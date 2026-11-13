-- Preserve each record and its ledger when the referenced category is deleted.
alter table public.transactions drop constraint transactions_category_id_ledger_id_fkey;
alter table public.transactions add constraint transactions_category_id_ledger_id_fkey foreign key(category_id,ledger_id) references public.categories(id,ledger_id) on delete set null (category_id);
alter table public.recurring_items drop constraint recurring_items_category_id_ledger_id_fkey;
alter table public.recurring_items add constraint recurring_items_category_id_ledger_id_fkey foreign key(category_id,ledger_id) references public.categories(id,ledger_id) on delete set null (category_id);
alter table public.rules drop constraint rules_category_id_ledger_id_fkey;
alter table public.rules add constraint rules_category_id_ledger_id_fkey foreign key(category_id,ledger_id) references public.categories(id,ledger_id) on delete set null (category_id);
alter table public.imports drop constraint imports_category_ledger_fk;
alter table public.imports add constraint imports_category_ledger_fk foreign key(category_id,ledger_id) references public.categories(id,ledger_id) on delete set null (category_id);

create unique index categories_ledger_type_trimmed_name_key on public.categories(ledger_id,type,btrim(name));

create function public.count_category_usage(target_ledger uuid) returns table(category_id uuid, count bigint)
language sql stable security invoker set search_path='' as $$
  select c.id, count(t.id) from public.categories c
  left join public.transactions t on t.ledger_id=c.ledger_id and t.category_id=c.id
  where c.ledger_id=target_ledger group by c.id
$$;
revoke all on function public.count_category_usage(uuid) from public,anon;
grant execute on function public.count_category_usage(uuid) to authenticated;
