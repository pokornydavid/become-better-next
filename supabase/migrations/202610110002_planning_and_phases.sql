-- Only the new development database. Existing clients do not grant management
-- access automatically; the client explicitly opts in and may revoke it.
alter table public.user_records drop constraint user_records_kind_check;
alter table public.user_records add constraint user_records_kind_check check (kind in
  ('workout','exercise','set','daily','goals','measurement','library','photo','photoAlbum','progressPhase'));
alter table public.coach_clients add column allow_management boolean not null default false;
drop policy "Consented client records" on public.user_records;
create policy "Consented client records" on public.user_records for select to authenticated using(
  (kind in ('workout','exercise','set','daily','goals','measurement','progressPhase') and public.can_read_client(user_id,false))
  or (kind in ('photo','photoAlbum') and public.can_read_client(user_id,true))
);

drop function public.accept_coach_invite(uuid,text,text,boolean);
create function public.accept_coach_invite(invite_code uuid, display_name text, client_goal text default '', photos boolean default false, management boolean default false)
returns uuid language plpgsql security definer set search_path = '' as $$
declare invite public.coach_invites; email_address text;
begin
  select lower(email) into email_address from auth.users where id=auth.uid();
  select * into invite from public.coach_invites where code=invite_code for update;
  if not found or invite.accepted_at is not null or invite.expires_at<=now() or email_address is null or invite.email<>email_address then raise exception 'Invitation is invalid, expired or belongs to another email'; end if;
  if invite.invite_role='coach' then
    insert into public.coach_members values(invite.team_id,auth.uid(),btrim(display_name)) on conflict do nothing;
  else
    insert into public.coach_clients(team_id,client_id,display_name,goal,share_photos,allow_management)
      values(invite.team_id,auth.uid(),btrim(display_name),client_goal,photos,management) on conflict do nothing;
  end if;
  update public.coach_invites set accepted_at=now() where code=invite_code; return invite.team_id;
end;
$$;
create function public.set_client_management(team uuid, management boolean) returns void language plpgsql security definer set search_path = '' as $$
begin
  if management is null then raise exception 'Management choice required'; end if;
  update public.coach_clients set allow_management=management where team_id=team and client_id=auth.uid();
  if not found then raise exception 'Client membership required'; end if;
end;
$$;

create function public.set_coach_client_goals(team uuid, client uuid, goal_patch jsonb, expected_revision bigint)
returns void language plpgsql security definer set search_path = '' as $$
declare existing public.user_records; k text; v jsonb; amount numeric; maximum numeric; minimum numeric;
  stamp text; stamps jsonb; payload jsonb; trainer_name text;
begin
  if not public.is_coach(team) then raise exception 'Trainer membership required'; end if;
  perform 1 from public.coach_clients where team_id=team and client_id=client and allow_management for share;
  if not found then raise exception 'Client management consent required'; end if;
  if goal_patch is null or jsonb_typeof(goal_patch)<>'object' or goal_patch='{}'::jsonb or octet_length(goal_patch::text)>2000 then raise exception 'Invalid goals'; end if;
  for k,v in select * from jsonb_each(goal_patch) loop
    if k='mode' then
      if jsonb_typeof(v)<>'string' or v#>>'{}' not in ('diet','bulk','maintain') then raise exception 'Invalid goal mode'; end if;
    else
      if k not in ('weeklyCalories','calories','protein','carbs','fat','weight','weeklyWorkouts') or jsonb_typeof(v)<>'number' then raise exception 'Invalid goal field'; end if;
      amount := (v#>>'{}')::numeric;
      minimum := case when k='weight' then 20 when k in ('protein','carbs','fat') then 0 else 1 end;
      maximum := case k when 'weeklyCalories' then 140000 when 'calories' then 20000 when 'weight' then 500 when 'weeklyWorkouts' then 14 else 2000 end;
      if amount<minimum or amount>maximum or (k<>'weight' and amount<>trunc(amount)) then raise exception 'Invalid goal value'; end if;
    end if;
  end loop;
  if expected_revision is null or expected_revision<0 then raise exception 'Invalid revision'; end if;
  perform pg_advisory_xact_lock(hashtextextended(client::text || ':goals',0));
  select * into existing from public.user_records where user_id=client and id='goals' for update;
  if coalesce(existing.revision,0)<>expected_revision then raise exception 'Cíle se mezitím změnily. Obnov aktuální hodnoty.'; end if;
  if existing.kind is not null and (existing.kind<>'goals' or existing.deleted) then raise exception 'Client goals are unavailable'; end if;
  select display_name into trainer_name from public.coach_members where team_id=team and user_id=auth.uid();
  payload := goal_patch || jsonb_build_object('trainer',trainer_name);
  -- Same millisecond UTC format as the browser's per-field clocks. Advance past
  -- existing fields, including clocks ahead of server time, to preserve merging.
  select to_char(greatest(clock_timestamp(),coalesce(max(value::timestamptz),'epoch'::timestamptz)+interval '1 millisecond') at time zone 'UTC','YYYY-MM-DD"T"HH24:MI:SS.MS"Z"') into stamp
    from jsonb_each_text(coalesce(existing.field_stamps,'{}'::jsonb));
  select jsonb_object_agg(key,stamp) into stamps from jsonb_each(payload);
  insert into public.user_records(user_id,id,kind,payload,field_stamps,revision)
    values(client,'goals','goals',payload,stamps,1)
    on conflict(user_id,id) do update set payload=public.user_records.payload || excluded.payload,
      field_stamps=public.user_records.field_stamps || excluded.field_stamps, revision=public.user_records.revision+1,updated_at=now();
end;
$$;

create function public.add_coach_client_workout(team uuid, client uuid, workout_plan jsonb)
returns text language plpgsql security definer set search_path = '' as $$
declare workout_id text := gen_random_uuid()::text; exercise_id text; item jsonb;
  exercise_order integer:=0; i integer; set_count integer; rep_count integer; weight_value numeric;
  stamp text; workout_date text; trainer_name text; p jsonb; s jsonb;
begin
  if not public.is_coach(team) then raise exception 'Trainer membership required'; end if;
  perform 1 from public.coach_clients where team_id=team and client_id=client and allow_management for share;
  if not found then raise exception 'Client management consent required'; end if;
  if workout_plan is null or jsonb_typeof(workout_plan)<>'object' or octet_length(workout_plan::text)>20000
    or jsonb_typeof(workout_plan->'name') is distinct from 'string' or length(btrim(workout_plan->>'name')) not between 1 and 120
    or jsonb_typeof(workout_plan->'notes') is distinct from 'string' or length(workout_plan->>'notes')>1000
    or jsonb_typeof(workout_plan->'date') is distinct from 'string' or jsonb_typeof(workout_plan->'exercises') is distinct from 'array'
    then raise exception 'Invalid workout plan'; end if;
  if jsonb_array_length(workout_plan->'exercises') not between 1 and 20 then raise exception 'Invalid exercise count'; end if;
  workout_date := workout_plan->>'date';
  if workout_date !~ '^\d{4}-\d{2}-\d{2}$' or workout_date::date::text<>workout_date then raise exception 'Invalid workout date'; end if;
  select display_name into trainer_name from public.coach_members where team_id=team and user_id=auth.uid();
  stamp := to_char(clock_timestamp() at time zone 'UTC','YYYY-MM-DD"T"HH24:MI:SS.MS"Z"');
  p := jsonb_build_object('name',btrim(workout_plan->>'name'),'date',workout_date,'notes',workout_plan->>'notes','status','planned','startedAt','','finishedAt','','assignedTeam',team::text,'assignedBy',auth.uid()::text,'trainer',trainer_name);
  select jsonb_object_agg(key,stamp) into s from jsonb_each(p);
  insert into public.user_records(user_id,id,kind,payload,field_stamps) values(client,workout_id,'workout',p,s);
  for item in select * from jsonb_array_elements(workout_plan->'exercises') loop
    if jsonb_typeof(item)<>'object' or jsonb_typeof(item->'name') is distinct from 'string' or length(btrim(item->>'name')) not between 1 and 120
      or jsonb_typeof(item->'sets') is distinct from 'number' or jsonb_typeof(item->'reps') is distinct from 'number'
      or (item->>'sets')::numeric<>trunc((item->>'sets')::numeric) or (item->>'reps')::numeric<>trunc((item->>'reps')::numeric)
      then raise exception 'Invalid exercise'; end if;
    set_count := (item->>'sets')::integer; rep_count := (item->>'reps')::integer;
    if set_count not between 1 and 20 or rep_count not between 1 and 1000 then raise exception 'Invalid sets or repetitions'; end if;
    if jsonb_typeof(item->'weight') not in ('number','null') or item->'weight' is null then raise exception 'Invalid weight'; end if;
    weight_value := (item->>'weight')::numeric;
    if weight_value<0 or weight_value>1000 then raise exception 'Invalid weight'; end if;
    exercise_id := gen_random_uuid()::text;
    p := jsonb_build_object('workoutId',workout_id,'name',btrim(item->>'name'),'order',exercise_order,'muscle','Vlastní','equipment','','cue','');
    select jsonb_object_agg(key,stamp) into s from jsonb_each(p);
    insert into public.user_records(user_id,id,kind,payload,field_stamps) values(client,exercise_id,'exercise',p,s);
    for i in 0..set_count-1 loop
      p := jsonb_build_object('exerciseId',exercise_id,'order',i,'weight',weight_value,'reps',rep_count,'done',false,'rpe',null);
      select jsonb_object_agg(key,stamp) into s from jsonb_each(p);
      insert into public.user_records(user_id,id,kind,payload,field_stamps) values(client,gen_random_uuid()::text,'set',p,s);
    end loop;
    exercise_order := exercise_order+1;
  end loop;
  return workout_id;
end;
$$;
revoke all on function public.accept_coach_invite(uuid,text,text,boolean,boolean),public.set_client_management(uuid,boolean),public.set_coach_client_goals(uuid,uuid,jsonb,bigint),public.add_coach_client_workout(uuid,uuid,jsonb) from public,anon,authenticated;
grant execute on function public.accept_coach_invite(uuid,text,text,boolean,boolean),public.set_client_management(uuid,boolean),public.set_coach_client_goals(uuid,uuid,jsonb,bigint),public.add_coach_client_workout(uuid,uuid,jsonb) to authenticated;
