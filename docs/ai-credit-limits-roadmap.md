# AI Credit Limits roadmap

## Current status: Stage 1 complete (2026-09-22)

- Payment verification and webhook handling use the atomic payment finalization RPC. Subscription periods are checked against paid status and their start and end times.
- AI usage is recorded in the usage ledger with provider call identity, retry attempts, pricing status, and authoritative billing metadata.
- Shadow credit persistence and route integration reserve, settle, or release alongside the ledger. Terminal reconciliation handles reserved rows whose ledger state is already success or failure.
- Stage 1 route protection is implemented in `lib/access/requireAiAccess.ts`, `app/api/avatar-lesson/route.ts`, `app/api/teacher-quiz/route.ts`, `app/api/generate-lesson/route.ts`, `app/api/teacher-qa/route.ts`, and `app/api/teacher-math/route.ts`. Tests are `tests/aiCreditStage1Access.test.mjs`, `tests/aiCreditStage1Routes.test.mjs`, `tests/aiCreditStage1ExistingRoutes.test.mjs`, `tests/aiCreditStage1Replay.test.mjs`, and `tests/aiCreditStage1PostgresHarness.test.mjs`, alongside the existing AI and payment suites.
- Stage 1 PostgreSQL 17 replay uniqueness and conditional failure-retry test passed on 2026-09-22 (`node.exe --test tests\aiCreditStage1PostgresHarness.test.mjs`: 1 passed, 0 failed, 0 skipped). Focused route and replay tests, TypeScript, production build, diff check, and final audit passed. A completed avatar response above the JSON replay cap is retained as a non-replayable conflict; the first caller still receives the original successful response. Route replay ownership is required before provider work; a completion database failure leaves a durable anti-retry lock and returns a sanitized 503.
- Avatar audio without authoritative pricing stays non-billable. Credit configuration and enforcement remain dormant.

## Remaining stages

2. Decide credit policy: grants, action minimums, charge rounding, exemptions, preview treatment, and failure handling.
3. Implement and test server-side balance enforcement and concurrency behavior against the approved policy.
4. Validate end-to-end billing, retries, reconciliation, and payment interactions with PostgreSQL and provider fixtures.
5. Build student and administrator credit visibility and operational controls.
6. Plan monitored activation, rollback, and migration from shadow observation to enforcement.

Do not activate credit limits before Stages 2–4 pass their tests and review gates. The current credit configuration is inactive and must stay dormant until then.

The stale `in_progress` limitation remains unresolved: terminal reconciliation processes only ledger rows already marked success or failure. A separate decision and implementation are needed for attempts left in progress.

Resume at Stage 2 credit-policy decisions. The full test command also encounters an existing `checkPolicy.js` import that is absent in this TypeScript checkout.
