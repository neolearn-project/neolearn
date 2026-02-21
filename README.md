# NeoLearn

NeoLearn is a Next.js application for AI-assisted learning with separate student, parent, and admin experiences. It includes both frontend pages and backend API routes for syllabus, lessons, progress, leads, payments, and weekly reports.

## Tech stack

- Next.js 14 (App Router)
- React 18 + TypeScript
- Supabase
- OpenAI
- Razorpay

## Quick start

1. Install dependencies:

```bash
npm install
```

2. Create local env file:

```bash
cp .env.example .env.local
```

3. Fill required values in `.env.local` (minimum):

- `NEXT_PUBLIC_SUPABASE_URL`
- `NEXT_PUBLIC_SUPABASE_ANON_KEY`
- `SUPABASE_SERVICE_ROLE_KEY`

Depending on features you use, also configure:

- `OPENAI_API_KEY`
- `RAZORPAY_KEY_ID`
- `RAZORPAY_KEY_SECRET`
- `RAZORPAY_WEBHOOK_SECRET`
- WhatsApp/Meta Cloud API keys

4. Run the app:

```bash
npm run dev
```

Default dev port is `3004`.

## Scripts

- `npm run dev` — start Next.js dev server on port 3004
- `npm run dev:fast` — start turbopack dev server on port 3004
- `npm run dev:clean` — clear `.next` then run `dev:fast`
- `npm run build` — production build
- `npm run start` — run production server
- `npm run test` — run automated tests

## High-level structure

- `app/` — App Router pages + API routes
  - `app/student` — student learning UI
  - `app/parent` — parent login/dashboard/report views
  - `app/admin` — admin views (leads, batches, syllabus)
  - `app/api` — backend endpoints
- `components/` and `app/components/` — shared/client components
- `lib/` — shared server/client utilities (Supabase, WhatsApp, summaries)
- `public/` — static assets

## Notes

- Keep secrets in environment variables only; never commit real credentials.
- Service-role keys must stay server-side.
