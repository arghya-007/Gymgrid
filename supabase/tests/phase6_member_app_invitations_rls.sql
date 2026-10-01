\set ON_ERROR_STOP on

-- Phase 6 member app invitation, acceptance, linkage, and denial smoke test.
begin;

insert into auth.users (
  instance_id, id, aud, role, email, encrypted_password, email_confirmed_at,
  raw_app_meta_data, raw_user_meta_data, created_at, updated_at
)
values
  ('00000000-0000-0000-0000-000000000000', '24000000-0000-0000-0000-000000000001', 'authenticated', 'authenticated', 'invite-owner@gymgrid.test', crypt('test-password', gen_salt('bf')), now(), '{}', '{}', now(), now()),
  ('00000000-0000-0000-0000-000000000000', '24000000-0000-0000-0000-000000000002', 'authenticated', 'authenticated', 'invite-member@gymgrid.test', crypt('test-password', gen_salt('bf')), now(), '{}', '{}', now(), now()),
  ('00000000-0000-0000-0000-000000000000', '24000000-0000-0000-0000-000000000003', 'authenticated', 'authenticated', 'invite-attacker@gymgrid.test', crypt('test-password', gen_salt('bf')), now(), '{}', '{}', now(), now()),
  ('00000000-0000-0000-0000-000000000000', '24000000-0000-0000-0000-000000000004', 'authenticated', 'authenticated', 'invite-suspended@gymgrid.test', crypt('test-password', gen_salt('bf')), now(), '{}', '{}', now(), now());

insert into public.profiles (id, full_name)
values
  ('24000000-0000-0000-0000-000000000001', 'Invite Owner'),
  ('24000000-0000-0000-0000-000000000002', 'Invite Member'),
  ('24000000-0000-0000-0000-000000000003', 'Invite Attacker'),
  ('24000000-0000-0000-0000-000000000004', 'Invite Suspended')
on conflict (id) do update set full_name = excluded.full_name;

insert into public.organizations (id, slug, name, status, timezone)
values ('34000000-0000-0000-0000-000000000001', 'member-invite-test', 'Member Invite Test', 'active', 'Asia/Kolkata');

insert into public.branches (id, organization_id, code, name)
values ('44000000-0000-0000-0000-000000000001', '34000000-0000-0000-0000-000000000001', 'MAIN', 'Invite Main');

insert into public.organization_users (id, organization_id, user_id, status, joined_at)
values
  ('54000000-0000-0000-0000-000000000001', '34000000-0000-0000-0000-000000000001', '24000000-0000-0000-0000-000000000001', 'active', now()),
  ('54000000-0000-0000-0000-000000000002', '34000000-0000-0000-0000-000000000001', '24000000-0000-0000-0000-000000000004', 'suspended', now());

insert into public.organization_user_roles (
  organization_id, organization_user_id, role, branch_id
)
values (
  '34000000-0000-0000-0000-000000000001',
  '54000000-0000-0000-0000-000000000001',
  'gym_owner',
  null
);

insert into public.members (
  id, organization_id, home_branch_id, member_code, full_name, phone, status,
  created_by, updated_by
)
values
  (
    '64000000-0000-0000-0000-000000000001',
    '34000000-0000-0000-0000-000000000001',
    '44000000-0000-0000-0000-000000000001',
    'M240001',
    'Invited Member',
    '+919000002401',
    'active',
    '24000000-0000-0000-0000-000000000001',
    '24000000-0000-0000-0000-000000000001'
  ),
  (
    '64000000-0000-0000-0000-000000000002',
    '34000000-0000-0000-0000-000000000001',
    '44000000-0000-0000-0000-000000000001',
    'M240002',
    'Suspended Member',
    '+919000002402',
    'active',
    '24000000-0000-0000-0000-000000000001',
    '24000000-0000-0000-0000-000000000001'
  );

set local role authenticated;
select set_config('request.jwt.claim.role', 'authenticated', true);
select set_config('request.jwt.claim.sub', '24000000-0000-0000-0000-000000000001', true);

select *
from public.create_member_invitation(
  '34000000-0000-0000-0000-000000000001',
  '64000000-0000-0000-0000-000000000001',
  'invite-member@gymgrid.test'
);

select *
from public.create_member_invitation(
  '34000000-0000-0000-0000-000000000001',
  '64000000-0000-0000-0000-000000000002',
  'invite-suspended@gymgrid.test'
);

do $$
begin
  if not exists (
    select 1
    from public.organization_invitations oi
    where oi.organization_id = '34000000-0000-0000-0000-000000000001'
      and oi.member_id = '64000000-0000-0000-0000-000000000001'
      and oi.email = 'invite-member@gymgrid.test'
      and oi.role = 'member'
      and oi.status = 'pending'
  ) then
    raise exception 'Member invitation was not created';
  end if;

  if not exists (
    select 1
    from public.members m
    where m.id = '64000000-0000-0000-0000-000000000001'
      and m.email = 'invite-member@gymgrid.test'
      and m.auth_user_id is null
  ) then
    raise exception 'Member email was not prepared for app access';
  end if;
end;
$$;

select set_config('request.jwt.claim.sub', '24000000-0000-0000-0000-000000000002', true);

do $$
declare
  accepted integer;
begin
  accepted := public.accept_my_organization_invitations();
  if accepted <> 1 then
    raise exception 'Expected one accepted member invitation, got %', accepted;
  end if;

  if not exists (
    select 1
    from public.members m
    where m.id = '64000000-0000-0000-0000-000000000001'
      and m.auth_user_id = '24000000-0000-0000-0000-000000000002'
  ) then
    raise exception 'Auth account was not linked to the invited member';
  end if;

  if not exists (
    select 1
    from public.organization_users ou
    join public.organization_user_roles our
      on our.organization_user_id = ou.id
    where ou.organization_id = '34000000-0000-0000-0000-000000000001'
      and ou.user_id = '24000000-0000-0000-0000-000000000002'
      and ou.status = 'active'
      and our.role = 'member'
      and our.branch_id = '44000000-0000-0000-0000-000000000001'
  ) then
    raise exception 'Member organization role was not activated';
  end if;
end;
$$;

select set_config('request.jwt.claim.sub', '24000000-0000-0000-0000-000000000004', true);

do $$
declare
  accepted integer;
begin
  accepted := public.accept_my_organization_invitations();
  if accepted <> 0 then
    raise exception 'Suspended account accepted an organization invitation';
  end if;

  if exists (
    select 1
    from public.members m
    where m.id = '64000000-0000-0000-0000-000000000002'
      and m.auth_user_id is not null
  ) then
    raise exception 'Suspended account was linked to a member';
  end if;

  if not exists (
    select 1
    from public.organization_users ou
    where ou.id = '54000000-0000-0000-0000-000000000002'
      and ou.status = 'suspended'
  ) then
    raise exception 'Suspended organization access was reactivated';
  end if;
end;
$$;

select set_config('request.jwt.claim.sub', '24000000-0000-0000-0000-000000000003', true);

do $$
declare
  accepted integer;
begin
  accepted := public.accept_my_organization_invitations();
  if accepted <> 0 then
    raise exception 'Uninvited account accepted an organization invitation';
  end if;

  begin
    perform public.create_member_invitation(
      '34000000-0000-0000-0000-000000000001',
      '64000000-0000-0000-0000-000000000001',
      'invite-attacker@gymgrid.test'
    );
    raise exception 'Unauthorized account created a member invitation';
  exception when insufficient_privilege then null;
  end;
end;
$$;

reset role;
rollback;
