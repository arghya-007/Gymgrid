\set ON_ERROR_STOP on

-- Phase 6 member-profile update, photo consent, and tenant-isolation smoke test.
begin;

insert into auth.users (
  instance_id, id, aud, role, email, encrypted_password, email_confirmed_at,
  raw_app_meta_data, raw_user_meta_data, created_at, updated_at
)
values
  ('00000000-0000-0000-0000-000000000000', '25000000-0000-0000-0000-000000000001', 'authenticated', 'authenticated', 'photo-owner@gymgrid.test', crypt('test-password', gen_salt('bf')), now(), '{}', '{}', now(), now()),
  ('00000000-0000-0000-0000-000000000000', '25000000-0000-0000-0000-000000000002', 'authenticated', 'authenticated', 'photo-member@gymgrid.test', crypt('test-password', gen_salt('bf')), now(), '{}', '{}', now(), now()),
  ('00000000-0000-0000-0000-000000000000', '25000000-0000-0000-0000-000000000003', 'authenticated', 'authenticated', 'photo-attacker@gymgrid.test', crypt('test-password', gen_salt('bf')), now(), '{}', '{}', now(), now());

insert into public.profiles (id, full_name)
values
  ('25000000-0000-0000-0000-000000000001', 'Photo Owner'),
  ('25000000-0000-0000-0000-000000000002', 'Photo Member'),
  ('25000000-0000-0000-0000-000000000003', 'Photo Attacker')
on conflict (id) do update set full_name = excluded.full_name;

insert into public.organizations (id, slug, name, status, timezone)
values
  ('35000000-0000-0000-0000-000000000001', 'photo-test', 'Photo Test', 'active', 'Asia/Kolkata'),
  ('35000000-0000-0000-0000-000000000002', 'photo-other', 'Photo Other', 'active', 'Asia/Kolkata');

insert into public.branches (id, organization_id, code, name)
values
  ('45000000-0000-0000-0000-000000000001', '35000000-0000-0000-0000-000000000001', 'MAIN', 'Photo Main'),
  ('45000000-0000-0000-0000-000000000002', '35000000-0000-0000-0000-000000000002', 'OTHER', 'Photo Other');

insert into public.organization_users (id, organization_id, user_id, status, joined_at)
values
  ('55000000-0000-0000-0000-000000000001', '35000000-0000-0000-0000-000000000001', '25000000-0000-0000-0000-000000000001', 'active', now()),
  ('55000000-0000-0000-0000-000000000002', '35000000-0000-0000-0000-000000000001', '25000000-0000-0000-0000-000000000002', 'active', now());

insert into public.organization_user_roles (
  organization_id, organization_user_id, role, branch_id
)
values
  ('35000000-0000-0000-0000-000000000001', '55000000-0000-0000-0000-000000000001', 'gym_owner', null),
  ('35000000-0000-0000-0000-000000000001', '55000000-0000-0000-0000-000000000002', 'member', '45000000-0000-0000-0000-000000000001');

insert into public.members (
  id, organization_id, home_branch_id, member_code, full_name, email, phone,
  status, auth_user_id, created_by, updated_by
)
values (
  '65000000-0000-0000-0000-000000000001',
  '35000000-0000-0000-0000-000000000001',
  '45000000-0000-0000-0000-000000000001',
  'M250001',
  'Original Member',
  'photo-member@gymgrid.test',
  '+919000002501',
  'active',
  '25000000-0000-0000-0000-000000000002',
  '25000000-0000-0000-0000-000000000001',
  '25000000-0000-0000-0000-000000000001'
);

set local role authenticated;
select set_config('request.jwt.claim.role', 'authenticated', true);
select set_config('request.jwt.claim.sub', '25000000-0000-0000-0000-000000000001', true);

select *
from public.update_member_profile(
  '35000000-0000-0000-0000-000000000001',
  '65000000-0000-0000-0000-000000000001',
  'Updated Member',
  '90000 02501',
  'updated-member@gymgrid.test',
  'Updated',
  date '1995-08-15',
  'prefer_not_to_say',
  'Profile updated in the tenant test.',
  true,
  '2026-10-v1'
);

select public.set_member_photo(
  '35000000-0000-0000-0000-000000000001',
  '65000000-0000-0000-0000-000000000001',
  '35000000-0000-0000-0000-000000000001/65000000-0000-0000-0000-000000000001/profile.webp',
  '2026-10-v1'
);

do $$
begin
  if not exists (
    select 1
    from public.members m
    where m.id = '65000000-0000-0000-0000-000000000001'
      and m.full_name = 'Updated Member'
      and m.phone = '+919000002501'
      and m.consent_version = '2026-10-v1'
      and m.consent_at is not null
      and m.photo_consent_at is not null
      and m.photo_path = '35000000-0000-0000-0000-000000000001/65000000-0000-0000-0000-000000000001/profile.webp'
  ) then
    raise exception 'Owner profile/photo update was not preserved';
  end if;

  if not public.can_manage_member_photo_path(
    '35000000-0000-0000-0000-000000000001/65000000-0000-0000-0000-000000000001/profile.webp'
  ) then
    raise exception 'Owner could not manage the authorized member photo path';
  end if;

  if public.can_manage_member_photo_path(
    '35000000-0000-0000-0000-000000000002/65000000-0000-0000-0000-000000000001/profile.webp'
  ) then
    raise exception 'Owner could manage a cross-tenant photo path';
  end if;
end;
$$;

select set_config('request.jwt.claim.sub', '25000000-0000-0000-0000-000000000002', true);

do $$
begin
  if not public.can_view_member_photo(
    '35000000-0000-0000-0000-000000000001',
    '65000000-0000-0000-0000-000000000001'
  ) then
    raise exception 'Linked member could not view their own photo';
  end if;

  if public.can_manage_member_photo(
    '35000000-0000-0000-0000-000000000001',
    '65000000-0000-0000-0000-000000000001'
  ) then
    raise exception 'Member could manage their own photo';
  end if;

  begin
    perform public.update_member_profile(
      '35000000-0000-0000-0000-000000000001',
      '65000000-0000-0000-0000-000000000001',
      'Unauthorized Update',
      '+919000002501'
    );
    raise exception 'Member updated a protected profile';
  exception when insufficient_privilege then null;
  end;
end;
$$;

select set_config('request.jwt.claim.sub', '25000000-0000-0000-0000-000000000003', true);

do $$
begin
  if public.can_view_member_photo(
    '35000000-0000-0000-0000-000000000001',
    '65000000-0000-0000-0000-000000000001'
  ) then
    raise exception 'Unrelated account could view the member photo';
  end if;

  begin
    perform public.set_member_photo(
      '35000000-0000-0000-0000-000000000001',
      '65000000-0000-0000-0000-000000000001',
      '35000000-0000-0000-0000-000000000001/65000000-0000-0000-0000-000000000001/profile.webp',
      '2026-10-v1'
    );
    raise exception 'Unrelated account updated the member photo';
  exception when insufficient_privilege then null;
  end;
end;
$$;

reset role;

do $$
begin
  if not exists (
    select 1
    from storage.buckets b
    where b.id = 'member-photos'
      and not b.public
      and b.file_size_limit = 1048576
  ) then
    raise exception 'Private member photo bucket is not configured';
  end if;

  if (
    select count(*)
    from pg_policies p
    where p.schemaname = 'storage'
      and p.tablename = 'objects'
      and p.policyname in (
        'member_photos_select',
        'member_photos_insert',
        'member_photos_update',
        'member_photos_delete'
      )
  ) <> 4 then
    raise exception 'Expected four member photo Storage policies';
  end if;
end;
$$;

rollback;
