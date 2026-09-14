-- Manual internal dispatcher. Does not activate any account or schedule work.
begin;
create function public.pme_alert_dispatch_context(p_user uuid) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare result jsonb;
begin
  if (select count(*) from public.pme_alert_outbox where user_id=p_user)>10000 then
    raise exception 'Delivery history limit reached; operator review required';
  end if;
  select jsonb_build_object(
    'userId',u.id,'recipient',u.email,'verified',u.email_confirmed_at is not null,
    'preferences',to_jsonb(p),
    'approved',a.consent_at is not null and a.consent_at=p.consent_at,
    'suppressed',exists(select 1 from public.pme_alert_suppressions where user_id=u.id),
    'due',a.last_attempt_at is null or a.last_attempt_at + (case p.frequency when 'daily' then interval '1 day' else interval '7 days' end)<=now(),
    'membershipIds',coalesce((select jsonb_agg(m.pme_id) from public.pme_memberships m where m.user_id=u.id),'[]'::jsonb),
    'jobs',coalesce((select jsonb_agg(jsonb_build_object('id',o.id,'opportunityId',o.opportunity_id,'state',o.state)) from public.pme_alert_outbox o where o.user_id=u.id),'[]'::jsonb)
  ) into result from auth.users u left join public.pme_alert_preferences p on p.user_id=u.id
    left join public.pme_alert_delivery_approvals a on a.user_id=u.id where u.id=p_user;
  return result;
end;
$$;

-- Fresh match facts replace the queued snapshot in the same transaction as the
-- once-only reservation. Membership is checked against the FRESH qualifying PMEs.
create function public.pme_dispatch_alert(p_job uuid,p_user uuid,p_recipient text,p_hash text,
  p_consent timestamptz,p_pmes text[],p_deadline timestamptz,p_score integer) returns boolean
language plpgsql security definer set search_path = '' as $$
declare pref public.pme_alert_preferences;
begin
  select * into pref from public.pme_alert_preferences where user_id=p_user for update;
  if not found or pref.consent_at is distinct from p_consent or p_consent is null
    or p_deadline is null or p_deadline<=now() or p_score is null or p_score not between 1 and 100
    or p_pmes is null or cardinality(p_pmes) not between 1 and 100 then return false; end if;
  update public.pme_alert_outbox set pme_ids=p_pmes,deadline=p_deadline,score=p_score
    where id=p_job and user_id=p_user and state='queued' and consent_at=p_consent;
  if not found then return false; end if;
  return public.pme_authorize_alert(p_job,p_recipient,p_hash);
end;
$$;
revoke all on function public.pme_alert_dispatch_context(uuid),public.pme_dispatch_alert(uuid,uuid,text,text,timestamptz,text[],timestamptz,integer) from public,anon,authenticated,service_role;
grant execute on function public.pme_alert_dispatch_context(uuid),public.pme_dispatch_alert(uuid,uuid,text,text,timestamptz,text[],timestamptz,integer) to service_role;
commit;
