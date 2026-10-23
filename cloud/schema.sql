-- 在新 Supabase 專案的 SQL Editor 執行一次；不會建立管理者。
begin;
create schema if not exists shenkeng_private;
revoke all on schema shenkeng_private from public, anon;
grant usage on schema shenkeng_private to authenticated;

create table if not exists shenkeng_private.admins (
  user_id uuid primary key references auth.users(id) on delete cascade
);
alter table shenkeng_private.admins enable row level security;
revoke all on shenkeng_private.admins from public, anon, authenticated;

create or replace function public.is_learning_admin()
returns boolean language sql stable security definer set search_path = '' as $$
  select coalesce((auth.jwt()->>'is_anonymous')::boolean, false) = false
    and exists(select 1 from shenkeng_private.admins a where a.user_id = auth.uid());
$$;
revoke all on function public.is_learning_admin() from public, anon;
grant execute on function public.is_learning_admin() to authenticated;

create table if not exists public.learning_players (
  user_id uuid primary key references auth.users(id) on delete cascade,
  nickname text not null check (char_length(nickname) between 1 and 20),
  role text not null check (role in ('resident','merchant','student','teacher','visitor')),
  consent_version text not null,
  progress jsonb not null default '{"visited":[],"completed":[],"active":null}',
  epoch integer not null default 0,
  created_at timestamptz not null default now(),
  last_seen timestamptz not null default now()
);
create table if not exists public.learning_events (
  id uuid primary key,
  user_id uuid not null references public.learning_players(user_id) on delete cascade,
  epoch integer not null,
  event_type text not null check(event_type in ('login','explore','answer','mission_complete','reset')),
  target text not null check(char_length(target) <= 100),
  payload jsonb not null default '{}',
  occurred_at timestamptz not null,
  received_at timestamptz not null default now()
);
create index if not exists learning_events_user_time on public.learning_events(user_id, received_at);
create index if not exists learning_players_last_seen on public.learning_players(last_seen);
alter table public.learning_players enable row level security;
alter table public.learning_events enable row level security;
revoke all on public.learning_players, public.learning_events from public, anon, authenticated;
grant select on public.learning_players, public.learning_events to authenticated;
drop policy if exists players_read on public.learning_players;
create policy players_read on public.learning_players for select to authenticated
using (user_id = (select auth.uid()) or (select public.is_learning_admin()));
drop policy if exists events_read on public.learning_events;
create policy events_read on public.learning_events for select to authenticated
using (user_id = (select auth.uid()) or (select public.is_learning_admin()));

-- Writes go through this function, never accept a user_id from the browser.
-- epoch prevents stale/offline tabs restoring progress after a reset.
create or replace function public.sync_learning(
  p_nickname text, p_role text, p_consent text, p_progress jsonb,
  p_events jsonb default '[]', p_epoch integer default 0, p_reset boolean default false
) returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  uid uuid := auth.uid(); row_data public.learning_players%rowtype;
  combined jsonb; event jsonb; visits jsonb; completed jsonb; active text;
begin
  if uid is null then raise exception 'Authentication required'; end if;
  if char_length(trim(p_nickname)) not between 1 and 20
    or p_role not in ('resident','merchant','student','teacher','visitor')
    or p_consent is null or char_length(p_consent) not between 1 and 80
    then raise exception 'Invalid profile'; end if;
  if p_progress is null or jsonb_typeof(p_progress) <> 'object'
    or coalesce(jsonb_typeof(p_progress->'visited'),'null') <> 'array'
    or coalesce(jsonb_typeof(p_progress->'completed'),'null') <> 'array'
    or jsonb_array_length(p_progress->'visited') > 500
    or jsonb_array_length(p_progress->'completed') > 6
    or p_events is null or jsonb_typeof(p_events) <> 'array'
    or jsonb_array_length(p_events) > 50 then raise exception 'Invalid batch'; end if;
  if exists(select 1 from jsonb_array_elements(p_progress->'visited') x
      where jsonb_typeof(x) <> 'string' or length(x#>>'{}') > 100)
    or exists(select 1 from jsonb_array_elements_text(p_progress->'completed') x
      where x not in ('river','people','student','workshop','culture','impact'))
    then raise exception 'Invalid progress'; end if;
  active := p_progress->>'active';
  if active is not null and active not in ('river','people','student','workshop','culture','impact')
    then raise exception 'Invalid mission'; end if;
  insert into public.learning_players(user_id,nickname,role,consent_version)
    values(uid,trim(p_nickname),p_role,p_consent) on conflict(user_id) do nothing;
  select * into row_data from public.learning_players where user_id=uid for update;
  if p_epoch <> row_data.epoch then
    return jsonb_build_object('progress',row_data.progress,'epoch',row_data.epoch,'reset_detected',true);
  end if;
  if p_reset then
    combined := '{"visited":[],"completed":[],"active":null}'::jsonb;
    row_data.epoch := row_data.epoch + 1;
  else
    select coalesce(jsonb_agg(value order by value),'[]') into visits from (
      select distinct value from jsonb_array_elements_text(
        (row_data.progress->'visited') || (p_progress->'visited'))) q;
    select coalesce(jsonb_agg(value order by value),'[]') into completed from (
      select distinct value from jsonb_array_elements_text(
        (row_data.progress->'completed') || (p_progress->'completed'))) q;
    combined := jsonb_build_object('visited',visits,'completed',completed,'active',active);
  end if;
  update public.learning_players set nickname=trim(p_nickname),role=p_role,
    consent_version=p_consent,progress=combined,epoch=row_data.epoch,last_seen=now() where user_id=uid;
  for event in select value from jsonb_array_elements(p_events) loop
    if event->>'event_type' not in ('login','explore','answer','mission_complete','reset')
      or char_length(coalesce(event->>'target','')) > 100
      or coalesce(jsonb_typeof(event->'payload'),'null') <> 'object'
      or octet_length((event->'payload')::text)>1000 then raise exception 'Invalid event'; end if;
    insert into public.learning_events(id,user_id,epoch,event_type,target,payload,occurred_at)
      values((event->>'id')::uuid,uid,row_data.epoch,event->>'event_type',coalesce(event->>'target',''),
        event->'payload',(event->>'occurred_at')::timestamptz)
      on conflict(id) do nothing;
  end loop;
  return jsonb_build_object('progress',combined,'epoch',row_data.epoch,'reset_detected',false);
end;
$$;
revoke all on function public.sync_learning(text,text,text,jsonb,jsonb,integer,boolean) from public, anon;
grant execute on function public.sync_learning(text,text,text,jsonb,jsonb,integer,boolean) to authenticated;

create or replace function public.delete_my_learning()
returns void language plpgsql security definer set search_path = '' as $$
begin
  if auth.uid() is null then raise exception 'Authentication required'; end if;
  delete from public.learning_players where user_id=auth.uid();
end;
$$;
revoke all on function public.delete_my_learning() from public, anon;
grant execute on function public.delete_my_learning() to authenticated;
commit;
