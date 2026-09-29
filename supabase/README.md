# Database source of truth

The Phase 1 migration is applied to the development Supabase project. Local public client values live only in the ignored `gymgrid-web/.env.local` file.

- Place reviewed, forward-only SQL migrations in `migrations/`.
- Keep safe demo-only data in `seed.sql`.
- Do not put connection strings, API keys, service-role keys, or production exports here.
- Do not make schema changes only in the Supabase dashboard; every change must be represented by a migration in this repository.

## Phase 1 contents

- `migrations/202609300001_secure_saas_core.sql` contains the tenant, role, subscription, entitlement, invitation, audit, and Row Level Security foundation.
- `tests/phase1_rls.sql` is a transaction-based cross-tenant isolation test for a disposable local database.
- `seed.sql` remains production-data-free.

When the Supabase CLI and Docker are available, initialize a local stack and repeat the database test there. The first platform administrator must be bootstrapped manually as described in `docs/SECURITY.md`; no personal user ID belongs in a migration.

## First CLI connection

The initial migration was applied through the SQL editor because the company laptop does not have the Supabase CLI or Docker. The schema is verified, but the CLI migration-history table has not been initialized. On the first CLI-capable computer, repair the history **before** running `db push`:

```bash
supabase login
supabase link --project-ref eeonwzudmbsyhvfcvcba
supabase migration repair --status applied 202609300001
supabase migration list
```

The final command must show `202609300001` in both the local and remote columns. Future schema changes should then be deployed with migration files and `supabase db push`, not pasted into the dashboard.
