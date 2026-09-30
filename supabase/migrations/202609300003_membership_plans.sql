create type public.membership_plan_duration_unit as enum (
  'day',
  'week',
  'month',
  'year'
);

create table public.membership_plans (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id) on delete cascade,
  branch_id uuid,
  code text not null check (code ~ '^[A-Z0-9][A-Z0-9_-]{0,19}$'),
  name text not null check (char_length(trim(name)) between 2 and 120),
  description text check (description is null or char_length(description) <= 1000),
  duration_value integer not null check (duration_value between 1 and 3650),
  duration_unit public.membership_plan_duration_unit not null,
  price_amount_minor bigint not null check (price_amount_minor >= 0),
  joining_fee_amount_minor bigint not null default 0 check (joining_fee_amount_minor >= 0),
  currency char(3) not null default 'INR' check (currency = upper(currency)),
  tax_inclusive boolean not null default true,
  active boolean not null default true,
  sort_order integer not null default 100 check (sort_order between 0 and 10000),
  created_by uuid not null references auth.users (id) on delete restrict,
  updated_by uuid not null references auth.users (id) on delete restrict,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint membership_plans_branch_fk
    foreign key (branch_id, organization_id)
    references public.branches (id, organization_id) on delete restrict,
  constraint membership_plans_organization_code_unique
    unique (organization_id, code)
);

create index membership_plans_organization_active_sort_idx
  on public.membership_plans (organization_id, active desc, sort_order, name);
create index membership_plans_organization_branch_idx
  on public.membership_plans (organization_id, branch_id);

create trigger membership_plans_set_updated_at before update on public.membership_plans
  for each row execute function public.set_updated_at();
create trigger membership_plans_audit after insert or update or delete on public.membership_plans
  for each row execute function public.capture_audit_change();

create or replace function public.create_membership_plan(
  p_organization_id uuid,
  p_branch_id uuid,
  p_code text,
  p_name text,
  p_description text,
  p_duration_value integer,
  p_duration_unit public.membership_plan_duration_unit,
  p_price_amount_minor bigint,
  p_joining_fee_amount_minor bigint,
  p_tax_inclusive boolean,
  p_active boolean
)
returns table (
  membership_plan_id uuid,
  membership_plan_code text
)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor_id uuid := auth.uid();
  v_currency char(3);
  v_plan_id uuid;
  v_plan_code text := upper(trim(p_code));
begin
  if v_actor_id is null then
    raise exception 'authentication is required' using errcode = '42501';
  end if;

  select o.currency into v_currency
  from public.organizations o
  where o.id = p_organization_id
    and o.status in ('trial', 'active');

  if v_currency is null then
    raise exception 'organization is unavailable' using errcode = '22023';
  end if;

  if p_branch_id is not null and not exists (
    select 1
    from public.branches b
    where b.id = p_branch_id
      and b.organization_id = p_organization_id
      and b.status = 'active'
  ) then
    raise exception 'branch is unavailable' using errcode = '22023';
  end if;

  if not public.has_branch_role(
    p_organization_id,
    p_branch_id,
    array['gym_owner', 'gym_manager']::public.tenant_role[]
  ) then
    raise exception 'plan management is not permitted' using errcode = '42501';
  end if;

  if v_plan_code !~ '^[A-Z0-9][A-Z0-9_-]{0,19}$' then
    raise exception 'plan code is invalid' using errcode = '22023';
  end if;

  if p_name is null or char_length(trim(p_name)) not between 2 and 120 then
    raise exception 'plan name is invalid' using errcode = '22023';
  end if;

  if p_description is not null and char_length(p_description) > 1000 then
    raise exception 'plan description is too long' using errcode = '22023';
  end if;

  if p_duration_value is null or p_duration_value not between 1 and 3650 then
    raise exception 'plan duration is invalid' using errcode = '22023';
  end if;

  if p_price_amount_minor is null or p_price_amount_minor < 0
    or p_joining_fee_amount_minor is null or p_joining_fee_amount_minor < 0 then
    raise exception 'plan price is invalid' using errcode = '22023';
  end if;

  insert into public.membership_plans (
    organization_id,
    branch_id,
    code,
    name,
    description,
    duration_value,
    duration_unit,
    price_amount_minor,
    joining_fee_amount_minor,
    currency,
    tax_inclusive,
    active,
    created_by,
    updated_by
  )
  values (
    p_organization_id,
    p_branch_id,
    v_plan_code,
    trim(p_name),
    nullif(trim(p_description), ''),
    p_duration_value,
    p_duration_unit,
    p_price_amount_minor,
    p_joining_fee_amount_minor,
    v_currency,
    p_tax_inclusive,
    p_active,
    v_actor_id,
    v_actor_id
  )
  returning id into v_plan_id;

  return query select v_plan_id, v_plan_code;
end;
$$;

create or replace function public.update_membership_plan(
  p_membership_plan_id uuid,
  p_organization_id uuid,
  p_branch_id uuid,
  p_code text,
  p_name text,
  p_description text,
  p_duration_value integer,
  p_duration_unit public.membership_plan_duration_unit,
  p_price_amount_minor bigint,
  p_joining_fee_amount_minor bigint,
  p_tax_inclusive boolean,
  p_active boolean
)
returns table (
  membership_plan_id uuid,
  membership_plan_code text
)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor_id uuid := auth.uid();
  v_existing_branch_id uuid;
  v_plan_code text := upper(trim(p_code));
begin
  if v_actor_id is null then
    raise exception 'authentication is required' using errcode = '42501';
  end if;

  select mp.branch_id into v_existing_branch_id
  from public.membership_plans mp
  where mp.id = p_membership_plan_id
    and mp.organization_id = p_organization_id;

  if not found then
    raise exception 'membership plan was not found' using errcode = '22023';
  end if;

  if p_branch_id is not null and not exists (
    select 1
    from public.branches b
    where b.id = p_branch_id
      and b.organization_id = p_organization_id
      and b.status = 'active'
  ) then
    raise exception 'branch is unavailable' using errcode = '22023';
  end if;

  if not public.has_branch_role(
    p_organization_id,
    v_existing_branch_id,
    array['gym_owner', 'gym_manager']::public.tenant_role[]
  ) or not public.has_branch_role(
    p_organization_id,
    p_branch_id,
    array['gym_owner', 'gym_manager']::public.tenant_role[]
  ) then
    raise exception 'plan management is not permitted' using errcode = '42501';
  end if;

  if v_plan_code !~ '^[A-Z0-9][A-Z0-9_-]{0,19}$'
    or p_name is null
    or char_length(trim(p_name)) not between 2 and 120
    or (p_description is not null and char_length(p_description) > 1000)
    or p_duration_value is null
    or p_duration_value not between 1 and 3650
    or p_price_amount_minor is null
    or p_price_amount_minor < 0
    or p_joining_fee_amount_minor is null
    or p_joining_fee_amount_minor < 0 then
    raise exception 'membership plan values are invalid' using errcode = '22023';
  end if;

  update public.membership_plans
  set
    branch_id = p_branch_id,
    code = v_plan_code,
    name = trim(p_name),
    description = nullif(trim(p_description), ''),
    duration_value = p_duration_value,
    duration_unit = p_duration_unit,
    price_amount_minor = p_price_amount_minor,
    joining_fee_amount_minor = p_joining_fee_amount_minor,
    tax_inclusive = p_tax_inclusive,
    active = p_active,
    updated_by = v_actor_id
  where id = p_membership_plan_id
    and organization_id = p_organization_id;

  return query select p_membership_plan_id, v_plan_code;
end;
$$;

alter table public.membership_plans enable row level security;

create policy membership_plans_select on public.membership_plans for select to authenticated
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
    or (
      active
      and (
        (branch_id is null and public.is_organization_user(organization_id))
        or (branch_id is not null and public.has_branch_access(organization_id, branch_id))
      )
    )
  );

revoke all on table public.membership_plans from anon;
grant select on table public.membership_plans to authenticated;

revoke all on function public.create_membership_plan(
  uuid,
  uuid,
  text,
  text,
  text,
  integer,
  public.membership_plan_duration_unit,
  bigint,
  bigint,
  boolean,
  boolean
) from public, anon;
revoke all on function public.update_membership_plan(
  uuid,
  uuid,
  uuid,
  text,
  text,
  text,
  integer,
  public.membership_plan_duration_unit,
  bigint,
  bigint,
  boolean,
  boolean
) from public, anon;

grant execute on function public.create_membership_plan(
  uuid,
  uuid,
  text,
  text,
  text,
  integer,
  public.membership_plan_duration_unit,
  bigint,
  bigint,
  boolean,
  boolean
) to authenticated;
grant execute on function public.update_membership_plan(
  uuid,
  uuid,
  uuid,
  text,
  text,
  text,
  integer,
  public.membership_plan_duration_unit,
  bigint,
  bigint,
  boolean,
  boolean
) to authenticated;
