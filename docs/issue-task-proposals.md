# Issue Task Proposals

## 1) Typo fix task: correct incorrect env var name in a Supabase comment

- **Issue found:** `lib/supabaseAdmin.ts` includes a commented example using `SUPABASE_SERVICE_ROLE`, but the real env var used elsewhere is `SUPABASE_SERVICE_ROLE_KEY`.
- **Why this matters:** Even though it is in a comment, this can mislead contributors and cause bad local/server config.

**Proposed task**
- Update the comment example in `lib/supabaseAdmin.ts` to use `SUPABASE_SERVICE_ROLE_KEY`.
- Optionally add a short note clarifying that service-role keys must never be exposed to the browser.

**Acceptance criteria**
- Comment references the correct env var name.
- No runtime behavior changes.

---

## 2) Bug fix task: fail closed when access-check API fails on lesson start

- **Issue found:** `app/student/page.tsx` only blocks lesson start when `/api/access/check` returns a successful response that explicitly says `allowed: false`.
- **Current risky behavior:** If the access-check API errors (network/server issue), the lesson still continues.
- **Why this matters:** This can bypass the intended free-usage limit during outages.

**Proposed task**
- In `handleStartLesson`, treat non-OK access-check responses (or JSON parse failure) as a blocking condition.
- Show a user-facing error like: "Unable to verify your plan right now. Please try again."

**Acceptance criteria**
- Lesson start is blocked when access-check fails.
- A clear user message is shown.
- Existing behavior remains unchanged when API succeeds.

---

## 3) Comment/documentation discrepancy task: rewrite stale README

- **Issue found:** README says this is a "server-only full build," but the repo includes extensive client UI (`app/page.tsx`, `app/student/page.tsx`, component directories), so this description is inaccurate.
- **Why this matters:** New contributors get the wrong architecture picture and setup expectations.

**Proposed task**
- Rewrite `README.md` with:
  - project overview (Next.js app + API routes + admin/parent/student flows),
  - environment setup (required env vars),
  - run/build commands,
  - high-level folder map.

**Acceptance criteria**
- README reflects current app architecture.
- Setup instructions are reproducible for a new contributor.

---

## 4) Test improvement task: replace ad-hoc Supabase script with automated route tests

- **Issue found:** `test-supabase.js` is a manual script with hardcoded URL/key and no assertions.
- **Why this matters:** It is not safe for sharing/CI and does not protect critical API behavior from regressions.

**Proposed task**
- Add automated tests (e.g., Vitest/Jest + fetch mocking) for critical API behavior, starting with:
  - `/api/access/check` returns 400 when `mobile` is missing,
  - returns expected `used/limit/allowed` shape on success,
  - returns 500 on Supabase failure.
- Remove secrets from `test-supabase.js` and either delete it or convert it to a safe local-only diagnostic with env-driven config.

**Acceptance criteria**
- Tests run via an npm script in CI/local.
- No hardcoded secrets remain in repository test utilities.
- Access-check behavior is covered by assertions.
