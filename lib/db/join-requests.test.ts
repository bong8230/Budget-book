import { PGlite } from '@electric-sql/pglite';
import { readFile } from 'node:fs/promises';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

const db = new PGlite();
const owner = '00000000-0000-0000-0000-000000000101';
const applicant = '00000000-0000-0000-0000-000000000102';
const outsider = '00000000-0000-0000-0000-000000000103';
let ledger: string;
async function asUser(id: string) { await db.exec(`reset role; set role authenticated; select set_config('request.jwt.claim.sub','${id}',false)`); }
async function invite(code: string, expiry = '1 day') {
  await db.exec('reset role');
  await db.query('insert into public.ledger_invites(code,ledger_id,expires_at) values ($1,$2,now()+$3::interval)', [code,ledger,expiry]);
}
beforeAll(async () => {
  await db.exec(`create role authenticated; create role anon; create role service_role bypassrls; create schema auth; create table auth.users(id uuid primary key,email text); create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid $$; grant usage on schema public,auth to authenticated,service_role; grant execute on function auth.uid() to authenticated,service_role; alter default privileges in schema public grant all on tables to authenticated,service_role; alter default privileges in schema public grant execute on functions to anon,authenticated,service_role; create publication supabase_realtime;`);
  const files = ['20261111000000_initial.sql','20261111000001_member_names_categories.sql','20261113000000_phase2.sql','20261113000001_operations.sql','20261113000002_ai_usage.sql','20261113000003_ai_hardening.sql','20261113000004_function_privileges.sql','20261113000005_import_event_dedupe.sql','20261113000006_category_management.sql','20261113000007_scheduled_transactions.sql','20261113000008_installment_lint.sql'];
  files.push('20261122000000_join_requests.sql');
  for (const name of files) await db.exec((await readFile(`supabase/migrations/${name}`, 'utf8')).replace('create extension if not exists pgcrypto with schema extensions;', ''));
  await db.query('insert into auth.users(id,email) values($1,$2),($3,$4),($5,$6)',[owner,'owner@example.com',applicant,'applicant@example.com',outsider,'other@example.com']);
  await asUser(owner);
  ledger = (await db.query<{id:string}>("select public.create_ledger('가족') id")).rows[0].id;
});
afterAll(() => db.close());
describe('ledger join approval', () => {
  it('requires a valid unused invite and prevents direct membership bypass', async () => {
    await invite('expired','-1 day'); await asUser(applicant);
    await expect(db.query("select public.request_join('expired','배우자')")).rejects.toThrow();
    await expect(db.query("select public.join_ledger('expired')")).rejects.toThrow();
    expect((await db.query<{allowed:boolean}>("select has_function_privilege('authenticated','public.join_ledger(text)','execute') allowed")).rows[0].allowed).toBe(false);
    await expect(db.query("insert into public.ledger_members(ledger_id,user_id,role) values($1,$2,'member')",[ledger,applicant])).rejects.toThrow();
  });
  it('never approves two pending applicants into a two-member ledger', async () => {
    await asUser(owner);
    const otherLedger = (await db.query<{id:string}>("select public.create_ledger('정원 테스트') id")).rows[0].id;
    await db.exec('reset role');
    await db.query("insert into public.ledger_invites(code,ledger_id) values('capacity-a',$1),('capacity-b',$1)",[otherLedger]);
    await asUser(applicant); const a = (await db.query<{id:string}>("select public.request_join('capacity-a','첫째') id")).rows[0].id;
    await asUser(outsider); const b = (await db.query<{id:string}>("select public.request_join('capacity-b','둘째') id")).rows[0].id;
    await asUser(owner); await db.query('select public.approve_join($1)',[a]);
    await expect(db.query('select public.approve_join($1)',[b])).rejects.toThrow();
    expect((await db.query('select user_id from public.ledger_members where ledger_id=$1',[otherLedger])).rows).toHaveLength(2);
    await db.query('select public.reject_join($1)',[b]);
  });
  it('allows one pending request and keeps another invitation unused when rejected by the unique constraint', async () => {
    await invite('reject-me'); await invite('second-pending'); await asUser(applicant);
    const id = (await db.query<{id:string}>("select public.request_join('reject-me','신청자') id")).rows[0].id;
    await expect(db.query("select public.request_join('second-pending','신청자')")).rejects.toThrow();
    await expect(db.query("update public.ledger_join_requests set status='approved' where id=$1",[id])).rejects.toThrow();
    await asUser(outsider); await expect(db.query('select public.reject_join($1)',[id])).rejects.toThrow();
    await asUser(owner); await db.query('select public.reject_join($1)',[id]);
    await asUser(applicant);
    expect((await db.query<{status:string}>('select status from public.my_join_request()')).rows[0].status).toBe('rejected');
    const retry = (await db.query<{id:string}>("select public.request_join('second-pending','신청자') id")).rows[0].id;
    await asUser(owner); await db.query('select public.reject_join($1)',[retry]);
  });
  it('allows only the owner to approve and preserves request privacy', async () => {
    await invite('first'); await asUser(applicant);
    const id = (await db.query<{id:string}>("select public.request_join('first',' 배우자 ') id")).rows[0].id;
    expect((await db.query("select * from public.ledger_join_requests where status='pending'")).rows).toHaveLength(1);
    expect((await db.query<{ledger_name:string}>("select * from public.my_join_request()")).rows[0].ledger_name).toBe('가족');
    await expect(db.query("select public.request_join('first','배우자')")).rejects.toThrow();
    await asUser(outsider); expect((await db.query('select * from public.ledger_join_requests where id=$1',[id])).rows).toHaveLength(0);
    await expect(db.query('select public.approve_join($1)',[id])).rejects.toThrow();
    await asUser(owner); await db.query('select public.approve_join($1)',[id]);
    expect((await db.query<{display_name:string}>('select display_name from public.ledger_members where user_id=$1 and ledger_id=$2',[applicant,ledger])).rows[0].display_name).toBe('배우자');
    await expect(db.query('select public.approve_join($1)',[id])).rejects.toThrow();
    await invite('full'); await asUser(outsider);
    await expect(db.query("select public.request_join('full','초과')")).rejects.toThrow();
  });
});
