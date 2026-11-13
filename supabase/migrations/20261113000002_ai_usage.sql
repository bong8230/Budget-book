create table public.ai_usage (
 id uuid primary key default gen_random_uuid(),
 ledger_id uuid not null references public.ledgers(id) on delete cascade,
 user_id uuid references auth.users(id) on delete set null,
 month date not null check(extract(day from month)=1),
 status text not null check(status in ('reserved','settled')),
 reserved_krw integer not null check(reserved_krw>0),
 cost_krw integer check(cost_krw>=0),
 input_tokens bigint check(input_tokens>=0), output_tokens bigint check(output_tokens>=0),
 created_at timestamptz not null default now()
);
create index ai_usage_ledger_month_idx on public.ai_usage(ledger_id,month);
alter table public.ai_usage enable row level security;
create policy ai_usage_read on public.ai_usage for select to authenticated using(public.is_ledger_member(ledger_id));
create function public.ai_usage_summary(target_ledger uuid, target_month date) returns table(spent_krw bigint, reserved_krw bigint)
language sql stable security invoker set search_path='' as $$
 select coalesce(sum(case when status='settled' then cost_krw else 0 end),0)::bigint,
        coalesce(sum(case when status='reserved' and created_at > now()-interval '15 minutes' then ai_usage.reserved_krw else 0 end),0)::bigint
 from public.ai_usage where ledger_id=target_ledger and month=target_month
$$;
revoke all on function public.ai_usage_summary(uuid,date) from public,anon;
grant execute on function public.ai_usage_summary(uuid,date) to authenticated;

create function public.reserve_ai_budget(target_ledger uuid, target_user uuid, reserve_krw integer, cap_krw integer) returns uuid
language plpgsql security definer set search_path='' as $$
declare current_month date := date_trunc('month',now() at time zone 'Asia/Seoul')::date;
 budget numeric; expense numeric; actual_cap numeric; used_amount numeric; result uuid;
begin
 if target_user is null or not exists(select 1 from public.ledger_members where ledger_id=target_ledger and user_id=target_user) then raise exception 'Access denied'; end if;
 if reserve_krw is null or reserve_krw <= 0 or cap_krw is null or cap_krw <= 0 then return null; end if;
 perform 1 from public.ledgers where id=target_ledger for update;
 select amount into budget from public.monthly_budgets where ledger_id=target_ledger and month=current_month;
 if budget is null then return null; end if;
 select coalesce(sum(amount),0) into expense from public.transactions where ledger_id=target_ledger and type='expense' and occurred_on>=current_month and occurred_on<(current_month+interval '1 month')::date;
 actual_cap := floor(greatest(0,budget-expense)/10);
 select coalesce(sum(case when status='settled' then cost_krw when status='reserved' and created_at > now()-interval '15 minutes' then reserved_krw else 0 end),0) into used_amount from public.ai_usage where ledger_id=target_ledger and month=current_month;
 if used_amount+reserve_krw > least(actual_cap,cap_krw) then return null; end if;
 insert into public.ai_usage(ledger_id,user_id,month,status,reserved_krw) values(target_ledger,target_user,current_month,'reserved',reserve_krw) returning id into result;
 return result;
end $$;
create function public.settle_ai_usage(usage_id uuid, target_user uuid, input_tokens bigint, output_tokens bigint, cost_krw integer) returns void
language plpgsql security definer set search_path='' as $$
begin
 if target_user is null or input_tokens is null or input_tokens<0 or output_tokens is null or output_tokens<0 or cost_krw is null or cost_krw<0 then raise exception 'Invalid usage'; end if;
 update public.ai_usage set status='settled',input_tokens=settle_ai_usage.input_tokens,output_tokens=settle_ai_usage.output_tokens,cost_krw=settle_ai_usage.cost_krw
 where id=usage_id and user_id=target_user and status='reserved' and exists(select 1 from public.ledger_members where ledger_id=ai_usage.ledger_id and user_id=target_user);
 if not found then raise exception 'Invalid or already settled reservation'; end if;
end $$;
-- Usage must come from the server, otherwise a browser could settle its own reservation for zero.
revoke all on function public.reserve_ai_budget(uuid,uuid,integer,integer),public.settle_ai_usage(uuid,uuid,bigint,bigint,integer) from public,anon,authenticated;
grant execute on function public.reserve_ai_budget(uuid,uuid,integer,integer),public.settle_ai_usage(uuid,uuid,bigint,bigint,integer) to service_role;
