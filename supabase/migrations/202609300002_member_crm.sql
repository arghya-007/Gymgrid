create type public.member_record_status as enum ('active', 'inactive', 'archived');
create type public.member_gender as enum (
  'female',
  'male',
  'non_binary',
  'prefer_not_to_say'
);

create table public.member_number_counters (
  organization_id uuid primary key references public.organizations (id) on delete cascade,
  next_value bigint not null default 1 check (next_value > 0)
);

create table public.members (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id) on delete cascade,
  home_branch_id uuid not null,
  member_code text not null check (member_code ~ '^M[0-9]{6,}$'),
  full_name text not null check (char_length(trim(full_name)) between 2 and 120),
  preferred_name text check (
    preferred_name is null
    or char_length(trim(preferred_name)) between 1 and 80
  ),
  email text check (
    email is null
    or email ~* '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$'
  ),
  phone text not null check (phone ~ '^\+[1-9][0-9]{7,14}$'),
  date_of_birth date check (
    date_of_birth is null
    or (date_of_birth >= date '1900-01-01' and date_of_birth <= current_date)
  ),
  gender public.member_gender,
  status public.member_record_status not null default 'active',
  notes text check (notes is null or char_length(notes) <= 2000),
  auth_user_id uuid references auth.users (id) on delete set null,
  created_by uuid not null references auth.users (id) on delete restrict,
  updated_by uuid not null references auth.users (id) on delete restrict,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint members_home_branch_fk
    foreign key (home_branch_id, organization_id)
    references public.branches (id, organization_id) on delete restrict,
  constraint members_organization_code_unique unique (organization_id, member_code),
  constraint members_organization_auth_user_unique unique (organization_id, auth_user_id)
);

create index members_organization_created_idx
  on public.members (organization_id, created_at desc);
create index members_organization_branch_status_idx
  on public.members (organization_id, home_branch_id, status);
create index members_organization_name_idx
  on public.members (organization_id, lower(full_name));
create index members_organization_phone_idx
  on public.members (organization_id, phone);

create trigger members_set_updated_at before update on public.members
  for each row execute function public.set_updated_at();
create trigger members_audit after insert or update or delete on public.members
  for each row execute function public.capture_audit_change();

create or replace function public.has_branch_role(
  p_organization_id uuid,
  p_branch_id uuid,
  p_roles public.tenant_role[]
)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.organization_users ou
    join public.organization_user_roles our
      on our.organization_user_id = ou.id
      and our.organization_id = ou.organization_id
    where ou.organization_id = p_organization_id
      and ou.user_id = auth.uid()
      and ou.status = 'active'
      and our.role = any (p_roles)
      and (our.branch_id is null or our.branch_id = p_branch_id)
  );
$$;

create or replace function public.create_member(
  p_organization_id uuid,
  p_home_branch_id uuid,
  p_full_name text,
  p_phone text,
  p_email text default null,
  p_preferred_name text default null,
  p_date_of_birth date default null,
  p_gender public.member_gender default null,
  p_notes text default null
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
  v_phone_digits text;
  v_phone text;
  v_sequence bigint;
  v_member_id uuid;
  v_member_code text;
begin
  if v_actor_id is null then
    raise exception 'authentication is required' using errcode = '42501';
  end if;

  if not exists (
    select 1
    from public.organizations o
    where o.id = p_organization_id
      and o.status in ('trial', 'active')
  ) then
    raise exception 'organization is unavailable' using errcode = '22023';
  end if;

  if not exists (
    select 1
    from public.branches b
    where b.id = p_home_branch_id
      and b.organization_id = p_organization_id
      and b.status = 'active'
  ) then
    raise exception 'branch is unavailable' using errcode = '22023';
  end if;

  if not public.has_branch_role(
    p_organization_id,
    p_home_branch_id,
    array['gym_owner', 'gym_manager', 'receptionist']::public.tenant_role[]
  ) then
    raise exception 'member creation is not permitted' using errcode = '42501';
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

  insert into public.member_number_counters (organization_id, next_value)
  values (p_organization_id, 2)
  on conflict (organization_id) do update
    set next_value = public.member_number_counters.next_value + 1
  returning next_value - 1 into v_sequence;

  v_member_code := 'M' || lpad(v_sequence::text, 6, '0');

  insert into public.members (
    organization_id,
    home_branch_id,
    member_code,
    full_name,
    preferred_name,
    email,
    phone,
    date_of_birth,
    gender,
    notes,
    created_by,
    updated_by
  )
  values (
    p_organization_id,
    p_home_branch_id,
    v_member_code,
    trim(p_full_name),
    nullif(trim(p_preferred_name), ''),
    nullif(lower(trim(p_email)), ''),
    v_phone,
    p_date_of_birth,
    p_gender,
    nullif(trim(p_notes), ''),
    v_actor_id,
    v_actor_id
  )
  returning id into v_member_id;

  return query select v_member_id, v_member_code;
end;
$$;

alter table public.member_number_counters enable row level security;
alter table public.members enable row level security;

create policy members_select on public.members for select to authenticated
  using (
    public.is_platform_administrator()
    or public.has_branch_role(
      organization_id,
      home_branch_id,
      array[
        'gym_owner',
        'gym_manager',
        'receptionist',
        'trainer',
        'accountant'
      ]::public.tenant_role[]
    )
  );

revoke all on table public.member_number_counters from anon, authenticated;
revoke all on table public.members from anon;
grant select on table public.members to authenticated;

revoke all on function public.has_branch_role(uuid, uuid, public.tenant_role[]) from public, anon;
revoke all on function public.create_member(
  uuid,
  uuid,
  text,
  text,
  text,
  text,
  date,
  public.member_gender,
  text
) from public, anon;

grant execute on function public.has_branch_role(uuid, uuid, public.tenant_role[])
  to authenticated;
grant execute on function public.create_member(
  uuid,
  uuid,
  text,
  text,
  text,
  text,
  date,
  public.member_gender,
  text
) to authenticated;
