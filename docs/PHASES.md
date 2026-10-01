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
- [x] Build renewals, freezes, cancellations, and membership lifecycle actions.
- [x] Build manual payment records and receipts.
- [x] Build member imports.
- [x] Build check-ins and operational reports.

The completed Phase 3 slices preserve plan and price terms on every enrolment, prevent overlapping membership dates, enforce the subscription’s active-member allowance, add audited lifecycle workflows, and provide partial-payment collection with immutable printable receipts and audited voids. Payment collection is limited to authorized owners, managers, receptionists, and accountants; only owners, managers, and accountants may void a receipt. CSV imports validate and normalize up to 500 members before committing the entire batch atomically, with duplicate detection and branch-scoped authorization repeated inside Postgres.

The Phase 3 gate is green: check-ins require an active same-branch membership, repeated scans inside two minutes are rejected, owners and managers can run branch-scoped or organization-wide daily reports, direct writes remain blocked, and the live rollback test left no fixture data behind.

## Phase 4 — Scheduling

- [x] Build class types, trainer schedules, capacity snapshots, overlap protection, and audited cancellation.
- [x] Build member bookings and automatic waitlist promotion.
- [x] Build the kiosk flow and QR class check-in.

The first Phase 4 slice is live. Owners and managers can define branch-scoped class types; owners, managers, and receptionists can schedule and cancel sessions in the gym timezone. Postgres validates the trainer's active branch scope, serializes trainer scheduling, rejects overlapping sessions, snapshots capacity, and keeps all direct tenant writes blocked.

The booking slice is also live. Capacity is serialized on the class session row, overflow bookings join an ordered waitlist, and cancelling a confirmed place promotes the oldest waiter atomically. Eligibility is checked against the membership dates for the class date. Staff can manage rosters in the gym portal, while linked member accounts may book and cancel only their own record through the secured database functions used by the upcoming app.

The Phase 4 gate is green. Member QR passes are rotatable and immediately revoke the prior token, kiosk access requires a signed-in authorized staff or trainer role, check-in requires a confirmed booking inside the class window, repeated scans are idempotent, and checked-in bookings cannot be individually cancelled. Direct table writes remain blocked, and the live rollback tests left no fixtures behind.

## Phase 5 — Android application

- [x] Create the Expo workspace with persisted authentication and protected routes.
- [x] Build the role-aware owner/staff and member workspace switcher foundation.
- [x] Build member class bookings, QR pass, membership history, and payment history.
- [x] Build the mobile owner/staff member directory, creation, and plan enrolment flow.
- [x] Add mobile membership renew, freeze, cancel, and payment collection actions.

The Phase 5 member slice is live. The Android-first client uses the same public Supabase project and RLS boundary as the web portal, persists sessions locally with Expo SQLite, discovers every active tenant role for the signed-in user, and exposes separate member and owner/staff modes without duplicating accounts. Linked members can now book or cancel classes, manage a rotating QR pass, and review only their own preserved membership terms and payment receipts. The live self-service RLS test passed and rolled all fixtures back to zero.

The first owner/staff mobile slice is also ready. Authorized staff can search their branch-scoped member directory, create a normalized member contact, inspect preserved membership and balance history, and assign an active compatible plan through the same secured database functions as the web portal. Role capability checks control each entry point while Postgres remains the final authorization boundary.

The Phase 5 MVP gate is green. Authorized owners, managers, and receptionists can now renew, freeze, resume, or cancel a membership from the app; authorized collection roles can view recent receipts and record a payment only up to the current outstanding balance. Android, iOS, and web production exports complete with all protected routes included.

## Phase 6 — Pilot quality

- [x] Add owner/staff member app invitations with exact-email account linking.
- [x] Add rollback-only invitation, linkage, denial, and suspended-account database tests.
- [x] Add automated web/mobile lint, type-check, build, export, Doctor, and dependency gates.
- [x] Add pilot operations and security-review runbooks.
- [ ] Add a reproducible demo tenant and browser end-to-end smoke suite.
- [ ] Execute controlled pilot onboarding with a separate pilot Supabase project and real devices.

The first Phase 6 checkpoint is live. An authorized owner, manager, or receptionist can prepare app access for an active member in their branch scope. The account is linked only when the exact invited email signs in, and a suspended organization user cannot use a new invitation to regain access. The live rollback test passed and left all fixtures at zero.

## After pilot

- Add live Razorpay with each gym's own merchant account.
- Add email, WhatsApp/SMS, advanced reports, data migration services, and optional integrations.
