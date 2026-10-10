-- Apply ONLY to the new Become Better development project.
create table public.user_records (
  user_id uuid not null references auth.users(id) on delete cascade,
  id text not null check (length(id) between 1 and 200),
  kind text not null check (kind in ('workout','exercise','set','daily','goals','measurement','library','photo')),
  payload jsonb not null default '{}' check (jsonb_typeof(payload) = 'object'),
  field_stamps jsonb not null default '{}' check (jsonb_typeof(field_stamps) = 'object'),
  deleted boolean not null default false,
  revision bigint not null default 1,
  updated_at timestamptz not null default now(),
  primary key (user_id, id)
);
create index user_records_by_kind on public.user_records(user_id, kind, updated_at);
alter table public.user_records enable row level security;
create policy "Read own records" on public.user_records for select to authenticated
  using ((select auth.uid()) = user_id);
revoke all on public.user_records from anon, authenticated;
grant select on public.user_records to authenticated;

-- Only this function writes records. The owner is derived from the session,
-- never from a client-supplied user_id. Revision checks prevent lost updates.
create function public.commit_record(
  record_id text, record_kind text, record_payload jsonb, record_stamps jsonb,
  record_deleted boolean, expected_revision bigint
) returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  owner_id uuid := auth.uid();
  existing public.user_records;
begin
  if owner_id is null then raise exception 'Authentication required'; end if;
  if expected_revision is null or expected_revision < 0 then raise exception 'Invalid revision'; end if;
  if record_payload is null or record_stamps is null or record_deleted is null
    or jsonb_typeof(record_payload) <> 'object' or jsonb_typeof(record_stamps) <> 'object'
    or octet_length(record_payload::text) > 100000 or octet_length(record_stamps::text) > 100000
    then raise exception 'Invalid record payload'; end if;
  -- Serialize each owner/id, including first insert races.
  perform pg_advisory_xact_lock(hashtextextended(owner_id::text || ':' || record_id, 0));
  select * into existing from public.user_records where user_id = owner_id and id = record_id for update;
  if not found then
    if expected_revision <> 0 then raise exception 'Unknown record revision'; end if;
    insert into public.user_records(user_id,id,kind,payload,field_stamps,deleted)
      values(owner_id,record_id,record_kind,record_payload,record_stamps,record_deleted) returning * into existing;
    return jsonb_build_object('accepted',true,'row',to_jsonb(existing));
  end if;
  if existing.revision <> expected_revision then
    return jsonb_build_object('accepted',false,'row',to_jsonb(existing));
  end if;
  if existing.kind <> record_kind then raise exception 'Record kind cannot change'; end if;
  update public.user_records set payload = record_payload, field_stamps = record_stamps,
    deleted = record_deleted, revision = revision + 1, updated_at = now()
    where user_id = owner_id and id = record_id returning * into existing;
  return jsonb_build_object('accepted',true,'row',to_jsonb(existing));
end;
$$;
revoke all on function public.commit_record(text,text,jsonb,jsonb,boolean,bigint) from public;
grant execute on function public.commit_record(text,text,jsonb,jsonb,boolean,bigint) to authenticated;

insert into storage.buckets(id,name,public,file_size_limit,allowed_mime_types)
values('progress-photos','progress-photos',false,10485760,array['image/jpeg','image/png','image/webp']);
create policy "Read own progress photos" on storage.objects for select to authenticated
  using (bucket_id = 'progress-photos' and (storage.foldername(name))[1] = (select auth.uid())::text);
create policy "Upload own progress photos" on storage.objects for insert to authenticated
  with check (bucket_id = 'progress-photos' and (storage.foldername(name))[1] = (select auth.uid())::text);
create policy "Delete own progress photos" on storage.objects for delete to authenticated
  using (bucket_id = 'progress-photos' and (storage.foldername(name))[1] = (select auth.uid())::text);
