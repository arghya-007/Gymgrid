# Development phases

## Phase 0 — Local foundation

- Establish the root npm workspace and shared domain package.
- Document product, architecture, pricing, security, and delivery phases.
- Add environment templates and version-controlled Supabase migration folders.
- Keep external services disconnected.

## Phase 1 — Secure SaaS core

- [x] Create organization, branch, user, role, subscription, entitlement, and audit schema.
- [x] Implement the authentication entry point, authorization guards, and Row Level Security policies.
- [x] Build the platform-admin tenant onboarding slice.
- [x] Add cross-tenant security tests.
- [x] Apply the migration to the development Supabase project and execute the rollback-only RLS tests.

The Phase 1 database gate is green: all 16 expected tables have RLS enabled, the four plans are seeded, the onboarding function is present, cross-tenant assertions passed, and test fixtures rolled back to zero rows.

## Phase 2 — Gym administration

- [x] Build the tenant-aware admin shell and dashboard.
- [x] Build the Member CRM list, search, and secure create-member flow.
- [x] Build membership-plan management.
- [x] Build staff management and secure invitation workflows.
- [x] Build lead capture and conversion workflows.

The Phase 2 database and application gate is green: owners, managers, and receptionists can manage only the leads in their authorized branch scope; direct writes and cross-tenant access remain blocked; and lead conversion creates the member record and closes the lead atomically.

## Phase 3 — Operations

- [x] Build secure plan enrolment and date-derived membership status.
- [ ] Build renewals, freezes, cancellations, and membership lifecycle actions.
- [ ] Build manual payment records and receipts.
- [ ] Build member imports.
- [ ] Build check-ins and operational reports.

The first Phase 3 slice preserves plan and price terms on every enrolment, prevents overlapping membership dates, enforces the subscription’s active-member allowance, and limits creation to owners, managers, and receptionists in their authorized branch scope.

## Phase 4 — Scheduling

- Build classes, trainer schedules, capacity rules, waitlists, bookings, kiosk flow, and QR check-in.

## Phase 5 — Android application

- Create the Expo workspace.
- Build member workflows and the owner/staff workspace switcher.
- Add member QR pass, bookings, enrolment, plan changes, and collection actions.

## Phase 6 — Pilot quality

- Add end-to-end tests, mobile validation, security audit, demo tenant, documentation, and controlled pilot onboarding.

## After pilot

- Add live Razorpay with each gym's own merchant account.
- Add email, WhatsApp/SMS, advanced reports, data migration services, and optional integrations.
