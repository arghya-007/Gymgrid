create type public.membership_lifecycle_state as enum (
  'open',
  'frozen',
  'cancelled'
);

create table public.enrollment_number_counters (
  organization_id uuid primary key references public.organizations (id) on delete cascade,
  next_value bigint not null default 1 check (next_value > 0)
);

create table public.member_memberships (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id) on delete cascade,
  branch_id uuid not null,
  member_id uuid not null,
  membership_plan_id uuid not null,
  enrollment_code text not null check (enrollment_code ~ '^E[0-9]{6,}$'),
  start_date date not null,
  end_date date not null,
  lifecycle_state public.membership_lifecycle_state not null default 'open',
  plan_code text not null,
  plan_name text not null,
  duration_value integer not null check (duration_value between 1 and 3650),
  duration_unit public.membership_plan_duration_unit not null,
  price_amount_minor bigint not null check (price_amount_minor >= 0),
  joining_fee_amount_minor bigint not null check (joining_fee_amount_minor >= 0),
  contract_amount_minor bigint generated always as (
    price_amount_minor + joining_fee_amount_minor
  ) stored,
  currency char(3) not null check (currency = upper(currency)),
  tax_inclusive boolean not null,
  notes text check (notes is null or char_length(notes) <= 2000),
  created_by uuid not null references auth.users (id) on delete restrict,
  updated_by uuid not null references auth.users (id) on delete restrict,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint member_memberships_branch_fk
    foreign key (branch_id, organization_id)
    references public.branches (id, organization_id) on delete restrict,
  constraint member_memberships_member_fk
    foreign key (member_id, organization_id)
    references public.members (id, organization_id) on delete restrict,
  constraint member_memberships_plan_fk
    foreign key (membership_plan_id, organization_id)
    references public.membership_plans (id, organization_id) on delete restrict,
  constraint member_memberships_organization_code_unique
    unique (organization_id, enrollment_code),
  constraint member_memberships_id_organization_unique
    unique (id, organization_id),
  constraint member_memberships_dates_check check (end_date >= start_date)
);

create index member_memberships_organization_member_dates_idx
  on public.member_memberships (organization_id, member_id, start_date desc);
create index member_memberships_organization_branch_dates_idx
  on public.member_memberships (organization_id, branch_id, end_date desc);
create index member_memberships_organization_state_idx
  on public.member_memberships (organization_id, lifecycle_state, end_date);

create trigger member_memberships_set_updated_at
  before update on public.member_memberships
  for each row execute function public.set_updated_at();
create trigger member_memberships_audit
  after insert or update or delete on public.member_memberships
  for each row execute function public.capture_audit_change();

alter table public.enrollment_number_counters enable row level security;
alter table public.member_memberships enable row level security;

create policy member_memberships_select on public.member_memberships
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

create view public.member_membership_statuses
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
    when mm.start_date > current_date then 'scheduled'
    when mm.end_date < current_date then 'expired'
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
  mm.updated_at
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

  if p_start_date is null
    or p_start_date < date '1900-01-01'
    or p_start_date > (current_date + interval '5 years')::date then
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
      and mm.end_date >= current_date
  ) then
    select count(distinct mm.member_id) into v_active_member_count
    from public.member_memberships mm
    where mm.organization_id = p_organization_id
      and mm.lifecycle_state in ('open', 'frozen')
      and mm.end_date >= current_date;

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
    when p_start_date > current_date then 'scheduled'
    when v_end_date < current_date then 'expired'
    else 'active'
  end;

  return query
    select v_membership_id, v_enrollment_code, v_membership_status;
end;
$$;

revoke all on table public.enrollment_number_counters from anon, authenticated;
revoke all on table public.member_memberships from anon;
grant select on table public.member_memberships to authenticated;
grant select on table public.member_membership_statuses to authenticated;

revoke all on function public.enroll_member(
  uuid, uuid, uuid, date, text
) from public, anon;
grant execute on function public.enroll_member(
  uuid, uuid, uuid, date, text
) to authenticated;
