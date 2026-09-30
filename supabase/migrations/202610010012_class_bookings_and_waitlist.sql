create type public.class_booking_status as enum ('booked', 'waitlisted', 'cancelled');

create table public.class_bookings (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id) on delete cascade,
  branch_id uuid not null,
  class_session_id uuid not null,
  member_id uuid not null,
  status public.class_booking_status not null,
  confirmed_at timestamptz,
  waitlisted_at timestamptz,
  promoted_at timestamptz,
  cancelled_at timestamptz,
  cancelled_by uuid references auth.users (id) on delete restrict,
  cancellation_reason text check (
    cancellation_reason is null
    or char_length(trim(cancellation_reason)) between 2 and 500
  ),
  created_by uuid not null references auth.users (id) on delete restrict,
  updated_by uuid not null references auth.users (id) on delete restrict,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint class_bookings_branch_fk
    foreign key (branch_id, organization_id)
    references public.branches (id, organization_id) on delete restrict,
  constraint class_bookings_session_fk
    foreign key (class_session_id, organization_id)
    references public.class_sessions (id, organization_id) on delete restrict,
  constraint class_bookings_member_fk
    foreign key (member_id, organization_id)
    references public.members (id, organization_id) on delete restrict,
  constraint class_bookings_state_check check (
    (
      status = 'booked'
      and confirmed_at is not null
      and cancelled_at is null
      and cancelled_by is null
      and cancellation_reason is null
      and (
        (waitlisted_at is null and promoted_at is null)
        or (waitlisted_at is not null and promoted_at is not null)
      )
    )
    or (
      status = 'waitlisted'
      and confirmed_at is null
      and waitlisted_at is not null
      and promoted_at is null
      and cancelled_at is null
      and cancelled_by is null
      and cancellation_reason is null
    )
    or (
      status = 'cancelled'
      and cancelled_at is not null
      and cancelled_by is not null
      and cancellation_reason is not null
    )
  ),
  constraint class_bookings_id_organization_unique unique (id, organization_id)
);

create unique index class_bookings_active_member_unique
  on public.class_bookings (organization_id, class_session_id, member_id)
  where status in ('booked', 'waitlisted');
create index class_bookings_session_status_queue_idx
  on public.class_bookings (
    organization_id,
    class_session_id,
    status,
    waitlisted_at,
    created_at,
    id
  );
create index class_bookings_member_created_idx
  on public.class_bookings (organization_id, member_id, created_at desc);

create trigger class_bookings_set_updated_at
  before update on public.class_bookings
  for each row execute function public.set_updated_at();
create trigger class_bookings_audit
  after insert or update or delete on public.class_bookings
  for each row execute function public.capture_audit_change();

alter table public.class_bookings enable row level security;

create policy members_select_self on public.members
  for select to authenticated
  using (
    auth_user_id = auth.uid()
    and public.has_branch_role(
      organization_id,
      home_branch_id,
      array['member']::public.tenant_role[]
    )
  );

create policy class_bookings_select on public.class_bookings
  for select to authenticated
  using (
    public.is_platform_administrator()
    or public.has_branch_role(
      organization_id,
      branch_id,
      array['gym_owner', 'gym_manager', 'receptionist', 'trainer', 'accountant']::public.tenant_role[]
    )
    or (
      public.has_branch_role(
        organization_id,
        branch_id,
        array['member']::public.tenant_role[]
      )
      and exists (
        select 1
        from public.members m
        where m.id = class_bookings.member_id
          and m.organization_id = class_bookings.organization_id
          and m.auth_user_id = auth.uid()
      )
    )
  );

create or replace function public.book_class_session(
  p_organization_id uuid,
  p_class_session_id uuid,
  p_member_id uuid
)
returns table (
  class_booking_id uuid,
  booking_status public.class_booking_status,
  waitlist_position integer
)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor_id uuid := auth.uid();
  v_session public.class_sessions%rowtype;
  v_member public.members%rowtype;
  v_timezone text;
  v_local_date date;
  v_confirmed_count integer;
  v_waitlist_position integer;
  v_status public.class_booking_status;
  v_booking_id uuid;
begin
  if v_actor_id is null then
    raise exception 'authentication is required' using errcode = '42501';
  end if;

  select cs.* into v_session
  from public.class_sessions cs
  join public.organizations o on o.id = cs.organization_id
  join public.branches b on b.id = cs.branch_id and b.organization_id = cs.organization_id
  where cs.id = p_class_session_id
    and cs.organization_id = p_organization_id
    and cs.status = 'scheduled'
    and cs.start_at > clock_timestamp()
    and b.status = 'active'
    and o.status in ('trial', 'active')
  for update of cs;
  if v_session.id is null then
    raise exception 'bookable class session was not found' using errcode = 'P0002';
  end if;

  select m.* into v_member
  from public.members m
  where m.id = p_member_id
    and m.organization_id = p_organization_id
    and m.status = 'active';
  if v_member.id is null then
    raise exception 'active member was not found' using errcode = 'P0002';
  end if;

  if not public.has_branch_role(
    p_organization_id,
    v_session.branch_id,
    array['gym_owner', 'gym_manager', 'receptionist']::public.tenant_role[]
  ) and not (
    coalesce(v_member.auth_user_id = v_actor_id, false)
    and public.has_branch_role(
      p_organization_id,
      v_session.branch_id,
      array['member']::public.tenant_role[]
    )
  ) then
    raise exception 'class booking is not permitted' using errcode = '42501';
  end if;

  select o.timezone into v_timezone
  from public.organizations o
  where o.id = p_organization_id;
  v_local_date := (v_session.start_at at time zone v_timezone)::date;
  if not exists (
    select 1
    from public.member_memberships mm
    where mm.organization_id = p_organization_id
      and mm.branch_id = v_session.branch_id
      and mm.member_id = v_member.id
      and mm.lifecycle_state = 'open'
      and v_local_date between mm.start_date and mm.end_date
  ) then
    raise exception 'member does not have an active branch membership' using errcode = '22023';
  end if;

  if exists (
    select 1
    from public.class_bookings cb
    where cb.organization_id = p_organization_id
      and cb.class_session_id = v_session.id
      and cb.member_id = v_member.id
      and cb.status in ('booked', 'waitlisted')
  ) then
    raise exception 'member already has an active class booking' using errcode = '23505';
  end if;

  select count(*)::integer into v_confirmed_count
  from public.class_bookings cb
  where cb.organization_id = p_organization_id
    and cb.class_session_id = v_session.id
    and cb.status = 'booked';

  if v_confirmed_count < v_session.capacity then
    v_status := 'booked';
    v_waitlist_position := null;
  else
    v_status := 'waitlisted';
    select count(*)::integer + 1 into v_waitlist_position
    from public.class_bookings cb
    where cb.organization_id = p_organization_id
      and cb.class_session_id = v_session.id
      and cb.status = 'waitlisted';
  end if;

  insert into public.class_bookings (
    organization_id,
    branch_id,
    class_session_id,
    member_id,
    status,
    confirmed_at,
    waitlisted_at,
    created_by,
    updated_by
  ) values (
    p_organization_id,
    v_session.branch_id,
    v_session.id,
    v_member.id,
    v_status,
    case when v_status = 'booked' then clock_timestamp() else null end,
    case when v_status = 'waitlisted' then clock_timestamp() else null end,
    v_actor_id,
    v_actor_id
  ) returning id into v_booking_id;

  return query select v_booking_id, v_status, v_waitlist_position;
end;
$$;

create or replace function public.cancel_class_booking(
  p_organization_id uuid,
  p_class_booking_id uuid,
  p_reason text
)
returns table (promoted_member_id uuid)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor_id uuid := auth.uid();
  v_booking public.class_bookings%rowtype;
  v_session public.class_sessions%rowtype;
  v_promoted_member_id uuid;
begin
  if v_actor_id is null then
    raise exception 'authentication is required' using errcode = '42501';
  end if;
  if char_length(trim(coalesce(p_reason, ''))) not between 2 and 500 then
    raise exception 'cancellation reason is invalid' using errcode = '22023';
  end if;

  select cb.* into v_booking
  from public.class_bookings cb
  where cb.id = p_class_booking_id
    and cb.organization_id = p_organization_id;
  if v_booking.id is null or v_booking.status not in ('booked', 'waitlisted') then
    raise exception 'active class booking was not found' using errcode = 'P0002';
  end if;

  select cs.* into v_session
  from public.class_sessions cs
  where cs.id = v_booking.class_session_id
    and cs.organization_id = p_organization_id
  for update;
  if v_session.id is null or v_session.status <> 'scheduled' or v_session.start_at <= clock_timestamp() then
    raise exception 'class booking can no longer be cancelled' using errcode = '22023';
  end if;

  select cb.* into v_booking
  from public.class_bookings cb
  where cb.id = p_class_booking_id
    and cb.organization_id = p_organization_id
  for update;
  if v_booking.status not in ('booked', 'waitlisted') then
    raise exception 'active class booking was not found' using errcode = 'P0002';
  end if;

  if not public.has_branch_role(
    p_organization_id,
    v_booking.branch_id,
    array['gym_owner', 'gym_manager', 'receptionist']::public.tenant_role[]
  ) and not exists (
    select 1
    from public.members m
    where m.id = v_booking.member_id
      and m.organization_id = p_organization_id
      and m.auth_user_id = v_actor_id
      and public.has_branch_role(
        p_organization_id,
        v_booking.branch_id,
        array['member']::public.tenant_role[]
      )
  ) then
    raise exception 'class booking cancellation is not permitted' using errcode = '42501';
  end if;

  update public.class_bookings
  set
    status = 'cancelled',
    cancelled_at = clock_timestamp(),
    cancelled_by = v_actor_id,
    cancellation_reason = trim(p_reason),
    updated_by = v_actor_id
  where id = v_booking.id;

  if v_booking.status = 'booked' then
    select cb.member_id into v_promoted_member_id
    from public.class_bookings cb
    where cb.organization_id = p_organization_id
      and cb.class_session_id = v_session.id
      and cb.status = 'waitlisted'
    order by cb.waitlisted_at, cb.created_at, cb.id
    limit 1
    for update;

    if v_promoted_member_id is not null then
      update public.class_bookings
      set
        status = 'booked',
        confirmed_at = clock_timestamp(),
        promoted_at = clock_timestamp(),
        updated_by = v_actor_id
      where organization_id = p_organization_id
        and class_session_id = v_session.id
        and member_id = v_promoted_member_id
        and status = 'waitlisted';
    end if;
  end if;

  return query select v_promoted_member_id;
end;
$$;

create or replace function public.cancel_class_session(
  p_organization_id uuid,
  p_class_session_id uuid,
  p_reason text
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor_id uuid := auth.uid();
  v_session public.class_sessions%rowtype;
begin
  if v_actor_id is null then
    raise exception 'authentication is required' using errcode = '42501';
  end if;
  if char_length(trim(coalesce(p_reason, ''))) not between 2 and 500 then
    raise exception 'cancellation reason is invalid' using errcode = '22023';
  end if;

  select * into v_session
  from public.class_sessions
  where id = p_class_session_id and organization_id = p_organization_id
  for update;
  if v_session.id is null then
    raise exception 'class session was not found' using errcode = 'P0002';
  end if;
  if not public.has_branch_role(
    p_organization_id,
    v_session.branch_id,
    array['gym_owner', 'gym_manager', 'receptionist']::public.tenant_role[]
  ) then
    raise exception 'class cancellation is not permitted' using errcode = '42501';
  end if;
  if v_session.status <> 'scheduled' then
    raise exception 'class session is already cancelled' using errcode = '22023';
  end if;

  update public.class_sessions
  set
    status = 'cancelled',
    cancellation_reason = trim(p_reason),
    cancelled_at = clock_timestamp(),
    cancelled_by = v_actor_id,
    updated_by = v_actor_id
  where id = v_session.id;

  update public.class_bookings
  set
    status = 'cancelled',
    cancelled_at = clock_timestamp(),
    cancelled_by = v_actor_id,
    cancellation_reason = left('Class cancelled: ' || trim(p_reason), 500),
    updated_by = v_actor_id
  where organization_id = p_organization_id
    and class_session_id = v_session.id
    and status in ('booked', 'waitlisted');
end;
$$;

revoke all on table public.class_bookings from anon, authenticated;
grant select on table public.class_bookings to authenticated;
revoke all on function public.book_class_session(uuid, uuid, uuid) from public, anon;
grant execute on function public.book_class_session(uuid, uuid, uuid) to authenticated;
revoke all on function public.cancel_class_booking(uuid, uuid, text) from public, anon;
grant execute on function public.cancel_class_booking(uuid, uuid, text) to authenticated;
