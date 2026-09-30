create table public.member_check_ins (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id) on delete cascade,
  branch_id uuid not null,
  member_id uuid not null,
  membership_id uuid not null,
  checked_in_at timestamptz not null default now(),
  checked_in_local_date date not null,
  entry_method text not null default 'staff' check (entry_method in ('staff')),
  recorded_by uuid not null references auth.users (id) on delete restrict,
  created_at timestamptz not null default now(),
  constraint member_check_ins_branch_fk
    foreign key (branch_id, organization_id)
    references public.branches (id, organization_id) on delete restrict,
  constraint member_check_ins_member_fk
    foreign key (member_id, organization_id)
    references public.members (id, organization_id) on delete restrict,
  constraint member_check_ins_membership_fk
    foreign key (membership_id, organization_id)
    references public.member_memberships (id, organization_id) on delete restrict
);

create index member_check_ins_organization_date_idx
  on public.member_check_ins (organization_id, checked_in_local_date desc, checked_in_at desc);
create index member_check_ins_branch_date_idx
  on public.member_check_ins (organization_id, branch_id, checked_in_local_date desc, checked_in_at desc);
create index member_check_ins_member_time_idx
  on public.member_check_ins (organization_id, member_id, checked_in_at desc);

create trigger member_check_ins_audit
  after insert or update or delete on public.member_check_ins
  for each row execute function public.capture_audit_change();

alter table public.member_check_ins enable row level security;

create policy member_check_ins_select on public.member_check_ins
  for select to authenticated
  using (
    public.is_platform_administrator()
    or public.has_branch_role(
      organization_id,
      branch_id,
      array['gym_owner', 'gym_manager', 'receptionist']::public.tenant_role[]
    )
  );

create or replace function public.record_member_check_in(
  p_organization_id uuid,
  p_branch_id uuid,
  p_member_id uuid
)
returns table (check_in_id uuid, membership_id uuid, checked_in_at timestamptz)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor_id uuid := auth.uid();
  v_local_date date := public.organization_local_date(p_organization_id);
  v_checked_in_at timestamptz := clock_timestamp();
  v_membership_id uuid;
  v_check_in_id uuid;
begin
  if v_actor_id is null then
    raise exception 'authentication is required' using errcode = '42501';
  end if;

  if not public.has_branch_role(
    p_organization_id,
    p_branch_id,
    array['gym_owner', 'gym_manager', 'receptionist']::public.tenant_role[]
  ) then
    raise exception 'member check-in is not permitted' using errcode = '42501';
  end if;

  if not exists (
    select 1
    from public.branches b
    join public.organizations o on o.id = b.organization_id
    where b.id = p_branch_id
      and b.organization_id = p_organization_id
      and b.status = 'active'
      and o.status in ('trial', 'active')
  ) then
    raise exception 'organization or branch is unavailable' using errcode = '22023';
  end if;

  if not exists (
    select 1 from public.members m
    where m.id = p_member_id
      and m.organization_id = p_organization_id
      and m.status = 'active'
  ) then
    raise exception 'active member was not found' using errcode = '22023';
  end if;

  perform pg_advisory_xact_lock(
    hashtextextended(
      'member-check-in:' || p_organization_id::text || ':' || p_member_id::text,
      0
    )
  );

  if exists (
    select 1 from public.member_check_ins ci
    where ci.organization_id = p_organization_id
      and ci.branch_id = p_branch_id
      and ci.member_id = p_member_id
      and ci.checked_in_at >= v_checked_in_at - interval '2 minutes'
  ) then
    raise exception 'member was already checked in recently' using errcode = '23505';
  end if;

  select mm.id into v_membership_id
  from public.member_memberships mm
  where mm.organization_id = p_organization_id
    and mm.branch_id = p_branch_id
    and mm.member_id = p_member_id
    and mm.lifecycle_state = 'open'
    and v_local_date between mm.start_date and mm.end_date
  order by mm.end_date desc, mm.created_at desc
  limit 1
  for share;

  if v_membership_id is null then
    raise exception 'member has no active membership at this branch' using errcode = 'P0002';
  end if;

  insert into public.member_check_ins (
    organization_id,
    branch_id,
    member_id,
    membership_id,
    checked_in_at,
    checked_in_local_date,
    recorded_by
  ) values (
    p_organization_id,
    p_branch_id,
    p_member_id,
    v_membership_id,
    v_checked_in_at,
    v_local_date,
    v_actor_id
  ) returning id into v_check_in_id;

  return query select v_check_in_id, v_membership_id, v_checked_in_at;
end;
$$;

create or replace function public.get_operational_report(
  p_organization_id uuid,
  p_branch_id uuid,
  p_start_date date,
  p_end_date date
)
returns table (
  report_date date,
  check_in_count bigint,
  new_member_count bigint,
  payment_amount_minor bigint,
  expiring_membership_count bigint
)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor_id uuid := auth.uid();
  v_timezone text;
begin
  if v_actor_id is null then
    raise exception 'authentication is required' using errcode = '42501';
  end if;

  if p_start_date is null
    or p_end_date is null
    or p_end_date < p_start_date
    or p_end_date - p_start_date > 92 then
    raise exception 'report range must contain 1 to 93 days' using errcode = '22023';
  end if;

  if not public.has_branch_role(
    p_organization_id,
    p_branch_id,
    array['gym_owner', 'gym_manager']::public.tenant_role[]
  ) then
    raise exception 'operational reports are not permitted' using errcode = '42501';
  end if;

  select o.timezone into v_timezone
  from public.organizations o
  where o.id = p_organization_id
    and o.status in ('trial', 'active');
  if v_timezone is null then
    raise exception 'organization is unavailable' using errcode = '22023';
  end if;

  if p_branch_id is not null and not exists (
    select 1 from public.branches b
    where b.id = p_branch_id
      and b.organization_id = p_organization_id
      and b.status = 'active'
  ) then
    raise exception 'branch is unavailable' using errcode = '22023';
  end if;

  return query
  select
    day.report_date,
    (
      select count(*) from public.member_check_ins ci
      where ci.organization_id = p_organization_id
        and (p_branch_id is null or ci.branch_id = p_branch_id)
        and ci.checked_in_local_date = day.report_date
    ),
    (
      select count(*) from public.members m
      where m.organization_id = p_organization_id
        and (p_branch_id is null or m.home_branch_id = p_branch_id)
        and (m.created_at at time zone v_timezone)::date = day.report_date
    ),
    (
      select coalesce(sum(mp.amount_minor), 0)::bigint
      from public.manual_payments mp
      where mp.organization_id = p_organization_id
        and (p_branch_id is null or mp.branch_id = p_branch_id)
        and mp.payment_date = day.report_date
        and mp.status = 'recorded'
    ),
    (
      select count(*) from public.member_memberships mm
      where mm.organization_id = p_organization_id
        and (p_branch_id is null or mm.branch_id = p_branch_id)
        and mm.end_date = day.report_date
        and mm.lifecycle_state in ('open', 'frozen')
    )
  from (
    select generated_day::date as report_date
    from generate_series(p_start_date, p_end_date, interval '1 day') generated_day
  ) day
  order by day.report_date;
end;
$$;

revoke all on table public.member_check_ins from anon, authenticated;
grant select on table public.member_check_ins to authenticated;
revoke all on function public.record_member_check_in(uuid, uuid, uuid) from public, anon;
grant execute on function public.record_member_check_in(uuid, uuid, uuid) to authenticated;
revoke all on function public.get_operational_report(uuid, uuid, date, date) from public, anon;
grant execute on function public.get_operational_report(uuid, uuid, date, date) to authenticated;
