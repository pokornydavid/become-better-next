import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { PGlite } from '@electric-sql/pglite';

test('step keys write only their owner totals, preserve PC fields, handle retries and revoke immediately',async()=>{
  const db=new PGlite();
  try {
    await db.exec(`create role anon; create role authenticated; create schema auth; create schema storage;
      create table auth.users(id uuid primary key,email text);
      create function auth.uid() returns uuid language sql stable as 'select nullif(current_setting(''request.jwt.claim.sub'',true),'''')::uuid';
      grant usage on schema auth,storage to authenticated,anon; grant execute on function auth.uid() to authenticated,anon;
      create table storage.buckets(id text primary key,name text,public boolean,file_size_limit bigint,allowed_mime_types text[]);
      create table storage.objects(id uuid default gen_random_uuid(),bucket_id text,name text);
      alter table storage.objects enable row level security; grant select,insert,delete on storage.objects to authenticated;
      create function storage.foldername(text) returns text[] language sql immutable as 'select string_to_array($1,''/'')';`);
    for(const file of ['202610100001_initial.sql','202610110001_coaching_and_albums.sql','202610110002_planning_and_phases.sql','202610140001_health_steps.sql'])await db.exec(await readFile(new URL('../supabase/migrations/'+file,import.meta.url),'utf8'));
    const owner='00000000-0000-4000-8000-000000000001',other='00000000-0000-4000-8000-000000000002';
    await db.query('insert into auth.users(id,email) values($1,$2),($3,$4)',[owner,'owner@example.test',other,'other@example.test']);
    const day=(await db.query<{day:string}>('select current_date::text as day')).rows[0].day;
    await db.exec('set role authenticated');await db.query("select set_config('request.jwt.claim.sub',$1,false)",[owner]);
    const connection=(await db.query<{v:{id:string;connection_key:string}}>('select public.create_step_connection() as v')).rows[0].v;
    assert.equal(connection.connection_key.length,64);
    await assert.rejects(db.exec('select token_hash from public.health_connections'),/permission denied/);
    await db.query("select public.commit_record($1,'daily',$2::jsonb,'{}',false,0)",['daily-'+day,JSON.stringify({date:day,calories:2300,sleepNotes:'Poznámka z PC',steps:100})]);
    await db.exec('set role anon');
    await assert.rejects(db.exec('select * from public.health_connections'),/permission denied/);
    await assert.rejects(db.exec('select public.create_step_connection()'),/permission denied/);
    const submit=(steps:number,key=connection.connection_key)=>db.query("select public.submit_health_steps($1,$2::date,$3,'Apple Zdraví') as v",[key,day,steps]);
    await assert.rejects(submit(400,'f'.repeat(64)),/Invalid connection/);
    await assert.rejects(submit(-1),/Invalid step total/); await assert.rejects(submit(200001),/Invalid step total/);
    await submit(8300); await submit(8300);
    await db.exec('set role authenticated');await db.query("select set_config('request.jwt.claim.sub',$1,false)",[owner]);
    let row=(await db.query<{payload:{steps:number;calories:number;sleepNotes:string};revision:number}>('select payload,revision from public.user_records')).rows[0];
    assert.equal(row.payload.steps,8300); assert.equal(row.payload.calories,2300); assert.equal(row.payload.sleepNotes,'Poznámka z PC');assert.equal(row.revision,2);
    await db.query("select set_config('request.jwt.claim.sub',$1,false)",[other]);
    assert.equal((await db.query('select id from public.health_connections')).rows.length,0);
    assert.equal((await db.query('select id from public.user_records')).rows.length,0);
    assert.equal((await db.query<{v:boolean}>('select public.revoke_step_connection($1) as v',[connection.id])).rows[0].v,false);
    await db.query("select set_config('request.jwt.claim.sub',$1,false)",[owner]);
    assert.equal((await db.query<{v:boolean}>('select public.revoke_step_connection($1) as v',[connection.id])).rows[0].v,true);
    await db.exec('set role anon');await assert.rejects(submit(9000),/Invalid connection/);
    await db.exec('set role authenticated');await db.query("select set_config('request.jwt.claim.sub',$1,false)",[owner]);
    const next=(await db.query<{v:{connection_key:string}}>('select public.create_step_connection() as v')).rows[0].v;
    await db.exec('reset role');await db.query('update public.user_records set deleted=true where user_id=$1',[owner]);
    await db.exec('set role anon');await assert.rejects(submit(100,next.connection_key),/Day is not available/);
  } finally {await db.close();}
});
