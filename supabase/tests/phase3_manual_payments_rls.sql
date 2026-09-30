\set ON_ERROR_STOP on

-- Phase 3 manual payment and receipt security smoke test.
begin;

insert into auth.users (
  instance_id, id, aud, role, email, encrypted_password, email_confirmed_at,
  raw_app_meta_data, raw_user_meta_data, created_at, updated_at
)
values
  ('00000000-0000-0000-0000-000000000000', '17000000-0000-0000-0000-000000000001', 'authenticated', 'authenticated', 'payment-owner-a@gymgrid.test', crypt('test-password', gen_salt('bf')), now(), '{}', '{}', now(), now()),
  ('00000000-0000-0000-0000-000000000000', '17000000-0000-0000-0000-000000000002', 'authenticated', 'authenticated', 'payment-reception-a@gymgrid.test', crypt('test-password', gen_salt('bf')), now(), '{}', '{}', now(), now()),
  ('00000000-0000-0000-0000-000000000000', '17000000-0000-0000-0000-000000000003', 'authenticated', 'authenticated', 'payment-member-a@gymgrid.test', crypt('test-password', gen_salt('bf')), now(), '{}', '{}', now(), now()),
  ('00000000-0000-0000-0000-000000000000', '17000000-0000-0000-0000-000000000004', 'authenticated', 'authenticated', 'payment-owner-b@gymgrid.test', crypt('test-password', gen_salt('bf')), now(), '{}', '{}', now(), now());

insert into public.organizations (id, slug, name, status, timezone)
values
  ('27000000-0000-0000-0000-000000000001', 'payment-test-a', 'Payment Test A', 'active', 'Asia/Kolkata'),
  ('27000000-0000-0000-0000-000000000002', 'payment-test-b', 'Payment Test B', 'active', 'Asia/Kolkata');

insert into public.branches (id, organization_id, code, name)
values
  ('37000000-0000-0000-0000-000000000001', '27000000-0000-0000-0000-000000000001', 'MAIN', 'Payment A Main'),
  ('37000000-0000-0000-0000-000000000002', '27000000-0000-0000-0000-000000000002', 'MAIN', 'Payment B Main');

insert into public.organization_users (id, organization_id, user_id, status, joined_at)
values
  ('47000000-0000-0000-0000-000000000001', '27000000-0000-0000-0000-000000000001', '17000000-0000-0000-0000-000000000001', 'active', now()),
  ('47000000-0000-0000-0000-000000000002', '27000000-0000-0000-0000-000000000001', '17000000-0000-0000-0000-000000000002', 'active', now()),
  ('47000000-0000-0000-0000-000000000003', '27000000-0000-0000-0000-000000000001', '17000000-0000-0000-0000-000000000003', 'active', now()),
  ('47000000-0000-0000-0000-000000000004', '27000000-0000-0000-0000-000000000002', '17000000-0000-0000-0000-000000000004', 'active', now());

insert into public.organization_user_roles (organization_id, organization_user_id, role, branch_id)
values
  ('27000000-0000-0000-0000-000000000001', '47000000-0000-0000-0000-000000000001', 'gym_owner', null),
  ('27000000-0000-0000-0000-000000000001', '47000000-0000-0000-0000-000000000002', 'receptionist', '37000000-0000-0000-0000-000000000001'),
  ('27000000-0000-0000-0000-000000000001', '47000000-0000-0000-0000-000000000003', 'member', '37000000-0000-0000-0000-000000000001'),
  ('27000000-0000-0000-0000-000000000002', '47000000-0000-0000-0000-000000000004', 'gym_owner', null);

insert into public.members (id, organization_id, home_branch_id, member_code, full_name, phone, created_by, updated_by)
values
  ('57000000-0000-0000-0000-000000000001', '27000000-0000-0000-0000-000000000001', '37000000-0000-0000-0000-000000000001', 'M000001', 'Payment Member A', '+919876543230', '17000000-0000-0000-0000-000000000001', '17000000-0000-0000-0000-000000000001'),
  ('57000000-0000-0000-0000-000000000002', '27000000-0000-0000-0000-000000000002', '37000000-0000-0000-0000-000000000002', 'M000001', 'Payment Member B', '+919876543231', '17000000-0000-0000-0000-000000000004', '17000000-0000-0000-0000-000000000004');

insert into public.membership_plans (
  id, organization_id, code, name, duration_value, duration_unit,
  price_amount_minor, joining_fee_amount_minor, currency, tax_inclusive,
  created_by, updated_by
)
values
  ('67000000-0000-0000-0000-000000000001', '27000000-0000-0000-0000-000000000001', 'MONTHLY', 'Monthly', 30, 'day', 150000, 0, 'INR', true, '17000000-0000-0000-0000-000000000001', '17000000-0000-0000-0000-000000000001'),
  ('67000000-0000-0000-0000-000000000002', '27000000-0000-0000-0000-000000000002', 'MONTHLY', 'Monthly', 30, 'day', 150000, 0, 'INR', true, '17000000-0000-0000-0000-000000000004', '17000000-0000-0000-0000-000000000004');

set local role authenticated;
select set_config('request.jwt.claim.role', 'authenticated', true);
select set_config('request.jwt.claim.sub', '17000000-0000-0000-0000-000000000001', true);

do $$
declare
  v_membership_id uuid;
  v_payment_id uuid;
  v_receipt text;
begin
  select membership_id into v_membership_id
  from public.enroll_member('27000000-0000-0000-0000-000000000001', '57000000-0000-0000-0000-000000000001', '67000000-0000-0000-0000-000000000001', public.organization_local_date('27000000-0000-0000-0000-000000000001'), null);

  select payment_id, receipt_code into v_payment_id, v_receipt
  from public.record_manual_payment('27000000-0000-0000-0000-000000000001', v_membership_id, 50000, 'upi', null, 'UPI-TEST-1', 'Deposit');

  if v_receipt <> 'R000001' then raise exception 'Receipt numbering failed'; end if;
  if not exists (
    select 1 from public.membership_payment_balances
    where membership_id = v_membership_id and paid_amount_minor = 50000 and outstanding_amount_minor = 100000
  ) then raise exception 'Payment balance is incorrect'; end if;

  begin
    perform public.record_manual_payment('27000000-0000-0000-0000-000000000001', v_membership_id, 100001, 'cash', null, null, null);
    raise exception 'Overpayment was permitted';
  exception when invalid_parameter_value then null;
  end;

  perform set_config('test.payment_id', v_payment_id::text, true);
  perform set_config('test.membership_id', v_membership_id::text, true);
end;
$$;

select set_config('request.jwt.claim.sub', '17000000-0000-0000-0000-000000000002', true);
do $$
begin
  perform public.record_manual_payment(
    '27000000-0000-0000-0000-000000000001',
    current_setting('test.membership_id')::uuid,
    25000,
    'cash', null, null, null
  );

  begin
    perform public.void_manual_payment('27000000-0000-0000-0000-000000000001', current_setting('test.payment_id')::uuid, 'Receptionist void');
    raise exception 'Receptionist voided a payment';
  exception when insufficient_privilege then null;
  end;
end;
$$;

select set_config('request.jwt.claim.sub', '17000000-0000-0000-0000-000000000003', true);
do $$
begin
  begin
    perform public.record_manual_payment('27000000-0000-0000-0000-000000000001', current_setting('test.membership_id')::uuid, 1000, 'cash', null, null, null);
    raise exception 'Member role recorded a payment';
  exception when insufficient_privilege then null;
  end;
end;
$$;

select set_config('request.jwt.claim.sub', '17000000-0000-0000-0000-000000000001', true);
do $$
begin
  perform public.void_manual_payment('27000000-0000-0000-0000-000000000001', current_setting('test.payment_id')::uuid, 'Entry correction');
  if not exists (
    select 1 from public.manual_payments
    where id = current_setting('test.payment_id')::uuid and status = 'voided' and void_reason = 'Entry correction'
  ) then raise exception 'Owner void did not persist'; end if;
end;
$$;

select set_config('request.jwt.claim.sub', '17000000-0000-0000-0000-000000000004', true);
do $$
declare v_membership_id uuid;
begin
  select membership_id into v_membership_id
  from public.enroll_member('27000000-0000-0000-0000-000000000002', '57000000-0000-0000-0000-000000000002', '67000000-0000-0000-0000-000000000002', public.organization_local_date('27000000-0000-0000-0000-000000000002'), null);
  perform set_config('test.other_membership_id', v_membership_id::text, true);
end;
$$;

select set_config('request.jwt.claim.sub', '17000000-0000-0000-0000-000000000001', true);
do $$
begin
  begin
    perform public.record_manual_payment('27000000-0000-0000-0000-000000000002', current_setting('test.other_membership_id')::uuid, 1000, 'cash', null, null, null);
    raise exception 'Cross-tenant payment was permitted';
  exception when insufficient_privilege then null;
  end;
end;
$$;

reset role;
rollback;
