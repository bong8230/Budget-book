-- Supabase grants function EXECUTE to anon directly; revoking PUBLIC alone does not remove that grant.
revoke execute on function public.create_ledger(text), public.create_invite(uuid), public.join_ledger(text), public.is_ledger_member(uuid), public.set_display_name(uuid,text), public.merge_import(uuid,uuid), public.resolve_import(uuid,text,text,bigint,date,uuid,text,uuid,text) from anon;
revoke execute on function public.cleanup_deleted_user(), public.cleanup_imports_on_processing(), public.default_member_name(), public.seed_ledger_categories() from public,anon,authenticated;

alter policy transaction_insert on public.transactions with check (public.is_ledger_member(ledger_id) and created_by=(select auth.uid()));
alter policy imports_read on public.imports using (owner_id=(select auth.uid()) and public.is_ledger_member(ledger_id));
alter policy device_read on public.device_tokens using (owner_id=(select auth.uid()) and public.is_ledger_member(ledger_id));
alter policy push_access on public.push_subscriptions using (owner_id=(select auth.uid()) and public.is_ledger_member(ledger_id)) with check (owner_id=(select auth.uid()) and public.is_ledger_member(ledger_id));
alter policy rules_insert on public.rules with check (public.is_ledger_member(ledger_id) and created_by=(select auth.uid()));
