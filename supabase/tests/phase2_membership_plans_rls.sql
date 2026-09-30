\set ON_ERROR_STOP on

-- Phase 2 membership-plan security smoke test.
-- Run against a disposable database after applying all migrations.

begin;

insert into auth.users (
  instance_id,
  id,
  aud,
  role,
  email,
  encrypted_password,
  email_confirmed_at,
  raw_app_meta_data,
  raw_user_meta_data,
  created_at,
  updated_at
)
values
  ('00000000-0000-0000-0000-000000000000', '12000000-0000-0000-0000-000000000001', 'authenticated', 'authenticated', 'plan-owner-a@gymgrid.test', crypt('test-password', gen_salt('bf')), now(), '{}', '{}', now(), now()),
  ('00000000-0000-0000-0000-000000000000', '12000000-0000-0000-0000-000000000002', 'authenticated', 'authenticated', 'plan-manager-a@gymgrid.test', crypt('test-password', gen_salt('bf')), now(), '{}', '{}', now(), now()),
  ('00000000-0000-0000-0000-000000000000', '12000000-0000-0000-0000-000000000003', 'authenticated', 'authenticated', 'plan-reception-a@gymgrid.test', crypt('test-password', gen_salt('bf')), now(), '{}', '{}', now(), now()),
  ('00000000-0000-0000-0000-000000000000', '12000000-0000-0000-0000-000000000004', 'authenticated', 'authenticated', 'plan-member-a@gymgrid.test', crypt('test-password', gen_salt('bf')), now(), '{}', '{}', now(), now()),
  ('00000000-0000-0000-0000-000000000000', '12000000-0000-0000-0000-000000000005', 'authenticated', 'authenticated', 'plan-owner-b@gymgrid.test', crypt('test-password', gen_salt('bf')), now(), '{}', '{}', now(), now());

insert into public.organizations (id, slug, name, status)
values
  ('22000000-0000-0000-0000-000000000001', 'plan-test-a', 'Plan Test A', 'active'),
  ('22000000-0000-0000-0000-000000000002', 'plan-test-b', 'Plan Test B', 'active');

insert into public.branches (id, organization_id, code, name)
values
  ('32000000-0000-0000-0000-000000000001', '22000000-0000-0000-0000-000000000001', 'MAIN', 'Plan Test A Main'),
  ('32000000-0000-0000-0000-000000000002', '22000000-0000-0000-0000-000000000002', 'MAIN', 'Plan Test B Main');

insert into public.organization_users (id, organization_id, user_id, status, joined_at)
values
  ('42000000-0000-0000-0000-000000000001', '22000000-0000-0000-0000-000000000001', '12000000-0000-0000-0000-000000000001', 'active', now()),
  ('42000000-0000-0000-0000-000000000002', '22000000-0000-0000-0000-000000000001', '12000000-0000-0000-0000-000000000002', 'active', now()),
  ('42000000-0000-0000-0000-000000000003', '22000000-0000-0000-0000-000000000001', '12000000-0000-0000-0000-000000000003', 'active', now()),
  ('42000000-0000-0000-0000-000000000004', '22000000-0000-0000-0000-000000000001', '12000000-0000-0000-0000-000000000004', 'active', now()),
  ('42000000-0000-0000-0000-000000000005', '22000000-0000-0000-0000-000000000002', '12000000-0000-0000-0000-000000000005', 'active', now());

insert into public.organization_user_roles (
  organization_id,
  organization_user_id,
  role,
  branch_id
)
values
  ('22000000-0000-0000-0000-000000000001', '42000000-0000-0000-0000-000000000001', 'gym_owner', null),
  ('22000000-0000-0000-0000-000000000001', '42000000-0000-0000-0000-000000000002', 'gym_manager', '32000000-0000-0000-0000-000000000001'),
  ('22000000-0000-0000-0000-000000000001', '42000000-0000-0000-0000-000000000003', 'receptionist', '32000000-0000-0000-0000-000000000001'),
  ('22000000-0000-0000-0000-000000000001', '42000000-0000-0000-0000-000000000004', 'member', '32000000-0000-0000-0000-000000000001'),
  ('22000000-0000-0000-0000-000000000002', '42000000-0000-0000-0000-000000000005', 'gym_owner', null);

set local role authenticated;
select set_config('request.jwt.claim.role', 'authenticated', true);
select set_config('request.jwt.claim.sub', '12000000-0000-0000-0000-000000000001', true);

do $$
declare
  v_plan_id uuid;
  v_plan_code text;
begin
  select result.membership_plan_id, result.membership_plan_code
    into v_plan_id, v_plan_code
  from public.create_membership_plan(
    '22000000-0000-0000-0000-000000000001',
    null,
    'ANNUAL',
    'Annual Membership',
    'Organization-wide annual plan',
    1,
    'year',
    1200000,
    50000,
    true,
    true
  ) result;

  if v_plan_id is null or v_plan_code <> 'ANNUAL' then
    raise exception 'Plan creation failure: unexpected id or code %', v_plan_code;
  end if;

  begin
    insert into public.membership_plans (
      organization_id,
      code,
      name,
      duration_value,
      duration_unit,
      price_amount_minor,
      created_by,
      updated_by
    ) values (
      '22000000-0000-0000-0000-000000000001',
      'DIRECT',
      'Direct Plan',
      1,
      'month',
      10000,
      '12000000-0000-0000-0000-000000000001',
      '12000000-0000-0000-0000-000000000001'
    );
    raise exception 'RLS failure: direct plan insert was permitted';
  exception
    when insufficient_privilege then null;
  end;
end;
$$;

select set_config('request.jwt.claim.sub', '12000000-0000-0000-0000-000000000002', true);

do $$
declare
  v_branch_plan_id uuid;
begin
  select result.membership_plan_id into v_branch_plan_id
  from public.create_membership_plan(
    '22000000-0000-0000-0000-000000000001',
    '32000000-0000-0000-0000-000000000001',
    'MONTHLY',
    'Monthly Membership',
    null,
    1,
    'month',
    150000,
    0,
    true,
    true
  ) result;

  if v_branch_plan_id is null then
    raise exception 'Branch manager could not create an assigned-branch plan';
  end if;

  begin
    perform public.create_membership_plan(
      '22000000-0000-0000-0000-000000000001',
      null,
      'ORG-WIDE',
      'Unauthorized Organization Plan',
      null,
      1,
      'month',
      100000,
      0,
      true,
      true
    );
    raise exception 'Authorization failure: branch manager created an organization-wide plan';
  exception
    when insufficient_privilege then null;
  end;
end;
$$;

select set_config('request.jwt.claim.sub', '12000000-0000-0000-0000-000000000003', true);

do $$
begin
  begin
    perform public.create_membership_plan(
      '22000000-0000-0000-0000-000000000001',
      '32000000-0000-0000-0000-000000000001',
      'RECEPTION',
      'Reception Plan',
      null,
      1,
      'month',
      100000,
      0,
      true,
      true
    );
    raise exception 'Authorization failure: receptionist created a plan';
  exception
    when insufficient_privilege then null;
  end;
end;
$$;

select set_config('request.jwt.claim.sub', '12000000-0000-0000-0000-000000000004', true);

do $$
declare
  v_visible_plans integer;
begin
  select count(*) into v_visible_plans from public.membership_plans;
  if v_visible_plans <> 2 then
    raise exception 'RLS failure: member saw % active plans instead of 2', v_visible_plans;
  end if;
end;
$$;

select set_config('request.jwt.claim.sub', '12000000-0000-0000-0000-000000000001', true);

do $$
declare
  v_annual_plan_id uuid;
begin
  select id into v_annual_plan_id
  from public.membership_plans
  where organization_id = '22000000-0000-0000-0000-000000000001'
    and code = 'ANNUAL';

  perform public.update_membership_plan(
    v_annual_plan_id,
    '22000000-0000-0000-0000-000000000001',
    null,
    'ANNUAL',
    'Annual Membership',
    'Inactive annual plan',
    1,
    'year',
    1200000,
    50000,
    true,
    false
  );

  begin
    perform public.update_membership_plan(
      v_annual_plan_id,
      '22000000-0000-0000-0000-000000000002',
      null,
      'CROSS-TENANT',
      'Cross Tenant Edit',
      null,
      1,
      'month',
      100000,
      0,
      true,
      true
    );
    raise exception 'Authorization failure: Tenant A owner updated a Tenant B plan';
  exception
    when invalid_parameter_value then null;
    when insufficient_privilege then null;
  end;
end;
$$;

select set_config('request.jwt.claim.sub', '12000000-0000-0000-0000-000000000004', true);

do $$
declare
  v_visible_plans integer;
begin
  select count(*) into v_visible_plans from public.membership_plans;
  if v_visible_plans <> 1 then
    raise exception 'RLS failure: member saw % plans after one was deactivated', v_visible_plans;
  end if;
end;
$$;

reset role;
rollback;
