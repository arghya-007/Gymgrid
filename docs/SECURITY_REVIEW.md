# Pilot security review

Review date: 1 October 2026

## Release decision

The current codebase is suitable for a controlled, operator-assisted pilot after deployment to an isolated pilot environment and completion of the real-device checks in `docs/PILOT.md`. It is not approved for open public registration, unattended onboarding, or live online payments.

## Controls verified

- Postgres Row Level Security is the tenant boundary; direct client writes to protected operational tables remain blocked.
- Privileged writes use narrowly scoped security-definer functions that recheck identity, tenant, branch, role, and record state.
- Browser and mobile packages contain public Supabase credentials only; repository scans and Git history must remain free of service-role keys.
- Phase-specific rollback tests cover cross-tenant reads and writes, role escalation, lifecycle operations, payments, imports, check-ins, scheduling, bookings, QR check-ins, member self-service, and app invitations.
- Member app invitations use exact normalized email matching and atomic member linkage. A suspended account cannot reactivate itself through an invitation.
- GitHub quality gates reject high or critical dependency advisories and verify lint, TypeScript, Next.js build, Expo Doctor, and Android/iOS/web exports.

## Accepted pilot risks

`npm audit` currently reports 34 moderate transitive findings under Expo Router tooling (`decode-uri-component` through `query-string`) and Expo/Xcode configuration tooling (`uuid`). The available forced remediation would apply breaking dependency changes or downgrade the application stack, so it is not accepted automatically. High and critical advisories are zero at this checkpoint and remain a hard release gate. Reassess after each Expo SDK-compatible dependency update.

Account creation and invitation delivery are manual during the controlled pilot. This reduces public attack surface but adds operator risk: the Auth email must exactly match the member invitation, temporary passwords must use a private channel, and the operator must never retain the member's replacement password.

## Before wider release

- Add public-safe sign-up or passwordless invitation delivery with verified redirect handling and rate limits.
- Add automated browser end-to-end tests for platform onboarding and the main gym workflow.
- Add production monitoring, alert ownership, backup-restore rehearsal, and a documented retention policy.
- Complete privacy-policy, consent, data-export, account-deletion, and India-specific legal review.
- Perform a third-party penetration test before processing live payments or onboarding gyms without operator supervision.
