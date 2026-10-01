-- GymGrid Phase 6: editable member profiles and private member photographs.

alter table public.members
  add column if not exists photo_path text,
  add column if not exists photo_updated_at timestamptz,
  add column if not exists consent_at timestamptz,
  add column if not exists consent_version text,
  add column if not exists photo_consent_at timestamptz;

alter table public.members
  drop constraint if exists members_photo_path_check;

alter table public.members
  add constraint members_photo_path_check check (
    photo_path is null
    or photo_path ~ (
      '^' || organization_id::text || '/' || id::text ||
      '/profile\.(jpg|jpeg|png|webp)$'
    )
  );

insert into storage.buckets (
  id,
  name,
  public,
  file_size_limit,
  allowed_mime_types
)
values (
  'member-photos',
  'member-photos',
  false,
  1048576,
  array['image/jpeg', 'image/png', 'image/webp']
)
on conflict (id) do update
set
  public = false,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

create or replace function public.can_view_member_photo(
  p_organization_id uuid,
  p_member_id uuid
)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.members m
    where m.organization_id = p_organization_id
      and m.id = p_member_id
      and (
        m.auth_user_id = auth.uid()
        or public.is_platform_administrator()
        or public.has_branch_role(
          m.organization_id,
          m.home_branch_id,
          array[
            'gym_owner',
            'gym_manager',
            'receptionist',
            'trainer',
            'accountant'
          ]::public.tenant_role[]
        )
      )
  );
$$;

create or replace function public.can_manage_member_photo(
  p_organization_id uuid,
  p_member_id uuid
)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.members m
    where m.organization_id = p_organization_id
      and m.id = p_member_id
      and m.status <> 'archived'
      and public.has_branch_role(
        m.organization_id,
        m.home_branch_id,
        array['gym_owner', 'gym_manager', 'receptionist']::public.tenant_role[]
      )
  );
$$;

create or replace function public.can_view_member_photo_path(p_name text)
returns boolean
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_organization_id uuid;
  v_member_id uuid;
begin
  if p_name !~ '^[0-9a-fA-F-]{36}/[0-9a-fA-F-]{36}/profile\.(jpg|jpeg|png|webp)$' then
    return false;
  end if;

  begin
    v_organization_id := split_part(p_name, '/', 1)::uuid;
    v_member_id := split_part(p_name, '/', 2)::uuid;
  exception when invalid_text_representation then
    return false;
  end;

  return public.can_view_member_photo(v_organization_id, v_member_id);
end;
$$;

create or replace function public.can_manage_member_photo_path(p_name text)
returns boolean
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_organization_id uuid;
  v_member_id uuid;
begin
  if p_name !~ '^[0-9a-fA-F-]{36}/[0-9a-fA-F-]{36}/profile\.(jpg|jpeg|png|webp)$' then
    return false;
  end if;

  begin
    v_organization_id := split_part(p_name, '/', 1)::uuid;
    v_member_id := split_part(p_name, '/', 2)::uuid;
  exception when invalid_text_representation then
    return false;
  end;

  return public.can_manage_member_photo(v_organization_id, v_member_id);
end;
$$;

create or replace function public.update_member_profile(
  p_organization_id uuid,
  p_member_id uuid,
  p_full_name text,
  p_phone text,
  p_email text default null,
  p_preferred_name text default null,
  p_date_of_birth date default null,
  p_gender public.member_gender default null,
  p_notes text default null,
  p_consent_confirmed boolean default false,
  p_consent_version text default null
)
returns table (
  member_id uuid,
  member_code text
)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor_id uuid := auth.uid();
  v_member public.members%rowtype;
  v_phone_digits text;
  v_phone text;
begin
  if v_actor_id is null then
    raise exception 'authentication is required' using errcode = '42501';
  end if;

  select m.* into v_member
  from public.members m
  where m.id = p_member_id
    and m.organization_id = p_organization_id
  for update;

  if not found or v_member.status = 'archived' then
    raise exception 'member is unavailable' using errcode = '22023';
  end if;

  if not public.has_branch_role(
    p_organization_id,
    v_member.home_branch_id,
    array['gym_owner', 'gym_manager', 'receptionist']::public.tenant_role[]
  ) then
    raise exception 'member editing is not permitted' using errcode = '42501';
  end if;

  if p_full_name is null or char_length(trim(p_full_name)) not between 2 and 120 then
    raise exception 'member name is invalid' using errcode = '22023';
  end if;

  if p_preferred_name is not null
    and char_length(trim(p_preferred_name)) not between 1 and 80 then
    raise exception 'preferred name is invalid' using errcode = '22023';
  end if;

  if p_email is not null
    and trim(p_email) <> ''
    and trim(p_email) !~* '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$' then
    raise exception 'email is invalid' using errcode = '22023';
  end if;

  if p_date_of_birth is not null
    and (p_date_of_birth < date '1900-01-01' or p_date_of_birth > current_date) then
    raise exception 'date of birth is invalid' using errcode = '22023';
  end if;

  if p_notes is not null and char_length(p_notes) > 2000 then
    raise exception 'notes are too long' using errcode = '22023';
  end if;

  if p_consent_confirmed
    and (p_consent_version is null or char_length(trim(p_consent_version)) not between 1 and 40) then
    raise exception 'consent version is invalid' using errcode = '22023';
  end if;

  v_phone_digits := regexp_replace(coalesce(p_phone, ''), '[^0-9]', '', 'g');
  if char_length(v_phone_digits) = 10 then
    v_phone := '+91' || v_phone_digits;
  elsif char_length(v_phone_digits) = 11 and left(v_phone_digits, 1) = '0' then
    v_phone := '+91' || right(v_phone_digits, 10);
  elsif char_length(v_phone_digits) = 12 and left(v_phone_digits, 2) = '91' then
    v_phone := '+' || v_phone_digits;
  elsif trim(coalesce(p_phone, '')) like '+%'
    and char_length(v_phone_digits) between 8 and 15 then
    v_phone := '+' || v_phone_digits;
  else
    raise exception 'phone number is invalid' using errcode = '22023';
  end if;

  update public.members
  set
    full_name = trim(p_full_name),
    preferred_name = nullif(trim(p_preferred_name), ''),
    phone = v_phone,
    email = nullif(lower(trim(p_email)), ''),
    date_of_birth = p_date_of_birth,
    gender = p_gender,
    notes = nullif(trim(p_notes), ''),
    consent_at = case
      when p_consent_confirmed then coalesce(consent_at, now())
      else consent_at
    end,
    consent_version = case
      when p_consent_confirmed then trim(p_consent_version)
      else consent_version
    end,
    updated_by = v_actor_id
  where id = p_member_id
    and organization_id = p_organization_id;

  return query select p_member_id, v_member.member_code;
end;
$$;

create or replace function public.set_member_photo(
  p_organization_id uuid,
  p_member_id uuid,
  p_photo_path text,
  p_consent_version text
)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor_id uuid := auth.uid();
  v_expected_pattern text;
begin
  if v_actor_id is null then
    raise exception 'authentication is required' using errcode = '42501';
  end if;

  if not public.can_manage_member_photo(p_organization_id, p_member_id) then
    raise exception 'member photo editing is not permitted' using errcode = '42501';
  end if;

  if p_consent_version is null
    or char_length(trim(p_consent_version)) not between 1 and 40 then
    raise exception 'photo consent is required' using errcode = '22023';
  end if;

  v_expected_pattern := '^' || p_organization_id::text || '/' ||
    p_member_id::text || '/profile\.(jpg|jpeg|png|webp)$';

  if p_photo_path is null or p_photo_path !~ v_expected_pattern then
    raise exception 'member photo path is invalid' using errcode = '22023';
  end if;

  update public.members
  set
    photo_path = p_photo_path,
    photo_updated_at = now(),
    photo_consent_at = now(),
    consent_at = coalesce(consent_at, now()),
    consent_version = coalesce(consent_version, trim(p_consent_version)),
    updated_by = v_actor_id
  where id = p_member_id
    and organization_id = p_organization_id;

  if not found then
    raise exception 'member is unavailable' using errcode = '22023';
  end if;

  return p_photo_path;
end;
$$;

create or replace function public.clear_member_photo(
  p_organization_id uuid,
  p_member_id uuid
)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor_id uuid := auth.uid();
  v_previous_path text;
begin
  if v_actor_id is null then
    raise exception 'authentication is required' using errcode = '42501';
  end if;

  if not public.can_manage_member_photo(p_organization_id, p_member_id) then
    raise exception 'member photo editing is not permitted' using errcode = '42501';
  end if;

  select m.photo_path into v_previous_path
  from public.members m
  where m.id = p_member_id
    and m.organization_id = p_organization_id
  for update;

  if not found then
    raise exception 'member is unavailable' using errcode = '22023';
  end if;

  update public.members
  set
    photo_path = null,
    photo_updated_at = now(),
    updated_by = v_actor_id
  where id = p_member_id
    and organization_id = p_organization_id;

  return v_previous_path;
end;
$$;

drop policy if exists member_photos_select on storage.objects;
create policy member_photos_select
on storage.objects for select to authenticated
using (
  bucket_id = 'member-photos'
  and public.can_view_member_photo_path(name)
);

drop policy if exists member_photos_insert on storage.objects;
create policy member_photos_insert
on storage.objects for insert to authenticated
with check (
  bucket_id = 'member-photos'
  and public.can_manage_member_photo_path(name)
);

drop policy if exists member_photos_update on storage.objects;
create policy member_photos_update
on storage.objects for update to authenticated
using (
  bucket_id = 'member-photos'
  and public.can_manage_member_photo_path(name)
)
with check (
  bucket_id = 'member-photos'
  and public.can_manage_member_photo_path(name)
);

drop policy if exists member_photos_delete on storage.objects;
create policy member_photos_delete
on storage.objects for delete to authenticated
using (
  bucket_id = 'member-photos'
  and public.can_manage_member_photo_path(name)
);

revoke all on function public.can_view_member_photo(uuid, uuid) from public, anon;
revoke all on function public.can_manage_member_photo(uuid, uuid) from public, anon;
revoke all on function public.can_view_member_photo_path(text) from public, anon;
revoke all on function public.can_manage_member_photo_path(text) from public, anon;
revoke all on function public.update_member_profile(
  uuid, uuid, text, text, text, text, date, public.member_gender, text, boolean, text
) from public, anon;
revoke all on function public.set_member_photo(uuid, uuid, text, text) from public, anon;
revoke all on function public.clear_member_photo(uuid, uuid) from public, anon;

grant execute on function public.can_view_member_photo(uuid, uuid) to authenticated;
grant execute on function public.can_manage_member_photo(uuid, uuid) to authenticated;
grant execute on function public.can_view_member_photo_path(text) to authenticated;
grant execute on function public.can_manage_member_photo_path(text) to authenticated;
grant execute on function public.update_member_profile(
  uuid, uuid, text, text, text, text, date, public.member_gender, text, boolean, text
) to authenticated;
grant execute on function public.set_member_photo(uuid, uuid, text, text) to authenticated;
grant execute on function public.clear_member_photo(uuid, uuid) to authenticated;
