-- ONLY the independent Become Better project. An iPhone shortcut receives a
-- revocable, write-only key for daily step totals, never an account session.
create table public.health_connections (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  token_hash bytea not null unique,
  created_at timestamptz not null default now(),
  expires_at timestamptz not null default now() + interval '1 year',
  revoked_at timestamptz,
  last_received_at timestamptz,
  last_date date,
  last_steps integer
);
alter table public.health_connections enable row level security;
create policy "Own step connections" on public.health_connections for select to authenticated
  using ((select auth.uid()) = user_id);
revoke all on public.health_connections from public, anon, authenticated;
grant select(id,user_id,created_at,expires_at,revoked_at,last_received_at,last_date,last_steps)
  on public.health_connections to authenticated;

create function public.create_step_connection() returns jsonb
language plpgsql security definer set search_path = '' as $$
declare owner_id uuid := auth.uid(); secret text; connection public.health_connections;
begin
  if owner_id is null then raise exception 'Authentication required'; end if;
  perform pg_advisory_xact_lock(hashtextextended('health:' || owner_id::text, 0));
  if (select count(*) from public.health_connections where user_id=owner_id and revoked_at is null and expires_at>now()) >= 3 then
    raise exception 'Revoke an old connection first';
  end if;
  secret := replace(gen_random_uuid()::text,'-','') || replace(gen_random_uuid()::text,'-','');
  insert into public.health_connections(user_id,token_hash) values(owner_id,sha256(convert_to(secret,'UTF8')))
    returning * into connection;
  return jsonb_build_object('id',connection.id,'connection_key',secret,'expires_at',connection.expires_at);
end;
$$;

create function public.revoke_step_connection(connection_id uuid) returns boolean
language plpgsql security definer set search_path = '' as $$
begin
  if auth.uid() is null then raise exception 'Authentication required'; end if;
  update public.health_connections set revoked_at=now() where id=connection_id and user_id=auth.uid() and revoked_at is null;
  return found;
end;
$$;

create function public.submit_health_steps(connection_key text, day date, step_count integer, source text default 'Apple Zdraví')
returns jsonb language plpgsql security definer set search_path = '' as $$
declare connection public.health_connections; existing public.user_records; record_id text;
  stamp timestamptz := clock_timestamp(); stamp_text text; patch jsonb; stamps jsonb;
begin
  if connection_key is null or length(connection_key)<>64 then raise exception 'Invalid connection'; end if;
  select * into connection from public.health_connections
    where token_hash=sha256(convert_to(connection_key,'UTF8')) and revoked_at is null and expires_at>now() for update;
  if not found then raise exception 'Invalid connection'; end if;
  if day is null or day<current_date-31 or day>current_date+1 or step_count is null or step_count<0 or step_count>200000
    or source is null or source not in ('Apple Zdraví','Huawei Zdraví','iPhone') then raise exception 'Invalid step total'; end if;
  record_id := 'daily-' || to_char(day,'YYYY-MM-DD');
  -- Same lock as commit_record: phone totals and PC notes cannot lose fields.
  perform pg_advisory_xact_lock(hashtextextended(connection.user_id::text || ':' || record_id, 0));
  select * into existing from public.user_records where user_id=connection.user_id and id=record_id for update;
  if found then
    if existing.deleted or existing.kind<>'daily' then raise exception 'Day is not available'; end if;
    if existing.payload->'steps'=to_jsonb(step_count) and existing.payload->>'stepsSource'=source then
      update public.health_connections set last_received_at=stamp,last_date=day,last_steps=step_count where id=connection.id;
      return jsonb_build_object('accepted',true,'date',day,'steps',step_count);
    end if;
    begin
      stamp := greatest(stamp,(existing.field_stamps->>'steps')::timestamptz + interval '1 millisecond');
    exception when invalid_datetime_format or datetime_field_overflow then null;
    end;
  end if;
  stamp_text := to_char(stamp at time zone 'UTC','YYYY-MM-DD"T"HH24:MI:SS.MS"Z"');
  patch := jsonb_build_object('steps',step_count,'stepsSource',source,'stepsSyncedAt',stamp_text);
  stamps := jsonb_build_object('steps',stamp_text,'stepsSource',stamp_text,'stepsSyncedAt',stamp_text);
  if existing.id is null then
    insert into public.user_records(user_id,id,kind,payload,field_stamps)
      values(connection.user_id,record_id,'daily',patch || jsonb_build_object('date',to_char(day,'YYYY-MM-DD')),
        stamps || jsonb_build_object('date',stamp_text));
  else
    update public.user_records set payload=payload || patch,field_stamps=field_stamps || stamps,
      revision=revision+1,updated_at=stamp where user_id=connection.user_id and id=record_id;
  end if;
  update public.health_connections set last_received_at=stamp,last_date=day,last_steps=step_count where id=connection.id;
  return jsonb_build_object('accepted',true,'date',day,'steps',step_count);
end;
$$;
revoke all on function public.create_step_connection(),public.revoke_step_connection(uuid),public.submit_health_steps(text,date,integer,text) from public,anon,authenticated;
grant execute on function public.create_step_connection(),public.revoke_step_connection(uuid) to authenticated;
grant execute on function public.submit_health_steps(text,date,integer,text) to anon,authenticated;
