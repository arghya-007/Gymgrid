\set ON_ERROR_STOP on

-- Phase 3 renewal and membership-lifecycle security smoke test.
-- Run against a disposable database after applying all migrations.

begin;

insert into auth.users (
  instance_id, id, aud, role, email, encrypted_password, email_confirmed_at,
  raw_app_meta_data, raw_user_meta_data, created_at, updated_at
)
values
  ('00000000-0000-0000-0000-000000000000', '16000000-0000-0000-0000-000000000001', 'authenticated', 'authenticated', 'lifecycle-owner-a@gymgrid.test', crypt('test-password', gen_salt('bf')), now(), '{}', '{}', now(), now()),
  ('00000000-0000-0000-0000-000000000000', '16000000-0000-0000-0000-000000000002', 'authenticated', 'authenticated', 'lifecycle-reception-a@gymgrid.test', crypt('test-password', gen_salt('bf')), now(), '{}', '{}', now(), now()),
  ('00000000-0000-0000-0000-000000000000', '16000000-0000-0000-0000-000000000003', 'authenticated', 'authenticated', 'lifecycle-member-a@gymgrid.test', crypt('test-password', gen_salt('bf')), now(), '{}', '{}', now(), now()),
  ('00000000-0000-0000-0000-000000000000', '16000000-0000-0000-0000-000000000004', 'authenticated', 'authenticated', 'lifecycle-owner-b@gymgrid.test', crypt('test-password', gen_salt('bf')), now(), '{}', '{}', now(), now());

insert into public.organizations (id, slug, name, status, timezone)
values
  ('26000000-0000-0000-0000-000000000001', 'lifecycle-test-a', 'Lifecycle Test A', 'active', 'Asia/Kolkata'),
  ('26000000-0000-0000-0000-000000000002', 'lifecycle-test-b', 'Lifecycle Test B', 'active', 'Asia/Kolkata');

insert into public.branches (id, organization_id, code, name)
values
  ('36000000-0000-0000-0000-000000000001', '26000000-0000-0000-0000-000000000001', 'MAIN', 'Lifecycle A Main'),
  ('36000000-0000-0000-0000-000000000002', '26000000-0000-0000-0000-000000000002', 'MAIN', 'Lifecycle B Main');

insert into public.organization_users (id, organization_id, user_id, status, joined_at)
values
  ('46000000-0000-0000-0000-000000000001', '26000000-0000-0000-0000-000000000001', '16000000-0000-0000-0000-000000000001', 'active', now()),
  ('46000000-0000-0000-0000-000000000002', '26000000-0000-0000-0000-000000000001', '16000000-0000-0000-0000-000000000002', 'active', now()),
  ('46000000-0000-0000-0000-000000000003', '26000000-0000-0000-0000-000000000001', '16000000-0000-0000-0000-000000000003', 'active', now()),
  ('46000000-0000-0000-0000-000000000004', '26000000-0000-0000-0000-000000000002', '16000000-0000-0000-0000-000000000004', 'active', now());

insert into public.organization_user_roles (organization_id, organization_user_id, role, branch_id)
values
  ('26000000-0000-0000-0000-000000000001', '46000000-0000-0000-0000-000000000001', 'gym_owner', null),
  ('26000000-0000-0000-0000-000000000001', '46000000-0000-0000-0000-000000000002', 'receptionist', '36000000-0000-0000-0000-000000000001'),
  ('26000000-0000-0000-0000-000000000001', '46000000-0000-0000-0000-000000000003', 'member', '36000000-0000-0000-0000-000000000001'),
  ('26000000-0000-0000-0000-000000000002', '46000000-0000-0000-0000-000000000004', 'gym_owner', null);

insert into public.members (
  id, organization_id, home_branch_id, member_code, full_name, phone, created_by, updated_by
)
values
  ('56000000-0000-0000-0000-000000000001', '26000000-0000-0000-0000-000000000001', '36000000-0000-0000-0000-000000000001', 'M000001', 'Lifecycle Owner Member', '+919876543220', '16000000-0000-0000-0000-000000000001', '16000000-0000-0000-0000-000000000001'),
  ('56000000-0000-0000-0000-000000000002', '26000000-0000-0000-0000-000000000001', '36000000-0000-0000-0000-000000000001', 'M000002', 'Lifecycle Reception Member', '+919876543221', '16000000-0000-0000-0000-000000000001', '16000000-0000-0000-0000-000000000001'),
  ('56000000-0000-0000-0000-000000000003', '26000000-0000-0000-0000-000000000002', '36000000-0000-0000-0000-000000000002', 'M000001', 'Lifecycle Other Member', '+919876543222', '16000000-0000-0000-0000-000000000004', '16000000-0000-0000-0000-000000000004');

insert into public.membership_plans (
  id, organization_id, code, name, duration_value, duration_unit,
  price_amount_minor, joining_fee_amount_minor, currency, tax_inclusive,
  created_by, updated_by
)
values
  ('66000000-0000-0000-0000-000000000001', '26000000-0000-0000-0000-000000000001', 'MONTHLY', 'Monthly', 30, 'day', 150000, 0, 'INR', true, '16000000-0000-0000-0000-000000000001', '16000000-0000-0000-0000-000000000001'),
  ('66000000-0000-0000-0000-000000000002', '26000000-0000-0000-0000-000000000002', 'MONTHLY', 'Other Monthly', 30, 'day', 180000, 0, 'INR', true, '16000000-0000-0000-0000-000000000004', '16000000-0000-0000-0000-000000000004');

set local role authenticated;
select set_config('request.jwt.claim.role', 'authenticated', true);
select set_config('request.jwt.claim.sub', '16000000-0000-0000-0000-000000000001', true);

do $$
declare
  v_membership_id uuid;
  v_renewed_id uuid;
  v_original_end date;
  v_local_date date := public.organization_local_date('26000000-0000-0000-0000-000000000001');
begin
  select result.membership_id into v_membership_id
  from public.enroll_member(
    '26000000-0000-0000-0000-000000000001',
    '56000000-0000-0000-0000-000000000001',
    '66000000-0000-0000-0000-000000000001',
    v_local_date - 10,
    null
  ) result;

  perform set_config('test.lifecycle_owner_membership_id', v_membership_id::text, true);

  select end_date into v_original_end
  from public.member_memberships where id = v_membership_id;

  perform public.freeze_membership(
    '26000000-0000-0000-0000-000000000001',
    v_membership_id,
    v_local_date - 5,
    'Travel break'
  );

  if not exists (
    select 1 from public.member_membership_statuses
    where id = v_membership_id and status = 'frozen'
  ) then
    raise exception 'Membership was not frozen';
  end if;

  if public.resume_membership(
    '26000000-0000-0000-0000-000000000001',
    v_membership_id,
    v_local_date
  ) <> 5 then
    raise exception 'Resume did not return five frozen days';
  end if;

  if not exists (
    select 1 from public.member_memberships
    where id = v_membership_id
      and lifecycle_state = 'open'
      and end_date = v_original_end + 5
  ) then
    raise exception 'Resume did not extend the membership';
  end if;

  select result.membership_id into v_renewed_id
  from public.renew_membership(
    '26000000-0000-0000-0000-000000000001',
    v_membership_id,
    '66000000-0000-0000-0000-000000000001',
    null,
    'Renewal'
  ) result;

  if not exists (
    select 1 from public.member_memberships
    where id = v_renewed_id
      and renewed_from_membership_id = v_membership_id
      and start_date = v_original_end + 6
  ) then
    raise exception 'Renewal lineage or start date is incorrect';
  end if;

  perform public.cancel_membership(
    '26000000-0000-0000-0000-000000000001',
    v_renewed_id,
    v_local_date,
    'Member changed plans'
  );

  if not exists (
    select 1 from public.member_membership_statuses
    where id = v_renewed_id
      and status = 'cancelled'
      and cancellation_reason = 'Member changed plans'
  ) then
    raise exception 'Renewed membership was not cancelled';
  end if;

  update public.member_memberships
  set notes = 'Direct update'
  where id = v_membership_id;

  if exists (
    select 1 from public.member_memberships
    where id = v_membership_id and notes = 'Direct update'
  ) then
    raise exception 'RLS failure: direct membership update was permitted';
  end if;
end;
$$;

select set_config('request.jwt.claim.sub', '16000000-0000-0000-0000-000000000002', true);

do $$
declare
  v_membership_id uuid;
  v_local_date date := public.organization_local_date('26000000-0000-0000-0000-000000000001');
begin
  select result.membership_id into v_membership_id
  from public.enroll_member(
    '26000000-0000-0000-0000-000000000001',
    '56000000-0000-0000-0000-000000000002',
    '66000000-0000-0000-0000-000000000001',
    v_local_date,
    null
  ) result;

  perform public.freeze_membership(
    '26000000-0000-0000-0000-000000000001',
    v_membership_id,
    null,
    'Medical break'
  );
  perform public.resume_membership(
    '26000000-0000-0000-0000-000000000001',
    v_membership_id,
    null
  );
end;
$$;

select set_config('request.jwt.claim.sub', '16000000-0000-0000-0000-000000000003', true);

do $$
declare
  v_membership_id uuid;
begin
  v_membership_id := current_setting('test.lifecycle_owner_membership_id')::uuid;

  begin
    perform public.cancel_membership(
      '26000000-0000-0000-0000-000000000001',
      v_membership_id,
      null,
      'Unauthorized cancellation'
    );
    raise exception 'Authorization failure: member role cancelled a membership';
  exception
    when insufficient_privilege then null;
  end;
end;
$$;

select set_config('request.jwt.claim.sub', '16000000-0000-0000-0000-000000000004', true);

do $$
declare
  v_membership_id uuid;
  v_local_date date := public.organization_local_date('26000000-0000-0000-0000-000000000002');
begin
  select result.membership_id into v_membership_id
  from public.enroll_member(
    '26000000-0000-0000-0000-000000000002',
    '56000000-0000-0000-0000-000000000003',
    '66000000-0000-0000-0000-000000000002',
    v_local_date,
    null
  ) result;

  perform set_config('test.lifecycle_other_membership_id', v_membership_id::text, true);
end;
$$;

select set_config('request.jwt.claim.sub', '16000000-0000-0000-0000-000000000001', true);

do $$
declare
  v_other_membership_id uuid;
begin
  v_other_membership_id := current_setting('test.lifecycle_other_membership_id')::uuid;

  begin
    perform public.cancel_membership(
      '26000000-0000-0000-0000-000000000002',
      v_other_membership_id,
      null,
      'Cross-tenant cancellation'
    );
    raise exception 'Authorization failure: cross-tenant cancellation was permitted';
  exception
    when insufficient_privilege then null;
  end;
end;
$$;

reset role;
rollback;
