-- Server-only delivery foundations. No scheduler and no activation of accounts.
-- Apply once, after the private PME and preference migrations.
begin;
create table public.pme_alert_delivery_approvals (
  user_id uuid primary key references auth.users(id) on delete cascade,
  -- A separate, reviewed approval of the CURRENT consent is required for delivery.
  consent_at timestamptz not null,
  approved_at timestamptz not null default now(),
  last_attempt_at timestamptz
);
create table public.pme_alert_outbox (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  opportunity_id text not null check (opportunity_id ~ '^rec[A-Za-z0-9]{14}$' and opportunity_id !~ '^recTEST'),
  pme_ids text[] not null check (cardinality(pme_ids) between 1 and 100),
  deadline timestamptz not null,
  score integer not null check (score between 1 and 100),
  consent_at timestamptz not null,
  state text not null default 'queued' check (state in ('queued','attempting','accepted','unknown','cancelled')),
  payload_hash text check (payload_hash ~ '^[a-f0-9]{64}$'),
  provider_id uuid unique,
  created_at timestamptz not null default now(),
  attempted_at timestamptz,
  finished_at timestamptz,
  unique(user_id, opportunity_id)
);
create table public.pme_alert_suppressions (
  user_id uuid primary key references auth.users(id) on delete cascade,
  reason text not null check (reason in ('unsubscribe','bounce','complaint','suppressed')),
  created_at timestamptz not null default now()
);
create table public.pme_alert_provider_events (
  event_id text primary key check (length(event_id) between 1 and 200),
  provider_id uuid not null,
  event_type text not null check (event_type in ('email.delivered','email.bounced','email.complained','email.suppressed')),
  received_at timestamptz not null default now()
);
create index pme_alert_provider_events_message on public.pme_alert_provider_events(provider_id);
alter table public.pme_alert_delivery_approvals enable row level security;
alter table public.pme_alert_outbox enable row level security;
alter table public.pme_alert_suppressions enable row level security;
alter table public.pme_alert_provider_events enable row level security;
revoke all on public.pme_alert_delivery_approvals,public.pme_alert_outbox,public.pme_alert_suppressions,public.pme_alert_provider_events from public,anon,authenticated,service_role;
grant select on public.pme_alert_outbox to service_role;

-- The planner must supply a fresh, publicly sourced match. Client calls are denied.
create function public.pme_enqueue_alert(p_user uuid,p_opportunity text,p_pmes text[],p_deadline timestamptz,p_score integer)
returns uuid language plpgsql security definer set search_path = '' as $$
declare pref public.pme_alert_preferences; result uuid;
begin
  select * into pref from public.pme_alert_preferences where user_id=p_user for update;
  if not found or not pref.enabled or pref.consent_version is distinct from 'alerts-v1' or pref.consent_at is null then return null; end if;
  if not exists(select 1 from public.pme_alert_delivery_approvals where user_id=p_user and consent_at=pref.consent_at)
    or exists(select 1 from public.pme_alert_suppressions where user_id=p_user)
    or not exists(select 1 from auth.users where id=p_user and email_confirmed_at is not null and email is not null)
    or p_deadline is null or p_deadline<=now() or p_score is null or p_score<pref.min_score
    or p_pmes is null or cardinality(p_pmes) not between 1 and 100
    or not exists(select 1 from public.pme_memberships where user_id=p_user and pme_id=any(p_pmes) and pme_id !~ '^recTEST') then return null; end if;
  insert into public.pme_alert_outbox(user_id,opportunity_id,pme_ids,deadline,score,consent_at)
    values(p_user,p_opportunity,p_pmes,p_deadline,p_score,pref.consent_at)
    on conflict(user_id,opportunity_id) do nothing returning id into result;
  return result;
end;
$$;

-- Atomic authorization immediately before HTTP dispatch. At most ONE attempt,
-- including crashes. No automatic retry can escape the provider's 24h window.
-- Lock preferences first, consistently with enqueue/unsubscribe and the trigger.
create function public.pme_authorize_alert(p_job uuid,p_recipient text,p_hash text)
returns boolean language plpgsql security definer set search_path = '' as $$
declare uid uuid; pref public.pme_alert_preferences; job public.pme_alert_outbox; approval public.pme_alert_delivery_approvals;
begin
  select user_id into uid from public.pme_alert_outbox where id=p_job;
  if not found then return false; end if;
  select * into pref from public.pme_alert_preferences where user_id=uid for update;
  select * into approval from public.pme_alert_delivery_approvals where user_id=uid for update;
  select * into job from public.pme_alert_outbox where id=p_job for update;
  if job.state<>'queued' then return false; end if;
  if pref.enabled is distinct from true or pref.consent_version is distinct from 'alerts-v1'
    or pref.consent_at is distinct from job.consent_at or approval.consent_at is distinct from job.consent_at
    or exists(select 1 from public.pme_alert_suppressions where user_id=uid)
    or not exists(select 1 from auth.users where id=uid and email=p_recipient and email_confirmed_at is not null)
    or job.deadline<=now() or job.score<pref.min_score
    or not exists(select 1 from public.pme_memberships where user_id=uid and pme_id=any(job.pme_ids) and pme_id !~ '^recTEST') then
    update public.pme_alert_outbox set state='cancelled',finished_at=now() where id=p_job;
    return false;
  end if;
  if approval.last_attempt_at is not null and approval.last_attempt_at +
    (case pref.frequency when 'daily' then interval '1 day' else interval '7 days' end) > now() then return false; end if;
  if p_hash is null or p_hash !~ '^[a-f0-9]{64}$' then raise exception 'Invalid payload hash'; end if;
  update public.pme_alert_delivery_approvals set last_attempt_at=now() where user_id=uid;
  update public.pme_alert_outbox set state='attempting',attempted_at=now(),payload_hash=p_hash where id=p_job;
  return true;
end;
$$;

create function public.pme_finish_alert(p_job uuid,p_provider uuid default null)
returns void language plpgsql security definer set search_path = '' as $$
begin
  if p_provider is not null then perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(p_provider::text,0)); end if;
  perform 1 from public.pme_alert_preferences where user_id=(select user_id from public.pme_alert_outbox where id=p_job) for update;
  update public.pme_alert_outbox set state=case when p_provider is null then 'unknown' else 'accepted' end,
    provider_id=p_provider,finished_at=now() where id=p_job and state='attempting';
  if p_provider is not null then perform public.pme_reconcile_alert_events(p_provider); end if;
end;
$$;

-- Service-authenticated receipt only; caller must first validate the RAW signed
-- webhook. Persist early events, then reconcile when send acceptance is stored.
create function public.pme_reconcile_alert_events(p_provider uuid)
returns void language plpgsql security definer set search_path = '' as $$
declare uid uuid; v_reason text;
begin
  select user_id into uid from public.pme_alert_outbox where provider_id=p_provider;
  if uid is null then return; end if;
  select case event_type when 'email.complained' then 'complaint' when 'email.bounced' then 'bounce' else 'suppressed' end
    into v_reason from public.pme_alert_provider_events where provider_id=p_provider and event_type<>'email.delivered' limit 1;
  if v_reason is null then return; end if;
  perform public.pme_unsubscribe_alert_user(uid);
  -- Never clear a suppression on a delayed delivery notification.
  update public.pme_alert_suppressions set reason=v_reason where user_id=uid;
end;
$$;
create function public.pme_record_alert_event(p_event text,p_provider uuid,p_type text)
returns void language plpgsql security definer set search_path = '' as $$
begin
  -- Serialize this provider id with finish: no lost event if acceptance races.
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(p_provider::text,0));
  insert into public.pme_alert_provider_events(event_id,provider_id,event_type) values(p_event,p_provider,p_type) on conflict do nothing;
  perform public.pme_reconcile_alert_events(p_provider);
end;
$$;

-- Called only by the server AFTER verification of a signed unsubscribe token.
-- Idempotent and independent of membership; it never grants/approves anything.
create function public.pme_unsubscribe_alert_user(p_user uuid)
returns void language plpgsql security definer set search_path = '' as $$
declare pref public.pme_alert_preferences;
begin
  select * into pref from public.pme_alert_preferences where user_id=p_user for update;
  if not found then return; end if;
  insert into public.pme_alert_suppressions(user_id,reason) values(p_user,'unsubscribe') on conflict do nothing;
  delete from public.pme_alert_delivery_approvals where user_id=p_user;
  update public.pme_alert_preferences set enabled=false,consent_at=null,consent_version=null,updated_at=now() where user_id=p_user;
  if pref.enabled then
    insert into public.pme_alert_preference_events(user_id,enabled,frequency,min_score,consent_version)
      values(p_user,false,pref.frequency,pref.min_score,null);
  end if;
end;
$$;

-- Existing authenticated UI unsubscribe also cancels queued deliveries.
-- An already in-flight provider request cannot be recalled by a DB trigger.
create function public.pme_cancel_changed_alerts() returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if not new.enabled or new.consent_at is distinct from old.consent_at then
    update public.pme_alert_outbox set state='cancelled',finished_at=now() where user_id=new.user_id and state='queued';
    delete from public.pme_alert_delivery_approvals where user_id=new.user_id;
  end if;
  return new;
end;
$$;
create trigger pme_cancel_changed_alerts after update on public.pme_alert_preferences
  for each row execute function public.pme_cancel_changed_alerts();
revoke all on function public.pme_enqueue_alert(uuid,text,text[],timestamptz,integer),
  public.pme_authorize_alert(uuid,text,text),public.pme_finish_alert(uuid,uuid),public.pme_unsubscribe_alert_user(uuid),
  public.pme_cancel_changed_alerts(),public.pme_reconcile_alert_events(uuid),public.pme_record_alert_event(text,uuid,text) from public,anon,authenticated,service_role;
grant execute on function public.pme_enqueue_alert(uuid,text,text[],timestamptz,integer),
  public.pme_authorize_alert(uuid,text,text),public.pme_finish_alert(uuid,uuid),public.pme_unsubscribe_alert_user(uuid),public.pme_record_alert_event(text,uuid,text) to service_role;
commit;
