-- GymGrid Phase 1: secure multi-tenant SaaS core.
-- Apply through the Supabase CLI. Never edit an applied migration.

create schema if not exists extensions;
create extension if not exists pgcrypto with schema extensions;

create type public.organization_status as enum ('trial', 'active', 'suspended', 'cancelled');
create type public.branch_status as enum ('active', 'inactive');
create type public.organization_user_status as enum ('invited', 'active', 'suspended');
create type public.tenant_role as enum (
  'gym_owner',
  'gym_manager',
  'receptionist',
  'trainer',
  'accountant',
  'member'
);
create type public.billing_interval as enum ('month', 'year');
create type public.subscription_status as enum ('trialing', 'active', 'past_due', 'cancelled', 'expired');
create type public.invitation_status as enum ('pending', 'accepted', 'revoked', 'expired');

create table public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  full_name text,
  phone text,
  avatar_path text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.platform_administrators (
  user_id uuid primary key references auth.users (id) on delete cascade,
  active boolean not null default true,
  granted_by uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default now()
);

create table public.organizations (
  id uuid primary key default gen_random_uuid(),
  slug text not null check (slug ~ '^[a-z0-9]+(?:-[a-z0-9]+)*$'),
  name text not null check (char_length(trim(name)) between 2 and 120),
  legal_name text,
  gstin text,
  status public.organization_status not null default 'trial',
  currency char(3) not null default 'INR' check (currency = upper(currency)),
  timezone text not null default 'Asia/Kolkata',
  created_by uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint organizations_slug_unique unique (slug)
);

create table public.branches (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id) on delete cascade,
  code text not null check (code ~ '^[A-Z0-9][A-Z0-9_-]{0,19}$'),
  name text not null check (char_length(trim(name)) between 2 and 120),
  status public.branch_status not null default 'active',
  phone text,
  email text,
  address jsonb not null default '{}'::jsonb check (jsonb_typeof(address) = 'object'),
  timezone text not null default 'Asia/Kolkata',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint branches_id_organization_unique unique (id, organization_id)
);

create unique index branches_organization_code_unique
  on public.branches (organization_id, upper(code));

create table public.organization_users (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id) on delete cascade,
  user_id uuid not null references auth.users (id) on delete cascade,
  status public.organization_user_status not null default 'active',
  joined_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint organization_users_organization_user_unique unique (organization_id, user_id),
  constraint organization_users_id_organization_unique unique (id, organization_id)
);

create index organization_users_user_id_idx on public.organization_users (user_id);

create table public.organization_user_roles (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id) on delete cascade,
  organization_user_id uuid not null,
  role public.tenant_role not null,
  branch_id uuid,
  granted_by uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default now(),
  constraint organization_user_roles_membership_fk
    foreign key (organization_user_id, organization_id)
    references public.organization_users (id, organization_id) on delete cascade,
  constraint organization_user_roles_branch_fk
    foreign key (branch_id, organization_id)
    references public.branches (id, organization_id) on delete cascade,
  constraint organization_user_roles_owner_scope_check
    check (role <> 'gym_owner' or branch_id is null)
);

create unique index organization_user_roles_organization_wide_unique
  on public.organization_user_roles (organization_user_id, role)
  where branch_id is null;

create unique index organization_user_roles_branch_unique
  on public.organization_user_roles (organization_user_id, role, branch_id)
  where branch_id is not null;

create table public.plans (
  id uuid primary key default gen_random_uuid(),
  code text not null unique check (code ~ '^[a-z0-9_]+$'),
  name text not null,
  description text,
  active boolean not null default true,
  sort_order integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.plan_prices (
  id uuid primary key default gen_random_uuid(),
  plan_id uuid not null references public.plans (id) on delete cascade,
  currency char(3) not null default 'INR' check (currency = upper(currency)),
  billing_interval public.billing_interval not null,
  amount_minor bigint not null check (amount_minor >= 0),
  tax_inclusive boolean not null default false,
  effective_from timestamptz not null default now(),
  effective_until timestamptz,
  created_at timestamptz not null default now(),
  constraint plan_prices_effective_range_check
    check (effective_until is null or effective_until > effective_from)
);

create unique index plan_prices_current_unique
  on public.plan_prices (plan_id, currency, billing_interval)
  where effective_until is null;

create table public.plan_entitlements (
  id uuid primary key default gen_random_uuid(),
  plan_id uuid not null references public.plans (id) on delete cascade,
  code text not null check (code ~ '^[a-z0-9_]+$'),
  enabled boolean not null default true,
  limit_value bigint check (limit_value is null or limit_value >= 0),
  configuration jsonb not null default '{}'::jsonb check (jsonb_typeof(configuration) = 'object'),
  created_at timestamptz not null default now(),
  constraint plan_entitlements_plan_code_unique unique (plan_id, code)
);

create table public.addons (
  id uuid primary key default gen_random_uuid(),
  code text not null unique check (code ~ '^[a-z0-9_]+$'),
  name text not null,
  description text,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.addon_prices (
  id uuid primary key default gen_random_uuid(),
  addon_id uuid not null references public.addons (id) on delete cascade,
  currency char(3) not null default 'INR' check (currency = upper(currency)),
  billing_interval public.billing_interval not null,
  amount_minor bigint not null check (amount_minor >= 0),
  included_units bigint not null default 1 check (included_units > 0),
  tax_inclusive boolean not null default false,
  effective_from timestamptz not null default now(),
  effective_until timestamptz,
  created_at timestamptz not null default now(),
  constraint addon_prices_effective_range_check
    check (effective_until is null or effective_until > effective_from)
);

create unique index addon_prices_current_unique
  on public.addon_prices (addon_id, currency, billing_interval)
  where effective_until is null;

create table public.subscriptions (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id) on delete cascade,
  plan_id uuid not null references public.plans (id),
  plan_price_id uuid references public.plan_prices (id),
  status public.subscription_status not null default 'trialing',
  billing_interval public.billing_interval not null default 'year',
  currency char(3) not null default 'INR' check (currency = upper(currency)),
  base_amount_minor bigint not null check (base_amount_minor >= 0),
  current_period_start date not null,
  current_period_end date not null,
  grace_until date,
  cancelled_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint subscriptions_period_check check (current_period_end > current_period_start),
  constraint subscriptions_grace_check check (grace_until is null or grace_until >= current_period_end)
);

create unique index subscriptions_one_current_per_organization
  on public.subscriptions (organization_id)
  where status in ('trialing', 'active', 'past_due');

create table public.subscription_entitlements (
  id uuid primary key default gen_random_uuid(),
  subscription_id uuid not null references public.subscriptions (id) on delete cascade,
  organization_id uuid not null references public.organizations (id) on delete cascade,
  code text not null check (code ~ '^[a-z0-9_]+$'),
  enabled boolean not null default true,
  limit_value bigint check (limit_value is null or limit_value >= 0),
  configuration jsonb not null default '{}'::jsonb check (jsonb_typeof(configuration) = 'object'),
  source text not null default 'plan' check (source in ('plan', 'addon', 'override')),
  created_at timestamptz not null default now(),
  constraint subscription_entitlements_subscription_code_unique unique (subscription_id, code)
);

create index subscription_entitlements_organization_code_idx
  on public.subscription_entitlements (organization_id, code);

create table public.subscription_addons (
  id uuid primary key default gen_random_uuid(),
  subscription_id uuid not null references public.subscriptions (id) on delete cascade,
  organization_id uuid not null references public.organizations (id) on delete cascade,
  addon_id uuid not null references public.addons (id),
  addon_price_id uuid references public.addon_prices (id),
  quantity bigint not null default 1 check (quantity > 0),
  unit_amount_minor bigint not null check (unit_amount_minor >= 0),
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint subscription_addons_subscription_addon_unique unique (subscription_id, addon_id)
);

create table public.organization_invitations (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id) on delete cascade,
  email text not null check (position('@' in email) > 1),
  role public.tenant_role not null,
  branch_id uuid,
  status public.invitation_status not null default 'pending',
  invited_by uuid references auth.users (id) on delete set null,
  accepted_by uuid references auth.users (id) on delete set null,
  expires_at timestamptz not null default (now() + interval '7 days'),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint organization_invitations_branch_fk
    foreign key (branch_id, organization_id)
    references public.branches (id, organization_id) on delete cascade
);

create unique index organization_invitations_pending_email_unique
  on public.organization_invitations (organization_id, lower(email), role)
  where status = 'pending';

create table public.audit_logs (
  id bigint generated always as identity primary key,
  -- Deliberately not a foreign key: an audit trail must survive tenant deletion.
  organization_id uuid,
  actor_user_id uuid references auth.users (id) on delete set null,
  action text not null,
  target_table text not null,
  target_id uuid,
  old_record jsonb,
  new_record jsonb,
  metadata jsonb not null default '{}'::jsonb check (jsonb_typeof(metadata) = 'object'),
  created_at timestamptz not null default now()
);

create index audit_logs_organization_created_idx
  on public.audit_logs (organization_id, created_at desc);

create or replace function public.set_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create or replace function public.handle_new_auth_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.profiles (id, full_name, phone)
  values (
    new.id,
    nullif(trim(new.raw_user_meta_data ->> 'full_name'), ''),
    nullif(trim(coalesce(new.phone, new.raw_user_meta_data ->> 'phone')), '')
  )
  on conflict (id) do nothing;
  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_auth_user();

create trigger profiles_set_updated_at before update on public.profiles
  for each row execute function public.set_updated_at();
create trigger organizations_set_updated_at before update on public.organizations
  for each row execute function public.set_updated_at();
create trigger branches_set_updated_at before update on public.branches
  for each row execute function public.set_updated_at();
create trigger organization_users_set_updated_at before update on public.organization_users
  for each row execute function public.set_updated_at();
create trigger plans_set_updated_at before update on public.plans
  for each row execute function public.set_updated_at();
create trigger addons_set_updated_at before update on public.addons
  for each row execute function public.set_updated_at();
create trigger subscriptions_set_updated_at before update on public.subscriptions
  for each row execute function public.set_updated_at();
create trigger subscription_addons_set_updated_at before update on public.subscription_addons
  for each row execute function public.set_updated_at();
create trigger organization_invitations_set_updated_at before update on public.organization_invitations
  for each row execute function public.set_updated_at();

create or replace function public.is_platform_administrator()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.platform_administrators pa
    where pa.user_id = auth.uid()
      and pa.active
  );
$$;

create or replace function public.is_organization_user(p_organization_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.organization_users ou
    where ou.organization_id = p_organization_id
      and ou.user_id = auth.uid()
      and ou.status = 'active'
  );
$$;

create or replace function public.has_organization_role(
  p_organization_id uuid,
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
    join public.organization_user_roles our on our.organization_user_id = ou.id
    where ou.organization_id = p_organization_id
      and ou.user_id = auth.uid()
      and ou.status = 'active'
      and our.role = any (p_roles)
      and our.branch_id is null
  );
$$;

create or replace function public.has_branch_access(
  p_organization_id uuid,
  p_branch_id uuid
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
    join public.organization_user_roles our on our.organization_user_id = ou.id
    where ou.organization_id = p_organization_id
      and ou.user_id = auth.uid()
      and ou.status = 'active'
      and (our.branch_id is null or our.branch_id = p_branch_id)
  );
$$;

create or replace function public.can_view_organization_profile(p_user_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.organization_users mine
    join public.organization_user_roles mine_role
      on mine_role.organization_user_id = mine.id
    join public.organization_users theirs
      on theirs.organization_id = mine.organization_id
    where mine.user_id = auth.uid()
      and mine.status = 'active'
      and mine_role.role in ('gym_owner', 'gym_manager')
      and theirs.user_id = p_user_id
      and theirs.status = 'active'
  );
$$;

create or replace function public.capture_audit_change()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_old jsonb := case when tg_op in ('UPDATE', 'DELETE') then to_jsonb(old) else null end;
  v_new jsonb := case when tg_op in ('INSERT', 'UPDATE') then to_jsonb(new) else null end;
  v_scope jsonb := coalesce(v_new, v_old);
  v_organization_id uuid;
  v_target_id uuid;
begin
  if tg_table_name = 'organizations' then
    v_organization_id := nullif(v_scope ->> 'id', '')::uuid;
  else
    v_organization_id := nullif(v_scope ->> 'organization_id', '')::uuid;
  end if;

  v_target_id := nullif(v_scope ->> 'id', '')::uuid;

  insert into public.audit_logs (
    organization_id,
    actor_user_id,
    action,
    target_table,
    target_id,
    old_record,
    new_record
  ) values (
    v_organization_id,
    auth.uid(),
    lower(tg_op),
    tg_table_name,
    v_target_id,
    v_old,
    v_new
  );

  if tg_op = 'DELETE' then
    return old;
  end if;

  return new;
end;
$$;

create or replace function public.prevent_audit_log_mutation()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  raise exception 'audit logs are immutable';
end;
$$;

create trigger organizations_audit after insert or update or delete on public.organizations
  for each row execute function public.capture_audit_change();
create trigger branches_audit after insert or update or delete on public.branches
  for each row execute function public.capture_audit_change();
create trigger organization_users_audit after insert or update or delete on public.organization_users
  for each row execute function public.capture_audit_change();
create trigger organization_user_roles_audit after insert or update or delete on public.organization_user_roles
  for each row execute function public.capture_audit_change();
create trigger subscriptions_audit after insert or update or delete on public.subscriptions
  for each row execute function public.capture_audit_change();
create trigger subscription_entitlements_audit after insert or update or delete on public.subscription_entitlements
  for each row execute function public.capture_audit_change();
create trigger audit_logs_immutable before update or delete on public.audit_logs
  for each row execute function public.prevent_audit_log_mutation();

insert into public.plans (code, name, description, sort_order)
values
  ('launch', 'Launch', 'For gyms with up to 100 active members.', 10),
  ('growth', 'Growth', 'For gyms with up to 300 active members.', 20),
  ('scale', 'Scale', 'For gyms with up to 700 active members.', 30),
  ('enterprise', 'Enterprise', 'Custom limits and commercial terms.', 40);

insert into public.plan_prices (plan_id, currency, billing_interval, amount_minor, tax_inclusive)
select id, 'INR', 'year',
  case code
    when 'launch' then 999900
    when 'growth' then 1499900
    when 'scale' then 2199900
  end,
  false
from public.plans
where code in ('launch', 'growth', 'scale');

insert into public.plan_entitlements (plan_id, code, enabled, limit_value)
select p.id, entitlement.code, true, entitlement.limit_value
from public.plans p
cross join lateral (
  values
    ('active_members', case p.code when 'launch' then 100 when 'growth' then 300 when 'scale' then 700 else null end::bigint),
    ('branches', case when p.code = 'enterprise' then null else 1 end::bigint),
    ('staff_users', case when p.code = 'launch' then 3 else null end::bigint)
) as entitlement(code, limit_value);

create or replace function public.platform_create_tenant(
  p_organization_name text,
  p_organization_slug text,
  p_branch_name text,
  p_branch_code text,
  p_owner_email text,
  p_plan_code text,
  p_subscription_start date default current_date
)
returns table (
  organization_id uuid,
  branch_id uuid,
  invitation_id uuid,
  subscription_id uuid
)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor_id uuid := auth.uid();
  v_organization_id uuid;
  v_branch_id uuid;
  v_invitation_id uuid;
  v_subscription_id uuid;
  v_plan_id uuid;
  v_price_id uuid;
  v_amount_minor bigint;
  v_owner_user_id uuid;
  v_organization_user_id uuid;
begin
  if not public.is_platform_administrator() then
    raise exception 'platform administrator access required' using errcode = '42501';
  end if;

  if p_organization_name is null or char_length(trim(p_organization_name)) < 2 then
    raise exception 'organization name is required' using errcode = '22023';
  end if;

  if p_organization_slug is null or p_organization_slug !~ '^[a-z0-9]+(?:-[a-z0-9]+)*$' then
    raise exception 'organization slug is invalid' using errcode = '22023';
  end if;

  if p_owner_email is null or position('@' in p_owner_email) <= 1 then
    raise exception 'owner email is invalid' using errcode = '22023';
  end if;

  if p_subscription_start is null then
    raise exception 'subscription start date is required' using errcode = '22023';
  end if;

  select p.id, pp.id, pp.amount_minor
    into v_plan_id, v_price_id, v_amount_minor
  from public.plans p
  left join public.plan_prices pp
    on pp.plan_id = p.id
    and pp.currency = 'INR'
    and pp.billing_interval = 'year'
    and pp.effective_from <= now()
    and (pp.effective_until is null or pp.effective_until > now())
  where p.code = p_plan_code
    and p.active
  limit 1;

  if v_plan_id is null then
    raise exception 'plan is unavailable' using errcode = '22023';
  end if;

  if p_plan_code <> 'enterprise' and v_price_id is null then
    raise exception 'plan price is unavailable' using errcode = '22023';
  end if;

  insert into public.organizations (slug, name, status, created_by)
  values (p_organization_slug, trim(p_organization_name), 'trial', v_actor_id)
  returning id into v_organization_id;

  insert into public.branches (organization_id, code, name)
  values (v_organization_id, upper(trim(p_branch_code)), trim(p_branch_name))
  returning id into v_branch_id;

  select u.id into v_owner_user_id
  from auth.users u
  where lower(u.email) = lower(trim(p_owner_email))
  limit 1;

  insert into public.organization_invitations (
    organization_id,
    email,
    role,
    status,
    invited_by,
    accepted_by
  ) values (
    v_organization_id,
    lower(trim(p_owner_email)),
    'gym_owner',
    case when v_owner_user_id is null then 'pending'::public.invitation_status else 'accepted'::public.invitation_status end,
    v_actor_id,
    v_owner_user_id
  ) returning id into v_invitation_id;

  if v_owner_user_id is not null then
    insert into public.organization_users (organization_id, user_id, status, joined_at)
    values (v_organization_id, v_owner_user_id, 'active', now())
    returning id into v_organization_user_id;

    insert into public.organization_user_roles (
      organization_id,
      organization_user_id,
      role,
      branch_id,
      granted_by
    ) values (
      v_organization_id,
      v_organization_user_id,
      'gym_owner',
      null,
      v_actor_id
    );
  end if;

  insert into public.subscriptions (
    organization_id,
    plan_id,
    plan_price_id,
    status,
    billing_interval,
    currency,
    base_amount_minor,
    current_period_start,
    current_period_end
  ) values (
    v_organization_id,
    v_plan_id,
    v_price_id,
    'trialing',
    'year',
    'INR',
    coalesce(v_amount_minor, 0),
    p_subscription_start,
    (p_subscription_start + interval '1 year')::date
  ) returning id into v_subscription_id;

  insert into public.subscription_entitlements (
    subscription_id,
    organization_id,
    code,
    enabled,
    limit_value,
    configuration,
    source
  )
  select
    v_subscription_id,
    v_organization_id,
    pe.code,
    pe.enabled,
    pe.limit_value,
    pe.configuration,
    'plan'
  from public.plan_entitlements pe
  where pe.plan_id = v_plan_id;

  insert into public.audit_logs (
    organization_id,
    actor_user_id,
    action,
    target_table,
    target_id,
    metadata
  ) values (
    v_organization_id,
    v_actor_id,
    'tenant_onboarded',
    'organizations',
    v_organization_id,
    jsonb_build_object(
      'branch_id', v_branch_id,
      'invitation_id', v_invitation_id,
      'subscription_id', v_subscription_id,
      'plan_code', p_plan_code
    )
  );

  return query select v_organization_id, v_branch_id, v_invitation_id, v_subscription_id;
end;
$$;

alter table public.profiles enable row level security;
alter table public.platform_administrators enable row level security;
alter table public.organizations enable row level security;
alter table public.branches enable row level security;
alter table public.organization_users enable row level security;
alter table public.organization_user_roles enable row level security;
alter table public.plans enable row level security;
alter table public.plan_prices enable row level security;
alter table public.plan_entitlements enable row level security;
alter table public.addons enable row level security;
alter table public.addon_prices enable row level security;
alter table public.subscriptions enable row level security;
alter table public.subscription_entitlements enable row level security;
alter table public.subscription_addons enable row level security;
alter table public.organization_invitations enable row level security;
alter table public.audit_logs enable row level security;

create policy profiles_select on public.profiles for select to authenticated
  using (
    id = auth.uid()
    or public.is_platform_administrator()
    or public.can_view_organization_profile(id)
  );
create policy profiles_update_self on public.profiles for update to authenticated
  using (id = auth.uid())
  with check (id = auth.uid());

create policy platform_administrators_select on public.platform_administrators for select to authenticated
  using (public.is_platform_administrator());
create policy platform_administrators_insert on public.platform_administrators for insert to authenticated
  with check (public.is_platform_administrator());
create policy platform_administrators_update on public.platform_administrators for update to authenticated
  using (public.is_platform_administrator())
  with check (public.is_platform_administrator());
create policy platform_administrators_delete on public.platform_administrators for delete to authenticated
  using (public.is_platform_administrator() and user_id <> auth.uid());

create policy organizations_select on public.organizations for select to authenticated
  using (public.is_platform_administrator() or public.is_organization_user(id));
create policy organizations_insert on public.organizations for insert to authenticated
  with check (public.is_platform_administrator());
create policy organizations_update on public.organizations for update to authenticated
  using (public.is_platform_administrator())
  with check (public.is_platform_administrator());
create policy organizations_delete on public.organizations for delete to authenticated
  using (public.is_platform_administrator());

create policy branches_select on public.branches for select to authenticated
  using (
    public.is_platform_administrator()
    or public.has_branch_access(organization_id, id)
  );
create policy branches_insert on public.branches for insert to authenticated
  with check (
    public.is_platform_administrator()
    or public.has_organization_role(organization_id, array['gym_owner', 'gym_manager']::public.tenant_role[])
  );
create policy branches_update on public.branches for update to authenticated
  using (
    public.is_platform_administrator()
    or public.has_organization_role(organization_id, array['gym_owner', 'gym_manager']::public.tenant_role[])
  )
  with check (
    public.is_platform_administrator()
    or public.has_organization_role(organization_id, array['gym_owner', 'gym_manager']::public.tenant_role[])
  );
create policy branches_delete on public.branches for delete to authenticated
  using (public.is_platform_administrator());

create policy organization_users_select on public.organization_users for select to authenticated
  using (
    user_id = auth.uid()
    or public.is_platform_administrator()
    or public.has_organization_role(organization_id, array['gym_owner', 'gym_manager']::public.tenant_role[])
  );
create policy organization_users_write_platform_only on public.organization_users for all to authenticated
  using (public.is_platform_administrator())
  with check (public.is_platform_administrator());

create policy organization_user_roles_select on public.organization_user_roles for select to authenticated
  using (
    public.is_platform_administrator()
    or exists (
      select 1
      from public.organization_users ou
      where ou.id = organization_user_id
        and ou.user_id = auth.uid()
    )
    or public.has_organization_role(organization_id, array['gym_owner', 'gym_manager']::public.tenant_role[])
  );
create policy organization_user_roles_write_platform_only on public.organization_user_roles for all to authenticated
  using (public.is_platform_administrator())
  with check (public.is_platform_administrator());

create policy plans_select on public.plans for select to authenticated
  using (active or public.is_platform_administrator());
create policy plans_write on public.plans for all to authenticated
  using (public.is_platform_administrator())
  with check (public.is_platform_administrator());
create policy plan_prices_select on public.plan_prices for select to authenticated
  using (public.is_platform_administrator() or effective_until is null or effective_until > now());
create policy plan_prices_write on public.plan_prices for all to authenticated
  using (public.is_platform_administrator())
  with check (public.is_platform_administrator());
create policy plan_entitlements_select on public.plan_entitlements for select to authenticated
  using (true);
create policy plan_entitlements_write on public.plan_entitlements for all to authenticated
  using (public.is_platform_administrator())
  with check (public.is_platform_administrator());
create policy addons_select on public.addons for select to authenticated
  using (active or public.is_platform_administrator());
create policy addons_write on public.addons for all to authenticated
  using (public.is_platform_administrator())
  with check (public.is_platform_administrator());
create policy addon_prices_select on public.addon_prices for select to authenticated
  using (public.is_platform_administrator() or effective_until is null or effective_until > now());
create policy addon_prices_write on public.addon_prices for all to authenticated
  using (public.is_platform_administrator())
  with check (public.is_platform_administrator());

create policy subscriptions_select on public.subscriptions for select to authenticated
  using (
    public.is_platform_administrator()
    or public.has_organization_role(
      organization_id,
      array['gym_owner', 'gym_manager', 'accountant']::public.tenant_role[]
    )
  );
create policy subscriptions_write on public.subscriptions for all to authenticated
  using (public.is_platform_administrator())
  with check (public.is_platform_administrator());

create policy subscription_entitlements_select on public.subscription_entitlements for select to authenticated
  using (
    public.is_platform_administrator()
    or public.has_organization_role(
      organization_id,
      array['gym_owner', 'gym_manager', 'accountant']::public.tenant_role[]
    )
  );
create policy subscription_entitlements_write on public.subscription_entitlements for all to authenticated
  using (public.is_platform_administrator())
  with check (public.is_platform_administrator());

create policy subscription_addons_select on public.subscription_addons for select to authenticated
  using (
    public.is_platform_administrator()
    or public.has_organization_role(
      organization_id,
      array['gym_owner', 'gym_manager', 'accountant']::public.tenant_role[]
    )
  );
create policy subscription_addons_write on public.subscription_addons for all to authenticated
  using (public.is_platform_administrator())
  with check (public.is_platform_administrator());

create policy organization_invitations_select on public.organization_invitations for select to authenticated
  using (
    public.is_platform_administrator()
    or public.has_organization_role(organization_id, array['gym_owner', 'gym_manager']::public.tenant_role[])
  );
create policy organization_invitations_write on public.organization_invitations for all to authenticated
  using (public.is_platform_administrator())
  with check (public.is_platform_administrator());

create policy audit_logs_select on public.audit_logs for select to authenticated
  using (
    public.is_platform_administrator()
    or (
      organization_id is not null
      and public.has_organization_role(organization_id, array['gym_owner']::public.tenant_role[])
    )
  );

grant usage on schema public to authenticated;
grant select, insert, update, delete on all tables in schema public to authenticated;
grant usage, select on all sequences in schema public to authenticated;

revoke all on function public.set_updated_at() from public, anon, authenticated;
revoke all on function public.handle_new_auth_user() from public, anon, authenticated;
revoke all on function public.capture_audit_change() from public, anon, authenticated;
revoke all on function public.prevent_audit_log_mutation() from public, anon, authenticated;
revoke all on function public.is_platform_administrator() from public, anon;
revoke all on function public.is_organization_user(uuid) from public, anon;
revoke all on function public.has_organization_role(uuid, public.tenant_role[]) from public, anon;
revoke all on function public.has_branch_access(uuid, uuid) from public, anon;
revoke all on function public.can_view_organization_profile(uuid) from public, anon;
revoke all on function public.platform_create_tenant(text, text, text, text, text, text, date) from public, anon;

grant execute on function public.is_platform_administrator() to authenticated;
grant execute on function public.is_organization_user(uuid) to authenticated;
grant execute on function public.has_organization_role(uuid, public.tenant_role[]) to authenticated;
grant execute on function public.has_branch_access(uuid, uuid) to authenticated;
grant execute on function public.can_view_organization_profile(uuid) to authenticated;
grant execute on function public.platform_create_tenant(text, text, text, text, text, text, date) to authenticated;
