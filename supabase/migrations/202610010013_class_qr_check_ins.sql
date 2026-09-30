create table public.member_qr_passes (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id) on delete cascade,
  member_id uuid not null,
  token uuid not null default gen_random_uuid(),
  active boolean not null default true,
  issued_by uuid not null references auth.users (id) on delete restrict,
  revoked_at timestamptz,
  revoked_by uuid references auth.users (id) on delete restrict,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint member_qr_passes_member_fk
    foreign key (member_id, organization_id)
    references public.members (id, organization_id) on delete cascade,
  constraint member_qr_passes_token_unique unique (token),
  constraint member_qr_passes_id_organization_unique unique (id, organization_id),
  constraint member_qr_passes_revocation_check check (
    (active and revoked_at is null and revoked_by is null)
    or (not active and revoked_at is not null and revoked_by is not null)
  )
);

create unique index member_qr_passes_active_member_unique
  on public.member_qr_passes (organization_id, member_id)
  where active;
create index member_qr_passes_member_created_idx
  on public.member_qr_passes (organization_id, member_id, created_at desc);

create trigger member_qr_passes_set_updated_at
  before update on public.member_qr_passes
  for each row execute function public.set_updated_at();
create trigger member_qr_passes_audit
  after insert or update or delete on public.member_qr_passes
  for each row execute function public.capture_audit_change();

create table public.class_check_ins (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id) on delete cascade,
  branch_id uuid not null,
  class_session_id uuid not null,
  class_booking_id uuid not null,
  member_id uuid not null,
  member_qr_pass_id uuid not null,
  checked_in_at timestamptz not null default clock_timestamp(),
  checked_in_by uuid not null references auth.users (id) on delete restrict,
  created_at timestamptz not null default now(),
  constraint class_check_ins_branch_fk
    foreign key (branch_id, organization_id)
    references public.branches (id, organization_id) on delete restrict,
  constraint class_check_ins_session_fk
    foreign key (class_session_id, organization_id)
    references public.class_sessions (id, organization_id) on delete restrict,
  constraint class_check_ins_booking_fk
    foreign key (class_booking_id, organization_id)
    references public.class_bookings (id, organization_id) on delete restrict,
  constraint class_check_ins_member_fk
    foreign key (member_id, organization_id)
    references public.members (id, organization_id) on delete restrict,
  constraint class_check_ins_qr_pass_fk
    foreign key (member_qr_pass_id, organization_id)
    references public.member_qr_passes (id, organization_id) on delete restrict,
  constraint class_check_ins_session_member_unique
    unique (organization_id, class_session_id, member_id),
  constraint class_check_ins_booking_unique
    unique (organization_id, class_booking_id)
);

create index class_check_ins_session_time_idx
  on public.class_check_ins (organization_id, class_session_id, checked_in_at desc);
create index class_check_ins_member_time_idx
  on public.class_check_ins (organization_id, member_id, checked_in_at desc);

create trigger class_check_ins_audit
  after insert or delete on public.class_check_ins
  for each row execute function public.capture_audit_change();

alter table public.member_qr_passes enable row level security;
alter table public.class_check_ins enable row level security;

create policy member_qr_passes_select on public.member_qr_passes
  for select to authenticated
  using (
    public.is_platform_administrator()
    or exists (
      select 1
      from public.members m
      where m.id = member_qr_passes.member_id
        and m.organization_id = member_qr_passes.organization_id
        and (
          public.has_branch_role(
            member_qr_passes.organization_id,
            m.home_branch_id,
            array['gym_owner', 'gym_manager', 'receptionist']::public.tenant_role[]
          )
          or (
            m.auth_user_id = auth.uid()
            and public.has_branch_role(
              member_qr_passes.organization_id,
              m.home_branch_id,
              array['member']::public.tenant_role[]
            )
          )
        )
    )
  );

create policy class_check_ins_select on public.class_check_ins
  for select to authenticated
  using (
    public.is_platform_administrator()
    or public.has_branch_role(
      organization_id,
      branch_id,
      array['gym_owner', 'gym_manager', 'receptionist', 'trainer', 'accountant']::public.tenant_role[]
    )
    or (
      public.has_branch_role(
        organization_id,
        branch_id,
        array['member']::public.tenant_role[]
      )
      and exists (
        select 1
        from public.members m
        where m.id = class_check_ins.member_id
          and m.organization_id = class_check_ins.organization_id
          and m.auth_user_id = auth.uid()
      )
    )
  );

create or replace function public.rotate_member_qr_pass(
  p_organization_id uuid,
  p_member_id uuid
)
returns table (member_qr_pass_id uuid, qr_token uuid)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor_id uuid := auth.uid();
  v_member public.members%rowtype;
  v_pass_id uuid;
  v_token uuid := gen_random_uuid();
begin
  if v_actor_id is null then
    raise exception 'authentication is required' using errcode = '42501';
  end if;

  select m.* into v_member
  from public.members m
  join public.organizations o on o.id = m.organization_id
  join public.branches b on b.id = m.home_branch_id and b.organization_id = m.organization_id
  where m.id = p_member_id
    and m.organization_id = p_organization_id
    and m.status = 'active'
    and o.status in ('trial', 'active')
    and b.status = 'active'
  for update of m;
  if v_member.id is null then
    raise exception 'active member was not found' using errcode = 'P0002';
  end if;

  if not public.has_branch_role(
    p_organization_id,
    v_member.home_branch_id,
    array['gym_owner', 'gym_manager', 'receptionist']::public.tenant_role[]
  ) and not (
    coalesce(v_member.auth_user_id = v_actor_id, false)
    and public.has_branch_role(
      p_organization_id,
      v_member.home_branch_id,
      array['member']::public.tenant_role[]
    )
  ) then
    raise exception 'QR pass rotation is not permitted' using errcode = '42501';
  end if;

  update public.member_qr_passes
  set
    active = false,
    revoked_at = clock_timestamp(),
    revoked_by = v_actor_id
  where organization_id = p_organization_id
    and member_id = v_member.id
    and active;

  insert into public.member_qr_passes (
    organization_id,
    member_id,
    token,
    issued_by
  ) values (
    p_organization_id,
    v_member.id,
    v_token,
    v_actor_id
  ) returning id into v_pass_id;

  return query select v_pass_id, v_token;
end;
$$;

create or replace function public.record_class_qr_check_in(
  p_organization_id uuid,
  p_class_session_id uuid,
  p_qr_token uuid
)
returns table (
  class_check_in_id uuid,
  member_id uuid,
  member_code text,
  member_name text,
  checked_in_at timestamptz,
  already_checked_in boolean
)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor_id uuid := auth.uid();
  v_session public.class_sessions%rowtype;
  v_pass public.member_qr_passes%rowtype;
  v_member public.members%rowtype;
  v_booking public.class_bookings%rowtype;
  v_existing public.class_check_ins%rowtype;
  v_check_in_id uuid;
  v_checked_in_at timestamptz;
begin
  if v_actor_id is null then
    raise exception 'authentication is required' using errcode = '42501';
  end if;
  if p_qr_token is null then
    raise exception 'QR token is required' using errcode = '22023';
  end if;

  select cs.* into v_session
  from public.class_sessions cs
  join public.organizations o on o.id = cs.organization_id
  join public.branches b on b.id = cs.branch_id and b.organization_id = cs.organization_id
  where cs.id = p_class_session_id
    and cs.organization_id = p_organization_id
    and cs.status = 'scheduled'
    and b.status = 'active'
    and o.status in ('trial', 'active')
  for share of cs;
  if v_session.id is null then
    raise exception 'active class session was not found' using errcode = 'P0002';
  end if;

  if not public.has_branch_role(
    p_organization_id,
    v_session.branch_id,
    array['gym_owner', 'gym_manager', 'receptionist', 'trainer']::public.tenant_role[]
  ) then
    raise exception 'class check-in is not permitted' using errcode = '42501';
  end if;
  if clock_timestamp() < v_session.start_at - interval '90 minutes'
    or clock_timestamp() > v_session.end_at + interval '30 minutes' then
    raise exception 'class is outside its check-in window' using errcode = '22023';
  end if;

  select mp.* into v_pass
  from public.member_qr_passes mp
  where mp.organization_id = p_organization_id
    and mp.token = p_qr_token
    and mp.active;
  if v_pass.id is null then
    raise exception 'active member QR pass was not found' using errcode = 'P0002';
  end if;

  select m.* into v_member
  from public.members m
  where m.id = v_pass.member_id
    and m.organization_id = p_organization_id
    and m.status = 'active';
  if v_member.id is null then
    raise exception 'active member was not found' using errcode = 'P0002';
  end if;

  select cb.* into v_booking
  from public.class_bookings cb
  where cb.organization_id = p_organization_id
    and cb.class_session_id = v_session.id
    and cb.member_id = v_member.id
    and cb.status = 'booked'
  for update;
  if v_booking.id is null then
    raise exception 'confirmed class booking was not found' using errcode = '22023';
  end if;

  select ci.* into v_existing
  from public.class_check_ins ci
  where ci.organization_id = p_organization_id
    and ci.class_booking_id = v_booking.id;
  if v_existing.id is not null then
    return query select
      v_existing.id,
      v_member.id,
      v_member.member_code,
      v_member.full_name,
      v_existing.checked_in_at,
      true;
    return;
  end if;

  insert into public.class_check_ins (
    organization_id,
    branch_id,
    class_session_id,
    class_booking_id,
    member_id,
    member_qr_pass_id,
    checked_in_by
  ) values (
    p_organization_id,
    v_session.branch_id,
    v_session.id,
    v_booking.id,
    v_member.id,
    v_pass.id,
    v_actor_id
  ) returning id, class_check_ins.checked_in_at into v_check_in_id, v_checked_in_at;

  return query select
    v_check_in_id,
    v_member.id,
    v_member.member_code,
    v_member.full_name,
    v_checked_in_at,
    false;
end;
$$;

create or replace function public.protect_checked_in_class_booking()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if old.status = 'booked'
    and new.status = 'cancelled'
    and exists (
      select 1
      from public.class_check_ins ci
      where ci.organization_id = old.organization_id
        and ci.class_booking_id = old.id
    )
    and exists (
      select 1
      from public.class_sessions cs
      where cs.organization_id = old.organization_id
        and cs.id = old.class_session_id
        and cs.status = 'scheduled'
    ) then
    raise exception 'checked-in class booking cannot be cancelled' using errcode = '22023';
  end if;
  return new;
end;
$$;

create trigger class_bookings_protect_checked_in
  before update on public.class_bookings
  for each row execute function public.protect_checked_in_class_booking();

revoke all on table public.member_qr_passes, public.class_check_ins from anon, authenticated;
grant select on table public.member_qr_passes, public.class_check_ins to authenticated;
revoke all on function public.rotate_member_qr_pass(uuid, uuid) from public, anon;
grant execute on function public.rotate_member_qr_pass(uuid, uuid) to authenticated;
revoke all on function public.record_class_qr_check_in(uuid, uuid, uuid) from public, anon;
grant execute on function public.record_class_qr_check_in(uuid, uuid, uuid) to authenticated;
