# ClassBoard

ClassBoard is a multi-school digital diary. A platform super admin creates schools and their admins; each school's staff, students and guardians sign in with an email or a generated username (like `ali.7b@cityschool`) and only ever see their own school's data, enforced by Postgres row-level security.

**Stack:** Next.js 16 (App Router, server actions), React 19, Supabase (Postgres, Auth, RLS) via `@supabase/ssr`, Tailwind CSS 4, Zod, Vitest and Playwright.

## Setup checklist

1. Create a **development** Supabase project.
2. In Authentication settings:
   - turn off "Allow new users to sign up";
   - turn off "Confirm email";
   - turn on "Secure password change";
   - set Site URL to the app URL;
   - for dev, raise the sign-in rate limit to at least 300 per 5 minutes.
3. Create `.env.local` and `.env.test` from `.env.example` (never commit them).
4. Link the project and apply migrations:
   ```bash
   npx supabase login
   npx supabase link --project-ref <ref>
   npx supabase db push
   ```
5. Create the first super admin:
   ```bash
   npx tsx scripts/create-super-admin.ts "Name" email password
   ```
6. Run the tests:
   ```bash
   npm test          # unit
   npm run test:db   # database / RLS (uses .env.test)
   npm run test:e2e  # Playwright
   ```
   DB and E2E tests create and delete real data — only ever point them at a dev project.

Then `npm run dev` and open http://localhost:3000.

## Conventions

- Migrations in `supabase/migrations` are append-only once pushed: add a new migration instead of editing a pushed one.
- Never link to `/logout` with `next/link` — prefetching would sign users out. Use a plain `<a>` or a form.
