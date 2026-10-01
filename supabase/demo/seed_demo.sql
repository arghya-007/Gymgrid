\set ON_ERROR_STOP on

\if :{?demo_owner_id}
\else
  \echo 'Pass an existing development Auth user UUID with -v demo_owner_id=...'
  \quit
\endif

select exists (
  select 1 from auth.users where id = :'demo_owner_id'::uuid
) as demo_owner_exists
\gset

\if :demo_owner_exists
\else
  \echo 'The supplied demo_owner_id does not exist in auth.users.'
  \quit
\endif

begin;

insert into public.profiles (id, full_name)
values (:'demo_owner_id'::uuid, 'GymGrid Demo Owner')
on conflict (id) do update set full_name = excluded.full_name;

insert into public.organizations (
  id, slug, name, legal_name, status, currency, timezone, created_by
)
values (
  'de000000-0000-4000-8000-000000000001',
  'gymgrid-demo',
  'GymGrid Demo Fitness',
  'GymGrid Demo Fitness Private Limited',
  'active',
  'INR',
  'Asia/Kolkata',
  :'demo_owner_id'::uuid
)
on conflict (id) do update set
  slug = excluded.slug,
  name = excluded.name,
  legal_name = excluded.legal_name,
  status = excluded.status,
  currency = excluded.currency,
  timezone = excluded.timezone,
  created_by = excluded.created_by;

insert into public.branches (
  id, organization_id, code, name, status, phone, email, address, timezone
)
values (
  'de100000-0000-4000-8000-000000000001',
  'de000000-0000-4000-8000-000000000001',
  'MAIN',
  'Indiranagar Demo Branch',
  'active',
  '+919000000001',
  'demo-branch@gymgrid.local',
  '{"line1":"100 Demo Road","city":"Bengaluru","state":"Karnataka","postal_code":"560038"}'::jsonb,
  'Asia/Kolkata'
)
on conflict (id) do update set
  code = excluded.code,
  name = excluded.name,
  status = excluded.status,
  phone = excluded.phone,
  email = excluded.email,
  address = excluded.address,
  timezone = excluded.timezone;

insert into public.organization_users (
  id, organization_id, user_id, status, joined_at
)
values (
  'de200000-0000-4000-8000-000000000001',
  'de000000-0000-4000-8000-000000000001',
  :'demo_owner_id'::uuid,
  'active',
  now()
)
on conflict (id) do update set
  user_id = excluded.user_id,
  status = excluded.status,
  joined_at = coalesce(public.organization_users.joined_at, excluded.joined_at);

insert into public.organization_user_roles (
  id, organization_id, organization_user_id, role, branch_id, granted_by
)
values (
  'de210000-0000-4000-8000-000000000001',
  'de000000-0000-4000-8000-000000000001',
  'de200000-0000-4000-8000-000000000001',
  'gym_owner',
  null,
  :'demo_owner_id'::uuid
)
on conflict (id) do update set
  organization_user_id = excluded.organization_user_id,
  role = excluded.role,
  branch_id = excluded.branch_id,
  granted_by = excluded.granted_by;

insert into public.subscriptions (
  id, organization_id, plan_id, plan_price_id, status, billing_interval,
  currency, base_amount_minor, current_period_start, current_period_end
)
select
  'de300000-0000-4000-8000-000000000001',
  'de000000-0000-4000-8000-000000000001',
  p.id,
  pp.id,
  'active',
  'year',
  'INR',
  pp.amount_minor,
  current_date,
  (current_date + interval '1 year')::date
from public.plans p
join public.plan_prices pp
  on pp.plan_id = p.id
  and pp.currency = 'INR'
  and pp.billing_interval = 'year'
  and pp.effective_until is null
where p.code = 'launch'
on conflict (id) do update set
  plan_id = excluded.plan_id,
  plan_price_id = excluded.plan_price_id,
  status = excluded.status,
  base_amount_minor = excluded.base_amount_minor,
  current_period_start = excluded.current_period_start,
  current_period_end = excluded.current_period_end;

insert into public.subscription_entitlements (
  subscription_id, organization_id, code, enabled, limit_value,
  configuration, source
)
select
  'de300000-0000-4000-8000-000000000001',
  'de000000-0000-4000-8000-000000000001',
  pe.code,
  pe.enabled,
  pe.limit_value,
  pe.configuration,
  'plan'
from public.plan_entitlements pe
join public.plans p on p.id = pe.plan_id
where p.code = 'launch'
on conflict (subscription_id, code) do update set
  enabled = excluded.enabled,
  limit_value = excluded.limit_value,
  configuration = excluded.configuration,
  source = excluded.source;

insert into public.membership_plans (
  id, organization_id, branch_id, code, name, description, duration_value,
  duration_unit, price_amount_minor, joining_fee_amount_minor, currency,
  tax_inclusive, active, sort_order, created_by, updated_by
)
values
  (
    'de400000-0000-4000-8000-000000000001',
    'de000000-0000-4000-8000-000000000001', null, 'MONTHLY',
    'Monthly Unlimited', 'Unlimited gym access for one month.', 1, 'month',
    150000, 50000, 'INR', true, true, 10,
    :'demo_owner_id'::uuid, :'demo_owner_id'::uuid
  ),
  (
    'de400000-0000-4000-8000-000000000002',
    'de000000-0000-4000-8000-000000000001', null, 'QUARTERLY',
    'Quarterly Saver', 'Three months of gym and group classes.', 3, 'month',
    390000, 0, 'INR', true, true, 20,
    :'demo_owner_id'::uuid, :'demo_owner_id'::uuid
  ),
  (
    'de400000-0000-4000-8000-000000000003',
    'de000000-0000-4000-8000-000000000001', null, 'ANNUAL',
    'Annual Unlimited', 'Twelve months of unlimited access.', 1, 'year',
    1200000, 0, 'INR', true, true, 30,
    :'demo_owner_id'::uuid, :'demo_owner_id'::uuid
  )
on conflict (id) do update set
  code = excluded.code,
  name = excluded.name,
  description = excluded.description,
  duration_value = excluded.duration_value,
  duration_unit = excluded.duration_unit,
  price_amount_minor = excluded.price_amount_minor,
  joining_fee_amount_minor = excluded.joining_fee_amount_minor,
  active = excluded.active,
  sort_order = excluded.sort_order,
  updated_by = excluded.updated_by;

insert into public.members (
  id, organization_id, home_branch_id, member_code, full_name, preferred_name,
  email, phone, date_of_birth, gender, status, notes, created_by, updated_by
)
values
  (
    'de500000-0000-4000-8000-000000000001',
    'de000000-0000-4000-8000-000000000001',
    'de100000-0000-4000-8000-000000000001', 'M900001',
    'Aarav Sharma', 'Aarav', 'aarav@gymgrid.local', '+919000000101',
    date '1994-04-18', 'male', 'active', 'Demo member with a partial balance.',
    :'demo_owner_id'::uuid, :'demo_owner_id'::uuid
  ),
  (
    'de500000-0000-4000-8000-000000000002',
    'de000000-0000-4000-8000-000000000001',
    'de100000-0000-4000-8000-000000000001', 'M900002',
    'Isha Menon', 'Isha', 'isha@gymgrid.local', '+919000000102',
    date '1997-09-02', 'female', 'active', 'Demo member with a paid quarterly plan.',
    :'demo_owner_id'::uuid, :'demo_owner_id'::uuid
  ),
  (
    'de500000-0000-4000-8000-000000000003',
    'de000000-0000-4000-8000-000000000001',
    'de100000-0000-4000-8000-000000000001', 'M900003',
    'Kabir Bose', 'Kabir', 'kabir@gymgrid.local', '+919000000103',
    date '1989-12-11', 'male', 'active', 'Demo member with an expired annual plan.',
    :'demo_owner_id'::uuid, :'demo_owner_id'::uuid
  )
on conflict (id) do update set
  full_name = excluded.full_name,
  preferred_name = excluded.preferred_name,
  email = excluded.email,
  phone = excluded.phone,
  date_of_birth = excluded.date_of_birth,
  gender = excluded.gender,
  status = excluded.status,
  notes = excluded.notes,
  updated_by = excluded.updated_by;

insert into public.member_number_counters (organization_id, next_value)
values ('de000000-0000-4000-8000-000000000001', 900004)
on conflict (organization_id) do update
set next_value = greatest(public.member_number_counters.next_value, excluded.next_value);

insert into public.member_memberships (
  id, organization_id, branch_id, member_id, membership_plan_id,
  enrollment_code, start_date, end_date, lifecycle_state, plan_code, plan_name,
  duration_value, duration_unit, price_amount_minor, joining_fee_amount_minor,
  currency, tax_inclusive, notes, created_by, updated_by
)
values
  (
    'de600000-0000-4000-8000-000000000001',
    'de000000-0000-4000-8000-000000000001',
    'de100000-0000-4000-8000-000000000001',
    'de500000-0000-4000-8000-000000000001',
    'de400000-0000-4000-8000-000000000001', 'E900001',
    current_date - 14, current_date + 16, 'open', 'MONTHLY',
    'Monthly Unlimited', 1, 'month', 150000, 50000, 'INR', true,
    'Active demo membership with a remaining balance.',
    :'demo_owner_id'::uuid, :'demo_owner_id'::uuid
  ),
  (
    'de600000-0000-4000-8000-000000000002',
    'de000000-0000-4000-8000-000000000001',
    'de100000-0000-4000-8000-000000000001',
    'de500000-0000-4000-8000-000000000002',
    'de400000-0000-4000-8000-000000000002', 'E900002',
    current_date - 30, current_date + 60, 'open', 'QUARTERLY',
    'Quarterly Saver', 3, 'month', 390000, 0, 'INR', true,
    'Active and fully paid demo membership.',
    :'demo_owner_id'::uuid, :'demo_owner_id'::uuid
  ),
  (
    'de600000-0000-4000-8000-000000000003',
    'de000000-0000-4000-8000-000000000001',
    'de100000-0000-4000-8000-000000000001',
    'de500000-0000-4000-8000-000000000003',
    'de400000-0000-4000-8000-000000000003', 'E900003',
    current_date - 400, current_date - 36, 'open', 'ANNUAL',
    'Annual Unlimited', 1, 'year', 1200000, 0, 'INR', true,
    'Expired demo membership.',
    :'demo_owner_id'::uuid, :'demo_owner_id'::uuid
  )
on conflict (id) do update set
  start_date = excluded.start_date,
  end_date = excluded.end_date,
  lifecycle_state = excluded.lifecycle_state,
  notes = excluded.notes,
  updated_by = excluded.updated_by;

insert into public.enrollment_number_counters (organization_id, next_value)
values ('de000000-0000-4000-8000-000000000001', 900004)
on conflict (organization_id) do update
set next_value = greatest(public.enrollment_number_counters.next_value, excluded.next_value);

insert into public.manual_payments (
  id, organization_id, branch_id, member_id, membership_id, receipt_code,
  amount_minor, currency, payment_date, payment_method,
  transaction_reference, notes, status, created_by
)
values
  (
    'de700000-0000-4000-8000-000000000001',
    'de000000-0000-4000-8000-000000000001',
    'de100000-0000-4000-8000-000000000001',
    'de500000-0000-4000-8000-000000000001',
    'de600000-0000-4000-8000-000000000001', 'R900001', 100000, 'INR',
    current_date - 10, 'upi', 'DEMO-UPI-001', 'Demo partial payment.',
    'recorded', :'demo_owner_id'::uuid
  ),
  (
    'de700000-0000-4000-8000-000000000002',
    'de000000-0000-4000-8000-000000000001',
    'de100000-0000-4000-8000-000000000001',
    'de500000-0000-4000-8000-000000000002',
    'de600000-0000-4000-8000-000000000002', 'R900002', 390000, 'INR',
    current_date - 29, 'cash', null, 'Demo full payment.',
    'recorded', :'demo_owner_id'::uuid
  )
on conflict (id) do update set
  amount_minor = excluded.amount_minor,
  payment_date = excluded.payment_date,
  payment_method = excluded.payment_method,
  transaction_reference = excluded.transaction_reference,
  notes = excluded.notes,
  status = 'recorded',
  void_reason = null,
  voided_at = null,
  voided_by = null;

insert into public.receipt_number_counters (organization_id, next_value)
values ('de000000-0000-4000-8000-000000000001', 900003)
on conflict (organization_id) do update
set next_value = greatest(public.receipt_number_counters.next_value, excluded.next_value);

insert into public.member_check_ins (
  id, organization_id, branch_id, member_id, membership_id,
  checked_in_at, checked_in_local_date, entry_method, recorded_by
)
values
  (
    'de800000-0000-4000-8000-000000000001',
    'de000000-0000-4000-8000-000000000001',
    'de100000-0000-4000-8000-000000000001',
    'de500000-0000-4000-8000-000000000001',
    'de600000-0000-4000-8000-000000000001', now() - interval '45 minutes',
    current_date, 'staff', :'demo_owner_id'::uuid
  ),
  (
    'de800000-0000-4000-8000-000000000002',
    'de000000-0000-4000-8000-000000000001',
    'de100000-0000-4000-8000-000000000001',
    'de500000-0000-4000-8000-000000000002',
    'de600000-0000-4000-8000-000000000002', now() - interval '20 minutes',
    current_date, 'staff', :'demo_owner_id'::uuid
  )
on conflict (id) do update set
  checked_in_at = excluded.checked_in_at,
  checked_in_local_date = excluded.checked_in_local_date,
  recorded_by = excluded.recorded_by;

insert into public.class_programs (
  id, organization_id, branch_id, code, name, description,
  default_duration_minutes, default_capacity, active, created_by, updated_by
)
values
  (
    'de900000-0000-4000-8000-000000000001',
    'de000000-0000-4000-8000-000000000001',
    'de100000-0000-4000-8000-000000000001', 'YOGA', 'Morning Yoga',
    'Mobility and breathwork for all levels.', 60, 2, true,
    :'demo_owner_id'::uuid, :'demo_owner_id'::uuid
  ),
  (
    'de900000-0000-4000-8000-000000000002',
    'de000000-0000-4000-8000-000000000001',
    'de100000-0000-4000-8000-000000000001', 'HIIT', 'HIIT Express',
    'A compact high-intensity conditioning class.', 45, 12, true,
    :'demo_owner_id'::uuid, :'demo_owner_id'::uuid
  )
on conflict (id) do update set
  name = excluded.name,
  description = excluded.description,
  default_duration_minutes = excluded.default_duration_minutes,
  default_capacity = excluded.default_capacity,
  active = excluded.active,
  updated_by = excluded.updated_by;

insert into public.class_sessions (
  id, organization_id, branch_id, class_program_id, start_at, end_at,
  capacity, status, created_by, updated_by
)
values
  (
    'dea00000-0000-4000-8000-000000000001',
    'de000000-0000-4000-8000-000000000001',
    'de100000-0000-4000-8000-000000000001',
    'de900000-0000-4000-8000-000000000001',
    ((current_date + 1)::timestamp + time '07:00') at time zone 'Asia/Kolkata',
    ((current_date + 1)::timestamp + time '08:00') at time zone 'Asia/Kolkata',
    2, 'scheduled', :'demo_owner_id'::uuid, :'demo_owner_id'::uuid
  ),
  (
    'dea00000-0000-4000-8000-000000000002',
    'de000000-0000-4000-8000-000000000001',
    'de100000-0000-4000-8000-000000000001',
    'de900000-0000-4000-8000-000000000002',
    ((current_date + 2)::timestamp + time '18:30') at time zone 'Asia/Kolkata',
    ((current_date + 2)::timestamp + time '19:15') at time zone 'Asia/Kolkata',
    12, 'scheduled', :'demo_owner_id'::uuid, :'demo_owner_id'::uuid
  )
on conflict (id) do update set
  start_at = excluded.start_at,
  end_at = excluded.end_at,
  capacity = excluded.capacity,
  status = 'scheduled',
  cancellation_reason = null,
  cancelled_at = null,
  cancelled_by = null,
  updated_by = excluded.updated_by;

insert into public.class_bookings (
  id, organization_id, branch_id, class_session_id, member_id, status,
  confirmed_at, created_by, updated_by
)
values
  (
    'deb00000-0000-4000-8000-000000000001',
    'de000000-0000-4000-8000-000000000001',
    'de100000-0000-4000-8000-000000000001',
    'dea00000-0000-4000-8000-000000000001',
    'de500000-0000-4000-8000-000000000001', 'booked', now(),
    :'demo_owner_id'::uuid, :'demo_owner_id'::uuid
  ),
  (
    'deb00000-0000-4000-8000-000000000002',
    'de000000-0000-4000-8000-000000000001',
    'de100000-0000-4000-8000-000000000001',
    'dea00000-0000-4000-8000-000000000001',
    'de500000-0000-4000-8000-000000000002', 'booked', now(),
    :'demo_owner_id'::uuid, :'demo_owner_id'::uuid
  )
on conflict (id) do update set
  status = 'booked',
  confirmed_at = excluded.confirmed_at,
  waitlisted_at = null,
  promoted_at = null,
  cancelled_at = null,
  cancelled_by = null,
  cancellation_reason = null,
  updated_by = excluded.updated_by;

commit;

select
  o.slug,
  (select count(*) from public.members m where m.organization_id = o.id) as members,
  (select count(*) from public.member_memberships mm where mm.organization_id = o.id) as memberships,
  (select count(*) from public.manual_payments mp where mp.organization_id = o.id) as payments,
  (select count(*) from public.class_sessions cs where cs.organization_id = o.id) as class_sessions
from public.organizations o
where o.id = 'de000000-0000-4000-8000-000000000001';
