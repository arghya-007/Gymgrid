# Controlled pilot runbook

This runbook is the release gate for the first real-gym pilot. It deliberately keeps payment gateways, messaging providers, and public self-registration out of scope.

## 1. Isolate the pilot

- Create a separate Supabase project for the pilot; never reuse the development project.
- Enable database backups before entering real member data and record who can restore them.
- Create separate preview and production deployments with separate public Supabase URL and publishable-key values.
- Keep service-role keys out of GitHub, Vercel client variables, Expo variables, screenshots, and support messages.
- Restrict Supabase and deployment-console access to named operators with multi-factor authentication.

## 2. Release gate

From the repository root, the candidate commit must pass:

```bash
npm ci
npm audit --audit-level=high
npm run lint
npm run typecheck:domain
npm run typecheck:mobile
npm run doctor:mobile
npm run build:web
cd gymgrid-mobile && npx expo export --platform all --output-dir dist
```

The GitHub `Quality gates` workflow repeats these checks without production secrets. Run every migration and its matching transaction-based test against a disposable project first. Confirm the final verification query reports zero fixture rows.

Use `docs/TESTING_AND_DEPLOYMENT.md` for the exact Vercel, custom-domain, Expo/EAS, and cloud acceptance steps.

## 3. Create the pilot gym

1. Create the gym owner's Auth user in the pilot Supabase dashboard with a temporary password delivered through a private channel.
2. Bootstrap the first GymGrid platform administrator as documented in `docs/SECURITY.md`.
3. Use the platform console to onboard the organization, owner, base subscription, active-member allowance, and first branch.
4. Ask the owner to change the temporary password directly in Supabase's recovery flow; GymGrid operators must never know the replacement.
5. Create only the staff roles the gym needs and verify branch assignment before sending each invitation.

## 4. Load and validate data

- For a rehearsal, create a disposable Auth user and load the credential-free `supabase/demo/seed_demo.sql` tenant as documented in `supabase/demo/README.md`.
- Start with a small reviewed CSV import. Compare imported totals and rejected rows with the source file.
- Create plans and verify duration, tax-inclusive price, currency, branch availability, and active status.
- Enrol two test members, record a partial payment, renew one membership, and exercise freeze/resume/cancel on test-only records.
- Create a class, book to capacity, verify the waitlist promotion order, rotate a member QR pass, and perform a kiosk check-in.
- Run the daily operations report and reconcile check-ins and collections with the test actions.

## 5. Member app activation

The pilot currently uses controlled Auth provisioning; public sign-up and automated email delivery are intentionally not enabled.

1. The gym owner or authorized staff opens an active member in the mobile staff workspace and selects **Invite to member app**.
2. Confirm the exact email the member will use, then create the seven-day invitation.
3. Create that email's Auth user in the pilot Supabase dashboard and provide a temporary password privately.
4. When the member signs in, GymGrid atomically accepts the invitation, adds only the invited member role, and links that Auth account to the exact member.
5. Verify the member can see only their own memberships, payments, classes, and QR pass. Verify they cannot enter staff routes.

Never reuse one email for multiple member records in the same gym. Reissue an expired invitation from the member profile.

## 6. Go-live checks

- Test owner, manager, receptionist, accountant, trainer, and member access with separate accounts.
- Test one user with both a member role and a staff role and verify the workspace switcher.
- Test a suspended user and confirm a new invitation cannot restore access.
- Verify Android on at least one supported physical device and verify the web portal at desktop and narrow widths.
- Verify member photo consent, camera/gallery upload, replacement, removal, and cross-tenant denial on web and Android.
- Record the deployed commit, migration list, environment owners, backup status, pilot contacts, and rollback decision-maker.

## 7. Incident and rollback

- For suspected account misuse, suspend the organization user first; do not delete audit records.
- Revoke pending invitations and rotate the affected user's password/session through Supabase Auth.
- Stop new writes by taking the deployment offline when data integrity is uncertain.
- Preserve the incident time range, actor IDs, organization ID, and relevant audit-log rows before repair.
- Roll back application code to the last green commit. Database migrations are forward-only: create and test a corrective migration rather than manually removing production schema.

## Current pilot boundaries

- No Razorpay or other live online payment processing.
- No automated email, WhatsApp, or SMS delivery.
- No public member registration or self-service password creation.
- Android is the launch target; iOS export is a compatibility check, not a launch commitment.
- Dependency audit exceptions and release conditions are recorded in `docs/SECURITY_REVIEW.md`.
