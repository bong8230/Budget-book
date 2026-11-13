-- Keep a fixed one-minute window for each device. Only service role can consume it.
create table public.import_rate_limits (
 device_id uuid primary key references public.device_tokens(id) on delete cascade,
 window_started_at timestamptz not null, request_count integer not null check(request_count >= 0)
);
alter table public.import_rate_limits enable row level security;
create function public.consume_import_limit(target_device uuid) returns boolean language plpgsql security definer set search_path='' as $$
declare count_value integer;
begin
 insert into public.import_rate_limits(device_id,window_started_at,request_count) values(target_device,clock_timestamp(),1)
 on conflict(device_id) do update set
   window_started_at=case when public.import_rate_limits.window_started_at <= clock_timestamp()-interval '1 minute' then clock_timestamp() else public.import_rate_limits.window_started_at end,
   request_count=case when public.import_rate_limits.window_started_at <= clock_timestamp()-interval '1 minute' then 1 else public.import_rate_limits.request_count+1 end
 returning request_count into count_value;
 return count_value <= 30;
end $$;
revoke all on function public.consume_import_limit(uuid) from public,anon,authenticated;
grant execute on function public.consume_import_limit(uuid) to service_role;

alter table public.imports alter column raw_text drop not null;
alter table public.imports add column processed_at timestamptz;
update public.imports set processed_at=now() where status in ('accepted','ignored');
alter table public.imports add constraint pending_import_has_raw_text check(status <> 'pending' or raw_text is not null);
create index imports_retention_idx on public.imports(processed_at) where raw_text is not null and status in ('accepted','ignored');
create function public.mark_import_processed() returns trigger language plpgsql set search_path='' as $$
begin
 if new.status in ('accepted','ignored') and old.status='pending' then new.processed_at:=now(); end if;
 return new;
end $$;
create trigger mark_import_processed before update of status on public.imports for each row execute function public.mark_import_processed();
create function public.cleanup_old_imports() returns bigint language plpgsql security definer set search_path='' as $$
declare affected bigint;
begin
 update public.imports set raw_text=null where status in ('accepted','ignored') and processed_at < now()-interval '30 days' and raw_text is not null;
 get diagnostics affected = row_count; return affected;
end $$;
revoke all on function public.cleanup_old_imports() from public,anon,authenticated;
grant execute on function public.cleanup_old_imports() to service_role;
create function public.cleanup_imports_on_processing() returns trigger language plpgsql security definer set search_path='' as $$
begin
 if new.status in ('accepted','ignored') and old.status='pending' then perform public.cleanup_old_imports(); end if;
 return new;
end $$;
create trigger cleanup_imports_on_processing after update of status on public.imports for each row execute function public.cleanup_imports_on_processing();

-- Shared records survive account deletion with anonymous authorship.
alter table public.ledgers alter column created_by drop not null;
alter table public.transactions alter column created_by drop not null;
alter table public.rules alter column created_by drop not null;
create or replace function public.protect_transaction() returns trigger language plpgsql set search_path='' as $$
begin
 if new.ledger_id<>old.ledger_id or (new.created_by is distinct from old.created_by and not (new.created_by is null and current_user <> 'authenticated')) then raise exception 'Transaction identity cannot change'; end if;
 new.updated_at:=now(); return new;
end $$;
create function public.cleanup_deleted_user() returns trigger language plpgsql security definer set search_path='' as $$
declare entry record; successor uuid;
begin
 for entry in select ledger_id from public.ledger_members where user_id=old.id loop
   perform pg_advisory_xact_lock(hashtextextended(entry.ledger_id::text,0));
   select user_id into successor from public.ledger_members where ledger_id=entry.ledger_id and user_id<>old.id order by joined_at,user_id limit 1;
   if successor is null then
     delete from public.ledgers where id=entry.ledger_id;
   else
     delete from public.imports where ledger_id=entry.ledger_id and owner_id=old.id;
     delete from public.device_tokens where ledger_id=entry.ledger_id and owner_id=old.id;
     delete from public.push_subscriptions where ledger_id=entry.ledger_id and owner_id=old.id;
     update public.payment_methods set owner_id=null where ledger_id=entry.ledger_id and owner_id=old.id;
     update public.transactions set created_by=null where ledger_id=entry.ledger_id and created_by=old.id;
     update public.rules set created_by=null where ledger_id=entry.ledger_id and created_by=old.id;
     update public.ledgers set created_by=null where id=entry.ledger_id and created_by=old.id;
     update public.ledger_members set role='owner' where ledger_id=entry.ledger_id and user_id=successor;
     delete from public.ledger_members where ledger_id=entry.ledger_id and user_id=old.id;
   end if;
 end loop;
 return old;
end $$;
create trigger cleanup_deleted_user before delete on auth.users for each row execute function public.cleanup_deleted_user();
