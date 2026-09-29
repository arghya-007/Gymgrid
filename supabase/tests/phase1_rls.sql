\set ON_ERROR_STOP on

-- Phase 1 cross-tenant security smoke test.
-- Run against a disposable local Supabase database with:
--   supabase test db supabase/tests/phase1_rls.sql

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
  ('00000000-0000-0000-0000-000000000000', '10000000-0000-0000-0000-000000000001', 'authenticated', 'authenticated', 'platform@gymgrid.test', crypt('test-password', gen_salt('bf')), now(), '{}', '{"full_name":"Platform Admin"}', now(), now()),
  ('00000000-0000-0000-0000-000000000000', '10000000-0000-0000-0000-000000000002', 'authenticated', 'authenticated', 'owner-a@gymgrid.test', crypt('test-password', gen_salt('bf')), now(), '{}', '{"full_name":"Owner A"}', now(), now()),
  ('00000000-0000-0000-0000-000000000000', '10000000-0000-0000-0000-000000000003', 'authenticated', 'authenticated', 'owner-b@gymgrid.test', crypt('test-password', gen_salt('bf')), now(), '{}', '{"full_name":"Owner B"}', now(), now());

insert into public.platform_administrators (user_id, granted_by)
values ('10000000-0000-0000-0000-000000000001', '10000000-0000-0000-0000-000000000001');

insert into public.organizations (id, slug, name, status)
values
  ('20000000-0000-0000-0000-000000000001', 'tenant-a', 'Tenant A', 'active'),
  ('20000000-0000-0000-0000-000000000002', 'tenant-b', 'Tenant B', 'active');

insert into public.branches (id, organization_id, code, name)
values
  ('30000000-0000-0000-0000-000000000001', '20000000-0000-0000-0000-000000000001', 'MAIN', 'Tenant A Main'),
  ('30000000-0000-0000-0000-000000000002', '20000000-0000-0000-0000-000000000002', 'MAIN', 'Tenant B Main');

insert into public.organization_users (id, organization_id, user_id, status, joined_at)
values
  ('40000000-0000-0000-0000-000000000001', '20000000-0000-0000-0000-000000000001', '10000000-0000-0000-0000-000000000002', 'active', now()),
  ('40000000-0000-0000-0000-000000000002', '20000000-0000-0000-0000-000000000002', '10000000-0000-0000-0000-000000000003', 'active', now());

insert into public.organization_user_roles (organization_id, organization_user_id, role)
values
  ('20000000-0000-0000-0000-000000000001', '40000000-0000-0000-0000-000000000001', 'gym_owner'),
  ('20000000-0000-0000-0000-000000000002', '40000000-0000-0000-0000-000000000002', 'gym_owner');

set local role authenticated;
select set_config('request.jwt.claim.role', 'authenticated', true);
select set_config('request.jwt.claim.sub', '10000000-0000-0000-0000-000000000002', true);

do $$
declare
  v_visible_organizations integer;
  v_visible_branches integer;
  v_changed_rows integer;
begin
  select count(*) into v_visible_organizations from public.organizations;
  if v_visible_organizations <> 1 then
    raise exception 'RLS failure: Tenant A owner saw % organizations instead of 1', v_visible_organizations;
  end if;

  select count(*) into v_visible_branches from public.branches;
  if v_visible_branches <> 1 then
    raise exception 'RLS failure: Tenant A owner saw % branches instead of 1', v_visible_branches;
  end if;

  update public.organizations
  set name = 'Cross-tenant edit'
  where id = '20000000-0000-0000-0000-000000000002';
  get diagnostics v_changed_rows = row_count;

  if v_changed_rows <> 0 then
    raise exception 'RLS failure: tenant owner updated another tenant';
  end if;
end;
$$;

do $$
begin
  begin
    insert into public.organization_users (organization_id, user_id)
    values ('20000000-0000-0000-0000-000000000001', '10000000-0000-0000-0000-000000000003');
    raise exception 'RLS failure: tenant owner directly added an organization user';
  exception
    when insufficient_privilege then null;
  end;
end;
$$;

select set_config('request.jwt.claim.sub', '10000000-0000-0000-0000-000000000001', true);

do $$
declare
  v_visible_organizations integer;
  v_created_organization uuid;
begin
  select count(*) into v_visible_organizations from public.organizations;
  if v_visible_organizations <> 2 then
    raise exception 'RLS failure: platform admin saw % organizations instead of 2', v_visible_organizations;
  end if;

  select result.organization_id into v_created_organization
  from public.platform_create_tenant(
    'Test Onboarding Gym',
    'test-onboarding-gym',
    'Main Branch',
    'MAIN',
    'new-owner@gymgrid.test',
    'launch',
    current_date
  ) result;

  if v_created_organization is null then
    raise exception 'Onboarding failure: no organization returned';
  end if;
end;
$$;

reset role;
rollback;
