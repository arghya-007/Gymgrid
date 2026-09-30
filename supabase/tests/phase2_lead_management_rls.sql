\set ON_ERROR_STOP on

-- Phase 2 lead-management security smoke test.
-- Run against a disposable database after applying all migrations.

begin;

insert into auth.users (
  instance_id, id, aud, role, email, encrypted_password, email_confirmed_at,
  raw_app_meta_data, raw_user_meta_data, created_at, updated_at
)
values
  ('00000000-0000-0000-0000-000000000000', '14000000-0000-0000-0000-000000000001', 'authenticated', 'authenticated', 'lead-owner-a@gymgrid.test', crypt('test-password', gen_salt('bf')), now(), '{}', '{}', now(), now()),
  ('00000000-0000-0000-0000-000000000000', '14000000-0000-0000-0000-000000000002', 'authenticated', 'authenticated', 'lead-reception-a@gymgrid.test', crypt('test-password', gen_salt('bf')), now(), '{}', '{}', now(), now()),
  ('00000000-0000-0000-0000-000000000000', '14000000-0000-0000-0000-000000000003', 'authenticated', 'authenticated', 'lead-member-a@gymgrid.test', crypt('test-password', gen_salt('bf')), now(), '{}', '{}', now(), now()),
  ('00000000-0000-0000-0000-000000000000', '14000000-0000-0000-0000-000000000004', 'authenticated', 'authenticated', 'lead-owner-b@gymgrid.test', crypt('test-password', gen_salt('bf')), now(), '{}', '{}', now(), now());

insert into public.organizations (id, slug, name, status)
values
  ('24000000-0000-0000-0000-000000000001', 'lead-test-a', 'Lead Test A', 'active'),
  ('24000000-0000-0000-0000-000000000002', 'lead-test-b', 'Lead Test B', 'active');

insert into public.branches (id, organization_id, code, name)
values
  ('34000000-0000-0000-0000-000000000001', '24000000-0000-0000-0000-000000000001', 'MAIN', 'Lead Test A Main'),
  ('34000000-0000-0000-0000-000000000002', '24000000-0000-0000-0000-000000000002', 'MAIN', 'Lead Test B Main');

insert into public.organization_users (id, organization_id, user_id, status, joined_at)
values
  ('44000000-0000-0000-0000-000000000001', '24000000-0000-0000-0000-000000000001', '14000000-0000-0000-0000-000000000001', 'active', now()),
  ('44000000-0000-0000-0000-000000000002', '24000000-0000-0000-0000-000000000001', '14000000-0000-0000-0000-000000000002', 'active', now()),
  ('44000000-0000-0000-0000-000000000003', '24000000-0000-0000-0000-000000000001', '14000000-0000-0000-0000-000000000003', 'active', now()),
  ('44000000-0000-0000-0000-000000000004', '24000000-0000-0000-0000-000000000002', '14000000-0000-0000-0000-000000000004', 'active', now());

insert into public.organization_user_roles (
  organization_id, organization_user_id, role, branch_id
)
values
  ('24000000-0000-0000-0000-000000000001', '44000000-0000-0000-0000-000000000001', 'gym_owner', null),
  ('24000000-0000-0000-0000-000000000001', '44000000-0000-0000-0000-000000000002', 'receptionist', '34000000-0000-0000-0000-000000000001'),
  ('24000000-0000-0000-0000-000000000001', '44000000-0000-0000-0000-000000000003', 'member', '34000000-0000-0000-0000-000000000001'),
  ('24000000-0000-0000-0000-000000000002', '44000000-0000-0000-0000-000000000004', 'gym_owner', null);

set local role authenticated;
select set_config('request.jwt.claim.role', 'authenticated', true);
select set_config('request.jwt.claim.sub', '14000000-0000-0000-0000-000000000001', true);

do $$
declare
  v_lead_id uuid;
  v_lead_code text;
begin
  select result.lead_id, result.lead_code into v_lead_id, v_lead_code
  from public.create_lead(
    '24000000-0000-0000-0000-000000000001',
    '34000000-0000-0000-0000-000000000001',
    'Owner Lead',
    '9876543210',
    'owner-lead@gymgrid.test',
    'website',
    null,
    now() + interval '1 day',
    'Interested in an annual plan'
  ) result;

  if v_lead_id is null or v_lead_code <> 'L000001' then
    raise exception 'Owner lead creation returned unexpected values';
  end if;

  begin
    insert into public.leads (
      organization_id, branch_id, lead_code, full_name, phone, source,
      created_by, updated_by
    ) values (
      '24000000-0000-0000-0000-000000000001',
      '34000000-0000-0000-0000-000000000001',
      'L999999',
      'Direct Lead',
      '+919876543210',
      'walk_in',
      '14000000-0000-0000-0000-000000000001',
      '14000000-0000-0000-0000-000000000001'
    );
    raise exception 'RLS failure: direct lead insert was permitted';
  exception
    when insufficient_privilege then null;
  end;

  begin
    perform public.create_lead(
      '24000000-0000-0000-0000-000000000002',
      '34000000-0000-0000-0000-000000000002',
      'Cross Tenant Lead',
      '9876543211',
      null,
      'phone',
      null,
      null,
      null
    );
    raise exception 'Authorization failure: owner created a cross-tenant lead';
  exception
    when insufficient_privilege then null;
  end;
end;
$$;

select set_config('request.jwt.claim.sub', '14000000-0000-0000-0000-000000000002', true);

do $$
declare
  v_lead_id uuid;
begin
  select result.lead_id into v_lead_id
  from public.create_lead(
    '24000000-0000-0000-0000-000000000001',
    '34000000-0000-0000-0000-000000000001',
    'Reception Lead',
    '+91 98765 43212',
    null,
    'walk_in',
    null,
    null,
    null
  ) result;

  perform public.update_lead(
    v_lead_id,
    '24000000-0000-0000-0000-000000000001',
    '34000000-0000-0000-0000-000000000001',
    'Reception Lead',
    '+919876543212',
    null,
    'walk_in',
    'contacted',
    null,
    now() + interval '2 days',
    'Called once',
    null
  );

  if not exists (
    select 1 from public.leads
    where id = v_lead_id and status = 'contacted'
  ) then
    raise exception 'Receptionist could not update assigned-branch lead';
  end if;
end;
$$;

select set_config('request.jwt.claim.sub', '14000000-0000-0000-0000-000000000003', true);

do $$
begin
  begin
    perform public.create_lead(
      '24000000-0000-0000-0000-000000000001',
      '34000000-0000-0000-0000-000000000001',
      'Unauthorized Lead',
      '9876543213',
      null,
      'other',
      null,
      null,
      null
    );
    raise exception 'Authorization failure: member role created a lead';
  exception
    when insufficient_privilege then null;
  end;
end;
$$;

select set_config('request.jwt.claim.sub', '14000000-0000-0000-0000-000000000001', true);

do $$
declare
  v_lead_id uuid;
  v_member_id uuid;
  v_member_code text;
begin
  select id into v_lead_id
  from public.leads
  where organization_id = '24000000-0000-0000-0000-000000000001'
    and lead_code = 'L000001';

  select result.member_id, result.member_code into v_member_id, v_member_code
  from public.convert_lead_to_member(
    v_lead_id,
    '24000000-0000-0000-0000-000000000001',
    date '1995-01-01',
    'prefer_not_to_say'
  ) result;

  if v_member_id is null or v_member_code <> 'M000001' then
    raise exception 'Lead conversion did not create the expected member';
  end if;

  if not exists (
    select 1 from public.leads
    where id = v_lead_id
      and status = 'won'
      and converted_member_id = v_member_id
      and converted_at is not null
  ) then
    raise exception 'Converted lead was not marked won';
  end if;
end;
$$;

reset role;
rollback;
