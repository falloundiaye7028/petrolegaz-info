-- Preferences only. No scheduler, outbound HTTP, SMTP or delivery queue.
begin;
create table public.pme_alert_preferences (
  user_id uuid primary key references auth.users(id) on delete cascade,
  enabled boolean not null default false,
  frequency text not null default 'weekly' check (frequency in ('daily','weekly')),
  min_score integer not null default 50 check (min_score between 1 and 100),
  consent_version text,
  consent_at timestamptz,
  updated_at timestamptz not null default now(),
  check (not enabled or (consent_version = 'alerts-v1' and consent_at is not null))
);
create table public.pme_alert_preference_events (
  id bigint generated always as identity primary key,
  user_id uuid not null references auth.users(id) on delete cascade,
  enabled boolean not null,
  frequency text not null,
  min_score integer not null,
  consent_version text,
  occurred_at timestamptz not null default now()
);
alter table public.pme_alert_preferences enable row level security;
alter table public.pme_alert_preference_events enable row level security;
revoke all on public.pme_alert_preferences, public.pme_alert_preference_events from public, anon, authenticated;
grant select on public.pme_alert_preferences, public.pme_alert_preference_events to authenticated;
create policy own_alert_preferences on public.pme_alert_preferences for select to authenticated using (user_id = (select auth.uid()));
create policy own_alert_events on public.pme_alert_preference_events for select to authenticated using (user_id = (select auth.uid()));

-- No caller-supplied user id/email; an authenticated account can change only itself.
create function public.pme_save_alert_preferences(p_enabled boolean, p_frequency text, p_min_score integer, p_consent_version text default null)
returns setof public.pme_alert_preferences language plpgsql security definer set search_path = '' as $$
declare uid uuid := auth.uid(); saved public.pme_alert_preferences;
begin
  if uid is null then raise exception 'Authentication required'; end if;
  if p_enabled is null or p_frequency is null or p_frequency not in ('daily','weekly') or p_min_score is null or p_min_score not between 1 and 100 then
    raise exception 'Invalid preferences';
  end if;
  if p_enabled and p_consent_version is distinct from 'alerts-v1' then raise exception 'Explicit consent required'; end if;
  insert into public.pme_alert_preferences(user_id,enabled,frequency,min_score,consent_version,consent_at)
    values(uid,p_enabled,p_frequency,p_min_score,case when p_enabled then p_consent_version end,case when p_enabled then now() end)
  on conflict (user_id) do update set enabled=excluded.enabled,frequency=excluded.frequency,min_score=excluded.min_score,
    consent_version=excluded.consent_version,consent_at=excluded.consent_at,updated_at=now()
  returning * into saved;
  insert into public.pme_alert_preference_events(user_id,enabled,frequency,min_score,consent_version)
    values(uid,saved.enabled,saved.frequency,saved.min_score,saved.consent_version);
  return next saved;
end;
$$;
revoke all on function public.pme_save_alert_preferences(boolean,text,integer,text) from public, anon, authenticated;
grant execute on function public.pme_save_alert_preferences(boolean,text,integer,text) to authenticated;

-- Unsubscribe without reading preferences first; remains possible after membership revocation.
create function public.pme_unsubscribe_alerts() returns void language plpgsql security definer set search_path = '' as $$
declare uid uuid := auth.uid();
begin
  if uid is null then raise exception 'Authentication required'; end if;
  perform public.pme_save_alert_preferences(false,'weekly',50,null);
end;
$$;
revoke all on function public.pme_unsubscribe_alerts() from public, anon, authenticated;
grant execute on function public.pme_unsubscribe_alerts() to authenticated;
commit;
