create table public.ledger_join_requests (
 id uuid primary key default gen_random_uuid(),
 ledger_id uuid not null references public.ledgers(id) on delete cascade,
 user_id uuid not null references auth.users(id) on delete cascade,
 display_name text not null check(length(btrim(display_name)) between 1 and 30),
 status text not null default 'pending' check(status in ('pending','approved','rejected')),
 created_at timestamptz not null default now(), decided_at timestamptz, decided_by uuid references auth.users(id) on delete set null
);
create unique index ledger_join_requests_one_pending_user on public.ledger_join_requests(user_id) where status='pending';
create index ledger_join_requests_ledger_pending on public.ledger_join_requests(ledger_id,created_at) where status='pending';
alter table public.ledger_join_requests enable row level security;
create policy join_requests_read on public.ledger_join_requests for select to authenticated
 using (user_id=(select auth.uid()) or public.is_ledger_member(ledger_id));
revoke insert,update,delete on public.ledger_join_requests from anon,authenticated;
grant select on public.ledger_join_requests to authenticated;

create function public.request_join(invite_code text, display_name text) returns uuid language plpgsql security definer set search_path='' as $$
declare target uuid; request_id uuid; caller uuid := auth.uid();
begin
 if caller is null then raise exception 'Authentication required'; end if;
 if display_name is null or length(btrim(display_name)) not between 1 and 30 then raise exception 'Invalid display name'; end if;
 select ledger_id into target from public.ledger_invites where code=invite_code and used_at is null and expires_at>now() for update;
 if target is null then raise exception 'Invalid or expired invite'; end if;
 perform 1 from public.ledgers where id=target for update;
 if exists(select 1 from public.ledger_members where ledger_id=target and user_id=caller) then raise exception 'Already a member'; end if;
 if (select count(*) from public.ledger_members where ledger_id=target)>=2 then raise exception 'Ledger is full'; end if;
 insert into public.ledger_join_requests(ledger_id,user_id,display_name) values(target,caller,btrim(display_name)) returning id into request_id;
 update public.ledger_invites set used_at=now() where code=invite_code;
 return request_id;
end $$;

create function public.approve_join(request_id uuid) returns void language plpgsql security definer set search_path='' as $$
declare item public.ledger_join_requests%rowtype; caller uuid := auth.uid();
begin
 if caller is null then raise exception 'Authentication required'; end if;
 select * into item from public.ledger_join_requests where id=request_id for update;
 if item.id is null or not exists(select 1 from public.ledger_members where ledger_id=item.ledger_id and user_id=caller and role='owner') then raise exception 'Access denied'; end if;
 if item.status<>'pending' then raise exception 'Request already decided'; end if;
 perform 1 from public.ledgers where id=item.ledger_id for update;
 if (select count(*) from public.ledger_members where ledger_id=item.ledger_id)>=2 then raise exception 'Ledger is full'; end if;
 if exists(select 1 from public.ledger_members where ledger_id=item.ledger_id and user_id=item.user_id) then raise exception 'Already a member'; end if;
 insert into public.ledger_members(ledger_id,user_id,role,display_name) values(item.ledger_id,item.user_id,'member',item.display_name);
 update public.ledger_join_requests set status='approved',decided_at=now(),decided_by=caller where id=item.id;
end $$;

create function public.reject_join(request_id uuid) returns void language plpgsql security definer set search_path='' as $$
declare item public.ledger_join_requests%rowtype; caller uuid := auth.uid();
begin
 if caller is null then raise exception 'Authentication required'; end if;
 select * into item from public.ledger_join_requests where id=request_id for update;
 if item.id is null or not exists(select 1 from public.ledger_members where ledger_id=item.ledger_id and user_id=caller and role='owner') then raise exception 'Access denied'; end if;
 if item.status<>'pending' then raise exception 'Request already decided'; end if;
 update public.ledger_join_requests set status='rejected',decided_at=now(),decided_by=caller where id=item.id;
end $$;

create function public.my_join_request() returns table(id uuid,status text,ledger_name text,created_at timestamptz)
language sql stable security definer set search_path='' as $$
 select r.id,r.status,l.name,r.created_at from public.ledger_join_requests r join public.ledgers l on l.id=r.ledger_id
 where r.user_id=auth.uid() order by r.created_at desc,r.id desc limit 1
$$;
revoke all on function public.request_join(text,text),public.approve_join(uuid),public.reject_join(uuid),public.my_join_request() from public,anon,authenticated;
grant execute on function public.request_join(text,text),public.approve_join(uuid),public.reject_join(uuid),public.my_join_request() to authenticated;
revoke execute on function public.join_ledger(text) from public,anon,authenticated;
alter publication supabase_realtime add table public.ledger_join_requests;
