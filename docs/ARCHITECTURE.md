# Architecture

## Technology choices

- **Web:** Next.js App Router, TypeScript, React, and Tailwind CSS.
- **Mobile:** Expo and React Native, introduced after the web/data foundations.
- **Backend:** Supabase Postgres, Auth, Storage, Realtime, and Edge Functions.
- **Shared contracts:** `@gymgrid/domain` TypeScript workspace package.
- **Database changes:** SQL migrations in `supabase/migrations`, never dashboard-only changes.

## Security principles

1. Tenant isolation is enforced in Postgres Row Level Security, not only in web or mobile code.
2. The browser and mobile app only receive public Supabase credentials.
3. Service-role credentials, payment secrets, and messaging credentials remain server-side.
4. Payment data is represented as an immutable ledger; GymGrid never stores card details.
5. Sensitive admin actions are audit logged.
6. Production data is never used in local demo environments.

## Planned application boundaries

```text
Next.js web portal ─┐
Expo mobile app ───┼── Supabase Auth, Postgres, Storage, Realtime, Edge Functions
Reception kiosk ───┘
                         └── Future: Razorpay, email, WhatsApp/SMS, access hardware
```

## Authentication approach

Development and the first pilot use email/password authentication. Phone OTP or WhatsApp authentication is deferred until a messaging provider and its operational cost are approved. A phone number remains a first-class member profile field.

## Region and environments

When Supabase is introduced, development and production will be separate projects in the Mumbai region. Before that, this repository contains only schema and environment templates; it contains no connection details or secrets.
