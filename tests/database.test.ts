import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { PGlite } from '@electric-sql/pglite';

test('new Supabase schema enforces owner isolation, CAS and private photo storage', async () => {
  const db = new PGlite();
  try {
    // Minimal Supabase platform objects; application migration runs unmodified.
    await db.exec(`
      create role anon;
      create role authenticated;
      create schema auth;
      create schema storage;
      create table auth.users(id uuid primary key);
      create function auth.uid() returns uuid language sql stable as
        'select nullif(current_setting(''request.jwt.claim.sub'',true),'''')::uuid';
      grant usage on schema auth, storage to authenticated, anon;
      grant execute on function auth.uid() to authenticated, anon;
      create table storage.buckets(id text primary key,name text,public boolean,file_size_limit bigint,allowed_mime_types text[]);
      create table storage.objects(id uuid default gen_random_uuid(), bucket_id text,name text);
      alter table storage.objects enable row level security;
      grant select,insert,delete on storage.objects to authenticated;
      create function storage.foldername(text) returns text[] language sql immutable as
        'select string_to_array($1,''/'')';
    `);
    await db.exec(await readFile(new URL('../supabase/migrations/202610100001_initial.sql', import.meta.url), 'utf8'));
    const alice = '00000000-0000-4000-8000-000000000001', bob = '00000000-0000-4000-8000-000000000002';
    await db.query('insert into auth.users(id) values($1),($2)', [alice, bob]);
    await db.exec('set role authenticated');
    await db.query("select set_config('request.jwt.claim.sub',$1,false)", [alice]);
    const write = (revision: number, payload = { calories: 2300 }) => db.query<{ result: { accepted: boolean; row: { revision: number; user_id: string; payload: { calories: number } } } }>(
      "select public.commit_record('day','daily',$1::jsonb,$2::jsonb,false,$3) as result", [JSON.stringify(payload), JSON.stringify({ calories: '2026-10-10T08:00:00.000Z' }), revision]);
    const initial = (await write(0)).rows[0].result;
    assert.equal(initial.accepted, true); assert.equal(initial.row.revision, 1); assert.equal(initial.row.user_id, alice);
    const conflict = (await write(0, { calories: 2400 })).rows[0].result;
    assert.equal(conflict.accepted, false); assert.equal(conflict.row.payload.calories, 2300);
    const update = (await write(1, { calories: 2400 })).rows[0].result;
    assert.equal(update.row.revision, 2); assert.equal(update.row.payload.calories, 2400);
    await assert.rejects(db.exec("update public.user_records set payload='{}'"), /permission denied/);
    await assert.rejects(db.exec("select public.commit_record('day','daily','{}','{}',false,null)"), /Invalid revision/);
    await db.query('insert into storage.objects(bucket_id,name) values($1,$2)', ['progress-photos', `${alice}/image.jpg`]);
    await assert.rejects(db.query('insert into storage.objects(bucket_id,name) values($1,$2)', ['progress-photos', `${bob}/image.jpg`]), /row-level security/);
    await db.query("select set_config('request.jwt.claim.sub',$1,false)", [bob]);
    assert.equal((await db.query('select * from public.user_records')).rows.length, 0);
    assert.equal((await db.query('select * from storage.objects')).rows.length, 0);
    const secondAccount = (await write(0, { calories: 1900 })).rows[0].result;
    assert.equal(secondAccount.row.user_id, bob); assert.equal(secondAccount.row.revision, 1);
    await db.exec('set role anon');
    await assert.rejects(db.exec('select * from public.user_records'), /permission denied/);
    await assert.rejects(db.exec("select public.commit_record('day','daily','{}','{}',false,0)"), /permission denied/);
  } finally { await db.close(); }
});
