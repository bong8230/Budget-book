import { PGlite } from '@electric-sql/pglite';
import { readFile } from 'node:fs/promises';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

const db = new PGlite();
const alice = '00000000-0000-0000-0000-000000000001';
const bob = '00000000-0000-0000-0000-000000000002';
let ledger: string;
beforeAll(async () => {
  await db.exec(`create role authenticated; create role anon; create role service_role; create schema auth; create table auth.users(id uuid primary key,email text); create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid $$; grant usage on schema public,auth to authenticated,service_role; grant execute on function auth.uid() to authenticated,service_role; alter default privileges in schema public grant all on tables to authenticated,service_role; alter default privileges in schema public grant execute on functions to authenticated,service_role; create publication supabase_realtime;`);
  for (const name of ['20261111000000_initial.sql','20261111000001_member_names_categories.sql','20261113000000_phase2.sql','20261113000001_operations.sql']) {
    const sql = await readFile(`supabase/migrations/${name}`, 'utf8');
    await db.exec(sql.replace('create extension if not exists pgcrypto with schema extensions;', ''));
  }
  await db.query('insert into auth.users(id,email) values ($1,$2),($3,$4)', [alice,'alice@example.com',bob,'bob@example.com']);
  await db.exec(`set role authenticated; select set_config('request.jwt.claim.sub','${alice}',false);`);
  const result = await db.query<{ id: string }>("select public.create_ledger('가계부') id"); ledger = result.rows[0].id;
});
afterAll(async () => { await db.close(); });
describe('phase 2 migration and RLS', () => {
  it('seeds categories and isolates other users', async () => {
    expect((await db.query('select * from public.categories')).rows).toHaveLength(12);
    await db.exec(`select set_config('request.jwt.claim.sub','${bob}',false);`);
    expect((await db.query('select * from public.payment_methods')).rows).toHaveLength(0);
    await expect(db.query("insert into public.payment_methods(ledger_id,name,kind) values ($1,'카드','card')", [ledger])).rejects.toThrow();
    await db.exec(`select set_config('request.jwt.claim.sub','${alice}',false);`);
  });
  it('merges only an owner import to its proposed transaction once', async () => {
    await db.exec('reset role');
    const tx = (await db.query<{id:string}>("insert into public.transactions(ledger_id,type,amount,occurred_on,created_by) values($1,'expense',1000,'2026-11-10',$2) returning id", [ledger,alice])).rows[0].id;
    const imp = (await db.query<{id:string}>("insert into public.imports(ledger_id,owner_id,source,raw_text,dedupe_hash,amount,occurred_on,type,merchant,duplicate_of) values($1,$2,'sms','출금','hash',1000,'2026-11-10','expense','가게',$3) returning id", [ledger,alice,tx])).rows[0].id;
    await db.exec(`set role authenticated; select set_config('request.jwt.claim.sub','${bob}',false);`);
    expect((await db.query('select * from public.imports')).rows).toHaveLength(0);
    await expect(db.query('select public.merge_import($1,$2)', [imp,tx])).rejects.toThrow();
    await db.exec(`select set_config('request.jwt.claim.sub','${alice}',false);`);
    await db.query('select public.merge_import($1,$2)', [imp,tx]);
    expect((await db.query<{merchant:string}>('select merchant from public.transactions where id=$1',[tx])).rows[0].merchant).toBe('가게');
    await expect(db.query('select public.merge_import($1,$2)', [imp,tx])).rejects.toThrow();
  });
  it('only lets service role ingest and identifies a duplicate', async () => {
    const args = [ledger,alice,'sms','결제 1000원','hash-2',1000,'2026-11-10','가게','expense',null,null,null,false];
    const sql = 'select public.ingest_import($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13) status';
    await expect(db.query(sql, args)).rejects.toThrow();
    await db.exec('reset role; set role service_role');
    expect((await db.query<{status:string}>(sql,args)).rows[0].status).toBe('pending');
    expect((await db.query<{status:string}>(sql,args)).rows[0].status).toBe('duplicate');
    await db.exec(`reset role; set role authenticated; select set_config('request.jwt.claim.sub','${alice}',false);`);
  });
  it('only allows the import owner to resolve it', async () => {
    await db.exec('reset role');
    const id = (await db.query<{id:string}>("insert into public.imports(ledger_id,owner_id,source,raw_text,dedupe_hash,amount,occurred_on,type,merchant) values($1,$2,'sms','결제','resolve',500,'2026-11-10','expense','가게') returning id",[ledger,alice])).rows[0].id;
    await db.exec(`set role authenticated; select set_config('request.jwt.claim.sub','${bob}',false);`);
    await expect(db.query("select public.resolve_import($1,'accept')",[id])).rejects.toThrow();
    await db.exec(`select set_config('request.jwt.claim.sub','${alice}',false);`);
    const result = await db.query<{id:string}>("select public.resolve_import($1,'accept') id",[id]);
    expect(result.rows[0].id).toBeTruthy();
    await expect(db.query("select public.resolve_import($1,'accept')",[id])).rejects.toThrow();
  });
  it('auto-accepts complete imports exactly once', async () => {
    await db.exec('reset role; set role service_role');
    const args = [ledger,alice,'sms','승인 2000원','hash-auto',2000,'2026-11-11','가게','expense',null,null,null,true];
    const sql = 'select public.ingest_import($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13) status';
    expect((await db.query<{status:string}>(sql,args)).rows[0].status).toBe('accepted');
    expect((await db.query<{status:string}>(sql,args)).rows[0].status).toBe('duplicate');
    await db.exec(`reset role; set role authenticated; select set_config('request.jwt.claim.sub','${alice}',false);`);
    expect((await db.query("select id from public.transactions where amount=2000")).rows).toHaveLength(1);
  });
  it('limits each device to 30 requests per window', async () => {
    await db.exec('reset role');
    const device = (await db.query<{id:string}>("insert into public.device_tokens(ledger_id,owner_id,token_hash) values($1,$2,'rate-token') returning id",[ledger,alice])).rows[0].id;
    await db.exec('set role service_role');
    for (let i = 0; i < 30; i++) expect((await db.query<{ok:boolean}>('select public.consume_import_limit($1) ok',[device])).rows[0].ok).toBe(true);
    expect((await db.query<{ok:boolean}>('select public.consume_import_limit($1) ok',[device])).rows[0].ok).toBe(false);
    await db.exec('reset role');
    await db.query("update public.import_rate_limits set window_started_at=now()-interval '61 seconds' where device_id=$1",[device]);
    await db.exec('set role service_role');
    expect((await db.query<{ok:boolean}>('select public.consume_import_limit($1) ok',[device])).rows[0].ok).toBe(true);
    await db.exec(`reset role; set role authenticated; select set_config('request.jwt.claim.sub','${alice}',false);`);
  });
  it('removes raw text only after 30 days from processing', async () => {
    await db.exec('reset role');
    const item = (await db.query<{id:string}>("insert into public.imports(ledger_id,owner_id,source,raw_text,dedupe_hash) values($1,$2,'sms','secret','old-raw') returning id",[ledger,alice])).rows[0].id;
    await db.query("update public.imports set status='ignored' where id=$1",[item]);
    await db.query("update public.imports set processed_at=now()-interval '31 days' where id=$1",[item]);
    await db.exec('set role service_role; select public.cleanup_old_imports(); reset role');
    expect((await db.query<{raw_text:string|null}>('select raw_text from public.imports where id=$1',[item])).rows[0].raw_text).toBeNull();
    await db.exec(`set role authenticated; select set_config('request.jwt.claim.sub','${alice}',false);`);
  });
  it('preserves shared transactions anonymously when a member leaves', async () => {
    await db.exec('reset role');
    await db.query("insert into public.ledger_members(ledger_id,user_id,role) values($1,$2,'member')", [ledger,bob]);
    await db.exec(`set role authenticated; select set_config('request.jwt.claim.sub','${bob}',false);`);
    expect((await db.query('select * from public.imports where ledger_id=$1',[ledger])).rows).toHaveLength(0);
    await db.exec('reset role');
    await db.query('delete from auth.users where id=$1',[alice]);
    const t = await db.query<{created_by:string|null}>("select created_by from public.transactions where ledger_id=$1 and amount=2000",[ledger]);
    expect(t.rows[0].created_by).toBeNull();
    expect((await db.query<{role:string}>("select role from public.ledger_members where ledger_id=$1 and user_id=$2",[ledger,bob])).rows[0].role).toBe('owner');
    expect((await db.query('select id from public.ledgers where id=$1',[ledger])).rows).toHaveLength(1);
  });
  it('deletes a ledger when its final member leaves', async () => {
    await db.query('delete from auth.users where id=$1',[bob]);
    expect((await db.query('select id from public.ledgers where id=$1',[ledger])).rows).toHaveLength(0);
  });
});
