alter table public.transactions add column source text not null default 'manual' check(source in ('manual','import','ai'));

create or replace function public.ai_usage_summary(target_ledger uuid, target_month date) returns table(spent_krw bigint, reserved_krw bigint)
language sql stable security invoker set search_path='' as $$
 select coalesce(sum(case when status='settled' then cost_krw else 0 end),0)::bigint,
        coalesce(sum(case when status='reserved' then ai_usage.reserved_krw else 0 end),0)::bigint
 from public.ai_usage where ledger_id=target_ledger and month=target_month
$$;

create or replace function public.reserve_ai_budget(target_ledger uuid, target_user uuid, reserve_krw integer, cap_krw integer) returns uuid
language plpgsql security definer set search_path='' as $$
declare current_month date := date_trunc('month',now() at time zone 'Asia/Seoul')::date;
 budget numeric; expense numeric; actual_cap numeric; used_amount numeric; result uuid;
begin
 if target_user is null or not exists(select 1 from public.ledger_members where ledger_id=target_ledger and user_id=target_user) then raise exception 'Access denied'; end if;
 if reserve_krw is null or reserve_krw<=0 or cap_krw is null or cap_krw<=0 then return null; end if;
 perform 1 from public.ledgers where id=target_ledger for update;
 select amount into budget from public.monthly_budgets where ledger_id=target_ledger and month=current_month;
 if budget is null then return null; end if;
 select coalesce(sum(amount),0) into expense from public.transactions where ledger_id=target_ledger and type='expense' and occurred_on>=current_month and occurred_on<(current_month+interval '1 month')::date;
 actual_cap:=floor(greatest(0,budget-expense)/10);
 select coalesce(sum(case when status='settled' then cost_krw else reserved_krw end),0) into used_amount from public.ai_usage where ledger_id=target_ledger and month=current_month;
 if used_amount+reserve_krw>least(actual_cap,cap_krw) then return null; end if;
 insert into public.ai_usage(ledger_id,user_id,month,status,reserved_krw) values(target_ledger,target_user,current_month,'reserved',reserve_krw) returning id into result;
 return result;
end $$;

create or replace function public.settle_ai_usage(usage_id uuid, target_user uuid, input_tokens bigint, output_tokens bigint, cost_krw integer) returns void
language plpgsql security definer set search_path='' as $$
declare row_value public.ai_usage%rowtype; target_ledger uuid;
begin
 if target_user is null or input_tokens is null or input_tokens<0 or output_tokens is null or output_tokens<0 or cost_krw is null or cost_krw<0 then raise exception 'Invalid usage'; end if;
 select ledger_id into target_ledger from public.ai_usage where id=usage_id and user_id=target_user;
 if target_ledger is null then raise exception 'Invalid reservation'; end if;
 perform 1 from public.ledgers where id=target_ledger for update;
 select * into row_value from public.ai_usage where id=usage_id and user_id=target_user for update;
 if row_value.id is null or not exists(select 1 from public.ledger_members where ledger_id=row_value.ledger_id and user_id=target_user) then raise exception 'Invalid reservation'; end if;
 if row_value.status='settled' then
   if row_value.input_tokens is not distinct from input_tokens and row_value.output_tokens is not distinct from output_tokens and row_value.cost_krw is not distinct from cost_krw then return; end if;
   raise exception 'Reservation already settled with different usage';
 end if;
 update public.ai_usage set status='settled',input_tokens=settle_ai_usage.input_tokens,output_tokens=settle_ai_usage.output_tokens,cost_krw=settle_ai_usage.cost_krw where id=usage_id;
end $$;

create or replace function public.merge_import(item_id uuid, target_transaction uuid) returns uuid language plpgsql security definer set search_path='' as $$
declare item public.imports%rowtype; target public.transactions%rowtype;
begin
 select * into item from public.imports where id=item_id and owner_id=auth.uid() for update;
 if item.id is null or not public.is_ledger_member(item.ledger_id) then raise exception 'Access denied'; end if;
 if item.status <> 'pending' or item.duplicate_of is distinct from target_transaction then raise exception 'Invalid duplicate'; end if;
 select * into target from public.transactions where id=target_transaction and ledger_id=item.ledger_id for update;
 if target.id is null or target.amount is distinct from item.amount or target.type is distinct from item.type or item.occurred_on is null or abs(target.occurred_on-item.occurred_on)>1 or exists(select 1 from public.imports where transaction_id=target.id) then raise exception 'Transaction unavailable'; end if;
 update public.transactions set payment_method_id=coalesce(payment_method_id,item.payment_method_id), merchant=coalesce(nullif(merchant,''),item.merchant), source='import' where id=target.id;
 update public.imports set status='accepted',transaction_id=target.id where id=item.id;
 return target.id;
end $$;

create or replace function public.resolve_import(item_id uuid, action text, item_type text default null, item_amount bigint default null, item_date date default null, item_category uuid default null, item_memo text default '', item_payment_method uuid default null, item_merchant text default null) returns uuid language plpgsql security definer set search_path='' as $$
declare item public.imports%rowtype; new_id uuid;
begin
 select * into item from public.imports where id=item_id and owner_id=auth.uid() for update;
 if item.id is null or not public.is_ledger_member(item.ledger_id) then raise exception 'Access denied'; end if;
 if item.status <> 'pending' then raise exception 'Already processed'; end if;
 if action='ignore' then update public.imports set status='ignored' where id=item_id; return null; end if;
 if action <> 'accept' then raise exception 'Invalid action'; end if;
 insert into public.transactions(ledger_id,type,amount,occurred_on,category_id,payment_method_id,merchant,memo,created_by,source)
 values(item.ledger_id,coalesce(item_type,item.type),coalesce(item_amount,item.amount),coalesce(item_date,item.occurred_on),coalesce(item_category,item.category_id),coalesce(item_payment_method,item.payment_method_id),coalesce(item_merchant,item.merchant),coalesce(nullif(trim(item_memo),''),item.merchant,''),auth.uid(),'import') returning id into new_id;
 update public.imports set status='accepted',transaction_id=new_id where id=item_id;
 return new_id;
end $$;

create or replace function public.ingest_import(target_ledger uuid, target_owner uuid, source_value text, raw_value text, hash_value text, amount_value bigint, date_value date, merchant_value text, type_value text, category_value uuid, payment_value uuid, rule_value uuid, auto_value boolean) returns text language plpgsql security definer set search_path='' as $$
declare candidate uuid; new_item uuid; new_tx uuid;
begin
 if not exists(select 1 from public.ledger_members where ledger_id=target_ledger and user_id=target_owner) then raise exception 'Access denied'; end if;
 perform pg_advisory_xact_lock(hashtextextended(target_ledger::text,0));
 if exists(select 1 from public.imports where ledger_id=target_ledger and owner_id=target_owner and dedupe_hash=hash_value) then return 'duplicate'; end if;
 select t.id into candidate from public.transactions t where t.ledger_id=target_ledger and t.amount=amount_value and t.type=type_value and t.occurred_on between date_value-1 and date_value+1 and not exists(select 1 from public.imports i where i.transaction_id=t.id) order by abs(t.occurred_on-date_value),t.created_at,t.id limit 1;
 insert into public.imports(ledger_id,owner_id,source,raw_text,dedupe_hash,amount,occurred_on,merchant,type,category_id,payment_method_id,rule_id,duplicate_of)
 values(target_ledger,target_owner,source_value,raw_value,hash_value,amount_value,date_value,merchant_value,type_value,category_value,payment_value,rule_value,candidate) returning id into new_item;
 if auto_value and candidate is null and amount_value is not null and date_value is not null and type_value is not null then
   insert into public.transactions(ledger_id,type,amount,occurred_on,category_id,payment_method_id,merchant,memo,created_by,source) values(target_ledger,type_value,amount_value,date_value,category_value,payment_value,merchant_value,coalesce(merchant_value,''),target_owner,'import') returning id into new_tx;
   update public.imports set status='accepted',transaction_id=new_tx where id=new_item;
   return 'accepted';
 end if;
 return 'pending';
end $$;

create function public.ai_query_transactions(target_ledger uuid, from_date date, to_date date, type_filter text default null, category_filter uuid default null, keyword text default null)
returns table(count bigint, income numeric, expense numeric, transfer numeric, rows jsonb)
language sql stable security invoker set search_path='' as $$
 with filtered as materialized (
   select t.* from public.transactions t where t.ledger_id=target_ledger and t.occurred_on between from_date and to_date
     and (type_filter is null or t.type=type_filter) and (category_filter is null or t.category_id=category_filter)
     and (nullif(trim(keyword),'') is null or position(lower(trim(keyword)) in lower(coalesce(t.memo,'') || ' ' || coalesce(t.merchant,'')))>0)
 )
 select count(*)::bigint, coalesce(sum(amount) filter(where type='income'),0), coalesce(sum(amount) filter(where type='expense'),0), coalesce(sum(amount) filter(where type='transfer'),0),
   coalesce((select jsonb_agg(to_jsonb(limited) order by occurred_on desc, created_at desc, id desc) from (select * from filtered order by occurred_on desc,created_at desc,id desc limit 100) limited),'[]'::jsonb)
 from filtered
$$;
revoke all on function public.ai_query_transactions(uuid,date,date,text,uuid,text) from public,anon;
grant execute on function public.ai_query_transactions(uuid,date,date,text,uuid,text) to authenticated;
