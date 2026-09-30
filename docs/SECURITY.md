# Security model

## Trust boundaries

- Supabase Auth establishes identity; authorization is always rechecked against Postgres.
- Row Level Security is the tenant boundary. UI visibility and Next.js route guards are usability layers, not the final control.
- Platform administrators are stored separately from organization roles.
- Browser and mobile clients use only Supabase public credentials. Service-role credentials must never be exposed to either client.
- Tenant onboarding is an atomic database function that verifies the caller is an active platform administrator.
- Audit records cannot be updated or deleted through normal database operations.

## Authorization summary

| Resource | Platform admin | Gym owner | Gym manager | Other tenant roles |
| --- | --- | --- | --- | --- |
| Organizations | Manage all | Read own | Read own | Read own |
| Branches | Manage all | Create/update own | Create/update own when organization-wide | Read assigned scope |
| Tenant users and roles | Manage all | Invite and manage non-owner staff | Invite and manage lower roles when organization-wide | Read self |
| SaaS subscriptions | Manage all | Read own | Read own when organization-wide | Accountant can read own |
| Audit log | Read all | Read own organization | No access | No access |
| Plan catalogue | Manage | Read | Read | Read |
| Leads | Read all | Manage own organization | Manage assigned scope | Receptionist manages assigned scope; others have no access |
| Member memberships | Read all | Manage lifecycle in own organization | Manage lifecycle in assigned scope | Receptionist manages assigned scope; trainer/accountant read assigned scope |
| Manual payments | Read all | Record and void in own organization | Record and void in assigned scope | Receptionist records assigned-scope payments; accountant records and voids; others have no access |
| Member imports | Read all | Import into own organization | Import into assigned scope | Receptionist imports into assigned scope; others have no access |
| Member check-ins | Read all | Record in own organization | Record in assigned scope | Receptionist records in assigned scope; others have no access |
| Class schedules | Read all | Manage types and sessions in own organization | Manage types and sessions in assigned scope | Receptionist schedules/cancels assigned-scope sessions; trainers and members have read-only assigned-scope access |

Direct tenant-side membership, role, invitation, membership-plan, and lead writes remain blocked. Phase 2 exposes narrowly scoped security-definer functions: owners may invite managers and lower staff roles, organization-wide managers may invite only lower roles, and neither can grant gym-owner access. Invitations activate only after an authenticated user signs in with the exact invited email. Suspension and invitation revocation follow the same role hierarchy. Lead creation and updates require an owner, manager, or receptionist role in the selected branch; conversion creates the member and marks the lead won in one database transaction.

## First platform administrator

The first platform administrator is a deliberate bootstrap action. After creating the user in the development Supabase Auth project, run the following once from an administrator SQL session, replacing the placeholder with that Auth user ID:

```sql
insert into public.platform_administrators (user_id, granted_by)
values ('AUTH_USER_UUID', 'AUTH_USER_UUID');
```

After bootstrap, platform administrators may manage other platform administrators through audited application workflows added later. Never place a real user ID in a migration or seed file.

## Verification gate

`supabase/tests/phase1_rls.sql` creates two isolated tenants inside a transaction and verifies that:

1. A tenant owner sees only their organization and branch.
2. A tenant owner cannot update another tenant.
3. A tenant owner cannot directly add users or grant roles.
4. A platform administrator sees all tenants and can call the atomic onboarding function.

The test rolls back all fixtures and must run against a disposable local database, never production.

Each Phase 2 migration has a matching transaction-based test under `supabase/tests/`. The lead-management test covers authorized creation and updates, direct-write and cross-tenant blocking, denial for member roles, and atomic lead-to-member conversion. Every fixture is rolled back.

Phase 3 membership writes also remain function-only. `enroll_member` rechecks organization, branch, member, plan, role, overlapping dates, and active-member allowance inside one transaction. The browser never supplies plan prices or calculated end dates; Postgres derives and snapshots them from the authorized plan record. `renew_membership`, `freeze_membership`, `resume_membership`, and `cancel_membership` repeat branch-role authorization in Postgres, preserve history and actor attribution, use the organization timezone, and prevent a resumed membership from overlapping a later enrolment.

Manual payment writes are function-only. `record_manual_payment` locks the membership balance before accepting a partial payment, prevents overpayment, derives currency and member scope from the membership, and allocates an organization-specific receipt number. Receipts cannot be edited or deleted; authorized finance roles use `void_manual_payment`, which preserves the original amount and actor-attributed correction reason.

Member imports are function-only. The web application validates the CSV for a useful preview, but `import_members` repeats text, phone, email, date, gender, role, organization, and branch validation in Postgres. It serializes concurrent imports per organization, rejects duplicate contacts, and creates the batch and every member in one transaction. Authenticated clients can read authorized batch metadata but cannot insert batch rows directly.

Check-in writes are function-only. `record_member_check_in` repeats staff role, organization, branch, active-member, active-membership, and local-date checks in Postgres. An advisory lock serializes scans for one member and rejects repeated same-branch entries inside two minutes. `get_operational_report` accepts at most 93 days and permits only owners or managers in the requested scope; collection totals exclude voided receipts.

Class scheduling and booking writes are function-only. `save_class_program`, `schedule_class_session`, and `cancel_class_session` recheck tenant role and branch scope in Postgres. Session creation derives the UTC interval from the organization's timezone and the authorized class type, validates the assigned trainer's active branch role, and uses an advisory lock to reject concurrent or existing trainer overlaps. `book_class_session` locks the session before allocating capacity, checks that the member's membership covers the class date, and moves overflow into an ordered waitlist. `cancel_class_booking` promotes the oldest waiter in the same transaction. Linked member users can act only on their own member record; staff permissions remain branch-scoped. Authenticated tenant users cannot write any scheduling or booking table directly.

Member QR tokens are random, rotatable bearer identifiers and are never sent to an external QR-generation service. `rotate_member_qr_pass` invalidates the previous token inside the same transaction and permits only authorized branch staff or the linked member. `record_class_qr_check_in` requires a signed-in owner, manager, receptionist, or trainer in the class branch, an active pass, a confirmed booking, and the configured check-in window. Duplicate scans return the immutable existing check-in, and a database trigger prevents individual cancellation after attendance is recorded.
