create type public.manual_payment_method as enum (
  'cash',
  'upi',
  'card',
  'bank_transfer',
  'cheque',
  'other'
);

create type public.manual_payment_status as enum ('recorded', 'voided');

create table public.receipt_number_counters (
  organization_id uuid primary key references public.organizations (id) on delete cascade,
  next_value bigint not null default 1 check (next_value > 0)
);

create table public.manual_payments (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id) on delete cascade,
  branch_id uuid not null,
  member_id uuid not null,
  membership_id uuid not null,
  receipt_code text not null check (receipt_code ~ '^R[0-9]{6,}$'),
  amount_minor bigint not null check (amount_minor > 0),
  currency char(3) not null check (currency = upper(currency)),
  payment_date date not null,
  payment_method public.manual_payment_method not null,
  transaction_reference text check (
    transaction_reference is null
    or char_length(trim(transaction_reference)) between 2 and 120
  ),
  notes text check (notes is null or char_length(notes) <= 1000),
  status public.manual_payment_status not null default 'recorded',
  void_reason text check (
    void_reason is null or char_length(trim(void_reason)) between 2 and 500
  ),
  voided_at timestamptz,
  voided_by uuid references auth.users (id) on delete restrict,
  created_by uuid not null references auth.users (id) on delete restrict,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint manual_payments_branch_fk
    foreign key (branch_id, organization_id)
    references public.branches (id, organization_id) on delete restrict,
  constraint manual_payments_member_fk
    foreign key (member_id, organization_id)
    references public.members (id, organization_id) on delete restrict,
  constraint manual_payments_membership_fk
    foreign key (membership_id, organization_id)
    references public.member_memberships (id, organization_id) on delete restrict,
  constraint manual_payments_organization_receipt_unique
    unique (organization_id, receipt_code),
  constraint manual_payments_void_state_check check (
    (
      status = 'recorded'
      and void_reason is null
      and voided_at is null
      and voided_by is null
    )
    or (
      status = 'voided'
      and void_reason is not null
      and voided_at is not null
      and voided_by is not null
    )
  )
);

create index manual_payments_organization_date_idx
  on public.manual_payments (organization_id, payment_date desc, created_at desc);
create index manual_payments_membership_idx
  on public.manual_payments (organization_id, membership_id, payment_date desc);
create index manual_payments_branch_date_idx
  on public.manual_payments (organization_id, branch_id, payment_date desc);

create trigger manual_payments_set_updated_at
  before update on public.manual_payments
  for each row execute function public.set_updated_at();
create trigger manual_payments_audit
  after insert or update or delete on public.manual_payments
  for each row execute function public.capture_audit_change();

alter table public.receipt_number_counters enable row level security;
alter table public.manual_payments enable row level security;

create policy manual_payments_select on public.manual_payments
  for select to authenticated
  using (
    public.is_platform_administrator()
    or public.has_branch_role(
      organization_id,
      branch_id,
      array['gym_owner', 'gym_manager', 'receptionist', 'accountant']::public.tenant_role[]
    )
  );

create or replace view public.membership_payment_balances
with (security_invoker = true)
as
select
  mm.id as membership_id,
  mm.organization_id,
  mm.branch_id,
  mm.member_id,
  mm.enrollment_code,
  mm.plan_name,
  mm.contract_amount_minor,
  mm.currency,
  coalesce(sum(mp.amount_minor) filter (where mp.status = 'recorded'), 0)::bigint
    as paid_amount_minor,
  greatest(
    mm.contract_amount_minor
      - coalesce(sum(mp.amount_minor) filter (where mp.status = 'recorded'), 0),
    0
  )::bigint as outstanding_amount_minor
from public.member_memberships mm
left join public.manual_payments mp
  on mp.organization_id = mm.organization_id
  and mp.membership_id = mm.id
group by mm.id;

create or replace function public.record_manual_payment(
  p_organization_id uuid,
  p_membership_id uuid,
  p_amount_minor bigint,
  p_payment_method public.manual_payment_method,
  p_payment_date date default null,
  p_transaction_reference text default null,
  p_notes text default null
)
returns table (payment_id uuid, receipt_code text)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor_id uuid := auth.uid();
  v_membership public.member_memberships%rowtype;
  v_local_date date := public.organization_local_date(p_organization_id);
  v_payment_date date := coalesce(p_payment_date, v_local_date);
  v_paid_amount bigint;
  v_sequence bigint;
  v_payment_id uuid;
  v_receipt_code text;
begin
  if v_actor_id is null then
    raise exception 'authentication is required' using errcode = '42501';
  end if;

  if p_amount_minor is null or p_amount_minor <= 0 then
    raise exception 'payment amount must be positive' using errcode = '22023';
  end if;

  if v_payment_date is null
    or v_payment_date < date '2000-01-01'
    or v_payment_date > v_local_date then
    raise exception 'payment date is invalid' using errcode = '22023';
  end if;

  if p_transaction_reference is not null
    and char_length(trim(p_transaction_reference)) not between 2 and 120 then
    raise exception 'transaction reference is invalid' using errcode = '22023';
  end if;

  if p_notes is not null and char_length(p_notes) > 1000 then
    raise exception 'payment notes are too long' using errcode = '22023';
  end if;

  select mm.* into v_membership
  from public.member_memberships mm
  where mm.id = p_membership_id
    and mm.organization_id = p_organization_id
  for update;

  if not found then
    raise exception 'membership is unavailable' using errcode = '22023';
  end if;

  if not public.has_branch_role(
    p_organization_id,
    v_membership.branch_id,
    array['gym_owner', 'gym_manager', 'receptionist', 'accountant']::public.tenant_role[]
  ) then
    raise exception 'payment recording is not permitted' using errcode = '42501';
  end if;

  perform pg_advisory_xact_lock(
    hashtextextended('membership-payment:' || p_membership_id::text, 0)
  );

  select coalesce(sum(mp.amount_minor), 0)::bigint into v_paid_amount
  from public.manual_payments mp
  where mp.organization_id = p_organization_id
    and mp.membership_id = p_membership_id
    and mp.status = 'recorded';

  if v_paid_amount + p_amount_minor > v_membership.contract_amount_minor then
    raise exception 'payment exceeds the outstanding membership balance'
      using errcode = '22023';
  end if;

  insert into public.receipt_number_counters (organization_id, next_value)
  values (p_organization_id, 2)
  on conflict (organization_id) do update
    set next_value = public.receipt_number_counters.next_value + 1
  returning next_value - 1 into v_sequence;

  v_receipt_code := 'R' || lpad(v_sequence::text, 6, '0');

  insert into public.manual_payments (
    organization_id,
    branch_id,
    member_id,
    membership_id,
    receipt_code,
    amount_minor,
    currency,
    payment_date,
    payment_method,
    transaction_reference,
    notes,
    created_by
  ) values (
    p_organization_id,
    v_membership.branch_id,
    v_membership.member_id,
    p_membership_id,
    v_receipt_code,
    p_amount_minor,
    v_membership.currency,
    v_payment_date,
    p_payment_method,
    nullif(trim(p_transaction_reference), ''),
    nullif(trim(p_notes), ''),
    v_actor_id
  ) returning id into v_payment_id;

  return query select v_payment_id, v_receipt_code;
end;
$$;

create or replace function public.void_manual_payment(
  p_organization_id uuid,
  p_payment_id uuid,
  p_reason text
)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor_id uuid := auth.uid();
  v_payment public.manual_payments%rowtype;
begin
  if v_actor_id is null then
    raise exception 'authentication is required' using errcode = '42501';
  end if;

  if char_length(trim(coalesce(p_reason, ''))) not between 2 and 500 then
    raise exception 'void reason is required' using errcode = '22023';
  end if;

  select mp.* into v_payment
  from public.manual_payments mp
  where mp.id = p_payment_id
    and mp.organization_id = p_organization_id
  for update;

  if not found or v_payment.status <> 'recorded' then
    raise exception 'payment cannot be voided' using errcode = '22023';
  end if;

  if not public.has_branch_role(
    p_organization_id,
    v_payment.branch_id,
    array['gym_owner', 'gym_manager', 'accountant']::public.tenant_role[]
  ) then
    raise exception 'payment voiding is not permitted' using errcode = '42501';
  end if;

  update public.manual_payments
  set
    status = 'voided',
    void_reason = trim(p_reason),
    voided_at = now(),
    voided_by = v_actor_id
  where id = p_payment_id and organization_id = p_organization_id;

  return true;
end;
$$;

revoke all on table public.receipt_number_counters from anon, authenticated;
revoke all on table public.manual_payments from anon, authenticated;
grant select on table public.manual_payments to authenticated;
grant select on table public.membership_payment_balances to authenticated;

revoke all on function public.record_manual_payment(
  uuid, uuid, bigint, public.manual_payment_method, date, text, text
) from public, anon;
revoke all on function public.void_manual_payment(uuid, uuid, text) from public, anon;
grant execute on function public.record_manual_payment(
  uuid, uuid, bigint, public.manual_payment_method, date, text, text
) to authenticated;
grant execute on function public.void_manual_payment(uuid, uuid, text) to authenticated;
