\set ON_ERROR_STOP on

-- Phase 4 class scheduling and trainer-scope smoke test.
begin;

insert into auth.users (instance_id, id, aud, role, email, encrypted_password, email_confirmed_at, raw_app_meta_data, raw_user_meta_data, created_at, updated_at)
values
  ('00000000-0000-0000-0000-000000000000', '20000000-0000-0000-0000-000000000001', 'authenticated', 'authenticated', 'classes-owner-a@gymgrid.test', crypt('test-password', gen_salt('bf')), now(), '{}', '{}', now(), now()),
  ('00000000-0000-0000-0000-000000000000', '20000000-0000-0000-0000-000000000002', 'authenticated', 'authenticated', 'classes-reception-a@gymgrid.test', crypt('test-password', gen_salt('bf')), now(), '{}', '{}', now(), now()),
  ('00000000-0000-0000-0000-000000000000', '20000000-0000-0000-0000-000000000003', 'authenticated', 'authenticated', 'classes-trainer-a@gymgrid.test', crypt('test-password', gen_salt('bf')), now(), '{}', '{}', now(), now()),
  ('00000000-0000-0000-0000-000000000000', '20000000-0000-0000-0000-000000000004', 'authenticated', 'authenticated', 'classes-member-a@gymgrid.test', crypt('test-password', gen_salt('bf')), now(), '{}', '{}', now(), now()),
  ('00000000-0000-0000-0000-000000000000', '20000000-0000-0000-0000-000000000005', 'authenticated', 'authenticated', 'classes-owner-b@gymgrid.test', crypt('test-password', gen_salt('bf')), now(), '{}', '{}', now(), now());
insert into public.profiles (id, full_name)
values
  ('20000000-0000-0000-0000-000000000001', 'Class Owner'),
  ('20000000-0000-0000-0000-000000000002', 'Class Reception'),
  ('20000000-0000-0000-0000-000000000003', 'Class Trainer'),
  ('20000000-0000-0000-0000-000000000004', 'Class Member'),
  ('20000000-0000-0000-0000-000000000005', 'Other Owner')
on conflict (id) do update set full_name = excluded.full_name;

insert into public.organizations (id, slug, name, status, timezone)
values
  ('30000000-0000-0000-0000-000000000001', 'classes-test-a', 'Classes Test A', 'active', 'Asia/Kolkata'),
  ('30000000-0000-0000-0000-000000000002', 'classes-test-b', 'Classes Test B', 'active', 'Asia/Kolkata');
insert into public.branches (id, organization_id, code, name)
values
  ('40000000-0000-0000-0000-000000000001', '30000000-0000-0000-0000-000000000001', 'MAIN', 'Classes A Main'),
  ('40000000-0000-0000-0000-000000000002', '30000000-0000-0000-0000-000000000002', 'MAIN', 'Classes B Main');
insert into public.organization_users (id, organization_id, user_id, status, joined_at)
values
  ('50000000-0000-0000-0000-000000000001', '30000000-0000-0000-0000-000000000001', '20000000-0000-0000-0000-000000000001', 'active', now()),
  ('50000000-0000-0000-0000-000000000002', '30000000-0000-0000-0000-000000000001', '20000000-0000-0000-0000-000000000002', 'active', now()),
  ('50000000-0000-0000-0000-000000000003', '30000000-0000-0000-0000-000000000001', '20000000-0000-0000-0000-000000000003', 'active', now()),
  ('50000000-0000-0000-0000-000000000004', '30000000-0000-0000-0000-000000000001', '20000000-0000-0000-0000-000000000004', 'active', now()),
  ('50000000-0000-0000-0000-000000000005', '30000000-0000-0000-0000-000000000002', '20000000-0000-0000-0000-000000000005', 'active', now());
insert into public.organization_user_roles (organization_id, organization_user_id, role, branch_id)
values
  ('30000000-0000-0000-0000-000000000001', '50000000-0000-0000-0000-000000000001', 'gym_owner', null),
  ('30000000-0000-0000-0000-000000000001', '50000000-0000-0000-0000-000000000002', 'receptionist', '40000000-0000-0000-0000-000000000001'),
  ('30000000-0000-0000-0000-000000000001', '50000000-0000-0000-0000-000000000003', 'trainer', '40000000-0000-0000-0000-000000000001'),
  ('30000000-0000-0000-0000-000000000001', '50000000-0000-0000-0000-000000000004', 'member', '40000000-0000-0000-0000-000000000001'),
  ('30000000-0000-0000-0000-000000000002', '50000000-0000-0000-0000-000000000005', 'gym_owner', null);

set local role authenticated;
select set_config('request.jwt.claim.role', 'authenticated', true);
select set_config('request.jwt.claim.sub', '20000000-0000-0000-0000-000000000001', true);

do $$
declare v_program_id uuid; v_session_id uuid; v_start timestamptz;
begin
  select class_program_id into v_program_id
  from public.save_class_program(
    '30000000-0000-0000-0000-000000000001', null,
    '40000000-0000-0000-0000-000000000001', 'YOGA', 'Morning Yoga',
    'Mobility and breath work', 60, 20, true
  );
  if v_program_id is null then raise exception 'Owner program creation failed'; end if;

  select class_session_id, class_start_at into v_session_id, v_start
  from public.schedule_class_session(
    '30000000-0000-0000-0000-000000000001', v_program_id,
    '50000000-0000-0000-0000-000000000003',
    (public.organization_local_date('30000000-0000-0000-0000-000000000001') + 1)::timestamp + time '07:00',
    null
  );
  if v_session_id is null or v_start is null then raise exception 'Owner session scheduling failed'; end if;
  if (select capacity from public.class_sessions where id = v_session_id) <> 20 then raise exception 'Default capacity was not preserved'; end if;

  begin
    perform public.schedule_class_session(
      '30000000-0000-0000-0000-000000000001', v_program_id,
      '50000000-0000-0000-0000-000000000003',
      (public.organization_local_date('30000000-0000-0000-0000-000000000001') + 1)::timestamp + time '07:30',
      15
    );
    raise exception 'Overlapping trainer session was permitted';
  exception when exclusion_violation then null;
  end;

  begin
    insert into public.class_sessions (
      organization_id, branch_id, class_program_id, start_at, end_at, capacity, created_by, updated_by
    ) values (
      '30000000-0000-0000-0000-000000000001', '40000000-0000-0000-0000-000000000001',
      v_program_id, now() + interval '2 days', now() + interval '2 days 1 hour', 20,
      '20000000-0000-0000-0000-000000000001', '20000000-0000-0000-0000-000000000001'
    );
    raise exception 'Direct session insert was permitted';
  exception when insufficient_privilege then null;
  end;
end;
$$;

select set_config('request.jwt.claim.sub', '20000000-0000-0000-0000-000000000002', true);
do $$
declare v_program_id uuid; v_session_id uuid;
begin
  select id into v_program_id from public.class_programs where organization_id = '30000000-0000-0000-0000-000000000001' and code = 'YOGA';
  select class_session_id into v_session_id
  from public.schedule_class_session(
    '30000000-0000-0000-0000-000000000001', v_program_id, null,
    (public.organization_local_date('30000000-0000-0000-0000-000000000001') + 2)::timestamp + time '07:00',
    18
  );
  perform public.cancel_class_session('30000000-0000-0000-0000-000000000001', v_session_id, 'Trainer unavailable');
  if (select status from public.class_sessions where id = v_session_id) <> 'cancelled' then raise exception 'Receptionist cancellation failed'; end if;
end;
$$;

select set_config('request.jwt.claim.sub', '20000000-0000-0000-0000-000000000004', true);
do $$ begin
  begin
    perform public.schedule_class_session(
      '30000000-0000-0000-0000-000000000001',
      (select id from public.class_programs where organization_id = '30000000-0000-0000-0000-000000000001' and code = 'YOGA'),
      null,
      (public.organization_local_date('30000000-0000-0000-0000-000000000001') + 3)::timestamp + time '07:00',
      20
    );
    raise exception 'Member role scheduled a class';
  exception when insufficient_privilege then null;
  end;
end $$;

select set_config('request.jwt.claim.sub', '20000000-0000-0000-0000-000000000005', true);
do $$ begin
  begin
    perform public.save_class_program(
      '30000000-0000-0000-0000-000000000001', null,
      '40000000-0000-0000-0000-000000000001', 'CROSS', 'Cross Tenant', null, 45, 10, true
    );
    raise exception 'Cross-tenant class program creation was permitted';
  exception when insufficient_privilege then null;
  end;
end $$;

reset role;
rollback;
