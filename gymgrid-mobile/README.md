# GymGrid mobile

GymGrid's Android-first Expo app serves both members and gym staff. One authenticated account can open a member experience, an owner/staff workspace, or both, according to the roles enforced by Supabase Row Level Security.

## Local setup

From the repository root:

```powershell
npm install
Copy-Item gymgrid-mobile\.env.example gymgrid-mobile\.env.local
npm run dev:mobile
```

Set `EXPO_PUBLIC_SUPABASE_URL` and `EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY` in `.env.local`. These are public client values; never add a database password, service-role key, or secret key to the app.

Useful checks:

```powershell
npm run lint --workspace=gymgrid-mobile
npm run typecheck:mobile
npm run doctor:mobile
```

## Current slice

- Persisted Supabase email/password sessions using Expo SQLite storage.
- Protected Expo Router routes.
- Multi-tenant workspace discovery from live organization roles.
- Member versus owner/staff workspace selection.

Member booking, QR pass, membership, and owner operation screens are built in the next Phase 5 slices.
