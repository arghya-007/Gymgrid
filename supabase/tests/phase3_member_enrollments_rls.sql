\set ON_ERROR_STOP on

-- Phase 3 member-enrolment security smoke test.
-- Run against a disposable database after applying all migrations.

begin;

insert into auth.users (
  instance_id, id, aud, role, email, encrypted_password, email_confirmed_at,
  raw_app_meta_data, raw_user_meta_data, created_at, updated_at
)
values
  ('00000000-0000-0000-0000-000000000000', '15000000-0000-0000-0000-000000000001', 'authenticated', 'authenticated', 'enrol-owner-a@gymgrid.test', crypt('test-password', gen_salt('bf')), now(), '{}', '{}', now(), now()),
  ('00000000-0000-0000-0000-000000000000', '15000000-0000-0000-0000-000000000002', 'authenticated', 'authenticated', 'enrol-reception-a@gymgrid.test', crypt('test-password', gen_salt('bf')), now(), '{}', '{}', now(), now()),
  ('00000000-0000-0000-0000-000000000000', '15000000-0000-0000-0000-000000000003', 'authenticated', 'authenticated', 'enrol-member-a@gymgrid.test', crypt('test-password', gen_salt('bf')), now(), '{}', '{}', now(), now()),
  ('00000000-0000-0000-0000-000000000000', '15000000-0000-0000-0000-000000000004', 'authenticated', 'authenticated', 'enrol-owner-b@gymgrid.test', crypt('test-password', gen_salt('bf')), now(), '{}', '{}', now(), now());

insert into public.organizations (id, slug, name, status)
values
  ('25000000-0000-0000-0000-000000000001', 'enrol-test-a', 'Enrol Test A', 'active'),
  ('25000000-0000-0000-0000-000000000002', 'enrol-test-b', 'Enrol Test B', 'active');

insert into public.branches (id, organization_id, code, name)
values
  ('35000000-0000-0000-0000-000000000001', '25000000-0000-0000-0000-000000000001', 'MAIN', 'Enrol Test A Main'),
  ('35000000-0000-0000-0000-000000000002', '25000000-0000-0000-0000-000000000002', 'MAIN', 'Enrol Test B Main');

insert into public.organization_users (id, organization_id, user_id, status, joined_at)
values
  ('45000000-0000-0000-0000-000000000001', '25000000-0000-0000-0000-000000000001', '15000000-0000-0000-0000-000000000001', 'active', now()),
  ('45000000-0000-0000-0000-000000000002', '25000000-0000-0000-0000-000000000001', '15000000-0000-0000-0000-000000000002', 'active', now()),
  ('45000000-0000-0000-0000-000000000003', '25000000-0000-0000-0000-000000000001', '15000000-0000-0000-0000-000000000003', 'active', now()),
  ('45000000-0000-0000-0000-000000000004', '25000000-0000-0000-0000-000000000002', '15000000-0000-0000-0000-000000000004', 'active', now());

insert into public.organization_user_roles (
  organization_id, organization_user_id, role, branch_id
)
values
  ('25000000-0000-0000-0000-000000000001', '45000000-0000-0000-0000-000000000001', 'gym_owner', null),
  ('25000000-0000-0000-0000-000000000001', '45000000-0000-0000-0000-000000000002', 'receptionist', '35000000-0000-0000-0000-000000000001'),
  ('25000000-0000-0000-0000-000000000001', '45000000-0000-0000-0000-000000000003', 'member', '35000000-0000-0000-0000-000000000001'),
  ('25000000-0000-0000-0000-000000000002', '45000000-0000-0000-0000-000000000004', 'gym_owner', null);

insert into public.members (
  id, organization_id, home_branch_id, member_code, full_name, phone,
  created_by, updated_by
)
values
  ('55000000-0000-0000-0000-000000000001', '25000000-0000-0000-0000-000000000001', '35000000-0000-0000-0000-000000000001', 'M000001', 'Owner Enrol Member', '+919876543210', '15000000-0000-0000-0000-000000000001', '15000000-0000-0000-0000-000000000001'),
  ('55000000-0000-0000-0000-000000000002', '25000000-0000-0000-0000-000000000001', '35000000-0000-0000-0000-000000000001', 'M000002', 'Reception Enrol Member', '+919876543211', '15000000-0000-0000-0000-000000000001', '15000000-0000-0000-0000-000000000001'),
  ('55000000-0000-0000-0000-000000000003', '25000000-0000-0000-0000-000000000002', '35000000-0000-0000-0000-000000000002', 'M000001', 'Other Tenant Member', '+919876543212', '15000000-0000-0000-0000-000000000004', '15000000-0000-0000-0000-000000000004');

insert into public.membership_plans (
  id, organization_id, branch_id, code, name, duration_value, duration_unit,
  price_amount_minor, joining_fee_amount_minor, currency, tax_inclusive,
  created_by, updated_by
)
values
  ('65000000-0000-0000-0000-000000000001', '25000000-0000-0000-0000-000000000001', null, 'ANNUAL', 'Annual Membership', 1, 'year', 999900, 50000, 'INR', true, '15000000-0000-0000-0000-000000000001', '15000000-0000-0000-0000-000000000001'),
  ('65000000-0000-0000-0000-000000000002', '25000000-0000-0000-0000-000000000002', null, 'ANNUAL', 'Other Annual', 1, 'year', 1200000, 0, 'INR', true, '15000000-0000-0000-0000-000000000004', '15000000-0000-0000-0000-000000000004');

set local role authenticated;
select set_config('request.jwt.claim.role', 'authenticated', true);
select set_config('request.jwt.claim.sub', '15000000-0000-0000-0000-000000000001', true);

do $$
declare
  v_membership_id uuid;
  v_enrollment_code text;
  v_status text;
begin
  select result.membership_id, result.enrollment_code, result.membership_status
    into v_membership_id, v_enrollment_code, v_status
  from public.enroll_member(
    '25000000-0000-0000-0000-000000000001',
    '55000000-0000-0000-0000-000000000001',
    '65000000-0000-0000-0000-000000000001',
    current_date,
    'First enrolment'
  ) result;

  if v_membership_id is null or v_enrollment_code <> 'E000001' or v_status <> 'active' then
    raise exception 'Owner enrolment returned unexpected values';
  end if;

  if not exists (
    select 1 from public.member_memberships
    where id = v_membership_id
      and end_date = (current_date + interval '1 year')::date - 1
      and plan_name = 'Annual Membership'
      and contract_amount_minor = 1049900
  ) then
    raise exception 'Enrolment dates or plan snapshot are incorrect';
  end if;

  begin
    perform public.enroll_member(
      '25000000-0000-0000-0000-000000000001',
      '55000000-0000-0000-0000-000000000001',
      '65000000-0000-0000-0000-000000000001',
      current_date + 30,
      null
    );
    raise exception 'Overlap failure: overlapping enrolment was permitted';
  exception
    when exclusion_violation then null;
  end;

  begin
    insert into public.member_memberships (
      organization_id, branch_id, member_id, membership_plan_id,
      enrollment_code, start_date, end_date, plan_code, plan_name,
      duration_value, duration_unit, price_amount_minor,
      joining_fee_amount_minor, currency, tax_inclusive, created_by, updated_by
    ) values (
      '25000000-0000-0000-0000-000000000001',
      '35000000-0000-0000-0000-000000000001',
      '55000000-0000-0000-0000-000000000001',
      '65000000-0000-0000-0000-000000000001',
      'E999999', current_date, current_date + 1, 'ANNUAL', 'Direct',
      1, 'year', 0, 0, 'INR', true,
      '15000000-0000-0000-0000-000000000001',
      '15000000-0000-0000-0000-000000000001'
    );
    raise exception 'RLS failure: direct enrolment insert was permitted';
  exception
    when insufficient_privilege then null;
  end;

  begin
    perform public.enroll_member(
      '25000000-0000-0000-0000-000000000002',
      '55000000-0000-0000-0000-000000000003',
      '65000000-0000-0000-0000-000000000002',
      current_date,
      null
    );
    raise exception 'Authorization failure: owner enrolled a cross-tenant member';
  exception
    when insufficient_privilege then null;
  end;
end;
$$;

select set_config('request.jwt.claim.sub', '15000000-0000-0000-0000-000000000002', true);

do $$
declare
  v_enrollment_code text;
begin
  select result.enrollment_code into v_enrollment_code
  from public.enroll_member(
    '25000000-0000-0000-0000-000000000001',
    '55000000-0000-0000-0000-000000000002',
    '65000000-0000-0000-0000-000000000001',
    current_date + 1,
    null
  ) result;

  if v_enrollment_code <> 'E000002' then
    raise exception 'Receptionist could not enrol assigned-branch member';
  end if;
end;
$$;

select set_config('request.jwt.claim.sub', '15000000-0000-0000-0000-000000000003', true);

do $$
begin
  begin
    perform public.enroll_member(
      '25000000-0000-0000-0000-000000000001',
      '55000000-0000-0000-0000-000000000002',
      '65000000-0000-0000-0000-000000000001',
      current_date + 730,
      null
    );
    raise exception 'Authorization failure: member role created an enrolment';
  exception
    when insufficient_privilege then null;
  end;
end;
$$;

reset role;

update public.membership_plans
set name = 'Renamed Annual', price_amount_minor = 1500000
where id = '65000000-0000-0000-0000-000000000001';

do $$
begin
  if not exists (
    select 1 from public.member_memberships
    where organization_id = '25000000-0000-0000-0000-000000000001'
      and enrollment_code = 'E000001'
      and plan_name = 'Annual Membership'
      and price_amount_minor = 999900
  ) then
    raise exception 'Plan history changed after catalogue update';
  end if;
end;
$$;

rollback;
