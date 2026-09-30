\set ON_ERROR_STOP on

-- Phase 3 check-in and operational-report security smoke test.
begin;

insert into auth.users (instance_id, id, aud, role, email, encrypted_password, email_confirmed_at, raw_app_meta_data, raw_user_meta_data, created_at, updated_at)
values
  ('00000000-0000-0000-0000-000000000000', '19000000-0000-0000-0000-000000000001', 'authenticated', 'authenticated', 'checkin-owner-a@gymgrid.test', crypt('test-password', gen_salt('bf')), now(), '{}', '{}', now(), now()),
  ('00000000-0000-0000-0000-000000000000', '19000000-0000-0000-0000-000000000002', 'authenticated', 'authenticated', 'checkin-reception-a@gymgrid.test', crypt('test-password', gen_salt('bf')), now(), '{}', '{}', now(), now()),
  ('00000000-0000-0000-0000-000000000000', '19000000-0000-0000-0000-000000000003', 'authenticated', 'authenticated', 'checkin-member-a@gymgrid.test', crypt('test-password', gen_salt('bf')), now(), '{}', '{}', now(), now()),
  ('00000000-0000-0000-0000-000000000000', '19000000-0000-0000-0000-000000000004', 'authenticated', 'authenticated', 'checkin-owner-b@gymgrid.test', crypt('test-password', gen_salt('bf')), now(), '{}', '{}', now(), now());

insert into public.organizations (id, slug, name, status, timezone)
values
  ('29000000-0000-0000-0000-000000000001', 'checkin-test-a', 'Check-in Test A', 'active', 'Asia/Kolkata'),
  ('29000000-0000-0000-0000-000000000002', 'checkin-test-b', 'Check-in Test B', 'active', 'Asia/Kolkata');
insert into public.branches (id, organization_id, code, name)
values
  ('39000000-0000-0000-0000-000000000001', '29000000-0000-0000-0000-000000000001', 'MAIN', 'Check-in A Main'),
  ('39000000-0000-0000-0000-000000000002', '29000000-0000-0000-0000-000000000002', 'MAIN', 'Check-in B Main');
insert into public.organization_users (id, organization_id, user_id, status, joined_at)
values
  ('49000000-0000-0000-0000-000000000001', '29000000-0000-0000-0000-000000000001', '19000000-0000-0000-0000-000000000001', 'active', now()),
  ('49000000-0000-0000-0000-000000000002', '29000000-0000-0000-0000-000000000001', '19000000-0000-0000-0000-000000000002', 'active', now()),
  ('49000000-0000-0000-0000-000000000003', '29000000-0000-0000-0000-000000000001', '19000000-0000-0000-0000-000000000003', 'active', now()),
  ('49000000-0000-0000-0000-000000000004', '29000000-0000-0000-0000-000000000002', '19000000-0000-0000-0000-000000000004', 'active', now());
insert into public.organization_user_roles (organization_id, organization_user_id, role, branch_id)
values
  ('29000000-0000-0000-0000-000000000001', '49000000-0000-0000-0000-000000000001', 'gym_owner', null),
  ('29000000-0000-0000-0000-000000000001', '49000000-0000-0000-0000-000000000002', 'receptionist', '39000000-0000-0000-0000-000000000001'),
  ('29000000-0000-0000-0000-000000000001', '49000000-0000-0000-0000-000000000003', 'member', '39000000-0000-0000-0000-000000000001'),
  ('29000000-0000-0000-0000-000000000002', '49000000-0000-0000-0000-000000000004', 'gym_owner', null);

insert into public.membership_plans (id, organization_id, branch_id, code, name, duration_value, duration_unit, price_amount_minor, created_by, updated_by)
values ('69000000-0000-0000-0000-000000000001', '29000000-0000-0000-0000-000000000001', '39000000-0000-0000-0000-000000000001', 'MONTHLY', 'Monthly', 1, 'month', 100000, '19000000-0000-0000-0000-000000000001', '19000000-0000-0000-0000-000000000001');
insert into public.members (id, organization_id, home_branch_id, member_code, full_name, phone, created_by, updated_by)
values
  ('59000000-0000-0000-0000-000000000001', '29000000-0000-0000-0000-000000000001', '39000000-0000-0000-0000-000000000001', 'M900001', 'Owner Check-in Member', '+919876543250', '19000000-0000-0000-0000-000000000001', '19000000-0000-0000-0000-000000000001'),
  ('59000000-0000-0000-0000-000000000002', '29000000-0000-0000-0000-000000000001', '39000000-0000-0000-0000-000000000001', 'M900002', 'Reception Check-in Member', '+919876543251', '19000000-0000-0000-0000-000000000001', '19000000-0000-0000-0000-000000000001'),
  ('59000000-0000-0000-0000-000000000003', '29000000-0000-0000-0000-000000000001', '39000000-0000-0000-0000-000000000001', 'M900003', 'No Membership Member', '+919876543252', '19000000-0000-0000-0000-000000000001', '19000000-0000-0000-0000-000000000001');
insert into public.member_memberships (
  id, organization_id, branch_id, member_id, membership_plan_id, enrollment_code,
  start_date, end_date, plan_code, plan_name, duration_value, duration_unit,
  price_amount_minor, joining_fee_amount_minor, currency, tax_inclusive, created_by, updated_by
)
values
  ('79000000-0000-0000-0000-000000000001', '29000000-0000-0000-0000-000000000001', '39000000-0000-0000-0000-000000000001', '59000000-0000-0000-0000-000000000001', '69000000-0000-0000-0000-000000000001', 'E900001', public.organization_local_date('29000000-0000-0000-0000-000000000001') - 5, public.organization_local_date('29000000-0000-0000-0000-000000000001') + 30, 'MONTHLY', 'Monthly', 1, 'month', 100000, 0, 'INR', true, '19000000-0000-0000-0000-000000000001', '19000000-0000-0000-0000-000000000001'),
  ('79000000-0000-0000-0000-000000000002', '29000000-0000-0000-0000-000000000001', '39000000-0000-0000-0000-000000000001', '59000000-0000-0000-0000-000000000002', '69000000-0000-0000-0000-000000000001', 'E900002', public.organization_local_date('29000000-0000-0000-0000-000000000001') - 5, public.organization_local_date('29000000-0000-0000-0000-000000000001') + 30, 'MONTHLY', 'Monthly', 1, 'month', 100000, 0, 'INR', true, '19000000-0000-0000-0000-000000000001', '19000000-0000-0000-0000-000000000001');

set local role authenticated;
select set_config('request.jwt.claim.role', 'authenticated', true);
select set_config('request.jwt.claim.sub', '19000000-0000-0000-0000-000000000001', true);

do $$
declare v_id uuid; v_membership_id uuid; v_time timestamptz;
begin
  select check_in_id, membership_id, checked_in_at into v_id, v_membership_id, v_time
  from public.record_member_check_in('29000000-0000-0000-0000-000000000001', '39000000-0000-0000-0000-000000000001', '59000000-0000-0000-0000-000000000001');
  if v_id is null or v_membership_id <> '79000000-0000-0000-0000-000000000001' or v_time is null then raise exception 'Owner check-in failed'; end if;

  begin
    perform public.record_member_check_in('29000000-0000-0000-0000-000000000001', '39000000-0000-0000-0000-000000000001', '59000000-0000-0000-0000-000000000001');
    raise exception 'Duplicate check-in was permitted';
  exception when unique_violation then null;
  end;

  begin
    perform public.record_member_check_in('29000000-0000-0000-0000-000000000001', '39000000-0000-0000-0000-000000000001', '59000000-0000-0000-0000-000000000003');
    raise exception 'Check-in without active membership was permitted';
  exception when no_data_found then null;
  end;

  begin
    insert into public.member_check_ins (organization_id, branch_id, member_id, membership_id, checked_in_local_date, recorded_by)
    values ('29000000-0000-0000-0000-000000000001', '39000000-0000-0000-0000-000000000001', '59000000-0000-0000-0000-000000000001', '79000000-0000-0000-0000-000000000001', public.organization_local_date('29000000-0000-0000-0000-000000000001'), '19000000-0000-0000-0000-000000000001');
    raise exception 'Direct check-in insert was permitted';
  exception when insufficient_privilege then null;
  end;
end;
$$;

select set_config('request.jwt.claim.sub', '19000000-0000-0000-0000-000000000002', true);
do $$ begin
  perform public.record_member_check_in('29000000-0000-0000-0000-000000000001', '39000000-0000-0000-0000-000000000001', '59000000-0000-0000-0000-000000000002');
  begin
    perform public.get_operational_report('29000000-0000-0000-0000-000000000001', '39000000-0000-0000-0000-000000000001', public.organization_local_date('29000000-0000-0000-0000-000000000001'), public.organization_local_date('29000000-0000-0000-0000-000000000001'));
    raise exception 'Receptionist report access was permitted';
  exception when insufficient_privilege then null;
  end;
end $$;

select set_config('request.jwt.claim.sub', '19000000-0000-0000-0000-000000000003', true);
do $$ begin
  begin
    perform public.record_member_check_in('29000000-0000-0000-0000-000000000001', '39000000-0000-0000-0000-000000000001', '59000000-0000-0000-0000-000000000001');
    raise exception 'Member role check-in was permitted';
  exception when insufficient_privilege then null;
  end;
end $$;

select set_config('request.jwt.claim.sub', '19000000-0000-0000-0000-000000000004', true);
do $$ begin
  begin
    perform public.record_member_check_in('29000000-0000-0000-0000-000000000001', '39000000-0000-0000-0000-000000000001', '59000000-0000-0000-0000-000000000001');
    raise exception 'Cross-tenant check-in was permitted';
  exception when insufficient_privilege then null;
  end;
end $$;

select set_config('request.jwt.claim.sub', '19000000-0000-0000-0000-000000000001', true);
do $$
declare v_report record;
begin
  select * into v_report
  from public.get_operational_report('29000000-0000-0000-0000-000000000001', null, public.organization_local_date('29000000-0000-0000-0000-000000000001'), public.organization_local_date('29000000-0000-0000-0000-000000000001'));
  if v_report.check_in_count <> 2 or v_report.new_member_count <> 3 or v_report.payment_amount_minor <> 0 then
    raise exception 'Operational report totals failed';
  end if;
end;
$$;

reset role;
rollback;
