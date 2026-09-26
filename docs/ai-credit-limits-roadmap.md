# AI Credit Limits roadmap

## Current status: Stage 5 complete (2026-09-26)

- Payment verification and webhook handling use the atomic payment finalization RPC. Subscription periods are checked against paid status and their start and end times.
- AI usage is recorded in the usage ledger with provider call identity, retry attempts, pricing status, and authoritative billing metadata.
- Shadow credit persistence and route integration reserve, settle, or release alongside the ledger. Terminal reconciliation handles reserved rows whose ledger state is already success or failure.
- Stage 1 route protection is implemented in `lib/access/requireAiAccess.ts`, `app/api/avatar-lesson/route.ts`, `app/api/teacher-quiz/route.ts`, `app/api/generate-lesson/route.ts`, `app/api/teacher-qa/route.ts`, and `app/api/teacher-math/route.ts`. Tests are `tests/aiCreditStage1Access.test.mjs`, `tests/aiCreditStage1Routes.test.mjs`, `tests/aiCreditStage1ExistingRoutes.test.mjs`, `tests/aiCreditStage1Replay.test.mjs`, and `tests/aiCreditStage1PostgresHarness.test.mjs`, alongside the existing AI and payment suites.
- Stage 1 PostgreSQL 17 replay uniqueness and conditional failure-retry test passed on 2026-09-22 (`node.exe --test tests\aiCreditStage1PostgresHarness.test.mjs`: 1 passed, 0 failed, 0 skipped). Focused route and replay tests, TypeScript, production build, diff check, and final audit passed. A completed avatar response above the JSON replay cap is retained as a non-replayable conflict; the first caller still receives the original successful response. Route replay ownership is required before provider work; a completion database failure leaves a durable anti-retry lock and returns a sanitized 503.
- Avatar audio without authoritative pricing stays non-billable. Credit configuration and enforcement remain dormant.
- Stage 2 policy validation completed on 2026-09-23. The approved inactive policy defines trial and plan grants, rolling five-hour and IST daily limits, authoritative entitlement-period expiry, quarterly tranches, positive prorated upgrades, fixed versioned pricing inputs, and non-billable TTS/avatar/realtime usage. The PostgreSQL 17 behavioral harness passed (`node.exe --test tests\\aiCreditPolicyPostgresHarness.test.mjs`: 1 passed, 0 failed, 0 skipped), alongside unit/contract tests, TypeScript, the production build, and `git diff --check`. No configuration is seeded or active and no balance enforcement is enabled.
- Stage 3 shadow-only reporting completed on 2026-09-25. It derives entitlement-term, rolling five-hour, and rolling 24-hour grant/consumed/remaining values from immutable available grant tranches and terminal authoritative settled debit transactions. Exceeded values are data only. It adds no seeds, activation, request blocking, or application-route integration. The PostgreSQL 17 behavioral harness passed (`node.exe --test tests\aiCreditShadowLimitsPostgresHarness.test.mjs`: 1 passed, 0 failed, 0 skipped), including exact window boundaries, quarterly tranche availability, renewal/no-rollover and student/period isolation, excluded states, exceeded-but-not-blocked reporting, deterministic concurrent reads, ACL/RLS, exact signature, fixed search path, and zero seeds.

### Stage 4 completion

Stage 4 operational monitoring completed on 2026-09-26. The service-role-only, read-only RPC uses an explicit evaluation timestamp and bounded deterministic findings. It reports terminal reservations, stale in-progress attempts, identity and settlement anomalies, billing exclusions, policy/tranche coverage, expired periods/tranches, term/5h/24h shadow usage readiness, reconciliation backlog, and relevant latest timestamps. Output is aggregate/redacted by default; optional identifiers are internal UUIDs. It does not reconcile, repair, settle, release, seed, activate, block, or enforce. The PostgreSQL 17 behavioral harness passed (`node.exe --test tests\aiCreditOperationalMonitoringPostgresHarness.test.mjs`: 1 passed, 0 failed, 0 skipped), covering all monitoring categories, bounds, deterministic repeated and concurrent reads, redaction, ACL/RLS, exact signature, fixed search path, and zero writes.

### Stage 5 completion

Stage 5 authenticated student AI-credit visibility completed on 2026-09-26. The logged-out API returned a generic authentication-required response. An authenticated student received the safe unavailable state because policy and entitlement data remain unseeded. Dashboard navigation and the Refresh and Back controls passed in Vercel Preview. No internal identifiers or database errors were exposed. Visibility remains observational and non-enforcing, and no migration, seed, activation, payment, subscription, reconciliation, or access behavior changed.

## Remaining stages

6. **Pending.** Build administrator credit monitoring and operational controls.
7. Plan monitored activation, rollback, and migration from shadow observation to enforcement.

Do not activate credit limits before Stages 2–4 pass their tests and review gates. The current credit configuration is inactive and must stay dormant until then.

The stale `in_progress` limitation remains unresolved: terminal reconciliation processes only ledger rows already marked success or failure. A separate decision and implementation are needed for attempts left in progress.

The full test command also encounters an existing `checkPolicy.js` import that is absent in this TypeScript checkout.
