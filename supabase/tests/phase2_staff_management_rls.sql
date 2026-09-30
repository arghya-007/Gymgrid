\set ON_ERROR_STOP on

-- Phase 2 staff-management security smoke test.
-- Run against a disposable database after applying all migrations.

begin;

insert into auth.users (
  instance_id, id, aud, role, email, encrypted_password, email_confirmed_at,
  raw_app_meta_data, raw_user_meta_data, created_at, updated_at
)
values
  ('00000000-0000-0000-0000-000000000000', '13000000-0000-0000-0000-000000000001', 'authenticated', 'authenticated', 'staff-owner-a@gymgrid.test', crypt('test-password', gen_salt('bf')), now(), '{}', '{"full_name":"Owner A"}', now(), now()),
  ('00000000-0000-0000-0000-000000000000', '13000000-0000-0000-0000-000000000002', 'authenticated', 'authenticated', 'staff-manager-a@gymgrid.test', crypt('test-password', gen_salt('bf')), now(), '{}', '{"full_name":"Manager A"}', now(), now()),
  ('00000000-0000-0000-0000-000000000000', '13000000-0000-0000-0000-000000000003', 'authenticated', 'authenticated', 'staff-reception-a@gymgrid.test', crypt('test-password', gen_salt('bf')), now(), '{}', '{"full_name":"Reception A"}', now(), now()),
  ('00000000-0000-0000-0000-000000000000', '13000000-0000-0000-0000-000000000004', 'authenticated', 'authenticated', 'staff-invitee-a@gymgrid.test', crypt('test-password', gen_salt('bf')), now(), '{}', '{"full_name":"Invitee A"}', now(), now()),
  ('00000000-0000-0000-0000-000000000000', '13000000-0000-0000-0000-000000000005', 'authenticated', 'authenticated', 'staff-owner-b@gymgrid.test', crypt('test-password', gen_salt('bf')), now(), '{}', '{"full_name":"Owner B"}', now(), now());

insert into public.organizations (id, slug, name, status)
values
  ('23000000-0000-0000-0000-000000000001', 'staff-test-a', 'Staff Test A', 'active'),
  ('23000000-0000-0000-0000-000000000002', 'staff-test-b', 'Staff Test B', 'active');

insert into public.branches (id, organization_id, code, name)
values
  ('33000000-0000-0000-0000-000000000001', '23000000-0000-0000-0000-000000000001', 'MAIN', 'Staff Test A Main'),
  ('33000000-0000-0000-0000-000000000002', '23000000-0000-0000-0000-000000000002', 'MAIN', 'Staff Test B Main');

insert into public.organization_users (id, organization_id, user_id, status, joined_at)
values
  ('43000000-0000-0000-0000-000000000001', '23000000-0000-0000-0000-000000000001', '13000000-0000-0000-0000-000000000001', 'active', now()),
  ('43000000-0000-0000-0000-000000000002', '23000000-0000-0000-0000-000000000001', '13000000-0000-0000-0000-000000000002', 'active', now()),
  ('43000000-0000-0000-0000-000000000003', '23000000-0000-0000-0000-000000000001', '13000000-0000-0000-0000-000000000003', 'active', now()),
  ('43000000-0000-0000-0000-000000000005', '23000000-0000-0000-0000-000000000002', '13000000-0000-0000-0000-000000000005', 'active', now());

insert into public.organization_user_roles (
  organization_id, organization_user_id, role, branch_id
)
values
  ('23000000-0000-0000-0000-000000000001', '43000000-0000-0000-0000-000000000001', 'gym_owner', null),
  ('23000000-0000-0000-0000-000000000001', '43000000-0000-0000-0000-000000000002', 'gym_manager', null),
  ('23000000-0000-0000-0000-000000000001', '43000000-0000-0000-0000-000000000003', 'receptionist', '33000000-0000-0000-0000-000000000001'),
  ('23000000-0000-0000-0000-000000000002', '43000000-0000-0000-0000-000000000005', 'gym_owner', null);

set local role authenticated;
select set_config('request.jwt.claim.role', 'authenticated', true);
select set_config('request.jwt.claim.sub', '13000000-0000-0000-0000-000000000001', true);

do $$
declare
  v_invitation_id uuid;
begin
  select result.invitation_id into v_invitation_id
  from public.create_staff_invitation(
    '23000000-0000-0000-0000-000000000001',
    'future-manager@gymgrid.test',
    'gym_manager',
    null
  ) result;

  if v_invitation_id is null then
    raise exception 'Owner could not create a manager invitation';
  end if;

  perform public.create_staff_invitation(
    '23000000-0000-0000-0000-000000000001',
    'staff-invitee-a@gymgrid.test',
    'trainer',
    '33000000-0000-0000-0000-000000000001'
  );

  begin
    insert into public.organization_invitations (
      organization_id, email, role, invited_by
    ) values (
      '23000000-0000-0000-0000-000000000001',
      'direct-staff@gymgrid.test',
      'trainer',
      '13000000-0000-0000-0000-000000000001'
    );
    raise exception 'RLS failure: direct invitation insert was permitted';
  exception
    when insufficient_privilege then null;
  end;

  begin
    perform public.create_staff_invitation(
      '23000000-0000-0000-0000-000000000002',
      'cross-tenant@gymgrid.test',
      'trainer',
      '33000000-0000-0000-0000-000000000002'
    );
    raise exception 'Authorization failure: owner invited staff into another tenant';
  exception
    when insufficient_privilege then null;
  end;
end;
$$;

select set_config('request.jwt.claim.sub', '13000000-0000-0000-0000-000000000002', true);

do $$
declare
  v_invitation_id uuid;
begin
  begin
    perform public.create_staff_invitation(
      '23000000-0000-0000-0000-000000000001',
      'manager-peer@gymgrid.test',
      'gym_manager',
      null
    );
    raise exception 'Authorization failure: manager invited a peer manager';
  exception
    when insufficient_privilege then null;
  end;

  select result.invitation_id into v_invitation_id
  from public.create_staff_invitation(
    '23000000-0000-0000-0000-000000000001',
    'future-reception@gymgrid.test',
    'receptionist',
    '33000000-0000-0000-0000-000000000001'
  ) result;

  if not public.revoke_staff_invitation(
    '23000000-0000-0000-0000-000000000001',
    v_invitation_id
  ) then
    raise exception 'Manager could not revoke a lower-role invitation';
  end if;
end;
$$;

select set_config('request.jwt.claim.sub', '13000000-0000-0000-0000-000000000003', true);

do $$
begin
  begin
    perform public.create_staff_invitation(
      '23000000-0000-0000-0000-000000000001',
      'unauthorized@gymgrid.test',
      'trainer',
      '33000000-0000-0000-0000-000000000001'
    );
    raise exception 'Authorization failure: receptionist invited staff';
  exception
    when insufficient_privilege then null;
  end;
end;
$$;

select set_config('request.jwt.claim.sub', '13000000-0000-0000-0000-000000000004', true);

do $$
declare
  v_accepted integer;
  v_membership_id uuid;
begin
  v_accepted := public.accept_my_organization_invitations();
  if v_accepted <> 1 then
    raise exception 'Invitation acceptance failure: accepted % instead of 1', v_accepted;
  end if;

  select ou.id into v_membership_id
  from public.organization_users ou
  where ou.organization_id = '23000000-0000-0000-0000-000000000001'
    and ou.user_id = '13000000-0000-0000-0000-000000000004'
    and ou.status = 'active';

  if v_membership_id is null or not exists (
    select 1
    from public.organization_user_roles our
    where our.organization_user_id = v_membership_id
      and our.role = 'trainer'
      and our.branch_id = '33000000-0000-0000-0000-000000000001'
  ) then
    raise exception 'Invitation acceptance did not create the scoped staff role';
  end if;
end;
$$;

select set_config('request.jwt.claim.sub', '13000000-0000-0000-0000-000000000002', true);

do $$
declare
  v_invitee_membership_id uuid;
begin
  select ou.id into v_invitee_membership_id
  from public.organization_users ou
  where ou.organization_id = '23000000-0000-0000-0000-000000000001'
    and ou.user_id = '13000000-0000-0000-0000-000000000004';

  perform public.set_staff_membership_status(
    '23000000-0000-0000-0000-000000000001',
    v_invitee_membership_id,
    'suspended'
  );

  if not exists (
    select 1 from public.organization_users
    where id = v_invitee_membership_id and status = 'suspended'
  ) then
    raise exception 'Manager could not suspend lower-role staff';
  end if;

  begin
    perform public.set_staff_membership_status(
      '23000000-0000-0000-0000-000000000001',
      '43000000-0000-0000-0000-000000000001',
      'suspended'
    );
    raise exception 'Authorization failure: manager suspended owner';
  exception
    when insufficient_privilege then null;
  end;
end;
$$;

reset role;
rollback;
