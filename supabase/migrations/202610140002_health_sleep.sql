-- Add sleep only to newly consented connections. Existing step keys stay step-only.
alter table public.health_connections
  add column sleep_allowed boolean not null default false,
  add column last_sleep_date date,
  add column last_sleep_minutes integer;
grant select(sleep_allowed,last_sleep_date,last_sleep_minutes) on public.health_connections to authenticated;

create function public.create_health_connection(include_sleep boolean default false) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare result jsonb;
begin
  if include_sleep is null then raise exception 'Choose connection permissions'; end if;
  result := public.create_step_connection();
  update public.health_connections set sleep_allowed=include_sleep where id=(result->>'id')::uuid;
  return result || jsonb_build_object('sleep_allowed',include_sleep);
end;
$$;

create function public.submit_health_sleep(connection_key text, day date, sleep_minutes integer, source text default 'Apple Zdraví')
returns jsonb language plpgsql security definer set search_path = '' as $$
declare connection public.health_connections; existing public.user_records; record_id text;
  stamp timestamptz := clock_timestamp(); stamp_text text; patch jsonb; stamps jsonb; hours numeric;
begin
  if connection_key is null or length(connection_key)<>64 then raise exception 'Invalid connection'; end if;
  select * into connection from public.health_connections
    where token_hash=sha256(convert_to(connection_key,'UTF8')) and sleep_allowed
      and revoked_at is null and expires_at>now() for update;
  if not found then raise exception 'Invalid connection'; end if;
  if day is null or day<current_date-31 or day>current_date+1 or sleep_minutes is null
    or sleep_minutes<0 or sleep_minutes>1440 or source is null
    or source not in ('Apple Zdraví','Huawei Zdraví','iPhone') then raise exception 'Invalid sleep duration'; end if;
  record_id := 'daily-' || to_char(day,'YYYY-MM-DD');
  hours := sleep_minutes::numeric / 60;
  perform pg_advisory_xact_lock(hashtextextended(connection.user_id::text || ':' || record_id, 0));
  select * into existing from public.user_records where user_id=connection.user_id and id=record_id for update;
  if found then
    if existing.deleted or existing.kind<>'daily' then raise exception 'Day is not available'; end if;
    if existing.payload->'sleepDurationHours'=to_jsonb(hours) and existing.payload->>'sleepSource'=source then
      update public.health_connections set last_received_at=stamp,last_sleep_date=day,last_sleep_minutes=sleep_minutes where id=connection.id;
      return jsonb_build_object('accepted',true,'date',day,'sleep_minutes',sleep_minutes);
    end if;
    begin
      stamp := greatest(stamp,(existing.field_stamps->>'sleepDurationHours')::timestamptz + interval '1 millisecond');
    exception when invalid_datetime_format or datetime_field_overflow then null;
    end;
  end if;
  stamp_text := to_char(stamp at time zone 'UTC','YYYY-MM-DD"T"HH24:MI:SS.MS"Z"');
  patch := jsonb_build_object('sleepDurationHours',hours,'sleepSource',source,'sleepSyncedAt',stamp_text);
  stamps := jsonb_build_object('sleepDurationHours',stamp_text,'sleepSource',stamp_text,'sleepSyncedAt',stamp_text);
  if existing.id is null then
    insert into public.user_records(user_id,id,kind,payload,field_stamps)
      values(connection.user_id,record_id,'daily',patch || jsonb_build_object('date',to_char(day,'YYYY-MM-DD')),
        stamps || jsonb_build_object('date',stamp_text));
  else
    update public.user_records set payload=payload || patch,field_stamps=field_stamps || stamps,
      revision=revision+1,updated_at=stamp where user_id=connection.user_id and id=record_id;
  end if;
  update public.health_connections set last_received_at=stamp,last_sleep_date=day,last_sleep_minutes=sleep_minutes where id=connection.id;
  return jsonb_build_object('accepted',true,'date',day,'sleep_minutes',sleep_minutes);
end;
$$;
revoke all on function public.create_health_connection(boolean),public.submit_health_sleep(text,date,integer,text) from public,anon,authenticated;
grant execute on function public.create_health_connection(boolean) to authenticated;
grant execute on function public.submit_health_sleep(text,date,integer,text) to anon,authenticated;
