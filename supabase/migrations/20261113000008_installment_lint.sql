create or replace function public.create_installment(target_ledger uuid, target_user uuid, total bigint, months integer, first_date date, category_id uuid, payment_method_id uuid, merchant text, memo text) returns jsonb language plpgsql security definer set search_path='' as $$
declare plan_id uuid; period_start date; due_date date; part_amount bigint;
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
