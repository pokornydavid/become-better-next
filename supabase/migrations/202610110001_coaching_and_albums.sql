-- New development project only. Existing production project is never targeted.
alter table public.user_records drop constraint user_records_kind_check;
alter table public.user_records add constraint user_records_kind_check
  check (kind in ('workout','exercise','set','daily','goals','measurement','library','photo','photoAlbum'));

create table public.coach_teams (
  id uuid primary key default gen_random_uuid(), name text not null check(length(name) between 1 and 80),
  owner_id uuid not null references auth.users(id), created_at timestamptz not null default now()
);
create table public.coach_members (
  team_id uuid not null references public.coach_teams(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  display_name text not null check(length(display_name) between 1 and 80),
  primary key(team_id,user_id)
);
create table public.coach_clients (
  team_id uuid not null references public.coach_teams(id) on delete cascade,
  client_id uuid not null references auth.users(id) on delete cascade,
  display_name text not null check(length(display_name) between 1 and 80),
  goal text not null default '' check(length(goal) <= 500),
  share_photos boolean not null default false,
  accepted_at timestamptz not null default now(), primary key(team_id,client_id)
);
create table public.coach_invites (
  code uuid primary key default gen_random_uuid(), team_id uuid not null references public.coach_teams(id) on delete cascade,
  email text not null, invite_role text not null check(invite_role in ('client','coach')),
  expires_at timestamptz not null default now() + interval '7 days', accepted_at timestamptz
);
create table public.coach_notes (
  team_id uuid not null, client_id uuid not null, body text not null default '' check(length(body) <= 10000),
  updated_by uuid not null references auth.users(id), updated_at timestamptz not null default now(),
  primary key(team_id,client_id), foreign key(team_id,client_id) references public.coach_clients on delete cascade
);
create table public.coach_messages (
  id uuid primary key default gen_random_uuid(), team_id uuid not null, client_id uuid not null,
  sender_id uuid not null references auth.users(id), sender_name text not null,
  body text not null check(length(btrim(body)) between 1 and 4000), created_at timestamptz not null default now(),
  foreign key(team_id,client_id) references public.coach_clients on delete cascade
);
create index coach_messages_conversation on public.coach_messages(team_id,client_id,created_at);
create table public.coach_plans (
  id uuid primary key default gen_random_uuid(), team_id uuid not null, client_id uuid not null,
  title text not null check(length(btrim(title)) between 1 and 120), body text not null check(length(btrim(body)) between 1 and 10000),
  assigned_by uuid not null references auth.users(id), created_at timestamptz not null default now(),
  foreign key(team_id,client_id) references public.coach_clients on delete cascade
);

create index coach_members_by_user on public.coach_members(user_id,team_id);
create index coach_clients_by_user on public.coach_clients(client_id,team_id);

create function public.is_coach(team uuid) returns boolean language sql stable security definer set search_path = '' as $$
  select exists(select 1 from public.coach_members where team_id=team and user_id=auth.uid());
$$;
create function public.is_team_participant(team uuid) returns boolean language sql stable security definer set search_path = '' as $$
  select public.is_coach(team) or exists(select 1 from public.coach_clients where team_id=team and client_id=auth.uid());
$$;
create function public.can_read_client(owner_id uuid, photos boolean default false) returns boolean language sql stable security definer set search_path = '' as $$
  select exists(select 1 from public.coach_clients c join public.coach_members m on c.team_id=m.team_id
    where c.client_id=owner_id and m.user_id=auth.uid() and (not photos or c.share_photos));
$$;
create function public.in_conversation(team uuid, client uuid) returns boolean language sql stable security definer set search_path = '' as $$
  select exists(select 1 from public.coach_clients where team_id=team and client_id=client)
    and (public.is_coach(team) or client=auth.uid());
$$;

alter table public.coach_teams enable row level security;
alter table public.coach_members enable row level security;
alter table public.coach_clients enable row level security;
alter table public.coach_invites enable row level security;
alter table public.coach_notes enable row level security;
alter table public.coach_messages enable row level security;
alter table public.coach_plans enable row level security;
revoke all on public.coach_teams,public.coach_members,public.coach_clients,public.coach_invites,public.coach_notes,public.coach_messages,public.coach_plans from anon,authenticated;
grant select on public.coach_teams,public.coach_members,public.coach_clients,public.coach_invites,public.coach_notes,public.coach_messages,public.coach_plans to authenticated;
create policy "Team participants" on public.coach_teams for select to authenticated using(public.is_team_participant(id));
create policy "Team trainers" on public.coach_members for select to authenticated using(public.is_team_participant(team_id));
create policy "Linked clients" on public.coach_clients for select to authenticated using(public.is_coach(team_id) or client_id=auth.uid());
create policy "Invitation management" on public.coach_invites for select to authenticated using(public.is_coach(team_id));
create policy "Private staff notes" on public.coach_notes for select to authenticated using(public.is_coach(team_id));
create policy "Conversation participants" on public.coach_messages for select to authenticated using(public.in_conversation(team_id,client_id));
create policy "Assigned plans" on public.coach_plans for select to authenticated using(public.in_conversation(team_id,client_id));
create policy "Consented client records" on public.user_records for select to authenticated using(
  (kind in ('workout','exercise','set','daily','goals','measurement') and public.can_read_client(user_id,false))
  or (kind in ('photo','photoAlbum') and public.can_read_client(user_id,true))
);
create policy "Consented client photos" on storage.objects for select to authenticated using (
  bucket_id='progress-photos' and (storage.foldername(name))[1] ~ '^[0-9a-fA-F-]{36}$'
  and public.can_read_client(case when (storage.foldername(name))[1] ~ '^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$' then (storage.foldername(name))[1]::uuid else null end,true)
);

create function public.create_coach_team(team_name text, trainer_name text) returns uuid language plpgsql security definer set search_path = '' as $$
declare team uuid;
begin
  if auth.uid() is null then raise exception 'Authentication required'; end if;
  insert into public.coach_teams(name,owner_id) values(btrim(team_name),auth.uid()) returning id into team;
  insert into public.coach_members values(team,auth.uid(),btrim(trainer_name)); return team;
end;
$$;
create function public.create_coach_invite(team uuid, target_email text, target_role text) returns uuid language plpgsql security definer set search_path = '' as $$
declare invite uuid;
begin
  if not public.is_coach(team) then raise exception 'Trainer membership required'; end if;
  if target_role='coach' and not exists(select 1 from public.coach_teams where id=team and owner_id=auth.uid()) then raise exception 'Team owner required'; end if;
  if length(target_email)>254 or target_email !~ '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$' then raise exception 'Invalid email'; end if;
  insert into public.coach_invites(team_id,email,invite_role) values(team,lower(btrim(target_email)),target_role) returning code into invite; return invite;
end;
$$;
create function public.preview_coach_invite(invite_code uuid) returns jsonb language plpgsql security definer set search_path = '' as $$
declare invite public.coach_invites; email_address text;
begin
  select lower(email) into email_address from auth.users where id=auth.uid();
  select * into invite from public.coach_invites where code=invite_code and accepted_at is null and expires_at>now();
  if not found or email_address is null or invite.email <> email_address then raise exception 'Invitation is invalid, expired or belongs to another email'; end if;
  return jsonb_build_object('team', (select name from public.coach_teams where id=invite.team_id), 'role',invite.invite_role);
end;
$$;
create function public.accept_coach_invite(invite_code uuid, display_name text, client_goal text default '', photos boolean default false) returns uuid language plpgsql security definer set search_path = '' as $$
declare invite public.coach_invites; email_address text;
begin
  select lower(email) into email_address from auth.users where id=auth.uid();
  select * into invite from public.coach_invites where code=invite_code for update;
  if not found or invite.accepted_at is not null or invite.expires_at<=now() or email_address is null or invite.email<>email_address then raise exception 'Invitation is invalid, expired or belongs to another email'; end if;
  if invite.invite_role='coach' then
    insert into public.coach_members values(invite.team_id,auth.uid(),btrim(display_name)) on conflict do nothing;
  else
    insert into public.coach_clients(team_id,client_id,display_name,goal,share_photos) values(invite.team_id,auth.uid(),btrim(display_name),client_goal,photos) on conflict do nothing;
  end if;
  update public.coach_invites set accepted_at=now() where code=invite_code; return invite.team_id;
end;
$$;
create function public.set_client_sharing(team uuid, photos boolean) returns void language plpgsql security definer set search_path = '' as $$
begin
  update public.coach_clients set share_photos=photos where team_id=team and client_id=auth.uid();
  if not found then raise exception 'Client membership required'; end if;
end;
$$;
create function public.disconnect_coach_team(team uuid) returns void language plpgsql security definer set search_path = '' as $$
begin
  delete from public.coach_clients where team_id=team and client_id=auth.uid();
  if not found then raise exception 'Client membership required'; end if;
end;
$$;
create function public.remove_coach_member(team uuid, member uuid) returns void language plpgsql security definer set search_path = '' as $$
begin
  if not exists(select 1 from public.coach_teams where id=team and owner_id=auth.uid() and owner_id<>member) then raise exception 'Team owner required; owner cannot be removed'; end if;
  delete from public.coach_members where team_id=team and user_id=member;
end;
$$;
create function public.send_coach_message(team uuid, client uuid, message_body text) returns uuid language plpgsql security definer set search_path = '' as $$
declare sender text; message_id uuid;
begin
  if not public.in_conversation(team,client) then raise exception 'Conversation membership required'; end if;
  select display_name into sender from public.coach_members where team_id=team and user_id=auth.uid();
  if sender is null then select display_name into sender from public.coach_clients where team_id=team and client_id=auth.uid(); end if;
  insert into public.coach_messages(team_id,client_id,sender_id,sender_name,body) values(team,client,auth.uid(),sender,btrim(message_body)) returning id into message_id;
  return message_id;
end;
$$;
create function public.save_coach_note(team uuid, client uuid, note_body text) returns void language plpgsql security definer set search_path = '' as $$
begin
  if not public.is_coach(team) then raise exception 'Trainer membership required'; end if;
  insert into public.coach_notes(team_id,client_id,body,updated_by) values(team,client,note_body,auth.uid())
    on conflict(team_id,client_id) do update set body=excluded.body,updated_by=auth.uid(),updated_at=now();
end;
$$;
create function public.assign_coach_plan(team uuid, client uuid, plan_title text, plan_body text) returns uuid language plpgsql security definer set search_path = '' as $$
declare plan uuid;
begin
  if not public.is_coach(team) then raise exception 'Trainer membership required'; end if;
  insert into public.coach_plans(team_id,client_id,title,body,assigned_by) values(team,client,btrim(plan_title),btrim(plan_body),auth.uid()) returning id into plan;
  return plan;
end;
$$;

-- No direct writes; all RPCs derive identity from the authenticated session.
revoke all on function public.is_coach(uuid),public.is_team_participant(uuid),public.can_read_client(uuid,boolean),public.in_conversation(uuid,uuid),public.create_coach_team(text,text),public.create_coach_invite(uuid,text,text),public.preview_coach_invite(uuid),public.accept_coach_invite(uuid,text,text,boolean),public.set_client_sharing(uuid,boolean),public.disconnect_coach_team(uuid),public.remove_coach_member(uuid,uuid),public.send_coach_message(uuid,uuid,text),public.save_coach_note(uuid,uuid,text),public.assign_coach_plan(uuid,uuid,text,text) from public,anon,authenticated;
grant execute on function public.is_coach(uuid),public.is_team_participant(uuid),public.can_read_client(uuid,boolean),public.in_conversation(uuid,uuid),public.create_coach_team(text,text),public.create_coach_invite(uuid,text,text),public.preview_coach_invite(uuid),public.accept_coach_invite(uuid,text,text,boolean),public.set_client_sharing(uuid,boolean),public.disconnect_coach_team(uuid),public.remove_coach_member(uuid,uuid),public.send_coach_message(uuid,uuid,text),public.save_coach_note(uuid,uuid,text),public.assign_coach_plan(uuid,uuid,text,text) to authenticated;
