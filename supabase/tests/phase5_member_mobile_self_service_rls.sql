\set ON_ERROR_STOP on

-- Phase 5 member membership and receipt self-read isolation smoke test.
begin;

insert into auth.users (
  instance_id, id, aud, role, email, encrypted_password, email_confirmed_at,
  raw_app_meta_data, raw_user_meta_data, created_at, updated_at
)
values
  ('00000000-0000-0000-0000-000000000000', '23000000-0000-0000-0000-000000000001', 'authenticated', 'authenticated', 'mobile-owner@gymgrid.test', crypt('test-password', gen_salt('bf')), now(), '{}', '{}', now(), now()),
  ('00000000-0000-0000-0000-000000000000', '23000000-0000-0000-0000-000000000002', 'authenticated', 'authenticated', 'mobile-member-a@gymgrid.test', crypt('test-password', gen_salt('bf')), now(), '{}', '{}', now(), now()),
  ('00000000-0000-0000-0000-000000000000', '23000000-0000-0000-0000-000000000003', 'authenticated', 'authenticated', 'mobile-member-b@gymgrid.test', crypt('test-password', gen_salt('bf')), now(), '{}', '{}', now(), now());

insert into public.profiles (id, full_name)
values
  ('23000000-0000-0000-0000-000000000001', 'Mobile Owner'),
  ('23000000-0000-0000-0000-000000000002', 'Mobile Member A'),
  ('23000000-0000-0000-0000-000000000003', 'Mobile Member B')
on conflict (id) do update set full_name = excluded.full_name;

insert into public.organizations (id, slug, name, status, timezone)
values ('33000000-0000-0000-0000-000000000001', 'mobile-self-test', 'Mobile Self Test', 'active', 'Asia/Kolkata');

insert into public.branches (id, organization_id, code, name)
values ('43000000-0000-0000-0000-000000000001', '33000000-0000-0000-0000-000000000001', 'MAIN', 'Mobile Main');

insert into public.organization_users (id, organization_id, user_id, status, joined_at)
values
  ('53000000-0000-0000-0000-000000000001', '33000000-0000-0000-0000-000000000001', '23000000-0000-0000-0000-000000000001', 'active', now()),
  ('53000000-0000-0000-0000-000000000002', '33000000-0000-0000-0000-000000000001', '23000000-0000-0000-0000-000000000002', 'active', now()),
  ('53000000-0000-0000-0000-000000000003', '33000000-0000-0000-0000-000000000001', '23000000-0000-0000-0000-000000000003', 'active', now());

insert into public.organization_user_roles (organization_id, organization_user_id, role, branch_id)
values
  ('33000000-0000-0000-0000-000000000001', '53000000-0000-0000-0000-000000000001', 'gym_owner', null),
  ('33000000-0000-0000-0000-000000000001', '53000000-0000-0000-0000-000000000002', 'member', '43000000-0000-0000-0000-000000000001'),
  ('33000000-0000-0000-0000-000000000001', '53000000-0000-0000-0000-000000000003', 'member', '43000000-0000-0000-0000-000000000001');

insert into public.members (
  id, organization_id, home_branch_id, member_code, full_name, phone, status,
  auth_user_id, created_by, updated_by
)
values
  ('63000000-0000-0000-0000-000000000001', '33000000-0000-0000-0000-000000000001', '43000000-0000-0000-0000-000000000001', 'M230001', 'Mobile Alpha', '+919000002301', 'active', '23000000-0000-0000-0000-000000000002', '23000000-0000-0000-0000-000000000001', '23000000-0000-0000-0000-000000000001'),
  ('63000000-0000-0000-0000-000000000002', '33000000-0000-0000-0000-000000000001', '43000000-0000-0000-0000-000000000001', 'M230002', 'Mobile Beta', '+919000002302', 'active', '23000000-0000-0000-0000-000000000003', '23000000-0000-0000-0000-000000000001', '23000000-0000-0000-0000-000000000001');

insert into public.membership_plans (
  id, organization_id, branch_id, code, name, duration_value, duration_unit,
  price_amount_minor, created_by, updated_by
)
values (
  '73000000-0000-0000-0000-000000000001', '33000000-0000-0000-0000-000000000001',
  '43000000-0000-0000-0000-000000000001', 'MOBILE', 'Mobile Test Plan', 1, 'month',
  100000, '23000000-0000-0000-0000-000000000001', '23000000-0000-0000-0000-000000000001'
);

insert into public.member_memberships (
  id, organization_id, branch_id, member_id, membership_plan_id, enrollment_code,
  start_date, end_date, plan_code, plan_name, duration_value, duration_unit,
  price_amount_minor, joining_fee_amount_minor, currency, tax_inclusive,
  created_by, updated_by
)
values
  ('83000000-0000-0000-0000-000000000001', '33000000-0000-0000-0000-000000000001', '43000000-0000-0000-0000-000000000001', '63000000-0000-0000-0000-000000000001', '73000000-0000-0000-0000-000000000001', 'E230001', current_date - 5, current_date + 25, 'MOBILE', 'Mobile Test Plan', 1, 'month', 100000, 0, 'INR', true, '23000000-0000-0000-0000-000000000001', '23000000-0000-0000-0000-000000000001'),
  ('83000000-0000-0000-0000-000000000002', '33000000-0000-0000-0000-000000000001', '43000000-0000-0000-0000-000000000001', '63000000-0000-0000-0000-000000000002', '73000000-0000-0000-0000-000000000001', 'E230002', current_date - 5, current_date + 25, 'MOBILE', 'Mobile Test Plan', 1, 'month', 100000, 0, 'INR', true, '23000000-0000-0000-0000-000000000001', '23000000-0000-0000-0000-000000000001');

insert into public.manual_payments (
  id, organization_id, branch_id, member_id, membership_id, receipt_code,
  amount_minor, currency, payment_date, payment_method, status, created_by
)
values
  ('93000000-0000-0000-0000-000000000001', '33000000-0000-0000-0000-000000000001', '43000000-0000-0000-0000-000000000001', '63000000-0000-0000-0000-000000000001', '83000000-0000-0000-0000-000000000001', 'R230001', 50000, 'INR', current_date, 'upi', 'recorded', '23000000-0000-0000-0000-000000000001'),
  ('93000000-0000-0000-0000-000000000002', '33000000-0000-0000-0000-000000000001', '43000000-0000-0000-0000-000000000001', '63000000-0000-0000-0000-000000000002', '83000000-0000-0000-0000-000000000002', 'R230002', 50000, 'INR', current_date, 'cash', 'recorded', '23000000-0000-0000-0000-000000000001');

set local role authenticated;
select set_config('request.jwt.claim.role', 'authenticated', true);
select set_config('request.jwt.claim.sub', '23000000-0000-0000-0000-000000000002', true);

do $$
declare
  affected_rows integer;
begin
  if (select count(*) from public.member_memberships) <> 1 then
    raise exception 'Member could see another member membership';
  end if;
  if (select count(*) from public.manual_payments) <> 1 then
    raise exception 'Member could see another member payment';
  end if;
  if not exists (
    select 1 from public.member_memberships
    where id = '83000000-0000-0000-0000-000000000001'
  ) then
    raise exception 'Member could not read own membership';
  end if;
  if not exists (
    select 1 from public.manual_payments
    where id = '93000000-0000-0000-0000-000000000001'
  ) then
    raise exception 'Member could not read own receipt';
  end if;

  affected_rows := 0;
  begin
    update public.member_memberships
    set notes = 'Member attempted update'
    where id = '83000000-0000-0000-0000-000000000001';
    get diagnostics affected_rows = row_count;
  exception when insufficient_privilege then
    affected_rows := 0;
  end;
  if affected_rows <> 0 then
    raise exception 'Member directly updated a membership';
  end if;

  affected_rows := 0;
  begin
    update public.manual_payments
    set notes = 'Member attempted update'
    where id = '93000000-0000-0000-0000-000000000001';
    get diagnostics affected_rows = row_count;
  exception when insufficient_privilege then
    affected_rows := 0;
  end;
  if affected_rows <> 0 then
    raise exception 'Member directly updated a payment';
  end if;
end;
$$;

select set_config('request.jwt.claim.sub', '23000000-0000-0000-0000-000000000003', true);
do $$
begin
  if exists (
    select 1 from public.member_memberships
    where id = '83000000-0000-0000-0000-000000000001'
  ) then
    raise exception 'Second member could read the first member membership';
  end if;
  if exists (
    select 1 from public.manual_payments
    where id = '93000000-0000-0000-0000-000000000001'
  ) then
    raise exception 'Second member could read the first member receipt';
  end if;
end;
$$;

reset role;
rollback;
