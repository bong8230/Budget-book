import { PGlite } from '@electric-sql/pglite';
import { readFile } from 'node:fs/promises';
import { beforeAll, afterAll, describe, expect, it } from 'vitest';
const db = new PGlite();
const alice = '10000000-0000-0000-0000-000000000001';
const bob = '10000000-0000-0000-0000-000000000002';
let ledger: string;
beforeAll(async () => {
  await db.exec(`create role authenticated; create role anon; create role service_role bypassrls; create schema auth; create table auth.users(id uuid primary key,email text); create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid $$; grant usage on schema public,auth to authenticated,service_role; grant execute on function auth.uid() to authenticated,service_role; alter default privileges in schema public grant all on tables to authenticated,service_role; alter default privileges in schema public grant execute on functions to anon,authenticated,service_role; create publication supabase_realtime;`);
  const files = ['20261111000000_initial.sql','20261111000001_member_names_categories.sql','20261113000000_phase2.sql','20261113000001_operations.sql','20261113000002_ai_usage.sql','20261113000003_ai_hardening.sql','20261113000004_function_privileges.sql','20261113000005_import_event_dedupe.sql','20261113000006_category_management.sql'];
  for (const file of files) await db.exec((await readFile(`supabase/migrations/${file}`, 'utf8')).replace('create extension if not exists pgcrypto with schema extensions;', ''));
  await db.query('insert into auth.users(id,email) values ($1,$2),($3,$4)', [alice,'a@example.com',bob,'b@example.com']);
  await db.exec(`set role authenticated; select set_config('request.jwt.claim.sub','${alice}',false);`);
  ledger = (await db.query<{id:string}>("select public.create_ledger('test') id")).rows[0].id;
  await db.query("insert into public.recurring_items(ledger_id,name,type,amount,day_of_month,keyword) values($1,'기존','expense',100,1,'기존')",[ledger]);
  await db.exec('reset role');
  await db.exec(await readFile('supabase/migrations/20261113000007_scheduled_transactions.sql', 'utf8'));
  await db.exec(await readFile('supabase/migrations/20261113000008_installment_lint.sql', 'utf8'));
  await db.exec(`set role authenticated; select set_config('request.jwt.claim.sub','${alice}',false);`);
});
afterAll(() => db.close());
describe('installments and recurring SQL', () => {
  it('does not enable existing tracking-only recurring items during migration', async () => {
    const row = (await db.query<{auto_create:boolean}>('select auto_create from public.recurring_items where name=$1',['기존'])).rows[0];
    expect(row.auto_create).toBe(false);
  });
  it('splits whole won, clamps month ends, and deletes future installments only', async () => {
    const created = await db.query<{result:{id:string}}>("select public.create_installment($1,$2,10001,3,'2024-01-31',null,null,null,'노트북') result", [ledger,alice]);
    const id = created.rows[0].result.id;
    const tx = await db.query<{amount:number;occurred_on:string;memo:string}>('select amount,occurred_on::text,memo from public.transactions where installment_plan_id=$1 order by installment_no',[id]);
    expect(tx.rows.map(t => Number(t.amount))).toEqual([3335,3333,3333]);
    expect(tx.rows.map(t => t.occurred_on)).toEqual(['2024-01-31','2024-02-29','2024-03-31']);
    const status = (await db.query<{paid_count:number;remaining_count:number;remaining_amount:number;next_date:string}>("select paid_count,remaining_count,remaining_amount,next_date::text from public.list_installments($1,'2024-02-01')",[ledger])).rows[0];
    expect([Number(status.paid_count),Number(status.remaining_count),Number(status.remaining_amount),status.next_date]).toEqual([1,2,6666,'2024-02-29']);
    await db.exec(`select set_config('request.jwt.claim.sub','${bob}',false);`);
    await expect(db.query("select public.delete_installment($1,$2,'2024-01-01')",[ledger,id])).rejects.toThrow();
    await db.exec(`select set_config('request.jwt.claim.sub','${alice}',false);`);
    await db.query("select public.delete_installment($1,$2,'2024-02-01')",[ledger,id]);
    expect((await db.query('select id from public.transactions where installment_plan_id=$1',[id])).rows).toHaveLength(1);
    await db.query("select public.delete_installment($1,$2,'2024-01-01')",[ledger,id]);
    expect((await db.query('select id from public.installment_plans where id=$1',[id])).rows).toHaveLength(0);
  });
  it('rejects a zero-won installment and a forged author', async () => {
    await expect(db.query("select public.create_installment($1,$2,1,3,'2024-01-01',null,null,null,'')",[ledger,alice])).rejects.toThrow();
    await expect(db.query("select public.create_installment($1,$2,30,3,'2024-01-01',null,null,null,'')",[ledger,bob])).rejects.toThrow();
  });
  it('generates a weekly series once and denies another ledger', async () => {
    await db.query("insert into public.recurring_items(ledger_id,name,type,amount,day_of_month,keyword,start_date,frequency,max_count,auto_create) values($1,'주간','expense',100,1,'주간','2024-01-01','weekly',3,true)",[ledger]);
    expect((await db.query("select * from public.generate_due_recurring($1,'2024-01-31')",[ledger])).rows).toHaveLength(3);
    expect((await db.query("select * from public.generate_due_recurring($1,'2024-01-31')",[ledger])).rows).toHaveLength(0);
    await expect(db.query('select * from public.recurring_notification_outbox')).rejects.toThrow();
    await db.exec('reset role; set role service_role');
    expect((await db.query('select * from public.recurring_notification_outbox')).rows).toHaveLength(3);
    await db.exec('reset role; set role authenticated');
    await db.exec(`select set_config('request.jwt.claim.sub','${bob}',false);`);
    await expect(db.query("select * from public.generate_due_recurring($1,'2024-01-31')",[ledger])).rejects.toThrow();
    await expect(db.query("select * from public.generate_due_recurring_all('2024-01-31')")).rejects.toThrow();
    await db.exec(`select set_config('request.jwt.claim.sub','${alice}',false);`);
  });
  it('clamps monthly dates, respects the end date, and creates distinct annual leap-day occurrences', async () => {
    await db.query("insert into public.recurring_items(ledger_id,name,type,amount,day_of_month,keyword,start_date,frequency,end_date,auto_create) values($1,'월간','expense',200,31,'월간','2024-01-31','monthly','2024-03-31',true),($1,'연간','expense',300,29,'연간','2024-02-29','yearly','2025-03-01',true)",[ledger]);
    await db.query("select * from public.generate_due_recurring($1,'2025-04-01')",[ledger]);
    const rows = (await db.query<{memo:string;occurred_on:string}>("select memo,occurred_on::text from public.transactions where memo in ('월간','연간') order by memo,occurred_on")).rows;
    expect(rows.filter(r=>r.memo==='월간').map(r=>r.occurred_on)).toEqual(['2024-01-31','2024-02-29','2024-03-31']);
    expect(rows.filter(r=>r.memo==='연간').map(r=>r.occurred_on)).toEqual(['2024-02-29','2025-02-28']);
  });
});
