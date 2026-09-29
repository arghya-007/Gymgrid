# GymGrid

GymGrid is an India-first, multi-tenant SaaS platform for gyms and fitness studios. It gives GymGrid staff a platform administration console, each gym a complete web management portal, and gym members an Android-first app.

## Workspace layout

```text
gymgrid-web/       Next.js web portal: public site, platform admin, gym admin, kiosk, member web portal
packages/domain/   Shared roles, tenant scope, subscription and entitlement contracts
supabase/          Version-controlled database migrations and safe demo seed data
docs/              Product, architecture, security and phase plans
```

The Expo mobile workspace will be introduced in Phase 5, after the authenticated web and database foundations are stable.

## Development status

Phase 1 is in progress. The secure tenant schema, RLS policies, authentication entry point, and platform-admin onboarding slice are checked in locally. No cloud service, deployment target, payment provider, or production database has been connected.

## Local commands

Run these commands from this repository root after dependencies are installed:

```bash
npm run dev:web
npm run lint
npm run build:web
npm run typecheck:domain
```

Read [the development plan](docs/PHASES.md) before starting a new feature.

Before using the authenticated routes, copy `gymgrid-web/.env.example` to `gymgrid-web/.env.local` and add values from a development-only Supabase project. See [the security model](docs/SECURITY.md) for platform-admin bootstrap and tenant-isolation verification.
