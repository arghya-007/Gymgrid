# GymGrid

GymGrid is an India-first, multi-tenant SaaS platform for gyms and fitness studios. It gives GymGrid staff a platform administration console, each gym a complete web management portal, and gym members an Android-first app.

## Workspace layout

```text
gymgrid-web/       Next.js web portal: public site, platform admin, gym admin, kiosk, member web portal
gymgrid-mobile/    Expo Android app: member and owner/staff workspaces
packages/domain/   Shared roles, tenant scope, subscription and entitlement contracts
supabase/          Version-controlled database migrations and safe demo seed data
docs/              Product, architecture, security and phase plans
```

## Development status

Phases 1 through 5 are complete and verified against the development Supabase project. Phase 6 pilot hardening is in progress: member app invitations are linked atomically, private consent-backed member photos and editable web profiles are versioned, automated quality gates cover both clients, and the controlled-pilot and deployment runbooks are versioned. Online payment providers, messaging, and production infrastructure remain disconnected.

## Local commands

Run these commands from this repository root after dependencies are installed:

```bash
npm run dev:web
npm run dev:web:system-ca
npm run dev:mobile
npm run lint
npm run build:web
npm run typecheck:domain
npm run typecheck:mobile
npm run doctor:mobile
```

Read [the development plan](docs/PHASES.md) before starting a new feature.
Use [the pilot runbook](docs/PILOT.md) before onboarding a real gym, and review [the pilot security assessment](docs/SECURITY_REVIEW.md) before every release candidate.
Follow [the testing and deployment guide](docs/TESTING_AND_DEPLOYMENT.md) for Supabase migration history, Vercel previews, a custom app subdomain, Expo/EAS Android builds, acceptance tests, and rollback.

Before using the authenticated routes, copy `gymgrid-web/.env.example` to `gymgrid-web/.env.local` and add values from a development-only Supabase project. See [the security model](docs/SECURITY.md) for platform-admin bootstrap and tenant-isolation verification.

The mobile app has its own environment template at `gymgrid-mobile/.env.example`. Use the same development Supabase public URL and publishable key; never copy server-only credentials into either client.
