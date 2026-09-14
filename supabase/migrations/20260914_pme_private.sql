-- Petrolegaz: schema prive v1. Atomic; no existing table is overwritten.
begin;
create table public.pme_memberships (
  user_id uuid not null references auth.users(id) on delete cascade,
  pme_id text not null check (pme_id ~ '^rec[A-Za-z0-9]{14}$'),
  approved_at timestamptz not null default now(),
  primary key (user_id, pme_id)
);
create table public.pme_access_requests (
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  pme_id text not null check (pme_id ~ '^rec[A-Za-z0-9]{14}$'),
  message text not null check (char_length(message) between 20 and 2000),
  status text not null default 'pending' check (status in ('pending','approved','rejected')),
  created_at timestamptz not null default now(),
  primary key (user_id, pme_id)
);
create table public.pme_applications (
  pme_id text not null check (pme_id ~ '^rec[A-Za-z0-9]{14}$'),
  opportunity_id text not null check (opportunity_id ~ '^rec[A-Za-z0-9]{14}$'),
  title text not null check (char_length(title) between 1 and 300),
  status text not null default 'preparing' check (status in ('preparing','sent','discussion','accepted','rejected','abandoned')),
  created_by uuid default auth.uid() references auth.users(id) on delete set null,
  updated_at timestamptz not null default now(),
  primary key (pme_id, opportunity_id)
);
create table public.pme_application_events (
  id bigint generated always as identity primary key,
  pme_id text not null,
  opportunity_id text not null,
  actor_id uuid references auth.users(id) on delete set null,
  status text not null,
  occurred_at timestamptz not null default now(),
  foreign key (pme_id, opportunity_id) references public.pme_applications(pme_id, opportunity_id)
);
alter table public.pme_memberships enable row level security;
alter table public.pme_access_requests enable row level security;
alter table public.pme_applications enable row level security;
alter table public.pme_application_events enable row level security;
revoke all on public.pme_memberships, public.pme_access_requests, public.pme_applications, public.pme_application_events from public, anon, authenticated;
create policy own_memberships on public.pme_memberships for select to authenticated using (user_id = (select auth.uid()));
create policy own_requests on public.pme_access_requests for select to authenticated using (user_id = (select auth.uid()));
create policy request_access on public.pme_access_requests for insert to authenticated with check (user_id = (select auth.uid()) and status = 'pending');
create policy read_applications on public.pme_applications for select to authenticated using (
  exists (select 1 from public.pme_memberships m where m.pme_id = pme_applications.pme_id and m.user_id = (select auth.uid()))
);
create policy add_application on public.pme_applications for insert to authenticated with check (
  created_by = (select auth.uid()) and status = 'preparing' and
  exists (select 1 from public.pme_memberships m where m.pme_id = pme_applications.pme_id and m.user_id = (select auth.uid()))
);
create policy update_application on public.pme_applications for update to authenticated using (
  exists (select 1 from public.pme_memberships m where m.pme_id = pme_applications.pme_id and m.user_id = (select auth.uid()))
) with check (
  exists (select 1 from public.pme_memberships m where m.pme_id = pme_applications.pme_id and m.user_id = (select auth.uid()))
);
create policy read_events on public.pme_application_events for select to authenticated using (
  exists (select 1 from public.pme_memberships m where m.pme_id = pme_application_events.pme_id and m.user_id = (select auth.uid()))
);
-- Only operators can approve/revoke memberships. No browser mutation grant.
grant select on public.pme_memberships to authenticated;
grant select on public.pme_access_requests to authenticated;
grant insert (pme_id, message) on public.pme_access_requests to authenticated;
grant select on public.pme_applications to authenticated;
grant insert (pme_id, opportunity_id, title) on public.pme_applications to authenticated;
grant update (status) on public.pme_applications to authenticated;
grant select on public.pme_application_events to authenticated;
create function public.pme_stamp_application() returns trigger language plpgsql set search_path = '' as $$
begin
  new.updated_at = now();
  return new;
end;
$$;
create function public.pme_audit_application() returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if TG_OP = 'INSERT' or new.status is distinct from old.status then
    insert into public.pme_application_events (pme_id, opportunity_id, actor_id, status)
      values (new.pme_id, new.opportunity_id, auth.uid(), new.status);
  end if;
  return new;
end;
$$;
revoke all on function public.pme_stamp_application(), public.pme_audit_application() from public, anon, authenticated;
create trigger pme_application_stamp before update on public.pme_applications for each row execute function public.pme_stamp_application();
create trigger pme_application_audit after insert or update on public.pme_applications for each row execute function public.pme_audit_application();
commit;

