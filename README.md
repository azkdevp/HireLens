# HireLens — Sprint 1

HireLens is a secure recruitment and hiring tracker implementing only HL-F01–HL-F11. It uses Next.js App Router, strict TypeScript, Tailwind CSS, Supabase Auth/PostgreSQL/Storage, Zod, Vitest, and Playwright.

## Local setup

1. Use Node.js 20 or newer and run `npm install`.
2. Create a Supabase project, then run `supabase/migrations/202608020001_sprint1.sql` in its SQL editor (or use the Supabase CLI migration flow).
3. Copy `.env.example` to `.env.local` and supply the project URL, anon key, service-role key, and strong local-only seed passwords. Never expose the service-role key to browser code or commit `.env.local`.
4. Run the synthetic seed with `npx tsx --env-file=.env.local supabase/seed.ts`. The script creates `hr@hirelens.demo`, `interviewer@hirelens.demo`, and `management@hirelens.demo`; their passwords are the corresponding environment values.
5. Run `npm run dev` and open `http://localhost:3000`.

## Verification

- `npm test` — unit/security contract tests.
- `npm run typecheck` — strict TypeScript verification.
- `npm run build` — production build.
- `E2E_HR_EMAIL=... E2E_HR_PASSWORD=... npm run test:e2e` — connected critical journey. The test is skipped when credentials are not supplied.

## Sprint Review journey

Sign in as the synthetic HR recruiter; create a vacancy; rename/reorder its stages; create a candidate associated with it; attach a PDF/DOC/DOCX CV up to 5 MB; open the vacancy pipeline; move the candidate to the next stage; record hired, rejected, or on-hold; then inspect the immutable activity timeline. Sign in as interviewer and management to demonstrate read-only views and rejected direct access to HR routes.

## Security notes

All authenticated routes refresh and validate the Supabase session. HR-only pages and every mutation enforce the role server-side. PostgreSQL RLS repeats those permissions, CVs use a private bucket and authenticated download route, stage moves and outcomes use security-definer database functions with explicit role/business-rule checks, and activity/history tables are append-only to authenticated application users.
