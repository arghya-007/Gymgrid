create type public.class_session_status as enum ('scheduled', 'cancelled');

create table public.class_programs (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id) on delete cascade,
  branch_id uuid not null,
  code text not null check (code ~ '^[A-Z0-9][A-Z0-9_-]{0,19}$'),
  name text not null check (char_length(trim(name)) between 2 and 120),
  description text check (description is null or char_length(description) <= 1000),
  default_duration_minutes integer not null check (default_duration_minutes between 15 and 240),
  default_capacity integer not null check (default_capacity between 1 and 500),
  active boolean not null default true,
  created_by uuid not null references auth.users (id) on delete restrict,
  updated_by uuid not null references auth.users (id) on delete restrict,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint class_programs_branch_fk
    foreign key (branch_id, organization_id)
    references public.branches (id, organization_id) on delete restrict,
  constraint class_programs_organization_code_unique unique (organization_id, code),
  constraint class_programs_id_organization_unique unique (id, organization_id)
);

create table public.class_sessions (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id) on delete cascade,
  branch_id uuid not null,
  class_program_id uuid not null,
  trainer_organization_user_id uuid,
  start_at timestamptz not null,
  end_at timestamptz not null,
  capacity integer not null check (capacity between 1 and 500),
  status public.class_session_status not null default 'scheduled',
  cancellation_reason text check (
    cancellation_reason is null or char_length(trim(cancellation_reason)) between 2 and 500
  ),
  cancelled_at timestamptz,
  cancelled_by uuid references auth.users (id) on delete restrict,
  created_by uuid not null references auth.users (id) on delete restrict,
  updated_by uuid not null references auth.users (id) on delete restrict,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint class_sessions_branch_fk
    foreign key (branch_id, organization_id)
    references public.branches (id, organization_id) on delete restrict,
  constraint class_sessions_program_fk
    foreign key (class_program_id, organization_id)
    references public.class_programs (id, organization_id) on delete restrict,
  constraint class_sessions_trainer_fk
    foreign key (trainer_organization_user_id, organization_id)
    references public.organization_users (id, organization_id) on delete restrict,
  constraint class_sessions_time_check check (end_at > start_at),
  constraint class_sessions_cancellation_state_check check (
    (
      status = 'scheduled'
      and cancellation_reason is null
      and cancelled_at is null
      and cancelled_by is null
    )
    or (
      status = 'cancelled'
      and cancellation_reason is not null
      and cancelled_at is not null
      and cancelled_by is not null
    )
  ),
  constraint class_sessions_id_organization_unique unique (id, organization_id)
);

create index class_programs_branch_active_idx
  on public.class_programs (organization_id, branch_id, active desc, name);
create index class_sessions_branch_start_idx
  on public.class_sessions (organization_id, branch_id, start_at);
create index class_sessions_program_start_idx
  on public.class_sessions (organization_id, class_program_id, start_at);
create index class_sessions_trainer_start_idx
  on public.class_sessions (organization_id, trainer_organization_user_id, start_at)
  where trainer_organization_user_id is not null and status = 'scheduled';

create trigger class_programs_set_updated_at
  before update on public.class_programs
  for each row execute function public.set_updated_at();
create trigger class_programs_audit
  after insert or update or delete on public.class_programs
  for each row execute function public.capture_audit_change();
create trigger class_sessions_set_updated_at
  before update on public.class_sessions
  for each row execute function public.set_updated_at();
create trigger class_sessions_audit
  after insert or update or delete on public.class_sessions
  for each row execute function public.capture_audit_change();

alter table public.class_programs enable row level security;
alter table public.class_sessions enable row level security;

create policy class_programs_select on public.class_programs
  for select to authenticated
  using (
    public.is_platform_administrator()
    or public.has_branch_role(
      organization_id,
      branch_id,
      array['gym_owner', 'gym_manager', 'receptionist', 'trainer', 'accountant', 'member']::public.tenant_role[]
    )
  );

create policy class_sessions_select on public.class_sessions
  for select to authenticated
  using (
    public.is_platform_administrator()
    or public.has_branch_role(
      organization_id,
      branch_id,
      array['gym_owner', 'gym_manager', 'receptionist', 'trainer', 'accountant', 'member']::public.tenant_role[]
    )
  );

create or replace function public.save_class_program(
  p_organization_id uuid,
  p_class_program_id uuid,
  p_branch_id uuid,
  p_code text,
  p_name text,
  p_description text,
  p_default_duration_minutes integer,
  p_default_capacity integer,
  p_active boolean
)
returns table (class_program_id uuid, class_program_code text)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor_id uuid := auth.uid();
  v_program_id uuid;
  v_code text := upper(trim(coalesce(p_code, '')));
begin
  if v_actor_id is null then
    raise exception 'authentication is required' using errcode = '42501';
  end if;
  if not public.has_branch_role(
    p_organization_id,
    p_branch_id,
    array['gym_owner', 'gym_manager']::public.tenant_role[]
  ) then
    raise exception 'class program management is not permitted' using errcode = '42501';
  end if;
  if not exists (
    select 1 from public.branches b
    join public.organizations o on o.id = b.organization_id
    where b.id = p_branch_id
      and b.organization_id = p_organization_id
      and b.status = 'active'
      and o.status in ('trial', 'active')
  ) then
    raise exception 'organization or branch is unavailable' using errcode = '22023';
  end if;
  if v_code !~ '^[A-Z0-9][A-Z0-9_-]{0,19}$'
    or char_length(trim(coalesce(p_name, ''))) not between 2 and 120
    or char_length(coalesce(p_description, '')) > 1000
    or p_default_duration_minutes not between 15 and 240
    or p_default_capacity not between 1 and 500 then
    raise exception 'class program values are invalid' using errcode = '22023';
  end if;

  if p_class_program_id is null then
    insert into public.class_programs (
      organization_id, branch_id, code, name, description,
      default_duration_minutes, default_capacity, active, created_by, updated_by
    ) values (
      p_organization_id, p_branch_id, v_code, trim(p_name),
      nullif(trim(coalesce(p_description, '')), ''),
      p_default_duration_minutes, p_default_capacity, coalesce(p_active, true),
      v_actor_id, v_actor_id
    ) returning id into v_program_id;
  else
    update public.class_programs
    set
      code = v_code,
      name = trim(p_name),
      description = nullif(trim(coalesce(p_description, '')), ''),
      default_duration_minutes = p_default_duration_minutes,
      default_capacity = p_default_capacity,
      active = coalesce(p_active, false),
      updated_by = v_actor_id
    where id = p_class_program_id
      and organization_id = p_organization_id
      and branch_id = p_branch_id
    returning id into v_program_id;
    if v_program_id is null then
      raise exception 'class program was not found in this branch' using errcode = 'P0002';
    end if;
  end if;

  return query select v_program_id, v_code;
end;
$$;

create or replace function public.schedule_class_session(
  p_organization_id uuid,
  p_class_program_id uuid,
  p_trainer_organization_user_id uuid,
  p_start_local timestamp without time zone,
  p_capacity integer
)
returns table (class_session_id uuid, class_start_at timestamptz)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor_id uuid := auth.uid();
  v_program public.class_programs%rowtype;
  v_timezone text;
  v_start_at timestamptz;
  v_end_at timestamptz;
  v_capacity integer;
  v_session_id uuid;
begin
  if v_actor_id is null then
    raise exception 'authentication is required' using errcode = '42501';
  end if;

  select cp.* into v_program
  from public.class_programs cp
  join public.organizations o on o.id = cp.organization_id
  join public.branches b on b.id = cp.branch_id and b.organization_id = cp.organization_id
  where cp.id = p_class_program_id
    and cp.organization_id = p_organization_id
    and cp.active
    and b.status = 'active'
    and o.status in ('trial', 'active')
  for share of cp;
  if v_program.id is null then
    raise exception 'active class program was not found' using errcode = 'P0002';
  end if;
  select o.timezone into v_timezone
  from public.organizations o
  where o.id = v_program.organization_id;

  if not public.has_branch_role(
    p_organization_id,
    v_program.branch_id,
    array['gym_owner', 'gym_manager', 'receptionist']::public.tenant_role[]
  ) then
    raise exception 'class scheduling is not permitted' using errcode = '42501';
  end if;
  if p_start_local is null then
    raise exception 'class start time is required' using errcode = '22023';
  end if;

  v_start_at := p_start_local at time zone v_timezone;
  v_end_at := v_start_at + make_interval(mins => v_program.default_duration_minutes);
  v_capacity := coalesce(p_capacity, v_program.default_capacity);
  if v_capacity not between 1 and 500
    or v_start_at < clock_timestamp() - interval '5 minutes'
    or v_start_at > clock_timestamp() + interval '366 days' then
    raise exception 'class time or capacity is invalid' using errcode = '22023';
  end if;

  if p_trainer_organization_user_id is not null then
    if not exists (
      select 1
      from public.organization_users ou
      join public.organization_user_roles our
        on our.organization_user_id = ou.id and our.organization_id = ou.organization_id
      where ou.id = p_trainer_organization_user_id
        and ou.organization_id = p_organization_id
        and ou.status = 'active'
        and our.role = 'trainer'
        and (our.branch_id is null or our.branch_id = v_program.branch_id)
    ) then
      raise exception 'trainer is unavailable for this branch' using errcode = '22023';
    end if;

    perform pg_advisory_xact_lock(
      hashtextextended('class-trainer:' || p_organization_id::text || ':' || p_trainer_organization_user_id::text, 0)
    );
    if exists (
      select 1 from public.class_sessions cs
      where cs.organization_id = p_organization_id
        and cs.trainer_organization_user_id = p_trainer_organization_user_id
        and cs.status = 'scheduled'
        and tstzrange(cs.start_at, cs.end_at, '[)') && tstzrange(v_start_at, v_end_at, '[)')
    ) then
      raise exception 'trainer already has an overlapping class' using errcode = '23P01';
    end if;
  end if;

  insert into public.class_sessions (
    organization_id, branch_id, class_program_id, trainer_organization_user_id,
    start_at, end_at, capacity, created_by, updated_by
  ) values (
    p_organization_id, v_program.branch_id, v_program.id, p_trainer_organization_user_id,
    v_start_at, v_end_at, v_capacity, v_actor_id, v_actor_id
  ) returning id into v_session_id;

  return query select v_session_id, v_start_at;
end;
$$;

create or replace function public.cancel_class_session(
  p_organization_id uuid,
  p_class_session_id uuid,
  p_reason text
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor_id uuid := auth.uid();
  v_session public.class_sessions%rowtype;
begin
  if v_actor_id is null then
    raise exception 'authentication is required' using errcode = '42501';
  end if;
  if char_length(trim(coalesce(p_reason, ''))) not between 2 and 500 then
    raise exception 'cancellation reason is invalid' using errcode = '22023';
  end if;

  select * into v_session
  from public.class_sessions
  where id = p_class_session_id and organization_id = p_organization_id
  for update;
  if v_session.id is null then
    raise exception 'class session was not found' using errcode = 'P0002';
  end if;
  if not public.has_branch_role(
    p_organization_id,
    v_session.branch_id,
    array['gym_owner', 'gym_manager', 'receptionist']::public.tenant_role[]
  ) then
    raise exception 'class cancellation is not permitted' using errcode = '42501';
  end if;
  if v_session.status <> 'scheduled' then
    raise exception 'class session is already cancelled' using errcode = '22023';
  end if;

  update public.class_sessions
  set
    status = 'cancelled',
    cancellation_reason = trim(p_reason),
    cancelled_at = clock_timestamp(),
    cancelled_by = v_actor_id,
    updated_by = v_actor_id
  where id = v_session.id;
end;
$$;

revoke all on table public.class_programs from anon, authenticated;
revoke all on table public.class_sessions from anon, authenticated;
grant select on table public.class_programs, public.class_sessions to authenticated;
revoke all on function public.save_class_program(uuid, uuid, uuid, text, text, text, integer, integer, boolean) from public, anon;
grant execute on function public.save_class_program(uuid, uuid, uuid, text, text, text, integer, integer, boolean) to authenticated;
revoke all on function public.schedule_class_session(uuid, uuid, uuid, timestamp without time zone, integer) from public, anon;
grant execute on function public.schedule_class_session(uuid, uuid, uuid, timestamp without time zone, integer) to authenticated;
revoke all on function public.cancel_class_session(uuid, uuid, text) from public, anon;
grant execute on function public.cancel_class_session(uuid, uuid, text) to authenticated;
