-- Keep the existing RPC available while the new API is rolled out.
alter table public.imports add column received_at timestamptz not null default now();
update public.imports set received_at=created_at;
alter table public.imports add column app_name text check(length(app_name)<=200);
create index imports_event_lookup_idx on public.imports(ledger_id,owner_id,amount,type,received_at) where amount is not null and type is not null;

create function public.ingest_import(target_ledger uuid, target_owner uuid, source_value text, raw_value text, hash_value text, amount_value bigint, date_value date, merchant_value text, type_value text, category_value uuid, payment_value uuid, rule_value uuid, auto_value boolean, received_value timestamptz, app_value text) returns text language plpgsql security definer set search_path='' as $$
declare candidate uuid; new_item uuid; new_tx uuid; event_time timestamptz := coalesce(received_value,now());
begin
 if not exists(select 1 from public.ledger_members where ledger_id=target_ledger and user_id=target_owner) then raise exception 'Access denied'; end if;
 if app_value is not null and length(app_value)>200 then raise exception 'Invalid app'; end if;
 perform pg_advisory_xact_lock(hashtextextended(target_ledger::text,0));
 if exists(select 1 from public.imports where ledger_id=target_ledger and owner_id=target_owner and dedupe_hash=hash_value) then return 'duplicate'; end if;
 -- Match only across SMS and push; preserve repeated same-channel purchases.
 if source_value in ('sms','notification') and amount_value is not null and type_value is not null and exists(
   select 1 from public.imports i where i.ledger_id=target_ledger and i.owner_id=target_owner
   and i.source in ('sms','notification') and i.source<>source_value and i.amount=amount_value and i.type=type_value
   and i.received_at between event_time-interval '10 minutes' and event_time+interval '10 minutes'
   and (nullif(trim(i.merchant),'') is null or nullif(trim(merchant_value),'') is null or regexp_replace(lower(i.merchant),'\s','','g')=regexp_replace(lower(merchant_value),'\s','','g'))
 ) then return 'duplicate'; end if;
 select t.id into candidate from public.transactions t where t.ledger_id=target_ledger and t.amount=amount_value and t.type=type_value and t.occurred_on between date_value-1 and date_value+1 and not exists(select 1 from public.imports i where i.transaction_id=t.id) order by abs(t.occurred_on-date_value),t.created_at,t.id limit 1;
 insert into public.imports(ledger_id,owner_id,source,raw_text,dedupe_hash,amount,occurred_on,merchant,type,category_id,payment_method_id,rule_id,duplicate_of,received_at,app_name)
 values(target_ledger,target_owner,source_value,raw_value,hash_value,amount_value,date_value,merchant_value,type_value,category_value,payment_value,rule_value,candidate,event_time,app_value) returning id into new_item;
 if auto_value and candidate is null and amount_value is not null and date_value is not null and type_value is not null then
   insert into public.transactions(ledger_id,type,amount,occurred_on,category_id,payment_method_id,merchant,memo,created_by,source) values(target_ledger,type_value,amount_value,date_value,category_value,payment_value,merchant_value,coalesce(merchant_value,''),target_owner,'import') returning id into new_tx;
   update public.imports set status='accepted',transaction_id=new_tx where id=new_item;
   return 'accepted';
 end if;
 return 'pending';
end $$;
revoke all on function public.ingest_import(uuid,uuid,text,text,text,bigint,date,text,text,uuid,uuid,uuid,boolean,timestamptz,text) from public,anon,authenticated;
grant execute on function public.ingest_import(uuid,uuid,text,text,text,bigint,date,text,text,uuid,uuid,uuid,boolean,timestamptz,text) to service_role;
