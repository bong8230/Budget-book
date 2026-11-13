create table public.payment_methods (
 id uuid primary key default gen_random_uuid(), ledger_id uuid not null references public.ledgers on delete cascade,
 name text not null check(length(trim(name)) between 1 and 100), kind text not null check(kind in ('card','account','cash')),
 owner_id uuid, keywords text[] not null default '{}', archived_at timestamptz, created_at timestamptz not null default now(),
 unique(id,ledger_id), foreign key(ledger_id,owner_id) references public.ledger_members(ledger_id,user_id)
);
create table public.rules (
 id uuid primary key default gen_random_uuid(), ledger_id uuid not null references public.ledgers on delete cascade,
 keyword text not null check(length(trim(keyword)) between 1 and 100), category_id uuid, set_type text check(set_type in ('income','expense','transfer')),
 payment_method_id uuid, auto_accept boolean not null default false, created_by uuid not null, created_at timestamptz not null default now(),
 unique(id,ledger_id), foreign key(category_id,ledger_id) references public.categories(id,ledger_id),
 foreign key(payment_method_id,ledger_id) references public.payment_methods(id,ledger_id), foreign key(ledger_id,created_by) references public.ledger_members(ledger_id,user_id)
);
create table public.recurring_items (
 id uuid primary key default gen_random_uuid(), ledger_id uuid not null references public.ledgers on delete cascade,
 name text not null check(length(trim(name)) between 1 and 100), type text not null check(type in ('income','expense','transfer')),
 amount bigint not null check(amount between 1 and 9007199254740991), day_of_month integer not null check(day_of_month between 1 and 31),
 category_id uuid, payment_method_id uuid, keyword text not null check(length(trim(keyword)) between 1 and 100), active boolean not null default true, created_at timestamptz not null default now(),
 foreign key(category_id,ledger_id) references public.categories(id,ledger_id), foreign key(payment_method_id,ledger_id) references public.payment_methods(id,ledger_id)
);
alter table public.transactions add column payment_method_id uuid, add column merchant text check(length(merchant)<=200), add constraint transactions_payment_ledger_fk foreign key(payment_method_id,ledger_id) references public.payment_methods(id,ledger_id);
alter table public.transactions add constraint transactions_id_ledger_key unique(id,ledger_id);
alter table public.imports add column category_id uuid, add column payment_method_id uuid, add column duplicate_of uuid, add column rule_id uuid;
alter table public.imports drop constraint imports_type_check;
alter table public.imports add constraint imports_type_check check(type in ('income','expense','transfer'));
alter table public.imports add constraint imports_category_ledger_fk foreign key(category_id,ledger_id) references public.categories(id,ledger_id), add constraint imports_payment_ledger_fk foreign key(payment_method_id,ledger_id) references public.payment_methods(id,ledger_id), add constraint imports_duplicate_ledger_fk foreign key(duplicate_of,ledger_id) references public.transactions(id,ledger_id) on delete set null (duplicate_of), add constraint imports_rule_ledger_fk foreign key(rule_id,ledger_id) references public.rules(id,ledger_id) on delete set null (rule_id);
create unique index imports_transaction_unique on public.imports(transaction_id) where transaction_id is not null;
alter table public.payment_methods enable row level security;
alter table public.rules enable row level security;
alter table public.recurring_items enable row level security;
create policy payment_methods_access on public.payment_methods for all to authenticated using(public.is_ledger_member(ledger_id)) with check(public.is_ledger_member(ledger_id));
create policy rules_read on public.rules for select to authenticated using(public.is_ledger_member(ledger_id));
create policy rules_insert on public.rules for insert to authenticated with check(public.is_ledger_member(ledger_id) and created_by=auth.uid());
create policy rules_update on public.rules for update to authenticated using(public.is_ledger_member(ledger_id)) with check(public.is_ledger_member(ledger_id));
create policy rules_delete on public.rules for delete to authenticated using(public.is_ledger_member(ledger_id));
create policy recurring_access on public.recurring_items for all to authenticated using(public.is_ledger_member(ledger_id)) with check(public.is_ledger_member(ledger_id));
create function public.preview_rule(target_ledger uuid, search_keyword text) returns bigint language sql stable security invoker set search_path='' as $$
 select count(*) from public.transactions where ledger_id=target_ledger and length(trim(search_keyword))>0 and occurred_on >= current_date - 90 and (position(lower(search_keyword) in lower(coalesce(merchant,'')))>0 or position(lower(search_keyword) in lower(memo))>0)
$$;
revoke all on function public.preview_rule(uuid,text) from public; grant execute on function public.preview_rule(uuid,text) to authenticated;
create function public.merge_import(item_id uuid, target_transaction uuid) returns uuid language plpgsql security definer set search_path='' as $$
declare item public.imports%rowtype; target public.transactions%rowtype;
begin
 select * into item from public.imports where id=item_id and owner_id=auth.uid() for update;
 if item.id is null or not public.is_ledger_member(item.ledger_id) then raise exception 'Access denied'; end if;
 if item.status <> 'pending' or item.duplicate_of is distinct from target_transaction then raise exception 'Invalid duplicate'; end if;
 select * into target from public.transactions where id=target_transaction and ledger_id=item.ledger_id for update;
 if target.id is null or target.amount is distinct from item.amount or target.type is distinct from item.type or item.occurred_on is null or abs(target.occurred_on-item.occurred_on)>1 or exists(select 1 from public.imports where transaction_id=target.id) then raise exception 'Transaction unavailable'; end if;
 update public.transactions set payment_method_id=coalesce(payment_method_id,item.payment_method_id), merchant=coalesce(nullif(merchant,''),item.merchant) where id=target.id;
 update public.imports set status='accepted',transaction_id=target.id where id=item.id;
 return target.id;
end $$;
revoke all on function public.merge_import(uuid,uuid) from public; grant execute on function public.merge_import(uuid,uuid) to authenticated;
drop function public.resolve_import(uuid,text,text,bigint,date,uuid,text);
create function public.resolve_import(item_id uuid, action text, item_type text default null, item_amount bigint default null, item_date date default null, item_category uuid default null, item_memo text default '', item_payment_method uuid default null, item_merchant text default null) returns uuid language plpgsql security definer set search_path='' as $$
declare item public.imports%rowtype; new_id uuid;
begin
 select * into item from public.imports where id=item_id and owner_id=auth.uid() for update;
 if item.id is null or not public.is_ledger_member(item.ledger_id) then raise exception 'Access denied'; end if;
 if item.status <> 'pending' then raise exception 'Already processed'; end if;
 if action='ignore' then update public.imports set status='ignored' where id=item_id; return null; end if;
 if action <> 'accept' then raise exception 'Invalid action'; end if;
 insert into public.transactions(ledger_id,type,amount,occurred_on,category_id,payment_method_id,merchant,memo,created_by)
 values(item.ledger_id,coalesce(item_type,item.type),coalesce(item_amount,item.amount),coalesce(item_date,item.occurred_on),coalesce(item_category,item.category_id),coalesce(item_payment_method,item.payment_method_id),coalesce(item_merchant,item.merchant),coalesce(nullif(trim(item_memo),''),item.merchant,''),auth.uid()) returning id into new_id;
 update public.imports set status='accepted',transaction_id=new_id where id=item_id;
 return new_id;
end $$;
revoke all on function public.resolve_import(uuid,text,text,bigint,date,uuid,text,uuid,text) from public;
grant execute on function public.resolve_import(uuid,text,text,bigint,date,uuid,text,uuid,text) to authenticated;
create function public.ingest_import(target_ledger uuid, target_owner uuid, source_value text, raw_value text, hash_value text, amount_value bigint, date_value date, merchant_value text, type_value text, category_value uuid, payment_value uuid, rule_value uuid, auto_value boolean) returns text language plpgsql security definer set search_path='' as $$
declare candidate uuid; new_item uuid; new_tx uuid;
begin
 if not exists(select 1 from public.ledger_members where ledger_id=target_ledger and user_id=target_owner) then raise exception 'Access denied'; end if;
 perform pg_advisory_xact_lock(hashtextextended(target_ledger::text,0));
 if exists(select 1 from public.imports where ledger_id=target_ledger and owner_id=target_owner and dedupe_hash=hash_value) then return 'duplicate'; end if;
 select t.id into candidate from public.transactions t where t.ledger_id=target_ledger and t.amount=amount_value and t.type=type_value and t.occurred_on between date_value-1 and date_value+1 and not exists(select 1 from public.imports i where i.transaction_id=t.id) order by abs(t.occurred_on-date_value),t.created_at,t.id limit 1;
 insert into public.imports(ledger_id,owner_id,source,raw_text,dedupe_hash,amount,occurred_on,merchant,type,category_id,payment_method_id,rule_id,duplicate_of)
 values(target_ledger,target_owner,source_value,raw_value,hash_value,amount_value,date_value,merchant_value,type_value,category_value,payment_value,rule_value,candidate) returning id into new_item;
 if auto_value and candidate is null and amount_value is not null and date_value is not null and type_value is not null then
   insert into public.transactions(ledger_id,type,amount,occurred_on,category_id,payment_method_id,merchant,memo,created_by) values(target_ledger,type_value,amount_value,date_value,category_value,payment_value,merchant_value,coalesce(merchant_value,''),target_owner) returning id into new_tx;
   update public.imports set status='accepted',transaction_id=new_tx where id=new_item;
   return 'accepted';
 end if;
 return 'pending';
end $$;
revoke all on function public.ingest_import(uuid,uuid,text,text,text,bigint,date,text,text,uuid,uuid,uuid,boolean) from public,authenticated,anon;
grant execute on function public.ingest_import(uuid,uuid,text,text,text,bigint,date,text,text,uuid,uuid,uuid,boolean) to service_role;
alter publication supabase_realtime add table public.payment_methods,public.rules,public.recurring_items;
