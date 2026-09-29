# GymGrid Web

This workspace contains the GymGrid web portal: public pages, platform administration, gym administration, reception/kiosk workflows, and the member web portal.

The parent repository contains shared domain contracts, the database migration source, and product documentation. Start with the [root README](../README.md) and [phase plan](../docs/PHASES.md).

## Run locally

From the repository root:

```bash
npm run dev:web
```

Open [http://localhost:3000](http://localhost:3000) with your browser.

On a managed Windows laptop where Node reports `UNABLE_TO_GET_ISSUER_CERT_LOCALLY`, use the operating system certificate store without disabling TLS verification:

```bash
npm run dev:web:system-ca
```

## Checks

Run quality checks from the repository root:

```bash
npm run lint
npm run build:web
```

The local application connects to Supabase with the public project URL and publishable key from `.env.local`. Never place a service-role key in a browser-facing environment variable.
