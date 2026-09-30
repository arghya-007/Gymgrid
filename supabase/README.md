# Database source of truth

The Phase 1 core, all Phase 2 migrations, and the Phase 3 enrolment, lifecycle, manual-payment, and member-import migrations are applied to the development Supabase project. Local public client values live only in the ignored `gymgrid-web/.env.local` file.

- Place reviewed, forward-only SQL migrations in `migrations/`.
- Keep safe demo-only data in `seed.sql`.
- Do not put connection strings, API keys, service-role keys, or production exports here.
- Do not make schema changes only in the Supabase dashboard; every change must be represented by a migration in this repository.

## Phase 1 contents

- `migrations/202609300001_secure_saas_core.sql` contains the tenant, role, subscription, entitlement, invitation, audit, and Row Level Security foundation.
- `tests/phase1_rls.sql` is a transaction-based cross-tenant isolation test for a disposable local database.
- `seed.sql` remains production-data-free.

## Phase 2 Member CRM contents

- `migrations/202609300002_member_crm.sql` contains the member record, per-organization member counter, branch-role authorization helper, secured create-member function, audit trigger, and RLS policy.
- `tests/phase2_member_crm_rls.sql` verifies owner and receptionist creation, blocks member-role and cross-tenant creation, blocks direct inserts, and rolls all fixtures back.

## Phase 2 membership-plan contents

- `migrations/202609300003_membership_plans.sql` contains organization-wide and branch-specific gym membership plans, INR minor-unit pricing, duration and tax fields, audit triggers, secured create/update functions, and RLS.
- `tests/phase2_membership_plans_rls.sql` verifies owner and assigned-branch manager workflows, member visibility, deactivation, and direct-write, receptionist, organization-scope, and cross-tenant protections. All fixtures are transactionally rolled back.

## Phase 2 staff-management contents

- `migrations/202609300004_staff_management.sql` contains entitlement-aware staff invitations, exact-email acceptance, branch-scoped role grants, invitation revocation, staff suspension/restoration, audit coverage, and privilege-escalation guards.
- `tests/phase2_staff_management_rls.sql` verifies owner and manager role boundaries, direct-write and cross-tenant blocking, exact-email acceptance, scoped role creation, revocation, and suspension. All fixtures are transactionally rolled back.

## Phase 2 lead-management contents

- `migrations/202609300005_lead_management.sql` contains tenant and branch-scoped leads, per-organization lead numbering, India-aware phone normalization, source and follow-up tracking, secured create/update functions, atomic lead-to-member conversion, audit coverage, and RLS.
- `tests/phase2_lead_management_rls.sql` verifies owner and receptionist workflows, direct-write, member-role, and cross-tenant protections, and atomic member creation. All fixtures are transactionally rolled back.

## Phase 3 member-enrolment contents

- `migrations/202609300006_member_enrollments.sql` contains immutable plan and price snapshots, per-organization enrolment numbering, date-derived membership status, overlap prevention, active-member allowance enforcement, audit coverage, and branch-scoped RLS.
- `tests/phase3_member_enrollments_rls.sql` verifies owner and receptionist enrolment, plan snapshot history, date calculation, overlap prevention, and direct-write, member-role, and cross-tenant protections. All fixtures are transactionally rolled back.

## Phase 3 membership-lifecycle contents

- `migrations/202609300007_membership_lifecycle.sql` contains linked renewals, timezone-aware status calculation, audited freezes and resumes, end-date extensions, cancellation history, branch authorization, and overlap prevention.
- `tests/phase3_membership_lifecycle_rls.sql` verifies owner and receptionist workflows, renewal lineage, frozen-day extension, cancellation history, direct-write, member-role, and cross-tenant protections. All fixtures are transactionally rolled back.

## Phase 3 manual-payment contents

- `migrations/202609300008_manual_payments.sql` contains partial manual collections, membership balances, organization receipt numbering, payment-method metadata, immutable receipt records, audited voiding, and branch-scoped RLS.
- `tests/phase3_manual_payments_rls.sql` verifies authorized owner and receptionist collection, balance calculations, overpayment rejection, restricted voiding, member-role and cross-tenant denial, and rollback cleanup.

## Phase 3 member-import contents

- `migrations/202609300009_member_imports.sql` contains audited import-batch metadata, source linkage on member records, a 500-row transaction limit, India-aware phone normalization, duplicate detection, branch authorization, and a secured atomic import function.
- `tests/phase3_member_imports_rls.sql` verifies owner and receptionist imports, imported-member linkage, duplicate rejection, direct-write blocking, member-role and cross-tenant denial, and rollback cleanup.

When the Supabase CLI and Docker are available, initialize a local stack and repeat the database test there. The first platform administrator must be bootstrapped manually as described in `docs/SECURITY.md`; no personal user ID belongs in a migration.

## First CLI connection

The first nine migrations were applied through the SQL editor because the company laptop does not have the Supabase CLI or Docker. The schema is verified, but the CLI migration-history table has not been initialized. On the first CLI-capable computer, repair the history **before** running `db push`:

```bash
supabase login
supabase link --project-ref eeonwzudmbsyhvfcvcba
supabase migration repair --status applied 202609300001
supabase migration repair --status applied 202609300002
supabase migration repair --status applied 202609300003
supabase migration repair --status applied 202609300004
supabase migration repair --status applied 202609300005
supabase migration repair --status applied 202609300006
supabase migration repair --status applied 202609300007
supabase migration repair --status applied 202609300008
supabase migration repair --status applied 202609300009
supabase migration list
```

The final command must show all nine versions in the local and remote columns. Future schema changes should then be deployed with migration files and `supabase db push`, not pasted into the dashboard.
