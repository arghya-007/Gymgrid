\set ON_ERROR_STOP on

-- Phase 4 member QR pass and class kiosk check-in smoke test.
begin;

insert into auth.users (
  instance_id, id, aud, role, email, encrypted_password, email_confirmed_at,
  raw_app_meta_data, raw_user_meta_data, created_at, updated_at
)
values
  ('00000000-0000-0000-0000-000000000000', '22000000-0000-0000-0000-000000000001', 'authenticated', 'authenticated', 'qr-owner-a@gymgrid.test', crypt('test-password', gen_salt('bf')), now(), '{}', '{}', now(), now()),
  ('00000000-0000-0000-0000-000000000000', '22000000-0000-0000-0000-000000000002', 'authenticated', 'authenticated', 'qr-trainer-a@gymgrid.test', crypt('test-password', gen_salt('bf')), now(), '{}', '{}', now(), now()),
  ('00000000-0000-0000-0000-000000000000', '22000000-0000-0000-0000-000000000003', 'authenticated', 'authenticated', 'qr-member-a@gymgrid.test', crypt('test-password', gen_salt('bf')), now(), '{}', '{}', now(), now()),
  ('00000000-0000-0000-0000-000000000000', '22000000-0000-0000-0000-000000000004', 'authenticated', 'authenticated', 'qr-member-b@gymgrid.test', crypt('test-password', gen_salt('bf')), now(), '{}', '{}', now(), now()),
  ('00000000-0000-0000-0000-000000000000', '22000000-0000-0000-0000-000000000005', 'authenticated', 'authenticated', 'qr-owner-b@gymgrid.test', crypt('test-password', gen_salt('bf')), now(), '{}', '{}', now(), now());

insert into public.profiles (id, full_name)
values
  ('22000000-0000-0000-0000-000000000001', 'QR Owner'),
  ('22000000-0000-0000-0000-000000000002', 'QR Trainer'),
  ('22000000-0000-0000-0000-000000000003', 'QR Member A'),
  ('22000000-0000-0000-0000-000000000004', 'QR Member B'),
  ('22000000-0000-0000-0000-000000000005', 'Other QR Owner')
on conflict (id) do update set full_name = excluded.full_name;

insert into public.organizations (id, slug, name, status, timezone)
values
  ('32000000-0000-0000-0000-000000000001', 'qr-test-a', 'QR Test A', 'active', 'Asia/Kolkata'),
  ('32000000-0000-0000-0000-000000000002', 'qr-test-b', 'QR Test B', 'active', 'Asia/Kolkata');
insert into public.branches (id, organization_id, code, name)
values
  ('42000000-0000-0000-0000-000000000001', '32000000-0000-0000-0000-000000000001', 'MAIN', 'QR A Main'),
  ('42000000-0000-0000-0000-000000000002', '32000000-0000-0000-0000-000000000002', 'MAIN', 'QR B Main');
insert into public.organization_users (id, organization_id, user_id, status, joined_at)
values
  ('52000000-0000-0000-0000-000000000001', '32000000-0000-0000-0000-000000000001', '22000000-0000-0000-0000-000000000001', 'active', now()),
  ('52000000-0000-0000-0000-000000000002', '32000000-0000-0000-0000-000000000001', '22000000-0000-0000-0000-000000000002', 'active', now()),
  ('52000000-0000-0000-0000-000000000003', '32000000-0000-0000-0000-000000000001', '22000000-0000-0000-0000-000000000003', 'active', now()),
  ('52000000-0000-0000-0000-000000000004', '32000000-0000-0000-0000-000000000001', '22000000-0000-0000-0000-000000000004', 'active', now()),
  ('52000000-0000-0000-0000-000000000005', '32000000-0000-0000-0000-000000000002', '22000000-0000-0000-0000-000000000005', 'active', now());
insert into public.organization_user_roles (organization_id, organization_user_id, role, branch_id)
values
  ('32000000-0000-0000-0000-000000000001', '52000000-0000-0000-0000-000000000001', 'gym_owner', null),
  ('32000000-0000-0000-0000-000000000001', '52000000-0000-0000-0000-000000000002', 'trainer', '42000000-0000-0000-0000-000000000001'),
  ('32000000-0000-0000-0000-000000000001', '52000000-0000-0000-0000-000000000003', 'member', '42000000-0000-0000-0000-000000000001'),
  ('32000000-0000-0000-0000-000000000001', '52000000-0000-0000-0000-000000000004', 'member', '42000000-0000-0000-0000-000000000001'),
  ('32000000-0000-0000-0000-000000000002', '52000000-0000-0000-0000-000000000005', 'gym_owner', null);

insert into public.members (
  id, organization_id, home_branch_id, member_code, full_name, phone, status,
  auth_user_id, created_by, updated_by
)
values
  ('62000000-0000-0000-0000-000000000001', '32000000-0000-0000-0000-000000000001', '42000000-0000-0000-0000-000000000001', 'M220001', 'QR Member Alpha', '+919000002201', 'active', '22000000-0000-0000-0000-000000000003', '22000000-0000-0000-0000-000000000001', '22000000-0000-0000-0000-000000000001'),
  ('62000000-0000-0000-0000-000000000002', '32000000-0000-0000-0000-000000000001', '42000000-0000-0000-0000-000000000001', 'M220002', 'QR Member Beta', '+919000002202', 'active', '22000000-0000-0000-0000-000000000004', '22000000-0000-0000-0000-000000000001', '22000000-0000-0000-0000-000000000001');

insert into public.membership_plans (
  id, organization_id, branch_id, code, name, duration_value, duration_unit,
  price_amount_minor, created_by, updated_by
)
values (
  '72000000-0000-0000-0000-000000000001', '32000000-0000-0000-0000-000000000001',
  '42000000-0000-0000-0000-000000000001', 'QR', 'QR Test Plan', 1, 'month',
  100000, '22000000-0000-0000-0000-000000000001', '22000000-0000-0000-0000-000000000001'
);
insert into public.member_memberships (
  id, organization_id, branch_id, member_id, membership_plan_id, enrollment_code,
  start_date, end_date, plan_code, plan_name, duration_value, duration_unit,
  price_amount_minor, joining_fee_amount_minor, currency, tax_inclusive,
  created_by, updated_by
)
select
  ('82000000-0000-0000-0000-00000000000' || member_number)::uuid,
  '32000000-0000-0000-0000-000000000001',
  '42000000-0000-0000-0000-000000000001',
  ('62000000-0000-0000-0000-00000000000' || member_number)::uuid,
  '72000000-0000-0000-0000-000000000001',
  'E22000' || member_number,
  public.organization_local_date('32000000-0000-0000-0000-000000000001') - 1,
  public.organization_local_date('32000000-0000-0000-0000-000000000001') + 30,
  'QR', 'QR Test Plan', 1, 'month', 100000, 0, 'INR', true,
  '22000000-0000-0000-0000-000000000001',
  '22000000-0000-0000-0000-000000000001'
from generate_series(1, 2) as member_number;

set local role authenticated;
select set_config('request.jwt.claim.role', 'authenticated', true);
select set_config('request.jwt.claim.sub', '22000000-0000-0000-0000-000000000001', true);

do $$
declare
  v_program_id uuid;
  v_session_id uuid;
  v_booking_a uuid;
  v_pass_a uuid;
  v_pass_b uuid;
begin
  select class_program_id into v_program_id
  from public.save_class_program(
    '32000000-0000-0000-0000-000000000001', null,
    '42000000-0000-0000-0000-000000000001', 'SPIN', 'QR Spin', null, 45, 1, true
  );
  select class_session_id into v_session_id
  from public.schedule_class_session(
    '32000000-0000-0000-0000-000000000001', v_program_id,
    '52000000-0000-0000-0000-000000000002',
    (clock_timestamp() at time zone 'Asia/Kolkata') + interval '20 minutes',
    1
  );
  select class_booking_id into v_booking_a
  from public.book_class_session(
    '32000000-0000-0000-0000-000000000001', v_session_id,
    '62000000-0000-0000-0000-000000000001'
  );
  perform public.book_class_session(
    '32000000-0000-0000-0000-000000000001', v_session_id,
    '62000000-0000-0000-0000-000000000002'
  );
  select qr_token into v_pass_a
  from public.rotate_member_qr_pass(
    '32000000-0000-0000-0000-000000000001',
    '62000000-0000-0000-0000-000000000001'
  );
  select qr_token into v_pass_b
  from public.rotate_member_qr_pass(
    '32000000-0000-0000-0000-000000000001',
    '62000000-0000-0000-0000-000000000002'
  );
  perform set_config('test.qr_session_id', v_session_id::text, true);
  perform set_config('test.qr_booking_id', v_booking_a::text, true);
  perform set_config('test.qr_token_a', v_pass_a::text, true);
  perform set_config('test.qr_token_b', v_pass_b::text, true);
end;
$$;

select set_config('request.jwt.claim.sub', '22000000-0000-0000-0000-000000000002', true);
do $$
declare
  v_check_in_id uuid;
  v_member_code text;
  v_duplicate boolean;
begin
  select class_check_in_id, member_code, already_checked_in
  into v_check_in_id, v_member_code, v_duplicate
  from public.record_class_qr_check_in(
    '32000000-0000-0000-0000-000000000001',
    current_setting('test.qr_session_id')::uuid,
    current_setting('test.qr_token_a')::uuid
  );
  if v_check_in_id is null or v_member_code <> 'M220001' or v_duplicate then
    raise exception 'Trainer QR check-in failed';
  end if;

  select already_checked_in into v_duplicate
  from public.record_class_qr_check_in(
    '32000000-0000-0000-0000-000000000001',
    current_setting('test.qr_session_id')::uuid,
    current_setting('test.qr_token_a')::uuid
  );
  if not v_duplicate then raise exception 'Duplicate QR scan was not idempotent'; end if;

  begin
    perform public.record_class_qr_check_in(
      '32000000-0000-0000-0000-000000000001',
      current_setting('test.qr_session_id')::uuid,
      current_setting('test.qr_token_b')::uuid
    );
    raise exception 'Waitlisted member was checked in';
  exception when invalid_parameter_value then null;
  end;

  begin
    insert into public.class_check_ins (
      organization_id, branch_id, class_session_id, class_booking_id,
      member_id, member_qr_pass_id, checked_in_by
    )
    select
      '32000000-0000-0000-0000-000000000001',
      '42000000-0000-0000-0000-000000000001',
      current_setting('test.qr_session_id')::uuid,
      cb.id,
      cb.member_id,
      mp.id,
      '22000000-0000-0000-0000-000000000002'
    from public.class_bookings cb
    join public.member_qr_passes mp on mp.member_id = cb.member_id and mp.organization_id = cb.organization_id
    where cb.id = current_setting('test.qr_booking_id')::uuid and mp.active;
    raise exception 'Direct class check-in insert was permitted';
  exception when insufficient_privilege then null;
  end;
end;
$$;

select set_config('request.jwt.claim.sub', '22000000-0000-0000-0000-000000000001', true);
do $$ begin
  begin
    perform public.cancel_class_booking(
      '32000000-0000-0000-0000-000000000001',
      current_setting('test.qr_booking_id')::uuid,
      'Trying to cancel after check-in'
    );
    raise exception 'Checked-in booking was cancelled';
  exception when invalid_parameter_value then null;
  end;
end $$;

select set_config('request.jwt.claim.sub', '22000000-0000-0000-0000-000000000003', true);
do $$
declare v_new_token uuid;
begin
  select qr_token into v_new_token
  from public.rotate_member_qr_pass(
    '32000000-0000-0000-0000-000000000001',
    '62000000-0000-0000-0000-000000000001'
  );
  if v_new_token is null then raise exception 'Member self-service QR rotation failed'; end if;
  if (select count(*) from public.member_qr_passes where member_id = '62000000-0000-0000-0000-000000000001' and active) <> 1 then
    raise exception 'Member active QR pass visibility is incorrect';
  end if;
end;
$$;

select set_config('request.jwt.claim.sub', '22000000-0000-0000-0000-000000000005', true);
do $$ begin
  begin
    perform public.record_class_qr_check_in(
      '32000000-0000-0000-0000-000000000001',
      current_setting('test.qr_session_id')::uuid,
      current_setting('test.qr_token_a')::uuid
    );
    raise exception 'Cross-tenant QR check-in was permitted';
  exception when insufficient_privilege then null;
  end;
end $$;

reset role;
rollback;
