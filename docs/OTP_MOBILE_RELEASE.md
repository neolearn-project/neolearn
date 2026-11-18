# OTP login and mobile interface release

Based on the tested `staging-classroom-experience-v1` textbook release (`8eef78a`).
The approved student authentication and classroom interface modules were ported
from the NeoLearn Site source (`074693d`), retaining the existing Next.js build,
production hostname, payment routes and provider configuration.

## Included

- Mobile OTP is the initial student login method; User ID/password remains available.
- Purpose-bound, single-use OTP challenges for login, signup, recovery and parent linking.
- Existing-account OTP login opens that same account and keeps its curriculum/progress.
- Signup establishes the student profile before issuing a real session.
- Parent linking requires verified guardian consent.
- A once-per-tab startup animation, account history/resume and bounded UI requests.
- Compact phone account controls, selected login-method styling, safe-area spacing,
  readable bottom-navigation labels and the existing light/dark appearance settings.
- Vercel OTP IP limits use the platform's `x-vercel-forwarded-for` header,
  never a caller-supplied Cloudflare header.

The four accompanying migrations document the already-installed database objects;
this release does not reapply them or alter textbook mappings.

## Validation

Run the focused offline authentication, recovery, session, appearance, classroom,
performance and textbook-access tests, TypeScript, and the production build.
Phone acceptance: log out, use Mobile OTP, confirm the same account/progress, check
password fallback, reopen a published textbook, and check the mobile navigation in
light and dark modes. Do not initiate paid SMS or AI calls as build checks.

The teacher portal, seller portal and additional classes' textbooks are separate
milestones and are not part of this release.
