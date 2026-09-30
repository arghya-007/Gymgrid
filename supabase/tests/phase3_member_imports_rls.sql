\set ON_ERROR_STOP on

-- Phase 3 atomic member import security smoke test.
begin;

insert into auth.users (instance_id, id, aud, role, email, encrypted_password, email_confirmed_at, raw_app_meta_data, raw_user_meta_data, created_at, updated_at)
values
  ('00000000-0000-0000-0000-000000000000', '18000000-0000-0000-0000-000000000001', 'authenticated', 'authenticated', 'import-owner-a@gymgrid.test', crypt('test-password', gen_salt('bf')), now(), '{}', '{}', now(), now()),
  ('00000000-0000-0000-0000-000000000000', '18000000-0000-0000-0000-000000000002', 'authenticated', 'authenticated', 'import-reception-a@gymgrid.test', crypt('test-password', gen_salt('bf')), now(), '{}', '{}', now(), now()),
  ('00000000-0000-0000-0000-000000000000', '18000000-0000-0000-0000-000000000003', 'authenticated', 'authenticated', 'import-member-a@gymgrid.test', crypt('test-password', gen_salt('bf')), now(), '{}', '{}', now(), now()),
  ('00000000-0000-0000-0000-000000000000', '18000000-0000-0000-0000-000000000004', 'authenticated', 'authenticated', 'import-owner-b@gymgrid.test', crypt('test-password', gen_salt('bf')), now(), '{}', '{}', now(), now());

insert into public.organizations (id, slug, name, status, timezone)
values
  ('28000000-0000-0000-0000-000000000001', 'import-test-a', 'Import Test A', 'active', 'Asia/Kolkata'),
  ('28000000-0000-0000-0000-000000000002', 'import-test-b', 'Import Test B', 'active', 'Asia/Kolkata');
insert into public.branches (id, organization_id, code, name)
values
  ('38000000-0000-0000-0000-000000000001', '28000000-0000-0000-0000-000000000001', 'MAIN', 'Import A Main'),
  ('38000000-0000-0000-0000-000000000002', '28000000-0000-0000-0000-000000000002', 'MAIN', 'Import B Main');
insert into public.organization_users (id, organization_id, user_id, status, joined_at)
values
  ('48000000-0000-0000-0000-000000000001', '28000000-0000-0000-0000-000000000001', '18000000-0000-0000-0000-000000000001', 'active', now()),
  ('48000000-0000-0000-0000-000000000002', '28000000-0000-0000-0000-000000000001', '18000000-0000-0000-0000-000000000002', 'active', now()),
  ('48000000-0000-0000-0000-000000000003', '28000000-0000-0000-0000-000000000001', '18000000-0000-0000-0000-000000000003', 'active', now()),
  ('48000000-0000-0000-0000-000000000004', '28000000-0000-0000-0000-000000000002', '18000000-0000-0000-0000-000000000004', 'active', now());
insert into public.organization_user_roles (organization_id, organization_user_id, role, branch_id)
values
  ('28000000-0000-0000-0000-000000000001', '48000000-0000-0000-0000-000000000001', 'gym_owner', null),
  ('28000000-0000-0000-0000-000000000001', '48000000-0000-0000-0000-000000000002', 'receptionist', '38000000-0000-0000-0000-000000000001'),
  ('28000000-0000-0000-0000-000000000001', '48000000-0000-0000-0000-000000000003', 'member', '38000000-0000-0000-0000-000000000001'),
  ('28000000-0000-0000-0000-000000000002', '48000000-0000-0000-0000-000000000004', 'gym_owner', null);

set local role authenticated;
select set_config('request.jwt.claim.role', 'authenticated', true);
select set_config('request.jwt.claim.sub', '18000000-0000-0000-0000-000000000001', true);

do $$
declare v_batch_id uuid; v_count integer;
begin
  select import_batch_id, imported_count into v_batch_id, v_count
  from public.import_members(
    '28000000-0000-0000-0000-000000000001',
    '38000000-0000-0000-0000-000000000001',
    'owner.csv',
    '[{"full_name":"First Imported","phone":"9876543240","email":"first@gymgrid.test"},{"full_name":"Second Imported","phone":"+919876543241","gender":"female"}]'::jsonb
  );
  if v_count <> 2 then raise exception 'Owner import count failed'; end if;
  if (select count(*) from public.members where source_import_batch_id = v_batch_id) <> 2 then raise exception 'Imported members were not linked to the batch'; end if;

  begin
    insert into public.member_import_batches (organization_id, branch_id, source_file_name, imported_count, created_by)
    values ('28000000-0000-0000-0000-000000000001', '38000000-0000-0000-0000-000000000001', 'direct.csv', 1, '18000000-0000-0000-0000-000000000001');
    raise exception 'Direct batch insert was permitted';
  exception when insufficient_privilege then null;
  end;

  begin
    perform public.import_members('28000000-0000-0000-0000-000000000001', '38000000-0000-0000-0000-000000000001', 'duplicate.csv', '[{"full_name":"Duplicate","phone":"9876543240"}]'::jsonb);
    raise exception 'Existing phone duplicate was permitted';
  exception when unique_violation then null;
  end;
end;
$$;

select set_config('request.jwt.claim.sub', '18000000-0000-0000-0000-000000000002', true);
do $$ begin
  perform public.import_members('28000000-0000-0000-0000-000000000001', '38000000-0000-0000-0000-000000000001', 'reception.csv', '[{"full_name":"Reception Imported","phone":"9876543242"}]'::jsonb);
end $$;

select set_config('request.jwt.claim.sub', '18000000-0000-0000-0000-000000000003', true);
do $$ begin
  begin
    perform public.import_members('28000000-0000-0000-0000-000000000001', '38000000-0000-0000-0000-000000000001', 'member.csv', '[{"full_name":"Denied Member","phone":"9876543243"}]'::jsonb);
    raise exception 'Member role import was permitted';
  exception when insufficient_privilege then null;
  end;
end $$;

select set_config('request.jwt.claim.sub', '18000000-0000-0000-0000-000000000004', true);
do $$ begin
  begin
    perform public.import_members('28000000-0000-0000-0000-000000000001', '38000000-0000-0000-0000-000000000001', 'cross.csv', '[{"full_name":"Cross Tenant","phone":"9876543244"}]'::jsonb);
    raise exception 'Cross-tenant import was permitted';
  exception when insufficient_privilege then null;
  end;
end $$;

reset role;
rollback;
