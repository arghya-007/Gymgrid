create type public.lead_status as enum (
  'new',
  'contacted',
  'trial_scheduled',
  'won',
  'lost'
);

create type public.lead_source as enum (
  'walk_in',
  'referral',
  'website',
  'instagram',
  'facebook',
  'whatsapp',
  'phone',
  'other'
);

alter table public.members
  add constraint members_id_organization_unique unique (id, organization_id);

alter table public.membership_plans
  add constraint membership_plans_id_organization_unique unique (id, organization_id);

create table public.lead_number_counters (
  organization_id uuid primary key references public.organizations (id) on delete cascade,
  next_value bigint not null default 1 check (next_value > 0)
);

create table public.leads (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id) on delete cascade,
  branch_id uuid not null,
  lead_code text not null check (lead_code ~ '^L[0-9]{6,}$'),
  full_name text not null check (char_length(trim(full_name)) between 2 and 120),
  phone text not null check (phone ~ '^\+[1-9][0-9]{7,14}$'),
  email text check (
    email is null
    or email ~* '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$'
  ),
  source public.lead_source not null default 'walk_in',
  status public.lead_status not null default 'new',
  interested_plan_id uuid,
  follow_up_at timestamptz,
  notes text check (notes is null or char_length(notes) <= 2000),
  lost_reason text check (lost_reason is null or char_length(trim(lost_reason)) between 2 and 500),
  converted_member_id uuid,
  converted_at timestamptz,
  created_by uuid not null references auth.users (id) on delete restrict,
  updated_by uuid not null references auth.users (id) on delete restrict,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint leads_branch_fk
    foreign key (branch_id, organization_id)
    references public.branches (id, organization_id) on delete restrict,
  constraint leads_interested_plan_fk
    foreign key (interested_plan_id, organization_id)
    references public.membership_plans (id, organization_id) on delete restrict,
  constraint leads_converted_member_fk
    foreign key (converted_member_id, organization_id)
    references public.members (id, organization_id) on delete restrict,
  constraint leads_organization_code_unique unique (organization_id, lead_code),
  constraint leads_conversion_state_check check (
    (status = 'won' and converted_member_id is not null and converted_at is not null)
    or (status <> 'won' and converted_member_id is null and converted_at is null)
  ),
  constraint leads_lost_status_reason_check check (
    status <> 'lost' or lost_reason is not null
  )
);

create index leads_organization_created_idx
  on public.leads (organization_id, created_at desc);
create index leads_organization_branch_status_idx
  on public.leads (organization_id, branch_id, status);
create index leads_organization_follow_up_idx
  on public.leads (organization_id, follow_up_at)
  where follow_up_at is not null and status not in ('won', 'lost');
create index leads_organization_name_idx
  on public.leads (organization_id, lower(full_name));
create index leads_organization_phone_idx
  on public.leads (organization_id, phone);

create trigger leads_set_updated_at before update on public.leads
  for each row execute function public.set_updated_at();
create trigger leads_audit after insert or update or delete on public.leads
  for each row execute function public.capture_audit_change();

create or replace function public.normalize_contact_phone(p_phone text)
returns text
language plpgsql
immutable
set search_path = ''
as $$
declare
  v_phone_digits text := regexp_replace(coalesce(p_phone, ''), '[^0-9]', '', 'g');
begin
  if char_length(v_phone_digits) = 10 then
    return '+91' || v_phone_digits;
  elsif char_length(v_phone_digits) = 11 and left(v_phone_digits, 1) = '0' then
    return '+91' || right(v_phone_digits, 10);
  elsif char_length(v_phone_digits) = 12 and left(v_phone_digits, 2) = '91' then
    return '+' || v_phone_digits;
  elsif trim(coalesce(p_phone, '')) like '+%'
    and char_length(v_phone_digits) between 8 and 15 then
    return '+' || v_phone_digits;
  end if;

  raise exception 'phone number is invalid' using errcode = '22023';
end;
$$;

create or replace function public.create_lead(
  p_organization_id uuid,
  p_branch_id uuid,
  p_full_name text,
  p_phone text,
  p_email text default null,
  p_source public.lead_source default 'walk_in',
  p_interested_plan_id uuid default null,
  p_follow_up_at timestamptz default null,
  p_notes text default null
)
returns table (
  lead_id uuid,
  lead_code text
)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor_id uuid := auth.uid();
  v_sequence bigint;
  v_lead_id uuid;
  v_lead_code text;
  v_phone text;
begin
  if v_actor_id is null then
    raise exception 'authentication is required' using errcode = '42501';
  end if;

  if not exists (
    select 1 from public.organizations o
    where o.id = p_organization_id and o.status in ('trial', 'active')
  ) then
    raise exception 'organization is unavailable' using errcode = '22023';
  end if;

  if not exists (
    select 1 from public.branches b
    where b.id = p_branch_id
      and b.organization_id = p_organization_id
      and b.status = 'active'
  ) then
    raise exception 'branch is unavailable' using errcode = '22023';
  end if;

  if not public.has_branch_role(
    p_organization_id,
    p_branch_id,
    array['gym_owner', 'gym_manager', 'receptionist']::public.tenant_role[]
  ) then
    raise exception 'lead creation is not permitted' using errcode = '42501';
  end if;

  if p_full_name is null or char_length(trim(p_full_name)) not between 2 and 120 then
    raise exception 'lead name is invalid' using errcode = '22023';
  end if;

  if p_email is not null
    and trim(p_email) <> ''
    and trim(p_email) !~* '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$' then
    raise exception 'email is invalid' using errcode = '22023';
  end if;

  if p_notes is not null and char_length(p_notes) > 2000 then
    raise exception 'notes are too long' using errcode = '22023';
  end if;

  if p_interested_plan_id is not null and not exists (
    select 1 from public.membership_plans mp
    where mp.id = p_interested_plan_id
      and mp.organization_id = p_organization_id
      and mp.active
      and (mp.branch_id is null or mp.branch_id = p_branch_id)
  ) then
    raise exception 'membership plan is unavailable' using errcode = '22023';
  end if;

  v_phone := public.normalize_contact_phone(p_phone);

  insert into public.lead_number_counters (organization_id, next_value)
  values (p_organization_id, 2)
  on conflict (organization_id) do update
    set next_value = public.lead_number_counters.next_value + 1
  returning next_value - 1 into v_sequence;

  v_lead_code := 'L' || lpad(v_sequence::text, 6, '0');

  insert into public.leads (
    organization_id,
    branch_id,
    lead_code,
    full_name,
    phone,
    email,
    source,
    interested_plan_id,
    follow_up_at,
    notes,
    created_by,
    updated_by
  ) values (
    p_organization_id,
    p_branch_id,
    v_lead_code,
    trim(p_full_name),
    v_phone,
    nullif(lower(trim(p_email)), ''),
    p_source,
    p_interested_plan_id,
    p_follow_up_at,
    nullif(trim(p_notes), ''),
    v_actor_id,
    v_actor_id
  )
  returning id into v_lead_id;

  return query select v_lead_id, v_lead_code;
end;
$$;

create or replace function public.update_lead(
  p_lead_id uuid,
  p_organization_id uuid,
  p_branch_id uuid,
  p_full_name text,
  p_phone text,
  p_email text,
  p_source public.lead_source,
  p_status public.lead_status,
  p_interested_plan_id uuid,
  p_follow_up_at timestamptz,
  p_notes text,
  p_lost_reason text
)
returns table (
  lead_id uuid,
  lead_code text
)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor_id uuid := auth.uid();
  v_existing_branch_id uuid;
  v_existing_status public.lead_status;
  v_lead_code text;
  v_phone text;
begin
  select l.branch_id, l.status, l.lead_code
    into v_existing_branch_id, v_existing_status, v_lead_code
  from public.leads l
  where l.id = p_lead_id and l.organization_id = p_organization_id;

  if not found then
    raise exception 'lead was not found' using errcode = '22023';
  end if;

  if not public.has_branch_role(
    p_organization_id,
    v_existing_branch_id,
    array['gym_owner', 'gym_manager', 'receptionist']::public.tenant_role[]
  ) or not public.has_branch_role(
    p_organization_id,
    p_branch_id,
    array['gym_owner', 'gym_manager', 'receptionist']::public.tenant_role[]
  ) then
    raise exception 'lead update is not permitted' using errcode = '42501';
  end if;

  if v_existing_status = 'won' or p_status = 'won' then
    raise exception 'won leads can only be created by conversion' using errcode = '22023';
  end if;

  if p_status not in ('new', 'contacted', 'trial_scheduled', 'lost') then
    raise exception 'lead status is invalid' using errcode = '22023';
  end if;

  if not exists (
    select 1 from public.branches b
    where b.id = p_branch_id
      and b.organization_id = p_organization_id
      and b.status = 'active'
  ) then
    raise exception 'branch is unavailable' using errcode = '22023';
  end if;

  if p_full_name is null or char_length(trim(p_full_name)) not between 2 and 120
    or (p_email is not null and trim(p_email) <> ''
      and trim(p_email) !~* '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$')
    or (p_notes is not null and char_length(p_notes) > 2000)
    or (p_status = 'lost' and char_length(trim(coalesce(p_lost_reason, ''))) not between 2 and 500) then
    raise exception 'lead values are invalid' using errcode = '22023';
  end if;

  if p_interested_plan_id is not null and not exists (
    select 1 from public.membership_plans mp
    where mp.id = p_interested_plan_id
      and mp.organization_id = p_organization_id
      and mp.active
      and (mp.branch_id is null or mp.branch_id = p_branch_id)
  ) then
    raise exception 'membership plan is unavailable' using errcode = '22023';
  end if;

  v_phone := public.normalize_contact_phone(p_phone);

  update public.leads
  set
    branch_id = p_branch_id,
    full_name = trim(p_full_name),
    phone = v_phone,
    email = nullif(lower(trim(p_email)), ''),
    source = p_source,
    status = p_status,
    interested_plan_id = p_interested_plan_id,
    follow_up_at = case when p_status in ('won', 'lost') then null else p_follow_up_at end,
    notes = nullif(trim(p_notes), ''),
    lost_reason = case when p_status = 'lost' then trim(p_lost_reason) else null end,
    updated_by = v_actor_id
  where id = p_lead_id and organization_id = p_organization_id;

  return query select p_lead_id, v_lead_code;
end;
$$;

create or replace function public.convert_lead_to_member(
  p_lead_id uuid,
  p_organization_id uuid,
  p_date_of_birth date default null,
  p_gender public.member_gender default null
)
returns table (
  member_id uuid,
  member_code text,
  lead_code text
)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_lead public.leads%rowtype;
  v_member_id uuid;
  v_member_code text;
begin
  select * into v_lead
  from public.leads l
  where l.id = p_lead_id
    and l.organization_id = p_organization_id
  for update;

  if not found then
    raise exception 'lead was not found' using errcode = '22023';
  end if;

  if v_lead.status in ('won', 'lost') then
    raise exception 'lead cannot be converted in its current status' using errcode = '22023';
  end if;

  if not public.has_branch_role(
    p_organization_id,
    v_lead.branch_id,
    array['gym_owner', 'gym_manager', 'receptionist']::public.tenant_role[]
  ) then
    raise exception 'lead conversion is not permitted' using errcode = '42501';
  end if;

  select result.member_id, result.member_code
    into v_member_id, v_member_code
  from public.create_member(
    p_organization_id,
    v_lead.branch_id,
    v_lead.full_name,
    v_lead.phone,
    v_lead.email,
    null,
    p_date_of_birth,
    p_gender,
    left(
      concat(
        'Converted from lead ',
        v_lead.lead_code,
        case when v_lead.notes is null then '' else E'\n' || v_lead.notes end
      ),
      2000
    )
  ) result;

  update public.leads
  set
    status = 'won',
    converted_member_id = v_member_id,
    converted_at = now(),
    follow_up_at = null,
    lost_reason = null,
    updated_by = auth.uid()
  where id = p_lead_id and organization_id = p_organization_id;

  return query select v_member_id, v_member_code, v_lead.lead_code;
end;
$$;

alter table public.lead_number_counters enable row level security;
alter table public.leads enable row level security;

create policy leads_select on public.leads for select to authenticated
  using (
    public.is_platform_administrator()
    or public.has_branch_role(
      organization_id,
      branch_id,
      array['gym_owner', 'gym_manager', 'receptionist']::public.tenant_role[]
    )
  );

revoke all on table public.lead_number_counters from anon, authenticated;
revoke all on table public.leads from anon;
grant select on table public.leads to authenticated;

revoke all on function public.normalize_contact_phone(text) from public, anon;
revoke all on function public.create_lead(
  uuid, uuid, text, text, text, public.lead_source, uuid, timestamptz, text
) from public, anon;
revoke all on function public.update_lead(
  uuid, uuid, uuid, text, text, text, public.lead_source, public.lead_status,
  uuid, timestamptz, text, text
) from public, anon;
revoke all on function public.convert_lead_to_member(
  uuid, uuid, date, public.member_gender
) from public, anon;

grant execute on function public.normalize_contact_phone(text) to authenticated;
grant execute on function public.create_lead(
  uuid, uuid, text, text, text, public.lead_source, uuid, timestamptz, text
) to authenticated;
grant execute on function public.update_lead(
  uuid, uuid, uuid, text, text, text, public.lead_source, public.lead_status,
  uuid, timestamptz, text, text
) to authenticated;
grant execute on function public.convert_lead_to_member(
  uuid, uuid, date, public.member_gender
) to authenticated;
