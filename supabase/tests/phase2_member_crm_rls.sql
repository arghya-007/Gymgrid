\set ON_ERROR_STOP on

-- Phase 2 Member CRM security smoke test.
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
  ('00000000-0000-0000-0000-000000000000', '11000000-0000-0000-0000-000000000001', 'authenticated', 'authenticated', 'owner-a-members@gymgrid.test', crypt('test-password', gen_salt('bf')), now(), '{}', '{}', now(), now()),
  ('00000000-0000-0000-0000-000000000000', '11000000-0000-0000-0000-000000000002', 'authenticated', 'authenticated', 'reception-a@gymgrid.test', crypt('test-password', gen_salt('bf')), now(), '{}', '{}', now(), now()),
  ('00000000-0000-0000-0000-000000000000', '11000000-0000-0000-0000-000000000003', 'authenticated', 'authenticated', 'member-a@gymgrid.test', crypt('test-password', gen_salt('bf')), now(), '{}', '{}', now(), now()),
  ('00000000-0000-0000-0000-000000000000', '11000000-0000-0000-0000-000000000004', 'authenticated', 'authenticated', 'owner-b-members@gymgrid.test', crypt('test-password', gen_salt('bf')), now(), '{}', '{}', now(), now());

insert into public.organizations (id, slug, name, status)
values
  ('21000000-0000-0000-0000-000000000001', 'member-test-a', 'Member Test A', 'active'),
  ('21000000-0000-0000-0000-000000000002', 'member-test-b', 'Member Test B', 'active');

insert into public.branches (id, organization_id, code, name)
values
  ('31000000-0000-0000-0000-000000000001', '21000000-0000-0000-0000-000000000001', 'MAIN', 'Member Test A Main'),
  ('31000000-0000-0000-0000-000000000002', '21000000-0000-0000-0000-000000000002', 'MAIN', 'Member Test B Main');

insert into public.organization_users (id, organization_id, user_id, status, joined_at)
values
  ('41000000-0000-0000-0000-000000000001', '21000000-0000-0000-0000-000000000001', '11000000-0000-0000-0000-000000000001', 'active', now()),
  ('41000000-0000-0000-0000-000000000002', '21000000-0000-0000-0000-000000000001', '11000000-0000-0000-0000-000000000002', 'active', now()),
  ('41000000-0000-0000-0000-000000000003', '21000000-0000-0000-0000-000000000001', '11000000-0000-0000-0000-000000000003', 'active', now()),
  ('41000000-0000-0000-0000-000000000004', '21000000-0000-0000-0000-000000000002', '11000000-0000-0000-0000-000000000004', 'active', now());

insert into public.organization_user_roles (
  organization_id,
  organization_user_id,
  role,
  branch_id
)
values
  ('21000000-0000-0000-0000-000000000001', '41000000-0000-0000-0000-000000000001', 'gym_owner', null),
  ('21000000-0000-0000-0000-000000000001', '41000000-0000-0000-0000-000000000002', 'receptionist', '31000000-0000-0000-0000-000000000001'),
  ('21000000-0000-0000-0000-000000000001', '41000000-0000-0000-0000-000000000003', 'member', null),
  ('21000000-0000-0000-0000-000000000002', '41000000-0000-0000-0000-000000000004', 'gym_owner', null);

set local role authenticated;
select set_config('request.jwt.claim.role', 'authenticated', true);
select set_config('request.jwt.claim.sub', '11000000-0000-0000-0000-000000000001', true);

do $$
declare
  v_member_id uuid;
  v_member_code text;
  v_visible_members integer;
begin
  select result.member_id, result.member_code
    into v_member_id, v_member_code
  from public.create_member(
    '21000000-0000-0000-0000-000000000001',
    '31000000-0000-0000-0000-000000000001',
    'Owner Created Member',
    '98765 43210',
    'owner-created@gymgrid.test'
  ) result;

  if v_member_id is null or v_member_code <> 'M000001' then
    raise exception 'Member creation failure: unexpected id or code %', v_member_code;
  end if;

  select count(*) into v_visible_members from public.members;
  if v_visible_members <> 1 then
    raise exception 'RLS failure: Tenant A owner saw % members instead of 1', v_visible_members;
  end if;

  begin
    perform public.create_member(
      '21000000-0000-0000-0000-000000000002',
      '31000000-0000-0000-0000-000000000002',
      'Cross Tenant Member',
      '9876543211'
    );
    raise exception 'RLS failure: Tenant A owner created a Tenant B member';
  exception
    when insufficient_privilege then null;
  end;

  begin
    insert into public.members (
      organization_id,
      home_branch_id,
      member_code,
      full_name,
      phone,
      created_by,
      updated_by
    )
    values (
      '21000000-0000-0000-0000-000000000001',
      '31000000-0000-0000-0000-000000000001',
      'M999999',
      'Direct Insert Member',
      '+919876543299',
      '11000000-0000-0000-0000-000000000001',
      '11000000-0000-0000-0000-000000000001'
    );
    raise exception 'RLS failure: direct member insert was permitted';
  exception
    when insufficient_privilege then null;
  end;
end;
$$;

select set_config('request.jwt.claim.sub', '11000000-0000-0000-0000-000000000002', true);

do $$
declare
  v_member_code text;
begin
  select result.member_code into v_member_code
  from public.create_member(
    '21000000-0000-0000-0000-000000000001',
    '31000000-0000-0000-0000-000000000001',
    'Reception Created Member',
    '+91 98765 43212'
  ) result;

  if v_member_code <> 'M000002' then
    raise exception 'Reception creation failure: unexpected code %', v_member_code;
  end if;
end;
$$;

select set_config('request.jwt.claim.sub', '11000000-0000-0000-0000-000000000003', true);

do $$
begin
  begin
    perform public.create_member(
      '21000000-0000-0000-0000-000000000001',
      '31000000-0000-0000-0000-000000000001',
      'Unauthorized Member',
      '9876543213'
    );
    raise exception 'Authorization failure: member role created a member record';
  exception
    when insufficient_privilege then null;
  end;
end;
$$;

reset role;
rollback;
