alter table public.ledger_members add column display_name text not null default '' check (length(display_name) <= 80);
create function public.default_member_name() returns trigger language plpgsql security definer set search_path='' as $$
begin
  if trim(new.display_name) = '' then
    select coalesce(nullif(left(split_part(email,'@',1),80),''),'가족') into new.display_name from auth.users where id=new.user_id;
    new.display_name := coalesce(new.display_name,'가족');
  end if;
  return new;
end $$;
create trigger member_default_name before insert on public.ledger_members for each row execute function public.default_member_name();
create function public.set_display_name(target_ledger uuid, name text) returns void language plpgsql security definer set search_path='' as $$
begin
  if auth.uid() is null or name is null or length(trim(name)) not between 1 and 80 then raise exception 'Invalid name'; end if;
  update public.ledger_members set display_name=trim(name) where ledger_id=target_ledger and user_id=auth.uid();
  if not found then raise exception 'Access denied'; end if;
end $$;
revoke all on function public.set_display_name(uuid,text) from public;
grant execute on function public.set_display_name(uuid,text) to authenticated;
create function public.seed_ledger_categories() returns trigger language plpgsql security definer set search_path='' as $$
begin
  insert into public.categories(ledger_id,name,type)
  select new.id, name, type from (values
    ('식비','expense'),('카페·간식','expense'),('생활','expense'),('교통','expense'),('주거·통신','expense'),('의료','expense'),('경조사','expense'),('쇼핑','expense'),('기타','expense'),
    ('급여','income'),('부수입','income'),('기타','income')
  ) as defaults(name,type);
  return new;
end $$;
create trigger ledger_seed_categories after insert on public.ledgers for each row execute function public.seed_ledger_categories();

create or replace function public.resolve_import(item_id uuid, action text, item_type text default null, item_amount bigint default null, item_date date default null, item_category uuid default null, item_memo text default '') returns uuid language plpgsql security definer set search_path='' as $$
declare item public.imports%rowtype; new_id uuid;
begin
  select * into item from public.imports where id=item_id and owner_id=auth.uid() for update;
  if item.id is null or not public.is_ledger_member(item.ledger_id) then raise exception 'Access denied'; end if;
  if item.status<>'pending' then raise exception 'Already processed'; end if;
  if action='ignore' then update public.imports set status='ignored' where id=item_id; return null;
  elsif action='accept' then
    insert into public.transactions(ledger_id,type,amount,occurred_on,category_id,memo,created_by)
    values(item.ledger_id,coalesce(item_type,item.type),coalesce(item_amount,item.amount),coalesce(item_date,item.occurred_on),item_category,coalesce(nullif(trim(item_memo),''),item.merchant,''),auth.uid()) returning id into new_id;
    update public.imports set status='accepted',transaction_id=new_id where id=item_id;
    return new_id;
  else raise exception 'Invalid action'; end if;
end $$;
