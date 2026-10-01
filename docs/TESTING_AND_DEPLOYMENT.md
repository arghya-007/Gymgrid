# GymGrid testing and deployment guide

This is the owner runbook for taking GymGrid from a local checkout to a controlled web and Android pilot. Use test people and fictional member data until every release gate passes. Do not put Supabase database passwords, service-role keys, real member exports, or temporary user passwords in GitHub, Vercel, Expo, screenshots, or support chats.

## Recommended low-cost topology

| Surface | Pilot service | Suggested address |
| --- | --- | --- |
| Database, Auth, private member photos | Supabase pilot project | Project-managed URL |
| Gym owner/staff web portal | Vercel | `app.yourdomain.com` |
| Future SEO/marketing site | Vercel, later | `yourdomain.com` and `www.yourdomain.com` |
| Android pilot app | Expo EAS internal distribution | Private install URL/APK |
| Source and automated quality checks | GitHub | `arghya-007/Gymgrid` |

Keeping the product portal on `app.yourdomain.com` leaves the root domain available for the future SEO website. The current web build deliberately sends `noindex` and disallows crawlers because it is an authenticated pilot product. Remove that protection only when the public marketing site is ready.

## 1. Accounts and tools you need

- A GitHub account with access to the GymGrid repository.
- A Supabase project for the pilot. Use a separate production project later.
- A Vercel account connected to GitHub.
- An Expo account. EAS Build is available on the Expo free plan, subject to its current quotas.
- Your domain registrar or DNS provider login.
- On the personal desktop: Node.js 22+, npm 10+, Git, and preferably the Supabase CLI.

Do not send account passwords or secret keys to Codex. Public Supabase project URLs and publishable keys are designed for client applications; database passwords and service-role/secret keys are not.

## 2. One-time Supabase migration-history repair

The first fifteen migrations were originally applied through the dashboard. Do this once from a trusted personal desktop before using `db push`:

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
supabase migration repair --status applied 202609300010
supabase migration repair --status applied 202609300011
supabase migration repair --status applied 202610010012
supabase migration repair --status applied 202610010013
supabase migration repair --status applied 202610010014
supabase migration repair --status applied 202610010015
supabase migration repair --status applied 202610010016
supabase migration list
```

All sixteen migrations, including the member-profile/photo migration, are already applied to the existing development project through the SQL Editor. Confirm that all sixteen versions appear in both the local and remote columns. For future migrations, preview and apply only the pending files:

```bash
supabase db push --dry-run
supabase db push
supabase migration list
```

Migration `202610010016_member_profiles_and_photos.sql` creates a private `member-photos` bucket, Storage RLS policies, member consent/photo fields, and secured profile/photo functions. On a brand-new pilot or production project, `supabase db push` applies all sixteen migrations in order; do not mark a migration as applied unless its SQL is already present in that exact project.

Do not run `supabase db reset --linked`; that command destroys and rebuilds the linked remote database. Supabase's supported migration flow is documented at <https://supabase.com/docs/guides/deployment/database-migrations>.

### Company-laptop fallback

If a future migration must be applied through the company laptop, open the Supabase SQL Editor and run the complete migration file once. Record that it was applied, then repair only that exact version on the personal desktop. Migration `016` has already been applied and verified in the current development project:

```bash
supabase migration repair --status applied 202610010016
supabase migration list
```

The rollback test `supabase/tests/phase6_member_profiles_and_photos_rls.sql` has passed in the current development project. Run it again for every new pilot or production project after migrations are applied. It runs inside a transaction and ends with `rollback`; a successful run shows no error and leaves no fixture rows.

## 3. Local release gate

From the repository root:

```bash
npm ci
npm audit --audit-level=high
npm run lint
npm run typecheck:domain
npm run typecheck:mobile
npm run doctor:mobile
npm run build:web
cd gymgrid-mobile
npx expo export --platform all --output-dir dist
```

On a Cognizant-managed machine, Node may need the company certificate store:

```powershell
$env:NODE_OPTIONS='--use-system-ca'
npm run doctor:mobile
Remove-Item Env:NODE_OPTIONS
```

The GitHub `Quality gates` workflow repeats the credential-free checks on every push to `main` and every pull request.

## 4. Local web testing

1. Copy `gymgrid-web/.env.example` to `gymgrid-web/.env.local`.
2. Set the pilot Supabase URL and publishable key.
3. Keep `NEXT_PUBLIC_SITE_URL=http://localhost:3000` locally.
4. Run `npm run dev:web` from the repository root.
5. Open <http://localhost:3000/login>.

Use separate Auth accounts for a platform administrator, gym owner, manager, receptionist, trainer, accountant, and member. Do not reuse one browser session when checking role isolation; use private windows or separate browser profiles.

### Required web acceptance test

1. Platform admin creates a test organization and first branch.
2. Owner creates a plan and a member.
3. Owner opens the member and edits their contact/profile fields.
4. Confirm the member's data-consent checkbox, save, and reopen the profile.
5. In **Edit profile**, confirm photo consent and upload a JPG or PNG.
6. Verify the photo appears on the member profile, survives a page refresh, can be replaced, and can be removed.
7. Verify a receptionist assigned to that branch can manage the member.
8. Verify a user from another organization cannot open the member URL or signed photo URL.
9. Enrol the member, record a partial payment, print the receipt, renew, freeze, resume, and cancel test memberships.
10. Create a class, fill it to capacity, verify waitlist promotion, rotate a member QR pass, and perform a kiosk check-in.
11. Run collections and attendance reports and reconcile them with the actions above.

## 5. Local Android testing with Expo Go

1. Copy `gymgrid-mobile/.env.example` to `gymgrid-mobile/.env.local`.
2. Set the same pilot Supabase public URL and publishable key.
3. Install Expo Go on the Android test phone.
4. Put the computer and phone on the same network.
5. Run `npm run dev:mobile` from the repository root and scan the QR code.

Test both an owner/staff account and a linked member account. For member photos, verify gallery selection, camera capture, the consent confirmation, compression/upload, replacement, removal, and rendering after a fresh sign-in.

If the company network blocks local device discovery, use an EAS preview build instead of weakening firewall or certificate controls.

## 6. Deploy the web portal to Vercel

1. Push the release branch to GitHub and merge it only after GitHub quality checks pass.
2. In Vercel choose **Add New → Project** and import `arghya-007/Gymgrid`.
3. Set **Root Directory** to `gymgrid-web`.
4. Keep the detected framework as Next.js. The normal build command is `npm run build`.
5. Add these variables to both Preview and Production:
   - `NEXT_PUBLIC_SUPABASE_URL`
   - `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`
   - `NEXT_PUBLIC_SITE_URL`
6. For the first preview, set `NEXT_PUBLIC_SITE_URL` to the generated HTTPS Vercel preview address.
7. Deploy and verify `/`, `/login`, a protected redirect, and a complete owner workflow.

Vercel creates Preview deployments from branches and a Production deployment from the configured production branch. Official environment guidance: <https://vercel.com/docs/deployments/environments>.

### Connect the domain

Use `app.yourdomain.com` for the operational portal:

1. Open Vercel project **Settings → Domains**.
2. Add `app.yourdomain.com`.
3. At the domain registrar, create exactly the DNS record Vercel displays. Do not copy a record from an old guide because providers and verification requirements differ.
4. Wait until Vercel reports the domain as valid and HTTPS is issued.
5. Change Production `NEXT_PUBLIC_SITE_URL` to `https://app.yourdomain.com` and redeploy.
6. In Supabase **Authentication → URL Configuration**, set the Site URL to `https://app.yourdomain.com` and add the exact Vercel preview/custom-domain redirect URLs that you intend to use for future recovery flows.

Keep the root domain and `www` unconnected or on a simple coming-soon page until the SEO site is built. Do not point both the root and `app` hostnames at different uncoordinated copies of the authenticated portal.

Vercel's current CLI/domain flow is documented at <https://vercel.com/docs/projects/deploy-from-cli>.

## 7. Create an installable Android preview with Expo EAS

The repository already contains `gymgrid-mobile/eas.json` with an internal `preview` profile and a production profile. The Android application ID is `in.gymgrid.app`; treat it as permanent once a Play Console listing exists.

From `gymgrid-mobile` on the personal desktop:

```bash
npx eas-cli@latest login
npx eas-cli@latest init
npx eas-cli@latest env:create --environment preview --name EXPO_PUBLIC_SUPABASE_URL
npx eas-cli@latest env:create --environment preview --name EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY
npx eas-cli@latest build --platform android --profile preview
```

`eas init` links the local app to your Expo project and writes the generated EAS project ID into app configuration. For each `env:create` prompt, enter the pilot project's public value and choose an appropriate visibility; these values are compiled into the client and must never be service-role secrets.

The preview profile creates an installable Android APK and returns a private build page/link. Open that link on the test phone, allow installation from the chosen browser when Android asks, install GymGrid, and then turn that temporary permission back off. Expo's internal-distribution guide is at <https://docs.expo.dev/build/internal-distribution/>.

Before Play Store testing, create a separate production Supabase project and production EAS environment, then build the default Android App Bundle:

```bash
npx eas-cli@latest env:create --environment production --name EXPO_PUBLIC_SUPABASE_URL
npx eas-cli@latest env:create --environment production --name EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY
npx eas-cli@latest build --platform android --profile production
```

Do not submit the production build until privacy documents, account deletion, monitoring, backup restore, billing/legal review, and the release checklist are complete.

## 8. Cloud acceptance test

Run this on the Vercel custom domain and the EAS preview APK, not only locally:

- Sign in/out and confirm sessions survive a page/app restart.
- Test owner, manager, receptionist, trainer, accountant, member, and dual-role accounts.
- Confirm every role sees only its organization and assigned branches.
- Create, edit, photograph, enrol, renew, freeze, resume, cancel, and collect payment for test members.
- Confirm a linked member sees only their own memberships, payments, classes, and QR pass.
- Test camera/gallery permission denial as well as approval.
- Test a slow or disconnected network and verify errors are understandable and no duplicate payment/check-in is created.
- Test desktop Chrome, Android Chrome, and at least one physical Android device.
- Confirm the private photo URL expires and cannot be listed or accessed by an unrelated signed-in account.
- Check Vercel function logs without logging names, phone numbers, photographs, or other member PII.
- Record the tested Git commit, migration versions, Vercel deployment, EAS build ID, tester, and result.

## 9. Rollback

- Application: redeploy the last known-good Vercel deployment or revert through a new Git commit.
- Android: keep the last known-good EAS APK link available to pilot operators. A native change needs a new build.
- Database: migrations are forward-only. Fix a schema problem with a reviewed corrective migration; do not edit migration `016` after it has been applied.
- Suspected account misuse: suspend the organization user, revoke invitations/sessions, and preserve audit records.
- Suspected data issue: stop new writes, record the time range and tenant IDs, take a backup, then investigate.

## 10. Information Codex will need for the final assisted setup

You may provide these non-secret identifiers when ready:

- The exact domain name and preferred app subdomain.
- The Vercel project name or deployment URL.
- The Expo project slug/URL after `eas init`.
- Confirmation that migration `202610010016` appears in `supabase migration list`.
- Test account email addresses and roles, but never their passwords in Git or documentation.

Keep all password entry and account-console confirmations on your side. Codex can inspect the deployed public pages, review build logs you share, and guide each dashboard step without needing ownership of your accounts.
