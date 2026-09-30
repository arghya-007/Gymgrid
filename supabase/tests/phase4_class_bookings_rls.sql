\set ON_ERROR_STOP on

-- Phase 4 class booking, capacity, waitlist, and promotion smoke test.
begin;

insert into auth.users (
  instance_id, id, aud, role, email, encrypted_password, email_confirmed_at,
  raw_app_meta_data, raw_user_meta_data, created_at, updated_at
)
values
  ('00000000-0000-0000-0000-000000000000', '21000000-0000-0000-0000-000000000001', 'authenticated', 'authenticated', 'booking-owner-a@gymgrid.test', crypt('test-password', gen_salt('bf')), now(), '{}', '{}', now(), now()),
  ('00000000-0000-0000-0000-000000000000', '21000000-0000-0000-0000-000000000002', 'authenticated', 'authenticated', 'booking-reception-a@gymgrid.test', crypt('test-password', gen_salt('bf')), now(), '{}', '{}', now(), now()),
  ('00000000-0000-0000-0000-000000000000', '21000000-0000-0000-0000-000000000003', 'authenticated', 'authenticated', 'booking-member-a@gymgrid.test', crypt('test-password', gen_salt('bf')), now(), '{}', '{}', now(), now()),
  ('00000000-0000-0000-0000-000000000000', '21000000-0000-0000-0000-000000000004', 'authenticated', 'authenticated', 'booking-member-b@gymgrid.test', crypt('test-password', gen_salt('bf')), now(), '{}', '{}', now(), now()),
  ('00000000-0000-0000-0000-000000000000', '21000000-0000-0000-0000-000000000005', 'authenticated', 'authenticated', 'booking-member-c@gymgrid.test', crypt('test-password', gen_salt('bf')), now(), '{}', '{}', now(), now()),
  ('00000000-0000-0000-0000-000000000000', '21000000-0000-0000-0000-000000000006', 'authenticated', 'authenticated', 'booking-owner-b@gymgrid.test', crypt('test-password', gen_salt('bf')), now(), '{}', '{}', now(), now());

insert into public.profiles (id, full_name)
values
  ('21000000-0000-0000-0000-000000000001', 'Booking Owner'),
  ('21000000-0000-0000-0000-000000000002', 'Booking Reception'),
  ('21000000-0000-0000-0000-000000000003', 'Booking Member A'),
  ('21000000-0000-0000-0000-000000000004', 'Booking Member B'),
  ('21000000-0000-0000-0000-000000000005', 'Booking Member C'),
  ('21000000-0000-0000-0000-000000000006', 'Other Booking Owner')
on conflict (id) do update set full_name = excluded.full_name;

insert into public.organizations (id, slug, name, status, timezone)
values
  ('31000000-0000-0000-0000-000000000001', 'bookings-test-a', 'Bookings Test A', 'active', 'Asia/Kolkata'),
  ('31000000-0000-0000-0000-000000000002', 'bookings-test-b', 'Bookings Test B', 'active', 'Asia/Kolkata');
insert into public.branches (id, organization_id, code, name)
values
  ('41000000-0000-0000-0000-000000000001', '31000000-0000-0000-0000-000000000001', 'MAIN', 'Bookings A Main'),
  ('41000000-0000-0000-0000-000000000002', '31000000-0000-0000-0000-000000000002', 'MAIN', 'Bookings B Main');
insert into public.organization_users (id, organization_id, user_id, status, joined_at)
values
  ('51000000-0000-0000-0000-000000000001', '31000000-0000-0000-0000-000000000001', '21000000-0000-0000-0000-000000000001', 'active', now()),
  ('51000000-0000-0000-0000-000000000002', '31000000-0000-0000-0000-000000000001', '21000000-0000-0000-0000-000000000002', 'active', now()),
  ('51000000-0000-0000-0000-000000000003', '31000000-0000-0000-0000-000000000001', '21000000-0000-0000-0000-000000000003', 'active', now()),
  ('51000000-0000-0000-0000-000000000004', '31000000-0000-0000-0000-000000000001', '21000000-0000-0000-0000-000000000004', 'active', now()),
  ('51000000-0000-0000-0000-000000000005', '31000000-0000-0000-0000-000000000001', '21000000-0000-0000-0000-000000000005', 'active', now()),
  ('51000000-0000-0000-0000-000000000006', '31000000-0000-0000-0000-000000000002', '21000000-0000-0000-0000-000000000006', 'active', now());
insert into public.organization_user_roles (organization_id, organization_user_id, role, branch_id)
values
  ('31000000-0000-0000-0000-000000000001', '51000000-0000-0000-0000-000000000001', 'gym_owner', null),
  ('31000000-0000-0000-0000-000000000001', '51000000-0000-0000-0000-000000000002', 'receptionist', '41000000-0000-0000-0000-000000000001'),
  ('31000000-0000-0000-0000-000000000001', '51000000-0000-0000-0000-000000000003', 'member', '41000000-0000-0000-0000-000000000001'),
  ('31000000-0000-0000-0000-000000000001', '51000000-0000-0000-0000-000000000004', 'member', '41000000-0000-0000-0000-000000000001'),
  ('31000000-0000-0000-0000-000000000001', '51000000-0000-0000-0000-000000000005', 'member', '41000000-0000-0000-0000-000000000001'),
  ('31000000-0000-0000-0000-000000000002', '51000000-0000-0000-0000-000000000006', 'gym_owner', null);

insert into public.members (
  id, organization_id, home_branch_id, member_code, full_name, phone, status,
  auth_user_id, created_by, updated_by
)
values
  ('61000000-0000-0000-0000-000000000001', '31000000-0000-0000-0000-000000000001', '41000000-0000-0000-0000-000000000001', 'M210001', 'Member Alpha', '+919000002101', 'active', '21000000-0000-0000-0000-000000000003', '21000000-0000-0000-0000-000000000001', '21000000-0000-0000-0000-000000000001'),
  ('61000000-0000-0000-0000-000000000002', '31000000-0000-0000-0000-000000000001', '41000000-0000-0000-0000-000000000001', 'M210002', 'Member Beta', '+919000002102', 'active', '21000000-0000-0000-0000-000000000004', '21000000-0000-0000-0000-000000000001', '21000000-0000-0000-0000-000000000001'),
  ('61000000-0000-0000-0000-000000000003', '31000000-0000-0000-0000-000000000001', '41000000-0000-0000-0000-000000000001', 'M210003', 'Member Gamma', '+919000002103', 'active', '21000000-0000-0000-0000-000000000005', '21000000-0000-0000-0000-000000000001', '21000000-0000-0000-0000-000000000001');

insert into public.membership_plans (
  id, organization_id, branch_id, code, name, duration_value, duration_unit,
  price_amount_minor, created_by, updated_by
)
values (
  '71000000-0000-0000-0000-000000000001', '31000000-0000-0000-0000-000000000001',
  '41000000-0000-0000-0000-000000000001', 'BOOK', 'Booking Test Plan', 1, 'month',
  100000, '21000000-0000-0000-0000-000000000001', '21000000-0000-0000-0000-000000000001'
);
insert into public.member_memberships (
  id, organization_id, branch_id, member_id, membership_plan_id, enrollment_code,
  start_date, end_date, plan_code, plan_name, duration_value, duration_unit,
  price_amount_minor, joining_fee_amount_minor, currency, tax_inclusive,
  created_by, updated_by
)
select
  ('81000000-0000-0000-0000-00000000000' || member_number)::uuid,
  '31000000-0000-0000-0000-000000000001',
  '41000000-0000-0000-0000-000000000001',
  ('61000000-0000-0000-0000-00000000000' || member_number)::uuid,
  '71000000-0000-0000-0000-000000000001',
  'E21000' || member_number,
  public.organization_local_date('31000000-0000-0000-0000-000000000001') - 1,
  public.organization_local_date('31000000-0000-0000-0000-000000000001') + 30,
  'BOOK', 'Booking Test Plan', 1, 'month', 100000, 0, 'INR', true,
  '21000000-0000-0000-0000-000000000001',
  '21000000-0000-0000-0000-000000000001'
from generate_series(1, 3) as member_number;

set local role authenticated;
select set_config('request.jwt.claim.role', 'authenticated', true);
select set_config('request.jwt.claim.sub', '21000000-0000-0000-0000-000000000001', true);

do $$
declare
  v_program_id uuid;
  v_session_id uuid;
  v_second_session_id uuid;
  v_booking_a uuid;
  v_booking_b uuid;
  v_status public.class_booking_status;
  v_position integer;
  v_promoted uuid;
begin
  select class_program_id into v_program_id
  from public.save_class_program(
    '31000000-0000-0000-0000-000000000001', null,
    '41000000-0000-0000-0000-000000000001', 'HIIT', 'Booking HIIT', null, 45, 1, true
  );
  select class_session_id into v_session_id
  from public.schedule_class_session(
    '31000000-0000-0000-0000-000000000001', v_program_id, null,
    (public.organization_local_date('31000000-0000-0000-0000-000000000001') + 1)::timestamp + time '18:00',
    1
  );

  select class_booking_id, booking_status, waitlist_position
  into v_booking_a, v_status, v_position
  from public.book_class_session(
    '31000000-0000-0000-0000-000000000001', v_session_id,
    '61000000-0000-0000-0000-000000000001'
  );
  if v_status <> 'booked' or v_position is not null then raise exception 'First member was not booked'; end if;

  select class_booking_id, booking_status, waitlist_position
  into v_booking_b, v_status, v_position
  from public.book_class_session(
    '31000000-0000-0000-0000-000000000001', v_session_id,
    '61000000-0000-0000-0000-000000000002'
  );
  if v_status <> 'waitlisted' or v_position <> 1 then raise exception 'Second member was not first waitlisted'; end if;

  begin
    insert into public.class_bookings (
      organization_id, branch_id, class_session_id, member_id, status,
      confirmed_at, created_by, updated_by
    ) values (
      '31000000-0000-0000-0000-000000000001', '41000000-0000-0000-0000-000000000001',
      v_session_id, '61000000-0000-0000-0000-000000000003', 'booked', now(),
      '21000000-0000-0000-0000-000000000001', '21000000-0000-0000-0000-000000000001'
    );
    raise exception 'Direct class booking insert was permitted';
  exception when insufficient_privilege then null;
  end;

  select promoted_member_id into v_promoted
  from public.cancel_class_booking(
    '31000000-0000-0000-0000-000000000001', v_booking_a, 'Member requested cancellation'
  );
  if v_promoted <> '61000000-0000-0000-0000-000000000002' then raise exception 'First waitlisted member was not promoted'; end if;
  if (select status from public.class_bookings where id = v_booking_b) <> 'booked' then raise exception 'Promoted booking status is incorrect'; end if;

  select class_session_id into v_second_session_id
  from public.schedule_class_session(
    '31000000-0000-0000-0000-000000000001', v_program_id, null,
    (public.organization_local_date('31000000-0000-0000-0000-000000000001') + 2)::timestamp + time '18:00',
    1
  );
  perform public.book_class_session(
    '31000000-0000-0000-0000-000000000001', v_second_session_id,
    '61000000-0000-0000-0000-000000000001'
  );
  perform public.cancel_class_session(
    '31000000-0000-0000-0000-000000000001', v_second_session_id, 'Class removed'
  );
  if exists (
    select 1 from public.class_bookings
    where class_session_id = v_second_session_id and status <> 'cancelled'
  ) then raise exception 'Class cancellation did not cancel bookings'; end if;
end;
$$;

select set_config(
  'test.booking_session_id',
  (
    select id::text
    from public.class_sessions
    where organization_id = '31000000-0000-0000-0000-000000000001'
      and status = 'scheduled'
    order by start_at
    limit 1
  ),
  true
);

select set_config('request.jwt.claim.sub', '21000000-0000-0000-0000-000000000005', true);
do $$
declare v_session_id uuid; v_booking_id uuid; v_status public.class_booking_status; v_position integer;
begin
  select id into v_session_id
  from public.class_sessions
  where organization_id = '31000000-0000-0000-0000-000000000001'
    and status = 'scheduled'
  order by start_at
  limit 1;
  select class_booking_id, booking_status, waitlist_position
  into v_booking_id, v_status, v_position
  from public.book_class_session(
    '31000000-0000-0000-0000-000000000001', v_session_id,
    '61000000-0000-0000-0000-000000000003'
  );
  if v_status <> 'waitlisted' or v_position <> 1 then raise exception 'Self-service member waitlist failed'; end if;
  perform public.cancel_class_booking(
    '31000000-0000-0000-0000-000000000001', v_booking_id, 'Cannot attend'
  );
  if (select status from public.class_bookings where id = v_booking_id) <> 'cancelled' then raise exception 'Self-service cancellation failed'; end if;
end;
$$;

select set_config('request.jwt.claim.sub', '21000000-0000-0000-0000-000000000006', true);
do $$ begin
  begin
    perform public.book_class_session(
      '31000000-0000-0000-0000-000000000001',
      current_setting('test.booking_session_id')::uuid,
      '61000000-0000-0000-0000-000000000003'
    );
    raise exception 'Cross-tenant class booking was permitted';
  exception when insufficient_privilege then null;
  end;
end $$;

reset role;
rollback;
