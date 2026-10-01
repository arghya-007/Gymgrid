# Demo tenant seed

`seed_demo.sql` creates or refreshes a deterministic `gymgrid-demo` tenant without creating an Auth user, storing a password, or granting platform-administrator access.

Create a disposable Auth user in a local or development-only Supabase project, copy its UUID, then run:

```bash
psql "$DATABASE_URL" -v demo_owner_id=AUTH_USER_UUID -f supabase/demo/seed_demo.sql
```

The script stops if the Auth user does not exist. It upserts only deterministic records owned by the `gymgrid-demo` organization and leaves every other organization untouched. The selected Auth user receives the organization-wide `gym_owner` role for the demo tenant.

Never point this script at production. The repository intentionally contains no demo password; use the password chosen when the disposable Auth user was created.
