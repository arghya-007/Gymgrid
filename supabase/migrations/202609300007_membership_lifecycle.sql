create or replace function public.organization_local_date(p_organization_id uuid)
returns date
language sql
stable
security definer
set search_path = ''
as $$
  select (now() at time zone o.timezone)::date
  from public.organizations o
  where o.id = p_organization_id;
$$;

alter table public.member_memberships
  add column renewed_from_membership_id uuid,
  add column cancelled_on date,
  add column cancellation_reason text,
  add column cancelled_by uuid references auth.users (id) on delete restrict,
  add constraint member_memberships_renewed_from_fk
    foreign key (renewed_from_membership_id, organization_id)
    references public.member_memberships (id, organization_id) on delete restrict,
  add constraint member_memberships_not_self_renewal_check check (
    renewed_from_membership_id is null or renewed_from_membership_id <> id
  ),
  add constraint member_memberships_cancellation_state_check check (
    (
      lifecycle_state = 'cancelled'
      and cancelled_on is not null
      and cancellation_reason is not null
      and cancelled_by is not null
    )
    or (
      lifecycle_state <> 'cancelled'
      and cancelled_on is null
      and cancellation_reason is null
      and cancelled_by is null
    )
  ),
  add constraint member_memberships_cancellation_reason_check check (
    cancellation_reason is null
    or char_length(trim(cancellation_reason)) between 2 and 500
  );

create index member_memberships_renewed_from_idx
  on public.member_memberships (organization_id, renewed_from_membership_id)
  where renewed_from_membership_id is not null;

create table public.membership_freezes (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id) on delete cascade,
  branch_id uuid not null,
  membership_id uuid not null,
  freeze_start_date date not null,
  resume_date date,
  frozen_days integer check (frozen_days is null or frozen_days >= 0),
  reason text check (reason is null or char_length(trim(reason)) between 2 and 500),
  created_by uuid not null references auth.users (id) on delete restrict,
  resumed_by uuid references auth.users (id) on delete restrict,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint membership_freezes_branch_fk
    foreign key (branch_id, organization_id)
    references public.branches (id, organization_id) on delete restrict,
  constraint membership_freezes_membership_fk
    foreign key (membership_id, organization_id)
    references public.member_memberships (id, organization_id) on delete restrict,
  constraint membership_freezes_resume_state_check check (
    (
      resume_date is null
      and frozen_days is null
      and resumed_by is null
    )
    or (
      resume_date is not null
      and resume_date >= freeze_start_date
      and frozen_days = resume_date - freeze_start_date
      and resumed_by is not null
    )
  )
);

create unique index membership_freezes_one_open_idx
  on public.membership_freezes (membership_id)
  where resume_date is null;
create index membership_freezes_organization_membership_idx
  on public.membership_freezes (organization_id, membership_id, freeze_start_date desc);

create trigger membership_freezes_set_updated_at
  before update on public.membership_freezes
  for each row execute function public.set_updated_at();
create trigger membership_freezes_audit
  after insert or update or delete on public.membership_freezes
  for each row execute function public.capture_audit_change();

alter table public.membership_freezes enable row level security;

create policy membership_freezes_select on public.membership_freezes
  for select to authenticated
  using (
    public.is_platform_administrator()
    or public.has_branch_role(
      organization_id,
      branch_id,
      array[
        'gym_owner',
        'gym_manager',
        'receptionist',
        'trainer',
        'accountant'
      ]::public.tenant_role[]
    )
  );

create or replace view public.member_membership_statuses
with (security_invoker = true)
as
select
  mm.id,
  mm.organization_id,
  mm.branch_id,
  mm.member_id,
  mm.membership_plan_id,
  mm.enrollment_code,
  mm.start_date,
  mm.end_date,
  case
    when mm.lifecycle_state = 'cancelled' then 'cancelled'
    when mm.lifecycle_state = 'frozen' then 'frozen'
    when mm.start_date > public.organization_local_date(mm.organization_id) then 'scheduled'
    when mm.end_date < public.organization_local_date(mm.organization_id) then 'expired'
    else 'active'
  end as status,
  mm.plan_code,
  mm.plan_name,
  mm.duration_value,
  mm.duration_unit,
  mm.price_amount_minor,
  mm.joining_fee_amount_minor,
  mm.contract_amount_minor,
  mm.currency,
  mm.tax_inclusive,
  mm.notes,
  mm.created_at,
  mm.updated_at,
  mm.renewed_from_membership_id,
  mm.cancelled_on,
  mm.cancellation_reason
from public.member_memberships mm;

create or replace function public.enroll_member(
  p_organization_id uuid,
  p_member_id uuid,
  p_membership_plan_id uuid,
  p_start_date date,
  p_notes text default null
)
returns table (
  membership_id uuid,
  enrollment_code text,
  membership_status text
)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor_id uuid := auth.uid();
  v_member public.members%rowtype;
  v_plan public.membership_plans%rowtype;
  v_local_date date;
  v_end_date date;
  v_sequence bigint;
  v_membership_id uuid;
  v_enrollment_code text;
  v_membership_status text;
  v_active_member_limit bigint;
  v_active_member_count bigint;
begin
  if v_actor_id is null then
    raise exception 'authentication is required' using errcode = '42501';
  end if;

  v_local_date := public.organization_local_date(p_organization_id);

  if v_local_date is null then
    raise exception 'organization is unavailable' using errcode = '22023';
  end if;

  if p_start_date is null
    or p_start_date < date '1900-01-01'
    or p_start_date > (v_local_date + interval '5 years')::date then
    raise exception 'membership start date is invalid' using errcode = '22023';
  end if;

  if p_notes is not null and char_length(p_notes) > 2000 then
    raise exception 'notes are too long' using errcode = '22023';
  end if;

  if not exists (
    select 1
    from public.organizations o
    where o.id = p_organization_id
      and o.status in ('trial', 'active')
  ) then
    raise exception 'organization is unavailable' using errcode = '22023';
  end if;

  select m.* into v_member
  from public.members m
  where m.id = p_member_id
    and m.organization_id = p_organization_id
  for update;

  if not found or v_member.status <> 'active' then
    raise exception 'member is unavailable' using errcode = '22023';
  end if;

  if not public.has_branch_role(
    p_organization_id,
    v_member.home_branch_id,
    array['gym_owner', 'gym_manager', 'receptionist']::public.tenant_role[]
  ) then
    raise exception 'member enrolment is not permitted' using errcode = '42501';
  end if;

  select mp.* into v_plan
  from public.membership_plans mp
  where mp.id = p_membership_plan_id
    and mp.organization_id = p_organization_id
    and mp.active
    and (mp.branch_id is null or mp.branch_id = v_member.home_branch_id);

  if not found then
    raise exception 'membership plan is unavailable' using errcode = '22023';
  end if;

  v_end_date := case v_plan.duration_unit
    when 'day' then p_start_date + (v_plan.duration_value - 1)
    when 'week' then p_start_date + (v_plan.duration_value * 7 - 1)
    when 'month' then
      (p_start_date + make_interval(months => v_plan.duration_value))::date - 1
    when 'year' then
      (p_start_date + make_interval(years => v_plan.duration_value))::date - 1
  end;

  perform pg_advisory_xact_lock(
    hashtextextended('enrolment-allowance:' || p_organization_id::text, 0)
  );
  perform pg_advisory_xact_lock(
    hashtextextended('member-enrolment:' || p_member_id::text, 0)
  );

  if exists (
    select 1
    from public.member_memberships mm
    where mm.organization_id = p_organization_id
      and mm.member_id = p_member_id
      and mm.lifecycle_state in ('open', 'frozen')
      and daterange(mm.start_date, mm.end_date, '[]')
        && daterange(p_start_date, v_end_date, '[]')
  ) then
    raise exception 'membership dates overlap an existing enrolment'
      using errcode = '23P01';
  end if;

  select se.limit_value into v_active_member_limit
  from public.subscriptions s
  join public.subscription_entitlements se
    on se.subscription_id = s.id
    and se.organization_id = s.organization_id
  where s.organization_id = p_organization_id
    and s.status in ('trialing', 'active', 'past_due')
    and se.code = 'active_members'
    and se.enabled
  order by s.created_at desc
  limit 1;

  if v_active_member_limit is not null and not exists (
    select 1
    from public.member_memberships mm
    where mm.organization_id = p_organization_id
      and mm.member_id = p_member_id
      and mm.lifecycle_state in ('open', 'frozen')
      and mm.end_date >= v_local_date
  ) then
    select count(distinct mm.member_id) into v_active_member_count
    from public.member_memberships mm
    where mm.organization_id = p_organization_id
      and mm.lifecycle_state in ('open', 'frozen')
      and mm.end_date >= v_local_date;

    if v_active_member_count >= v_active_member_limit then
      raise exception 'active member allowance has been reached' using errcode = 'P0003';
    end if;
  end if;

  insert into public.enrollment_number_counters (organization_id, next_value)
  values (p_organization_id, 2)
  on conflict (organization_id) do update
    set next_value = public.enrollment_number_counters.next_value + 1
  returning next_value - 1 into v_sequence;

  v_enrollment_code := 'E' || lpad(v_sequence::text, 6, '0');

  insert into public.member_memberships (
    organization_id,
    branch_id,
    member_id,
    membership_plan_id,
    enrollment_code,
    start_date,
    end_date,
    plan_code,
    plan_name,
    duration_value,
    duration_unit,
    price_amount_minor,
    joining_fee_amount_minor,
    currency,
    tax_inclusive,
    notes,
    created_by,
    updated_by
  ) values (
    p_organization_id,
    v_member.home_branch_id,
    p_member_id,
    p_membership_plan_id,
    v_enrollment_code,
    p_start_date,
    v_end_date,
    v_plan.code,
    v_plan.name,
    v_plan.duration_value,
    v_plan.duration_unit,
    v_plan.price_amount_minor,
    v_plan.joining_fee_amount_minor,
    v_plan.currency,
    v_plan.tax_inclusive,
    nullif(trim(p_notes), ''),
    v_actor_id,
    v_actor_id
  )
  returning id into v_membership_id;

  v_membership_status := case
    when p_start_date > v_local_date then 'scheduled'
    when v_end_date < v_local_date then 'expired'
    else 'active'
  end;

  return query
    select v_membership_id, v_enrollment_code, v_membership_status;
end;
$$;

create or replace function public.renew_membership(
  p_organization_id uuid,
  p_source_membership_id uuid,
  p_membership_plan_id uuid,
  p_start_date date default null,
  p_notes text default null
)
returns table (
  membership_id uuid,
  enrollment_code text,
  membership_status text
)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_source public.member_memberships%rowtype;
  v_start_date date;
  v_local_date date;
  v_new_membership_id uuid;
  v_enrollment_code text;
  v_membership_status text;
begin
  select mm.* into v_source
  from public.member_memberships mm
  where mm.id = p_source_membership_id
    and mm.organization_id = p_organization_id
  for update;

  if not found then
    raise exception 'membership was not found' using errcode = '22023';
  end if;

  if v_source.lifecycle_state in ('frozen', 'cancelled') then
    raise exception 'membership cannot be renewed in its current state' using errcode = '22023';
  end if;

  if not public.has_branch_role(
    p_organization_id,
    v_source.branch_id,
    array['gym_owner', 'gym_manager', 'receptionist']::public.tenant_role[]
  ) then
    raise exception 'membership renewal is not permitted' using errcode = '42501';
  end if;

  v_local_date := public.organization_local_date(p_organization_id);
  v_start_date := coalesce(
    p_start_date,
    greatest(v_source.end_date + 1, v_local_date)
  );

  select result.membership_id, result.enrollment_code, result.membership_status
    into v_new_membership_id, v_enrollment_code, v_membership_status
  from public.enroll_member(
    p_organization_id,
    v_source.member_id,
    p_membership_plan_id,
    v_start_date,
    p_notes
  ) result;

  update public.member_memberships
  set renewed_from_membership_id = p_source_membership_id
  where id = v_new_membership_id
    and organization_id = p_organization_id;

  return query
    select v_new_membership_id, v_enrollment_code, v_membership_status;
end;
$$;

create or replace function public.freeze_membership(
  p_organization_id uuid,
  p_membership_id uuid,
  p_effective_date date default null,
  p_reason text default null
)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor_id uuid := auth.uid();
  v_membership public.member_memberships%rowtype;
  v_local_date date := public.organization_local_date(p_organization_id);
  v_effective_date date := coalesce(p_effective_date, v_local_date);
begin
  if v_actor_id is null then
    raise exception 'authentication is required' using errcode = '42501';
  end if;

  select mm.* into v_membership
  from public.member_memberships mm
  where mm.id = p_membership_id
    and mm.organization_id = p_organization_id
  for update;

  if not found
    or v_membership.lifecycle_state <> 'open'
    or v_membership.start_date > v_local_date
    or v_membership.end_date < v_local_date then
    raise exception 'only an active membership can be frozen' using errcode = '22023';
  end if;

  if v_effective_date < v_membership.start_date
    or v_effective_date > v_local_date then
    raise exception 'freeze date is invalid' using errcode = '22023';
  end if;

  if p_reason is not null
    and char_length(trim(p_reason)) not between 2 and 500 then
    raise exception 'freeze reason is invalid' using errcode = '22023';
  end if;

  if not public.has_branch_role(
    p_organization_id,
    v_membership.branch_id,
    array['gym_owner', 'gym_manager', 'receptionist']::public.tenant_role[]
  ) then
    raise exception 'membership freeze is not permitted' using errcode = '42501';
  end if;

  insert into public.membership_freezes (
    organization_id,
    branch_id,
    membership_id,
    freeze_start_date,
    reason,
    created_by
  ) values (
    p_organization_id,
    v_membership.branch_id,
    p_membership_id,
    v_effective_date,
    nullif(trim(p_reason), ''),
    v_actor_id
  );

  update public.member_memberships
  set lifecycle_state = 'frozen', updated_by = v_actor_id
  where id = p_membership_id and organization_id = p_organization_id;

  return true;
end;
$$;

create or replace function public.resume_membership(
  p_organization_id uuid,
  p_membership_id uuid,
  p_effective_date date default null
)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor_id uuid := auth.uid();
  v_membership public.member_memberships%rowtype;
  v_freeze public.membership_freezes%rowtype;
  v_local_date date := public.organization_local_date(p_organization_id);
  v_effective_date date := coalesce(p_effective_date, v_local_date);
  v_frozen_days integer;
begin
  if v_actor_id is null then
    raise exception 'authentication is required' using errcode = '42501';
  end if;

  select mm.* into v_membership
  from public.member_memberships mm
  where mm.id = p_membership_id
    and mm.organization_id = p_organization_id
  for update;

  if not found or v_membership.lifecycle_state <> 'frozen' then
    raise exception 'membership is not frozen' using errcode = '22023';
  end if;

  if not public.has_branch_role(
    p_organization_id,
    v_membership.branch_id,
    array['gym_owner', 'gym_manager', 'receptionist']::public.tenant_role[]
  ) then
    raise exception 'membership resume is not permitted' using errcode = '42501';
  end if;

  select mf.* into v_freeze
  from public.membership_freezes mf
  where mf.membership_id = p_membership_id
    and mf.organization_id = p_organization_id
    and mf.resume_date is null
  for update;

  if not found
    or v_effective_date < v_freeze.freeze_start_date
    or v_effective_date > v_local_date then
    raise exception 'resume date is invalid' using errcode = '22023';
  end if;

  v_frozen_days := v_effective_date - v_freeze.freeze_start_date;

  if exists (
    select 1
    from public.member_memberships other_membership
    where other_membership.organization_id = p_organization_id
      and other_membership.member_id = v_membership.member_id
      and other_membership.id <> p_membership_id
      and other_membership.lifecycle_state in ('open', 'frozen')
      and daterange(
        other_membership.start_date,
        other_membership.end_date,
        '[]'
      ) && daterange(
        v_membership.start_date,
        v_membership.end_date + v_frozen_days,
        '[]'
      )
  ) then
    raise exception 'resuming this membership would overlap another membership'
      using errcode = '23P01';
  end if;

  update public.membership_freezes
  set
    resume_date = v_effective_date,
    frozen_days = v_frozen_days,
    resumed_by = v_actor_id
  where id = v_freeze.id;

  update public.member_memberships
  set
    lifecycle_state = 'open',
    end_date = end_date + v_frozen_days,
    updated_by = v_actor_id
  where id = p_membership_id and organization_id = p_organization_id;

  return v_frozen_days;
end;
$$;

create or replace function public.cancel_membership(
  p_organization_id uuid,
  p_membership_id uuid,
  p_effective_date date default null,
  p_reason text default null
)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor_id uuid := auth.uid();
  v_membership public.member_memberships%rowtype;
  v_local_date date := public.organization_local_date(p_organization_id);
  v_effective_date date := coalesce(p_effective_date, v_local_date);
begin
  if v_actor_id is null then
    raise exception 'authentication is required' using errcode = '42501';
  end if;

  if char_length(trim(coalesce(p_reason, ''))) not between 2 and 500 then
    raise exception 'cancellation reason is required' using errcode = '22023';
  end if;

  select mm.* into v_membership
  from public.member_memberships mm
  where mm.id = p_membership_id
    and mm.organization_id = p_organization_id
  for update;

  if not found
    or v_membership.lifecycle_state = 'cancelled'
    or (
      v_membership.lifecycle_state = 'open'
      and v_membership.end_date < v_local_date
    ) then
    raise exception 'membership cannot be cancelled in its current state' using errcode = '22023';
  end if;

  if v_effective_date > v_local_date
    or (
      v_membership.start_date <= v_local_date
      and v_effective_date < v_membership.start_date
    ) then
    raise exception 'cancellation date is invalid' using errcode = '22023';
  end if;

  if not public.has_branch_role(
    p_organization_id,
    v_membership.branch_id,
    array['gym_owner', 'gym_manager', 'receptionist']::public.tenant_role[]
  ) then
    raise exception 'membership cancellation is not permitted' using errcode = '42501';
  end if;

  if v_membership.lifecycle_state = 'frozen' then
    if not exists (
      select 1
      from public.membership_freezes mf
      where mf.membership_id = p_membership_id
        and mf.organization_id = p_organization_id
        and mf.resume_date is null
        and mf.freeze_start_date <= v_effective_date
    ) then
      raise exception 'cancellation date precedes the active freeze' using errcode = '22023';
    end if;

    update public.membership_freezes
    set
      resume_date = v_effective_date,
      frozen_days = v_effective_date - freeze_start_date,
      resumed_by = v_actor_id
    where membership_id = p_membership_id
      and organization_id = p_organization_id
      and resume_date is null;
  end if;

  update public.member_memberships
  set
    lifecycle_state = 'cancelled',
    cancelled_on = v_effective_date,
    cancellation_reason = trim(p_reason),
    cancelled_by = v_actor_id,
    updated_by = v_actor_id
  where id = p_membership_id and organization_id = p_organization_id;

  return true;
end;
$$;

revoke all on table public.membership_freezes from anon;
grant select on table public.membership_freezes to authenticated;

revoke all on function public.organization_local_date(uuid) from public, anon;
revoke all on function public.renew_membership(
  uuid, uuid, uuid, date, text
) from public, anon;
revoke all on function public.freeze_membership(
  uuid, uuid, date, text
) from public, anon;
revoke all on function public.resume_membership(
  uuid, uuid, date
) from public, anon;
revoke all on function public.cancel_membership(
  uuid, uuid, date, text
) from public, anon;

grant execute on function public.organization_local_date(uuid) to authenticated;
grant execute on function public.renew_membership(
  uuid, uuid, uuid, date, text
) to authenticated;
grant execute on function public.freeze_membership(
  uuid, uuid, date, text
) to authenticated;
grant execute on function public.resume_membership(
  uuid, uuid, date
) to authenticated;
grant execute on function public.cancel_membership(
  uuid, uuid, date, text
) to authenticated;
