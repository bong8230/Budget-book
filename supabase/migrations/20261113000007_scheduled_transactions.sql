create table public.installment_plans (
 id uuid primary key default gen_random_uuid(), ledger_id uuid not null references public.ledgers on delete cascade,
 created_by uuid references auth.users on delete set null, total_amount bigint not null check(total_amount between 2 and 9007199254740991),
 months integer not null check(months between 2 and 36 and total_amount>=months), first_date date not null,
 category_id uuid, payment_method_id uuid, merchant text check(length(merchant)<=200), memo text not null default '' check(length(memo)<=900), created_at timestamptz not null default now(),
 unique(id,ledger_id), foreign key(category_id,ledger_id) references public.categories(id,ledger_id) on delete set null (category_id),
 foreign key(payment_method_id,ledger_id) references public.payment_methods(id,ledger_id) on delete set null (payment_method_id)
);
alter table public.installment_plans enable row level security;
create policy installment_read on public.installment_plans for select to authenticated using(public.is_ledger_member(ledger_id));

alter table public.transactions add column installment_plan_id uuid, add column installment_no integer check(installment_no between 1 and 36);
alter table public.transactions add constraint transactions_installment_ledger_fk foreign key(installment_plan_id,ledger_id) references public.installment_plans(id,ledger_id) on delete set null (installment_plan_id);
create unique index transactions_installment_number_key on public.transactions(installment_plan_id,installment_no) where installment_plan_id is not null;

create function public.create_installment(target_ledger uuid, target_user uuid, total bigint, months integer, first_date date, category_id uuid, payment_method_id uuid, merchant text, memo text) returns jsonb language plpgsql security definer set search_path='' as $$
declare plan_id uuid; part integer; period_start date; due_date date; part_amount bigint;
begin
 if auth.uid() is null or target_user is distinct from auth.uid() or not public.is_ledger_member(target_ledger) then raise exception 'Access denied'; end if;
 if total is null or months is null or months not between 2 and 36 or total<months or total>9007199254740991 or first_date is null then raise exception 'Invalid installment'; end if;
 insert into public.installment_plans(ledger_id,created_by,total_amount,months,first_date,category_id,payment_method_id,merchant,memo)
 values(target_ledger,target_user,total,months,first_date,category_id,payment_method_id,merchant,coalesce(memo,'')) returning id into plan_id;
 for part in 1..months loop
   period_start := (date_trunc('month',first_date)::date + make_interval(months => part-1))::date;
   due_date := period_start + least(extract(day from first_date)::integer,extract(day from (period_start+interval '1 month - 1 day'))::integer)-1;
   part_amount := total / months + case when part=1 then total % months else 0 end;
   insert into public.transactions(ledger_id,type,amount,occurred_on,category_id,payment_method_id,merchant,memo,created_by,installment_plan_id,installment_no)
   values(target_ledger,'expense',part_amount,due_date,category_id,payment_method_id,merchant,coalesce(memo,'') || ' (' || part || '/' || months || ')',target_user,plan_id,part);
 end loop;
 return jsonb_build_object('id',plan_id);
end $$;
create function public.delete_installment(target_ledger uuid, plan_id uuid, from_date date) returns void language plpgsql security definer set search_path='' as $$
begin
 if auth.uid() is null or not public.is_ledger_member(target_ledger) then raise exception 'Access denied'; end if;
 if from_date is null then raise exception 'Invalid date'; end if;
 perform 1 from public.installment_plans where id=plan_id and ledger_id=target_ledger for update;
 if not found then raise exception 'Plan not found'; end if;
 delete from public.transactions where ledger_id=target_ledger and installment_plan_id=plan_id and occurred_on>=from_date;
 if not exists(select 1 from public.transactions where installment_plan_id=plan_id) then delete from public.installment_plans where id=plan_id and ledger_id=target_ledger; end if;
end $$;
create function public.list_installments(target_ledger uuid, today date) returns table(plan jsonb, paid_count bigint, remaining_count bigint, remaining_amount numeric, next_date date)
language sql stable security invoker set search_path='' as $$
 select to_jsonb(p),count(t.id) filter(where t.occurred_on<=today),count(t.id) filter(where t.occurred_on>today),coalesce(sum(t.amount) filter(where t.occurred_on>today),0),min(t.occurred_on) filter(where t.occurred_on>today)
 from public.installment_plans p left join public.transactions t on t.installment_plan_id=p.id and t.ledger_id=p.ledger_id
 where p.ledger_id=target_ledger group by p.id order by p.created_at desc,p.id
$$;
revoke all on function public.create_installment(uuid,uuid,bigint,integer,date,uuid,uuid,text,text),public.delete_installment(uuid,uuid,date),public.list_installments(uuid,date) from public,anon;
grant execute on function public.create_installment(uuid,uuid,bigint,integer,date,uuid,uuid,text,text),public.delete_installment(uuid,uuid,date),public.list_installments(uuid,date) to authenticated;

alter table public.recurring_items add column frequency text not null default 'monthly' check(frequency in ('weekly','monthly','yearly'));
alter table public.recurring_items add column start_date date;
update public.recurring_items set start_date=(created_at at time zone 'Asia/Seoul')::date;
alter table public.recurring_items alter column start_date set not null;
alter table public.recurring_items alter column start_date set default ((now() at time zone 'Asia/Seoul')::date);
alter table public.recurring_items add column end_date date, add column max_count integer check(max_count>0);
alter table public.recurring_items add constraint recurring_end_after_start check(end_date is null or end_date>=start_date);
-- Existing rows were tracking-only: enabling them would silently backfill expenses.
alter table public.recurring_items add column auto_create boolean not null default false;
alter table public.recurring_items alter column auto_create set default true;
alter table public.transactions add column recurring_item_id uuid;
alter table public.recurring_items add constraint recurring_items_id_ledger_key unique(id,ledger_id);
alter table public.transactions add constraint transactions_recurring_ledger_fk foreign key(recurring_item_id,ledger_id) references public.recurring_items(id,ledger_id) on delete set null (recurring_item_id);
create unique index transactions_recurring_date_key on public.transactions(recurring_item_id,occurred_on) where recurring_item_id is not null;
-- Queue notifications in the same transaction as each automatic entry.
create table public.recurring_notification_outbox (
 transaction_id uuid primary key references public.transactions(id) on delete cascade,
 ledger_id uuid not null references public.ledgers(id) on delete cascade,
 item_name text not null, amount bigint not null, created_at timestamptz not null default now()
);
alter table public.recurring_notification_outbox enable row level security;
revoke all on public.recurring_notification_outbox from public,anon,authenticated;
grant select,delete on public.recurring_notification_outbox to service_role;

create function public._generate_due_recurring(target_ledger uuid, until_date date) returns table(transaction_id uuid, ledger_id uuid, item_name text, amount bigint, occurred_on date)
language plpgsql security definer set search_path='' as $$
#variable_conflict use_column
declare item public.recurring_items%rowtype; due date; creator uuid; created_id uuid;
begin
 if until_date is null or until_date>(now() at time zone 'Asia/Seoul')::date then raise exception 'Invalid due date'; end if;
 for item in select r.* from public.recurring_items r where r.active and r.auto_create and (target_ledger is null or r.ledger_id=target_ledger) and r.start_date<=until_date order by r.id for update loop
   select m.user_id into creator from public.ledger_members m where m.ledger_id=item.ledger_id order by (m.role='owner') desc,m.joined_at,m.user_id limit 1;
   if creator is null then continue; end if;
   for due in
     with candidates as (
       select case when item.frequency='weekly' then item.start_date+n*7
         else ((date_trunc('month',item.start_date)::date + make_interval(months => case when item.frequency='yearly' then n*12 else n end))::date
           + least(case when item.frequency='yearly' then extract(day from item.start_date)::integer else item.day_of_month end,
             extract(day from ((date_trunc('month',item.start_date)::date + make_interval(months => case when item.frequency='yearly' then n*12 else n end))::date + interval '1 month - 1 day'))::integer)-1) end as d
       from generate_series(0,case when item.frequency='weekly' then (until_date-item.start_date)/7 when item.frequency='yearly' then extract(year from age(until_date,item.start_date))::integer+1 else (extract(year from until_date)::integer-extract(year from item.start_date)::integer)*12+extract(month from until_date)::integer-extract(month from item.start_date)::integer end) n
     ), valid as (select d,row_number() over(order by d) ordinal from candidates where d>=item.start_date and d<=until_date and (item.end_date is null or d<=item.end_date))
     select d from valid where item.max_count is null or ordinal<=item.max_count order by d
   loop
     created_id := null;
     insert into public.transactions(ledger_id,type,amount,occurred_on,category_id,payment_method_id,merchant,memo,created_by,recurring_item_id)
     values(item.ledger_id,item.type,item.amount,due,item.category_id,item.payment_method_id,item.name,item.name,creator,item.id)
     on conflict(recurring_item_id,occurred_on) where recurring_item_id is not null do nothing returning id into created_id;
     if created_id is not null then
       insert into public.recurring_notification_outbox(transaction_id,ledger_id,item_name,amount) values(created_id,item.ledger_id,item.name,item.amount);
       transaction_id:=created_id; ledger_id:=item.ledger_id; item_name:=item.name; amount:=item.amount; occurred_on:=due; return next;
     end if;
   end loop;
 end loop;
end $$;
create function public.generate_due_recurring(target_ledger uuid, until_date date) returns table(transaction_id uuid, ledger_id uuid, item_name text, amount bigint, occurred_on date)
language plpgsql security definer set search_path='' as $$
begin
 if target_ledger is null or auth.uid() is null or not public.is_ledger_member(target_ledger) then raise exception 'Access denied'; end if;
 return query select * from public._generate_due_recurring(target_ledger,until_date);
end $$;
create function public.generate_due_recurring_all(until_date date) returns table(transaction_id uuid, ledger_id uuid, item_name text, amount bigint, occurred_on date)
language sql security definer set search_path='' as $$ select * from public._generate_due_recurring(null,until_date) $$;
revoke all on function public._generate_due_recurring(uuid,date),public.generate_due_recurring(uuid,date),public.generate_due_recurring_all(date) from public,anon,authenticated;
grant execute on function public.generate_due_recurring(uuid,date) to authenticated;
grant execute on function public.generate_due_recurring_all(date) to service_role;
alter publication supabase_realtime add table public.installment_plans;
