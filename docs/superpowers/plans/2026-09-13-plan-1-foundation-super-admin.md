# Plan 1: Foundation + Super Admin Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A deployed-ready Next.js + Supabase app where the platform owner (super admin) logs in, creates school workspaces, assigns/replaces school admins, and suspends schools — with school isolation enforced by row-level security and proven by tests.

**Architecture:** One Next.js App Router app (TypeScript, Tailwind) talking to a hosted Supabase project. All data access from the browser/user session goes through RLS; privileged account creation runs only in server actions using the Supabase secret key, after a server-side super-admin check. Pure logic (credentials, login resolution, routing by role, validation) lives in small modules with unit tests; database rules have integration tests against a dedicated **development** Supabase project.

**Tech Stack:** Next.js (latest, App Router, `src/` dir, `proxy.ts`), React, TypeScript, Tailwind CSS, `@supabase/supabase-js`, `@supabase/ssr`, Zod 4, Vitest, Playwright, Supabase CLI via `npx supabase`, `tsx` for scripts.

**Spec:** `docs/superpowers/specs/2026-09-13-school-diary-design.md`

## Roadmap (this plan is 1 of 6)

| Plan | Delivers |
|---|---|
| **1. Foundation + Super admin** (this file) | Project, auth, schools/profiles/memberships, RLS, super admin panel, suspension |
| 2. School admin + teachers + classes + students | Admin dashboard/teachers/settings, classes, subjects, students, guardian accounts, sibling linking |
| 3. Diary | Posts, attachments, multi-class posting, student/guardian diary, done marks, calendar, school notices |
| 4. Consents | Consent requests, guardian answers, tracker, deadline rules |
| 5. Notifications | Web push, in-app badges, scheduler, quiet hours, reminder log |
| 6. PWA + offline + pilot readiness | Installable app, offline diary cache, draft retry, full E2E suite |

Each later plan is written after the previous one ships, so it can build on real code.

## Global Constraints

- Every school-owned table has `school_id`; cross-school reads must be impossible via RLS, independent of app code.
- Super admin never reads student, guardian, diary, or consent records — only school info, school-admin accounts, and aggregate counts.
- Schools cannot self-register; only the super admin creates schools.
- Suspended school: login shows exactly `Your school's account is inactive. Contact your school.`; its users are rejected on every request.
- Generated accounts get a temporary password and `must_change_password = true`; first login forces a password change.
- Generated usernames look like `ali.7b@cityschool` (`<local>@<school-slug>`); they map to internal emails on `ACCOUNT_EMAIL_DOMAIN`, which never receive mail.
- The Supabase secret key (`SUPABASE_SECRET_KEY`) is used only in server-only modules (`import 'server-only'`), never in client components.
- UI copy is English; user-facing strings for each screen live in that screen's files (translation is a later version).
- Tests run against a **development** Supabase project only — never production.
- Node 24 / npm 11 (installed on the dev machine). Docker is not installed, so local `supabase start` is not used.

## Decisions made while planning (beyond the spec)

- `schools.slug` (lowercase letters, digits, single hyphens) is added; it forms the username suffix.
- A school admin may be created with an email (logs in with it) or without one (gets a generated username `admin@<slug>`, then `admin2@<slug>`, …). Phone number is stored for contact; phone-number login arrives with SMS setup in a later plan.
- Default `time_zone` is `UTC`; the New school form requires choosing one.
- Self-service "forgot password" (email/phone code) is deferred to Plan 2; in Plan 1 the login page tells users to ask their school admin, and the super admin can reset school-admin passwords.
- The super admin panel has only a Schools section (the spec's platform "Settings" has no content yet).

## File Structure

```
.env.example                          env variable names (committed)
.env.local / .env.test                real values (git-ignored)
supabase/migrations/
  20260913000001_core_schema.sql      schools, profiles, memberships, helper functions
  20260913000002_core_rls.sql         RLS policies for core tables
  20260913000003_platform_rpc.sql     super admin overview function
scripts/create-super-admin.ts         one-time bootstrap of the platform owner
src/proxy.ts                          refreshes session, redirects signed-out users to /login
src/lib/env.ts                        typed env access
src/lib/supabase/server.ts            cookie-based client for server components/actions
src/lib/supabase/admin.ts             secret-key client (server-only)
src/lib/supabase/proxy.ts             updateSession used by proxy.ts
src/lib/accounts/credentials.ts       slug/username/password/internal-email helpers (pure)
src/lib/accounts/create-account.ts    creates auth user + profile (server-only, reused by Plan 2)
src/lib/auth/login-identifier.ts      turns typed login into an auth email (pure)
src/lib/auth/home-path.ts             where a user lands based on account context (pure)
src/lib/auth/account-context.ts       loads profile + memberships for current user
src/lib/auth/guards.ts                requireSuperAdmin / requireMember
src/lib/platform/validation.ts        Zod schemas for platform forms
src/lib/platform/schools.ts           create school, add/remove admin, reset password, suspend
src/components/credentials-card.tsx   shows login + temp password with Copy / WhatsApp
src/components/submit-button.tsx      pending-aware submit button
src/app/page.tsx                      redirects to the role home
src/app/login/{page.tsx,login-form.tsx,actions.ts}
src/app/change-password/{page.tsx,form.tsx,actions.ts}
src/app/logout/route.ts
src/app/platform/layout.tsx           super admin shell (guarded)
src/app/platform/page.tsx             schools list
src/app/platform/new/{page.tsx,form.tsx,actions.ts}
src/app/platform/schools/[id]/{page.tsx,admin-forms.tsx,actions.ts}
src/app/admin/page.tsx, src/app/teacher/page.tsx, src/app/diary/page.tsx   guarded role homes (filled in by Plans 2–3)
tests/setup.ts                        loads .env.test
tests/unit/*.test.ts                  pure logic tests
tests/db/helpers.ts                   test users/schools + signed-in clients
tests/db/*.test.ts                    RLS + service integration tests
src/lib/accounts/share-message.ts     WhatsApp/copy text for credentials (pure)
playwright.config.ts                  E2E config (dev server + .env.test)
e2e/global-setup.ts, global-teardown.ts   create E2E super admin / clean test data
e2e/login.ts                          login/logout helpers
e2e/platform.spec.ts                  Playwright flows
```

---

### Task 1: Project scaffold, tooling, and git

**Files:**
- Create: whole Next.js scaffold, `vitest.config.ts`, `tests/setup.ts`, `tests/unit/smoke.test.ts`, `.env.example`
- Modify: `package.json` (scripts), `.gitignore`

**Interfaces:**
- Consumes: nothing
- Produces: `npm test` (unit), `npm run test:db` (DB integration), path alias `@/*` → `src/*`

- [ ] **Step 1: Initialise git and scaffold Next.js**

`create-next-app` refuses non-empty folders, so move the docs out temporarily (PowerShell, from `C:\Users\DELL\Desktop\copypaste`):

```powershell
Move-Item docs ..\copypaste-docs-tmp
npx create-next-app@latest . --ts --tailwind --eslint --app --src-dir --import-alias "@/*" --use-npm --yes
Move-Item ..\copypaste-docs-tmp docs
git init
```

Expected: `src/app/page.tsx` exists, `docs/superpowers/...` is back, `.git` exists.

- [ ] **Step 2: Install dependencies**

```powershell
npm install @supabase/supabase-js @supabase/ssr zod@^4 server-only
npm install -D vitest dotenv tsx @playwright/test supabase
npx playwright install chromium
```

- [ ] **Step 3: Add scripts to `package.json`**

Add to the `"scripts"` object (keep the generated `dev`, `build`, `start`, `lint`):

```json
"test": "vitest run tests/unit",
"test:db": "vitest run tests/db",
"test:e2e": "playwright test",
"typecheck": "tsc --noEmit"
```

- [ ] **Step 4: Create `vitest.config.ts`**

```ts
import { defineConfig } from 'vitest/config'
import path from 'node:path'

export default defineConfig({
  resolve: { alias: { '@': path.resolve(__dirname, 'src') } },
  test: {
    environment: 'node',
    setupFiles: ['tests/setup.ts'],
    fileParallelism: false,
    testTimeout: 30_000,
    hookTimeout: 60_000,
    // server-only throws outside React Server Components; stub it for tests
    alias: { 'server-only': path.resolve(__dirname, 'tests/server-only-stub.ts') },
  },
})
```

- [ ] **Step 5: Create `tests/setup.ts` and `tests/server-only-stub.ts`**

```ts
// tests/setup.ts
import { config } from 'dotenv'
config({ path: '.env.test' })
```

```ts
// tests/server-only-stub.ts
export {}
```

- [ ] **Step 6: Create `.env.example` and git-ignore real env files**

```bash
# .env.example
NEXT_PUBLIC_SUPABASE_URL=https://YOUR-PROJECT-REF.supabase.co
NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=sb_publishable_xxx
SUPABASE_SECRET_KEY=sb_secret_xxx
# Domain you control; generated usernames become <local>--<slug>@this-domain. No mail is sent.
ACCOUNT_EMAIL_DOMAIN=accounts.example.com
```

Ensure `.gitignore` contains these lines (create-next-app already ignores `.env*`; add the exception so the example is committed):

```
.env*
!.env.example
/test-results/
/playwright-report/
/e2e/.auth/
```

- [ ] **Step 7: Write a smoke test**

```ts
// tests/unit/smoke.test.ts
import { describe, it, expect } from 'vitest'

describe('tooling', () => {
  it('runs Vitest and loads the test setup', () => {
    expect(typeof process.env).toBe('object')
  })
})
```

The `@` alias is exercised by Task 5's unit tests.

- [ ] **Step 8: Run unit tests**

Run: `npm test`
Expected: PASS, 1 test.

- [ ] **Step 9: Commit**

```powershell
git add -A
git commit -m "chore: scaffold Next.js app with Vitest and Playwright"
```

---

### Task 2: Supabase dev project, core schema, and helper functions

**Files:**
- Create: `supabase/config.toml` (via CLI), `supabase/migrations/20260913000001_core_schema.sql`, `tests/db/helpers.ts`, `tests/db/schema.test.ts`, `.env.test`, `.env.local`

**Interfaces:**
- Consumes: Task 1 test scripts
- Produces:
  - Enums `public.member_role` (`admin|teacher|student|guardian`), `public.school_status` (`active|suspended`)
  - Tables `public.schools`, `public.profiles`, `public.memberships` (columns below)
  - `public.is_super_admin() returns boolean`
  - `public.my_role_in(p_school uuid) returns public.member_role` (null if not an active member of an active school)
  - `public.my_memberships() returns table(school_id uuid, school_name text, school_slug text, school_status public.school_status, role public.member_role, can_create_classes boolean)`
  - Test helpers in `tests/db/helpers.ts`: `adminClient()`, `createTestUser(opts)`, `signInAs(email, password)`, `createTestSchool(opts)`, `addMember(schoolId, userId, role)`, `cleanupTestData()`

- [ ] **Step 1: Create the development Supabase project (manual, one time)**

1. At supabase.com create a project named `classboard-dev`.
2. Project Settings → API Keys: copy the URL, the **publishable** key, and the **secret** key.
3. Authentication → Rate Limits: raise "sign-ins/sign-ups" to at least 300 per 5 minutes (tests sign in many times).
4. Authentication → Sign In / Providers → Email: turn **off** "Confirm email" (accounts are created by admins).

Create `.env.local` and `.env.test` with the same four values as `.env.example`, filled in. Use `ACCOUNT_EMAIL_DOMAIN=accounts.classboard.test` for dev.

- [ ] **Step 2: Initialise and link the Supabase CLI**

```powershell
npx supabase init
npx supabase login
npx supabase link --project-ref YOUR-PROJECT-REF
```

Expected: `supabase/config.toml` exists; link succeeds.

- [ ] **Step 3: Write the failing schema test**

```ts
// tests/db/helpers.ts
import { createClient, type SupabaseClient } from '@supabase/supabase-js'
import { randomUUID } from 'node:crypto'

const url = () => process.env.NEXT_PUBLIC_SUPABASE_URL!
export const TEST_PREFIX = 'test-'

export function adminClient(): SupabaseClient {
  return createClient(url(), process.env.SUPABASE_SECRET_KEY!, {
    auth: { persistSession: false, autoRefreshToken: false },
  })
}

export type TestUser = { id: string; email: string; password: string }

export async function createTestUser(
  opts: { superAdmin?: boolean; fullName?: string } = {},
): Promise<TestUser> {
  const admin = adminClient()
  const email = `${TEST_PREFIX}${randomUUID().slice(0, 8)}@classboard.test`
  const password = `Pw-${randomUUID()}`
  const { data, error } = await admin.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
  })
  if (error) throw error
  const { error: pErr } = await admin.from('profiles').insert({
    id: data.user.id,
    full_name: opts.fullName ?? 'Test User',
    email,
    is_super_admin: opts.superAdmin ?? false,
  })
  if (pErr) throw pErr
  return { id: data.user.id, email, password }
}

export async function signInAs(user: TestUser): Promise<SupabaseClient> {
  const client = createClient(url(), process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!, {
    auth: { persistSession: false, autoRefreshToken: false },
  })
  const { error } = await client.auth.signInWithPassword({
    email: user.email,
    password: user.password,
  })
  if (error) throw error
  return client
}

export async function createTestSchool(
  opts: { status?: 'active' | 'suspended' } = {},
): Promise<{ id: string; slug: string }> {
  const slug = `${TEST_PREFIX}${randomUUID().slice(0, 8)}`
  const { data, error } = await adminClient()
    .from('schools')
    .insert({ name: `School ${slug}`, slug, status: opts.status ?? 'active' })
    .select('id, slug')
    .single()
  if (error) throw error
  return data
}

export async function addMember(
  schoolId: string,
  userId: string,
  role: 'admin' | 'teacher' | 'student' | 'guardian',
  extra: { active?: boolean } = {},
) {
  const { error } = await adminClient()
    .from('memberships')
    .insert({ school_id: schoolId, user_id: userId, role, active: extra.active ?? true })
  if (error) throw error
}

export async function cleanupTestData() {
  const admin = adminClient()
  await admin.from('schools').delete().like('slug', `${TEST_PREFIX}%`)
  // listUsers is paginated; test runs create well under 1000 users
  const { data } = await admin.auth.admin.listUsers({ perPage: 1000 })
  for (const u of data?.users ?? []) {
    if (u.email?.startsWith(TEST_PREFIX)) await admin.auth.admin.deleteUser(u.id)
  }
}
```

```ts
// tests/db/schema.test.ts
import { afterAll, describe, expect, it } from 'vitest'
import {
  addMember, adminClient, cleanupTestData, createTestSchool, createTestUser, signInAs,
} from './helpers'

afterAll(cleanupTestData)

describe('core schema', () => {
  it('rejects an invalid school slug', async () => {
    const { error } = await adminClient()
      .from('schools')
      .insert({ name: 'Bad', slug: 'Bad Slug!' })
    expect(error?.code).toBe('23514') // check_violation
  })

  it('my_memberships returns the caller memberships with school status', async () => {
    const school = await createTestSchool({ status: 'suspended' })
    const user = await createTestUser()
    await addMember(school.id, user.id, 'teacher')
    const client = await signInAs(user)

    const { data, error } = await client.rpc('my_memberships')
    expect(error).toBeNull()
    expect(data).toEqual([
      expect.objectContaining({ school_id: school.id, role: 'teacher', school_status: 'suspended' }),
    ])
  })

  it('my_role_in is null for a suspended school and set for an active one', async () => {
    const active = await createTestSchool()
    const suspended = await createTestSchool({ status: 'suspended' })
    const user = await createTestUser()
    await addMember(active.id, user.id, 'admin')
    await addMember(suspended.id, user.id, 'admin')
    const client = await signInAs(user)

    const a = await client.rpc('my_role_in', { p_school: active.id })
    const s = await client.rpc('my_role_in', { p_school: suspended.id })
    expect(a.data).toBe('admin')
    expect(s.data).toBeNull()
  })

  it('is_super_admin reflects the profile flag', async () => {
    const boss = await signInAs(await createTestUser({ superAdmin: true }))
    const normal = await signInAs(await createTestUser())
    expect((await boss.rpc('is_super_admin')).data).toBe(true)
    expect((await normal.rpc('is_super_admin')).data).toBe(false)
  })
})
```

- [ ] **Step 4: Run the test to verify it fails**

Run: `npm run test:db -- tests/db/schema.test.ts`
Expected: FAIL — errors like `relation "public.profiles" does not exist` / `Could not find the table 'public.schools'`.

- [ ] **Step 5: Write the migration**

```sql
-- supabase/migrations/20260913000001_core_schema.sql

create type public.member_role as enum ('admin', 'teacher', 'student', 'guardian');
create type public.school_status as enum ('active', 'suspended');

create table public.schools (
  id uuid primary key default gen_random_uuid(),
  name text not null check (length(btrim(name)) between 2 and 120),
  slug text not null unique check (slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$' and length(slug) <= 40),
  logo_path text,
  city text,
  contact_name text,
  contact_phone text,
  brand_color text not null default '#2563eb' check (brand_color ~ '^#[0-9a-fA-F]{6}$'),
  time_zone text not null default 'UTC',
  academic_year text,
  status public.school_status not null default 'active',
  created_at timestamptz not null default now()
);

create table public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  full_name text not null check (length(btrim(full_name)) between 1 and 120),
  phone text,
  email text,
  username text unique,
  is_super_admin boolean not null default false,
  must_change_password boolean not null default false,
  created_at timestamptz not null default now()
);

create table public.memberships (
  school_id uuid not null references public.schools (id) on delete cascade,
  user_id uuid not null references public.profiles (id) on delete cascade,
  role public.member_role not null,
  can_create_classes boolean not null default false,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  primary key (school_id, user_id)
);
create index memberships_user_id_idx on public.memberships (user_id);

alter table public.schools enable row level security;
alter table public.profiles enable row level security;
alter table public.memberships enable row level security;

create function public.is_super_admin()
returns boolean
language sql stable security definer set search_path = ''
as $$
  select coalesce(
    (select p.is_super_admin from public.profiles p where p.id = auth.uid()),
    false
  );
$$;

create function public.my_role_in(p_school uuid)
returns public.member_role
language sql stable security definer set search_path = ''
as $$
  select m.role
  from public.memberships m
  join public.schools s on s.id = m.school_id
  where m.school_id = p_school
    and m.user_id = auth.uid()
    and m.active
    and s.status = 'active';
$$;

create function public.my_memberships()
returns table (
  school_id uuid,
  school_name text,
  school_slug text,
  school_status public.school_status,
  role public.member_role,
  can_create_classes boolean
)
language sql stable security definer set search_path = ''
as $$
  select s.id, s.name, s.slug, s.status, m.role, m.can_create_classes
  from public.memberships m
  join public.schools s on s.id = m.school_id
  where m.user_id = auth.uid() and m.active
  order by s.name;
$$;

revoke execute on function public.is_super_admin() from public, anon;
revoke execute on function public.my_role_in(uuid) from public, anon;
revoke execute on function public.my_memberships() from public, anon;
grant execute on function public.is_super_admin() to authenticated;
grant execute on function public.my_role_in(uuid) to authenticated;
grant execute on function public.my_memberships() to authenticated;
```

RLS is enabled here with **no policies yet**, so signed-in users can read nothing from the tables directly; Task 3 adds policies. The RPCs above are security definer and scoped to `auth.uid()`, so they work now.

- [ ] **Step 6: Push the migration**

Run: `npx supabase db push`
Expected: `Applying migration 20260913000001_core_schema.sql... Finished supabase db push.`

- [ ] **Step 7: Run the tests to verify they pass**

Run: `npm run test:db -- tests/db/schema.test.ts`
Expected: PASS, 4 tests.

- [ ] **Step 8: Commit**

```powershell
git add supabase tests/db
git commit -m "feat(db): core schools/profiles/memberships schema with helper functions"
```

---

### Task 3: Row-level security for core tables

**Files:**
- Create: `supabase/migrations/20260913000002_core_rls.sql`, `tests/db/rls-core.test.ts`

**Interfaces:**
- Consumes: Task 2 tables, `is_super_admin()`, `my_role_in()`, test helpers
- Produces:
  - `public.is_admin_of_user(p_user uuid) returns boolean` — caller is an active admin of an active school where `p_user` is a member
  - `public.is_any_school_admin(p_user uuid) returns boolean` — `p_user` has an active `admin` membership anywhere
  - Read rules (all writes to these tables happen only with the secret key):
    - `schools`: members of the (active) school, or super admin
    - `memberships`: own row in an active school; all rows of a school the caller administers; super admin sees only `role = 'admin'` rows
    - `profiles`: own; members of a school the caller administers; super admin sees only school-admin profiles

- [ ] **Step 1: Write the failing RLS tests**

```ts
// tests/db/rls-core.test.ts
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import type { SupabaseClient } from '@supabase/supabase-js'
import {
  addMember, cleanupTestData, createTestSchool, createTestUser, signInAs, type TestUser,
} from './helpers'

let s1: { id: string }, s2: { id: string }, suspended: { id: string }
let admin1: TestUser, teacher1: TestUser, student1: TestUser, admin2: TestUser, suspendedTeacher: TestUser
let boss: SupabaseClient, admin1C: SupabaseClient, teacher1C: SupabaseClient, suspendedC: SupabaseClient

beforeAll(async () => {
  s1 = await createTestSchool()
  s2 = await createTestSchool()
  suspended = await createTestSchool({ status: 'suspended' })
  admin1 = await createTestUser({ fullName: 'Admin One' })
  teacher1 = await createTestUser({ fullName: 'Teacher One' })
  student1 = await createTestUser({ fullName: 'Student One' })
  admin2 = await createTestUser({ fullName: 'Admin Two' })
  suspendedTeacher = await createTestUser()
  await addMember(s1.id, admin1.id, 'admin')
  await addMember(s1.id, teacher1.id, 'teacher')
  await addMember(s1.id, student1.id, 'student')
  await addMember(s2.id, admin2.id, 'admin')
  await addMember(suspended.id, suspendedTeacher.id, 'teacher')

  boss = await signInAs(await createTestUser({ superAdmin: true }))
  admin1C = await signInAs(admin1)
  teacher1C = await signInAs(teacher1)
  suspendedC = await signInAs(suspendedTeacher)
})

afterAll(cleanupTestData)

const ids = (rows: { id?: string; user_id?: string }[] | null, key: 'id' | 'user_id' = 'id') =>
  (rows ?? []).map((r) => r[key]).sort()

describe('schools RLS', () => {
  it('a member sees only their own school', async () => {
    const { data } = await teacher1C.from('schools').select('id')
    expect(ids(data)).toEqual([s1.id])
  })

  it('super admin sees every school', async () => {
    const { data } = await boss.from('schools').select('id').in('id', [s1.id, s2.id, suspended.id])
    expect(ids(data)).toEqual([s1.id, s2.id, suspended.id].sort())
  })

  it('a member of a suspended school sees nothing', async () => {
    const schools = await suspendedC.from('schools').select('id')
    const members = await suspendedC.from('memberships').select('user_id')
    expect(schools.data).toEqual([])
    expect(members.data).toEqual([])
  })

  it('a signed-in non-super-admin cannot create a school', async () => {
    const { error } = await admin1C.from('schools').insert({ name: 'Hack', slug: 'test-hack' })
    expect(error).not.toBeNull()
  })
})

describe('memberships RLS', () => {
  it('a teacher sees only their own membership', async () => {
    const { data } = await teacher1C.from('memberships').select('user_id')
    expect(ids(data, 'user_id')).toEqual([teacher1.id])
  })

  it('a school admin sees all memberships of their school only', async () => {
    const { data } = await admin1C.from('memberships').select('user_id, school_id')
    expect(ids(data, 'user_id')).toEqual([admin1.id, teacher1.id, student1.id].sort())
    expect(new Set(data!.map((r) => r.school_id))).toEqual(new Set([s1.id]))
  })

  it('super admin sees admin memberships but not teachers or students', async () => {
    const { data } = await boss
      .from('memberships')
      .select('user_id, role')
      .in('school_id', [s1.id, s2.id])
    expect(ids(data, 'user_id')).toEqual([admin1.id, admin2.id].sort())
  })
})

describe('profiles RLS', () => {
  it('a teacher sees only their own profile', async () => {
    const { data } = await teacher1C.from('profiles').select('id')
    expect(ids(data)).toEqual([teacher1.id])
  })

  it('a school admin sees profiles of their school members only', async () => {
    const { data } = await admin1C
      .from('profiles')
      .select('id')
      .in('id', [admin1.id, teacher1.id, student1.id, admin2.id])
    expect(ids(data)).toEqual([admin1.id, teacher1.id, student1.id].sort())
  })

  it('super admin sees school admin profiles but never student or teacher profiles', async () => {
    const { data } = await boss
      .from('profiles')
      .select('id')
      .in('id', [admin1.id, teacher1.id, student1.id, admin2.id])
    expect(ids(data)).toEqual([admin1.id, admin2.id].sort())
  })
})
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npm run test:db -- tests/db/rls-core.test.ts`
Expected: FAIL — "a member sees only their own school" gets `[]` (RLS on, no policies), and the super admin tests get `[]`.

- [ ] **Step 3: Write the RLS migration**

```sql
-- supabase/migrations/20260913000002_core_rls.sql

create function public.is_admin_of_user(p_user uuid)
returns boolean
language sql stable security definer set search_path = ''
as $$
  select exists (
    select 1
    from public.memberships me
    join public.schools s on s.id = me.school_id and s.status = 'active'
    join public.memberships them on them.school_id = me.school_id
    where me.user_id = auth.uid()
      and me.role = 'admin'
      and me.active
      and them.user_id = p_user
  );
$$;

create function public.is_any_school_admin(p_user uuid)
returns boolean
language sql stable security definer set search_path = ''
as $$
  select exists (
    select 1 from public.memberships m
    where m.user_id = p_user and m.role = 'admin' and m.active
  );
$$;

revoke execute on function public.is_admin_of_user(uuid) from public, anon;
revoke execute on function public.is_any_school_admin(uuid) from public, anon;
grant execute on function public.is_admin_of_user(uuid) to authenticated;
grant execute on function public.is_any_school_admin(uuid) to authenticated;

-- schools: read only
create policy schools_select on public.schools
  for select to authenticated
  using (public.is_super_admin() or public.my_role_in(id) is not null);

-- memberships: read only
create policy memberships_select_own on public.memberships
  for select to authenticated
  using (user_id = auth.uid() and public.my_role_in(school_id) is not null);

create policy memberships_select_school_admin on public.memberships
  for select to authenticated
  using (public.my_role_in(school_id) = 'admin');

create policy memberships_select_super_admin on public.memberships
  for select to authenticated
  using (role = 'admin' and public.is_super_admin());

-- profiles: read only
create policy profiles_select_own on public.profiles
  for select to authenticated
  using (id = auth.uid());

create policy profiles_select_school_admin on public.profiles
  for select to authenticated
  using (public.is_admin_of_user(id));

create policy profiles_select_super_admin on public.profiles
  for select to authenticated
  using (public.is_super_admin() and public.is_any_school_admin(id));
```

No insert/update/delete policies exist, so the `authenticated` and `anon` roles cannot write these tables; server code uses the secret key after its own permission check.

- [ ] **Step 4: Push and run tests**

Run: `npx supabase db push` then `npm run test:db -- tests/db/rls-core.test.ts`
Expected: PASS, 10 tests.

- [ ] **Step 5: Commit**

```powershell
git add supabase/migrations/20260913000002_core_rls.sql tests/db/rls-core.test.ts
git commit -m "feat(db): RLS policies isolating schools, memberships and profiles"
```

---

### Task 4: Super admin school overview (counts only)

**Files:**
- Create: `supabase/migrations/20260913000003_platform_rpc.sql`, `tests/db/platform-overview.test.ts`

**Interfaces:**
- Consumes: Task 2–3 tables and helpers
- Produces: `public.platform_school_overview()` returning rows
  `{ id uuid, name text, slug text, city text, contact_name text, contact_phone text, status school_status, created_at timestamptz, admin_count int, teacher_count int, student_count int, last_activity timestamptz }`,
  ordered by `name`; raises SQLSTATE `42501` with message `forbidden` for non-super-admins. Plan 3 replaces `last_activity` with the latest diary post time.

- [ ] **Step 1: Write the failing test**

```ts
// tests/db/platform-overview.test.ts
import { afterAll, describe, expect, it } from 'vitest'
import {
  addMember, cleanupTestData, createTestSchool, createTestUser, signInAs,
} from './helpers'

afterAll(cleanupTestData)

describe('platform_school_overview', () => {
  it('returns per-school counts and no personal data to the super admin', async () => {
    const school = await createTestSchool()
    await addMember(school.id, (await createTestUser()).id, 'admin')
    await addMember(school.id, (await createTestUser()).id, 'teacher')
    await addMember(school.id, (await createTestUser()).id, 'student')
    await addMember(school.id, (await createTestUser()).id, 'student')
    await addMember(school.id, (await createTestUser()).id, 'student', { active: false })
    const boss = await signInAs(await createTestUser({ superAdmin: true }))

    const { data, error } = await boss.rpc('platform_school_overview')
    expect(error).toBeNull()
    const row = data!.find((r: { id: string }) => r.id === school.id)
    expect(row).toMatchObject({ admin_count: 1, teacher_count: 1, student_count: 2, status: 'active' })
    expect(Object.keys(row).sort()).toEqual([
      'admin_count', 'city', 'contact_name', 'contact_phone', 'created_at', 'id',
      'last_activity', 'name', 'slug', 'status', 'student_count', 'teacher_count',
    ])
  })

  it('refuses anyone who is not a super admin', async () => {
    const school = await createTestSchool()
    const user = await createTestUser()
    await addMember(school.id, user.id, 'admin')
    const client = await signInAs(user)

    const { data, error } = await client.rpc('platform_school_overview')
    expect(data).toBeNull()
    expect(error?.code).toBe('42501')
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm run test:db -- tests/db/platform-overview.test.ts`
Expected: FAIL — `Could not find the function public.platform_school_overview`.

- [ ] **Step 3: Write the migration**

```sql
-- supabase/migrations/20260913000003_platform_rpc.sql

create function public.platform_school_overview()
returns table (
  id uuid,
  name text,
  slug text,
  city text,
  contact_name text,
  contact_phone text,
  status public.school_status,
  created_at timestamptz,
  admin_count int,
  teacher_count int,
  student_count int,
  last_activity timestamptz
)
language plpgsql stable security definer set search_path = ''
as $$
begin
  if not public.is_super_admin() then
    raise exception 'forbidden' using errcode = '42501';
  end if;

  return query
  select
    s.id, s.name, s.slug, s.city, s.contact_name, s.contact_phone, s.status, s.created_at,
    (count(*) filter (where m.role = 'admin' and m.active))::int,
    (count(*) filter (where m.role = 'teacher' and m.active))::int,
    (count(*) filter (where m.role = 'student' and m.active))::int,
    greatest(s.created_at, max(m.created_at))
  from public.schools s
  left join public.memberships m on m.school_id = s.id
  group by s.id
  order by s.name;
end;
$$;

revoke execute on function public.platform_school_overview() from public, anon;
grant execute on function public.platform_school_overview() to authenticated;
```

- [ ] **Step 4: Push and run tests**

Run: `npx supabase db push` then `npm run test:db -- tests/db/platform-overview.test.ts`
Expected: PASS, 2 tests.

- [ ] **Step 5: Commit**

```powershell
git add supabase/migrations/20260913000003_platform_rpc.sql tests/db/platform-overview.test.ts
git commit -m "feat(db): super admin school overview with aggregate counts only"
```

---

### Task 5: Pure logic — credentials, login resolution, home routing, validation

**Files:**
- Create: `src/lib/accounts/credentials.ts`, `src/lib/auth/login-identifier.ts`, `src/lib/auth/messages.ts`, `src/lib/auth/home-path.ts`, `src/lib/platform/validation.ts`
- Test: `tests/unit/credentials.test.ts`, `tests/unit/login-identifier.test.ts`, `tests/unit/home-path.test.ts`, `tests/unit/validation.test.ts`

**Interfaces:**
- Consumes: nothing (no Supabase, no Next.js)
- Produces:
  - `credentials.ts`: `generateTempPassword(length?: number): string`, `slugify(input: string): string`, `usernameLocal(input: string): string`, `formatUsername(local: string, schoolSlug: string): string`, `internalEmailFor(username: string, domain: string): string`, `nextUsernameCandidate(base: string, taken: ReadonlySet<string>): string`
  - `login-identifier.ts`: `resolveLoginEmail(raw: string, domain: string): { kind: 'email' | 'username'; email: string } | null`
  - `messages.ts`: `LOGIN_ERRORS: { suspended: string; 'no-access': string; invalid: string; format: string }`
  - `home-path.ts`: types `Role`, `Membership`, `AccountContext`; `homePathFor(ctx: AccountContext): string`; `toAccountContext(userId: string, profile: { full_name: string; is_super_admin: boolean; must_change_password: boolean }, rows: MembershipRow[]): AccountContext` where rows are `my_memberships()` results
  - `validation.ts`: `SLUG_PATTERN`, `newSchoolSchema`, `adminAccountSchema`, `passwordSchema`, `newSchoolFromForm(fd: FormData): unknown`, `adminAccountFromForm(fd: FormData): unknown`, `toFieldErrors(error: ZodError): Record<string, string>`; inferred types `NewSchoolInput`, `AdminAccountInput`

- [ ] **Step 1: Write failing tests for credentials**

```ts
// tests/unit/credentials.test.ts
import { describe, expect, it } from 'vitest'
import {
  formatUsername, generateTempPassword, internalEmailFor, nextUsernameCandidate, slugify, usernameLocal,
} from '@/lib/accounts/credentials'

describe('generateTempPassword', () => {
  it('has the requested length and no look-alike characters', () => {
    for (let i = 0; i < 50; i++) {
      const pw = generateTempPassword(10)
      expect(pw).toHaveLength(10)
      expect(pw).not.toMatch(/[0O1lI]/)
    }
  })

  it('is different each time', () => {
    expect(generateTempPassword()).not.toBe(generateTempPassword())
  })
})

describe('slugify', () => {
  it('lowercases and hyphenates', () => {
    expect(slugify('  City School — G7 Campus! ')).toBe('city-school-g7-campus')
  })
  it('caps at 40 characters without a trailing hyphen', () => {
    const s = slugify('a'.repeat(39) + ' bbb')
    expect(s.length).toBeLessThanOrEqual(40)
    expect(s.endsWith('-')).toBe(false)
  })
})

describe('usernameLocal', () => {
  it('turns names into dotted lowercase', () => {
    expect(usernameLocal('Ali Khan 7B')).toBe('ali.khan.7b')
  })
  it('falls back to "user" when nothing usable remains', () => {
    expect(usernameLocal('!!!')).toBe('user')
  })
})

describe('formatUsername / internalEmailFor', () => {
  it('builds the visible username and its internal email', () => {
    const u = formatUsername('ali.7b', 'city-school')
    expect(u).toBe('ali.7b@city-school')
    expect(internalEmailFor(u, 'accounts.classboard.test')).toBe('ali.7b--city-school@accounts.classboard.test')
  })
})

describe('nextUsernameCandidate', () => {
  it('returns the base when free, else appends the first free number', () => {
    expect(nextUsernameCandidate('admin', new Set())).toBe('admin')
    expect(nextUsernameCandidate('admin', new Set(['admin', 'admin2']))).toBe('admin3')
  })
})
```

- [ ] **Step 2: Write failing tests for login resolution and home routing**

```ts
// tests/unit/login-identifier.test.ts
import { describe, expect, it } from 'vitest'
import { resolveLoginEmail } from '@/lib/auth/login-identifier'

const D = 'accounts.classboard.test'

describe('resolveLoginEmail', () => {
  it('passes real emails through, lowercased', () => {
    expect(resolveLoginEmail('  Hina@School.PK ', D)).toEqual({ kind: 'email', email: 'hina@school.pk' })
  })
  it('maps generated usernames to internal emails', () => {
    expect(resolveLoginEmail('Ali.7B@City-School', D)).toEqual({
      kind: 'username',
      email: 'ali.7b--city-school@accounts.classboard.test',
    })
  })
  it('rejects anything else', () => {
    expect(resolveLoginEmail('ali', D)).toBeNull()
    expect(resolveLoginEmail('', D)).toBeNull()
    expect(resolveLoginEmail('a b@c.d', D)).toBeNull()
  })
})
```

```ts
// tests/unit/home-path.test.ts
import { describe, expect, it } from 'vitest'
import { homePathFor, toAccountContext, type AccountContext, type Membership } from '@/lib/auth/home-path'

const m = (role: Membership['role'], schoolStatus: Membership['schoolStatus'] = 'active'): Membership => ({
  schoolId: `s-${role}-${schoolStatus}`, schoolName: 'S', schoolSlug: 's', schoolStatus, role, canCreateClasses: false,
})
const ctx = (over: Partial<AccountContext>): AccountContext => ({
  userId: 'u', fullName: 'U', isSuperAdmin: false, mustChangePassword: false, memberships: [], ...over,
})

describe('homePathFor', () => {
  it('forces password change first', () => {
    expect(homePathFor(ctx({ mustChangePassword: true, isSuperAdmin: true }))).toBe('/change-password')
  })
  it('sends super admins to the platform panel', () => {
    expect(homePathFor(ctx({ isSuperAdmin: true }))).toBe('/platform')
  })
  it('picks the highest role among active schools', () => {
    expect(homePathFor(ctx({ memberships: [m('student'), m('teacher')] }))).toBe('/teacher')
    expect(homePathFor(ctx({ memberships: [m('guardian'), m('admin')] }))).toBe('/admin')
    expect(homePathFor(ctx({ memberships: [m('guardian')] }))).toBe('/diary')
    expect(homePathFor(ctx({ memberships: [m('student')] }))).toBe('/diary')
  })
  it('ignores suspended schools and reports suspension when nothing else is left', () => {
    expect(homePathFor(ctx({ memberships: [m('admin', 'suspended'), m('student')] }))).toBe('/diary')
    expect(homePathFor(ctx({ memberships: [m('admin', 'suspended')] }))).toBe('/login?error=suspended')
  })
  it('reports no access when the user has no memberships', () => {
    expect(homePathFor(ctx({}))).toBe('/login?error=no-access')
  })
  it('reports suspension before asking for a password change', () => {
    expect(homePathFor(ctx({ mustChangePassword: true, memberships: [m('admin', 'suspended')] })))
      .toBe('/login?error=suspended')
    expect(homePathFor(ctx({ mustChangePassword: true, memberships: [m('teacher')] }))).toBe('/change-password')
  })
})

describe('toAccountContext', () => {
  it('maps the profile and my_memberships rows', () => {
    const result = toAccountContext(
      'u1',
      { full_name: 'Hina', is_super_admin: false, must_change_password: true },
      [{ school_id: 's1', school_name: 'City', school_slug: 'city', school_status: 'active', role: 'admin', can_create_classes: false }],
    )
    expect(result).toEqual({
      userId: 'u1', fullName: 'Hina', isSuperAdmin: false, mustChangePassword: true,
      memberships: [{ schoolId: 's1', schoolName: 'City', schoolSlug: 'city', schoolStatus: 'active', role: 'admin', canCreateClasses: false }],
    })
  })
})
```

- [ ] **Step 3: Write failing tests for validation**

```ts
// tests/unit/validation.test.ts
import { describe, expect, it } from 'vitest'
import {
  newSchoolFromForm, newSchoolSchema, passwordSchema, toFieldErrors,
} from '@/lib/platform/validation'

function form(values: Record<string, string>) {
  const fd = new FormData()
  for (const [k, v] of Object.entries(values)) fd.set(k, v)
  return fd
}

const valid = {
  name: 'City School G7', slug: 'city-school-g7', city: 'Islamabad', contactName: '', contactPhone: '',
  timeZone: 'Asia/Karachi', adminFullName: 'Asad Ali', adminEmail: '', adminPhone: '0300 1234567',
}

describe('newSchoolSchema', () => {
  it('accepts a valid form and normalises empty strings to null', () => {
    const r = newSchoolSchema.safeParse(newSchoolFromForm(form(valid)))
    expect(r.success).toBe(true)
    expect(r.data).toMatchObject({
      name: 'City School G7', slug: 'city-school-g7', contactName: null,
      admin: { fullName: 'Asad Ali', email: null, phone: '0300 1234567' },
    })
  })

  it('reports field errors with dotted paths', () => {
    const r = newSchoolSchema.safeParse(
      newSchoolFromForm(form({ ...valid, slug: 'Bad Slug', timeZone: 'Mars/Base', adminFullName: '', adminEmail: 'nope' })),
    )
    expect(r.success).toBe(false)
    const errors = toFieldErrors(r.error!)
    expect(Object.keys(errors).sort()).toEqual(['admin.email', 'admin.fullName', 'slug', 'timeZone'])
  })
})

describe('passwordSchema', () => {
  it('requires 8+ characters and matching confirmation', () => {
    expect(passwordSchema.safeParse({ password: 'short', confirm: 'short' }).success).toBe(false)
    const mismatch = passwordSchema.safeParse({ password: 'longenough1', confirm: 'longenough2' })
    expect(toFieldErrors(mismatch.error!)).toEqual({ confirm: 'Passwords do not match' })
    expect(passwordSchema.safeParse({ password: 'longenough1', confirm: 'longenough1' }).success).toBe(true)
  })
})
```

- [ ] **Step 4: Run tests to verify they fail**

Run: `npm test`
Expected: FAIL — cannot resolve `@/lib/accounts/credentials`, `@/lib/auth/login-identifier`, `@/lib/auth/home-path`, `@/lib/platform/validation`.

- [ ] **Step 5: Implement `credentials.ts`**

```ts
// src/lib/accounts/credentials.ts
import { randomInt } from 'node:crypto'

// No 0/O, 1/l/I — parents often copy these by hand
const PASSWORD_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnpqrstuvwxyz23456789'

export function generateTempPassword(length = 10): string {
  let out = ''
  for (let i = 0; i < length; i++) out += PASSWORD_ALPHABET[randomInt(PASSWORD_ALPHABET.length)]
  return out
}

export function slugify(input: string): string {
  return input
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 40)
    .replace(/-+$/g, '')
}

export function usernameLocal(input: string): string {
  const local = input
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '.')
    .replace(/^\.+|\.+$/g, '')
    .slice(0, 30)
    .replace(/\.+$/g, '')
  return local || 'user'
}

export function formatUsername(local: string, schoolSlug: string): string {
  return `${local}@${schoolSlug}`
}

export function internalEmailFor(username: string, domain: string): string {
  const [local, slug] = username.split('@')
  return `${local}--${slug}@${domain}`
}

export function nextUsernameCandidate(base: string, taken: ReadonlySet<string>): string {
  if (!taken.has(base)) return base
  let n = 2
  while (taken.has(`${base}${n}`)) n++
  return `${base}${n}`
}
```

- [ ] **Step 6: Implement `login-identifier.ts` and `messages.ts`**

```ts
// src/lib/auth/login-identifier.ts
import { internalEmailFor } from '@/lib/accounts/credentials'

const USERNAME = /^[a-z0-9]+(\.[a-z0-9]+)*@[a-z0-9]+(-[a-z0-9]+)*$/
const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

export function resolveLoginEmail(
  raw: string,
  domain: string,
): { kind: 'email' | 'username'; email: string } | null {
  const value = raw.trim().toLowerCase()
  if (USERNAME.test(value)) return { kind: 'username', email: internalEmailFor(value, domain) }
  if (EMAIL.test(value)) return { kind: 'email', email: value }
  return null
}
```

```ts
// src/lib/auth/messages.ts
export const LOGIN_ERRORS = {
  suspended: "Your school's account is inactive. Contact your school.",
  'no-access': "Your account isn't linked to a school. Contact your school.",
  invalid: 'Wrong login or password.',
  format: 'Enter your email or username (like ali.7b@cityschool).',
} as const
```

- [ ] **Step 7: Implement `home-path.ts`**

```ts
// src/lib/auth/home-path.ts
export type Role = 'admin' | 'teacher' | 'student' | 'guardian'

export type Membership = {
  schoolId: string
  schoolName: string
  schoolSlug: string
  schoolStatus: 'active' | 'suspended'
  role: Role
  canCreateClasses: boolean
}

export type AccountContext = {
  userId: string
  fullName: string
  isSuperAdmin: boolean
  mustChangePassword: boolean
  memberships: Membership[]
}

const ROLE_HOME: Record<Role, string> = {
  admin: '/admin',
  teacher: '/teacher',
  guardian: '/diary',
  student: '/diary',
}
const ROLE_PRIORITY: Role[] = ['admin', 'teacher', 'guardian', 'student']

export function homePathFor(ctx: AccountContext): string {
  // Access is decided before the password-change step, so a suspended school's
  // user sees the suspension message instead of being asked to set a password.
  let home: string
  if (ctx.isSuperAdmin) {
    home = '/platform'
  } else {
    const active = ctx.memberships.filter((m) => m.schoolStatus === 'active')
    const role = ROLE_PRIORITY.find((r) => active.some((m) => m.role === r))
    if (role) home = ROLE_HOME[role]
    else if (ctx.memberships.length > 0) return '/login?error=suspended'
    else return '/login?error=no-access'
  }
  return ctx.mustChangePassword ? '/change-password' : home
}

type MembershipRow = {
  school_id: string
  school_name: string
  school_slug: string
  school_status: 'active' | 'suspended'
  role: Role
  can_create_classes: boolean
}

export function toAccountContext(
  userId: string,
  profile: { full_name: string; is_super_admin: boolean; must_change_password: boolean },
  rows: MembershipRow[],
): AccountContext {
  return {
    userId,
    fullName: profile.full_name,
    isSuperAdmin: profile.is_super_admin,
    mustChangePassword: profile.must_change_password,
    memberships: rows.map((r) => ({
      schoolId: r.school_id,
      schoolName: r.school_name,
      schoolSlug: r.school_slug,
      schoolStatus: r.school_status,
      role: r.role,
      canCreateClasses: r.can_create_classes,
    })),
  }
}
```

- [ ] **Step 8: Implement `validation.ts`**

```ts
// src/lib/platform/validation.ts
import { z, type ZodError } from 'zod'

export const SLUG_PATTERN = /^[a-z0-9]+(-[a-z0-9]+)*$/
const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

const optionalText = (max: number) =>
  z.string().trim().max(max).transform((v) => (v === '' ? null : v))

function isTimeZone(tz: string): boolean {
  try {
    new Intl.DateTimeFormat('en', { timeZone: tz })
    return true
  } catch {
    return false
  }
}

export const adminAccountSchema = z.object({
  fullName: z.string().trim().min(1, "Enter the admin's name").max(120),
  email: z
    .string()
    .trim()
    .toLowerCase()
    .refine((v) => v === '' || EMAIL.test(v), 'Enter a valid email')
    .transform((v) => (v === '' ? null : v)),
  phone: optionalText(30),
})

export const newSchoolSchema = z.object({
  name: z.string().trim().min(2, 'Enter the school name').max(120),
  slug: z
    .string()
    .trim()
    .max(40, 'Use at most 40 characters')
    .regex(SLUG_PATTERN, 'Use lowercase letters, numbers and single hyphens'),
  city: optionalText(80),
  contactName: optionalText(120),
  contactPhone: optionalText(30),
  timeZone: z.string().refine(isTimeZone, 'Choose a valid time zone'),
  admin: adminAccountSchema,
})

export const passwordSchema = z
  .object({
    password: z.string().min(8, 'Use at least 8 characters').max(72, 'Use at most 72 characters'),
    confirm: z.string(),
  })
  .refine((d) => d.password === d.confirm, { message: 'Passwords do not match', path: ['confirm'] })

export type NewSchoolInput = z.infer<typeof newSchoolSchema>
export type AdminAccountInput = z.infer<typeof adminAccountSchema>

const text = (fd: FormData, key: string) => String(fd.get(key) ?? '')

export function adminAccountFromForm(fd: FormData): unknown {
  return { fullName: text(fd, 'adminFullName'), email: text(fd, 'adminEmail'), phone: text(fd, 'adminPhone') }
}

export function newSchoolFromForm(fd: FormData): unknown {
  return {
    name: text(fd, 'name'),
    slug: text(fd, 'slug'),
    city: text(fd, 'city'),
    contactName: text(fd, 'contactName'),
    contactPhone: text(fd, 'contactPhone'),
    timeZone: text(fd, 'timeZone'),
    admin: adminAccountFromForm(fd),
  }
}

export function toFieldErrors(error: ZodError): Record<string, string> {
  const out: Record<string, string> = {}
  for (const issue of error.issues) {
    const key = issue.path.join('.')
    if (!(key in out)) out[key] = issue.message
  }
  return out
}
```

- [ ] **Step 9: Run tests to verify they pass**

Run: `npm test`
Expected: PASS — all tests in `tests/unit` (smoke + 4 new files).

- [ ] **Step 10: Commit**

```powershell
git add src/lib tests/unit
git commit -m "feat: credentials, login resolution, role routing and form validation"
```

---

### Task 6: Server services — account creation and school management

**Files:**
- Create: `src/lib/supabase/admin.ts`, `src/lib/env.ts`, `src/lib/accounts/create-account.ts`, `src/lib/platform/schools.ts`
- Modify: `tests/db/helpers.ts` (cleanup also removes generated-username users)
- Test: `tests/db/platform-schools.test.ts`

**Interfaces:**
- Consumes: Task 5 `credentials.ts`, `NewSchoolInput`, `AdminAccountInput`; Task 2–3 tables
- Produces:
  - `env.ts`: `publicEnv(): { supabaseUrl: string; publishableKey: string }`, `serverEnv(): { secretKey: string; accountEmailDomain: string }`
  - `admin.ts`: `createAdminClient(): SupabaseClient` (server-only)
  - `create-account.ts`: type `Credentials = { userId: string; fullName: string; login: string; temporaryPassword: string }`; class `AccountExistsError`; `createAccount(admin, input: { fullName: string; email: string | null; phone: string | null; usernameBase: string; schoolSlug: string }, accountDomain: string): Promise<Credentials>` — Plan 2 reuses this for teachers, students, guardians
  - `schools.ts`: classes `SlugTakenError`, `LastAdminError`, `NotSchoolAdminError`;
    `createSchoolWithAdmin(admin, input: NewSchoolInput, accountDomain: string): Promise<{ schoolId: string; credentials: Credentials }>`,
    `addSchoolAdmin(admin, schoolId: string, input: AdminAccountInput, accountDomain: string): Promise<Credentials>`,
    `removeSchoolAdmin(admin, schoolId: string, userId: string): Promise<void>`,
    `resetSchoolAdminPassword(admin, schoolId: string, userId: string): Promise<{ login: string; temporaryPassword: string }>`,
    `setSchoolStatus(admin, schoolId: string, status: 'active' | 'suspended'): Promise<void>`

These functions do **no** permission checks — callers (server actions in Task 8) must call `requireSuperAdmin()` first. They take the admin client as a parameter so tests can pass their own.

- [ ] **Step 1: Update test cleanup for generated usernames**

In `tests/db/helpers.ts`, replace the user loop inside `cleanupTestData` with:

```ts
  for (const u of data?.users ?? []) {
    const email = u.email ?? ''
    // real test emails start with test-; generated usernames embed the test- school slug
    if (email.startsWith(TEST_PREFIX) || email.includes(`--${TEST_PREFIX}`)) {
      await admin.auth.admin.deleteUser(u.id)
    }
  }
```

- [ ] **Step 2: Write the failing integration tests**

```ts
// tests/db/platform-schools.test.ts
import { afterAll, describe, expect, it } from 'vitest'
import { createClient } from '@supabase/supabase-js'
import { randomUUID } from 'node:crypto'
import { adminClient, cleanupTestData, TEST_PREFIX } from './helpers'
import {
  addSchoolAdmin, createSchoolWithAdmin, LastAdminError, removeSchoolAdmin,
  resetSchoolAdminPassword, setSchoolStatus, SlugTakenError,
} from '@/lib/platform/schools'
import { resolveLoginEmail } from '@/lib/auth/login-identifier'
import type { NewSchoolInput } from '@/lib/platform/validation'

const DOMAIN = process.env.ACCOUNT_EMAIL_DOMAIN!
afterAll(cleanupTestData)

function schoolInput(over: Partial<NewSchoolInput> = {}): NewSchoolInput {
  return {
    name: 'Test School', slug: `${TEST_PREFIX}${randomUUID().slice(0, 8)}`,
    city: null, contactName: null, contactPhone: null, timeZone: 'Asia/Karachi',
    admin: { fullName: 'Asad Ali', email: null, phone: '03001234567' },
    ...over,
  }
}

async function canSignIn(login: string, password: string) {
  const client = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!,
    { auth: { persistSession: false } },
  )
  const resolved = resolveLoginEmail(login, DOMAIN)!
  const { error } = await client.auth.signInWithPassword({ email: resolved.email, password })
  return error === null
}

describe('createSchoolWithAdmin', () => {
  it('creates the school, a username admin who must change password, and can sign in', async () => {
    const admin = adminClient()
    const input = schoolInput()
    const { schoolId, credentials } = await createSchoolWithAdmin(admin, input, DOMAIN)

    expect(credentials.login).toBe(`admin@${input.slug}`)
    const { data: profile } = await admin.from('profiles').select('*').eq('id', credentials.userId).single()
    expect(profile).toMatchObject({ full_name: 'Asad Ali', username: `admin@${input.slug}`, must_change_password: true })
    const { data: membership } = await admin
      .from('memberships').select('role, active').eq('school_id', schoolId).eq('user_id', credentials.userId).single()
    expect(membership).toEqual({ role: 'admin', active: true })
    expect(await canSignIn(credentials.login, credentials.temporaryPassword)).toBe(true)
  })

  it('uses the email as login when one is given', async () => {
    const email = `${TEST_PREFIX}${randomUUID().slice(0, 8)}@school.test`
    const { credentials } = await createSchoolWithAdmin(
      adminClient(), schoolInput({ admin: { fullName: 'Hina', email, phone: null } }), DOMAIN,
    )
    expect(credentials.login).toBe(email)
    expect(await canSignIn(email, credentials.temporaryPassword)).toBe(true)
  })

  it('throws SlugTakenError and leaves no extra school or user behind', async () => {
    const admin = adminClient()
    const input = schoolInput()
    await createSchoolWithAdmin(admin, input, DOMAIN)
    await expect(createSchoolWithAdmin(admin, { ...input, name: 'Other' }, DOMAIN)).rejects.toBeInstanceOf(SlugTakenError)
    const { count } = await admin.from('schools').select('id', { count: 'exact', head: true }).eq('slug', input.slug)
    expect(count).toBe(1)
  })
})

describe('school admin management', () => {
  it('adds a second username admin as admin2, protects the last admin, resets passwords', async () => {
    const admin = adminClient()
    const input = schoolInput()
    const { schoolId, credentials: first } = await createSchoolWithAdmin(admin, input, DOMAIN)

    const second = await addSchoolAdmin(admin, schoolId, { fullName: 'Second', email: null, phone: null }, DOMAIN)
    expect(second.login).toBe(`admin2@${input.slug}`)

    await removeSchoolAdmin(admin, schoolId, first.userId)
    await expect(removeSchoolAdmin(admin, schoolId, second.userId)).rejects.toBeInstanceOf(LastAdminError)

    const reset = await resetSchoolAdminPassword(admin, schoolId, second.userId)
    expect(reset.login).toBe(second.login)
    expect(await canSignIn(second.login, second.temporaryPassword)).toBe(false)
    expect(await canSignIn(reset.login, reset.temporaryPassword)).toBe(true)
  })

  it('suspends and reactivates a school', async () => {
    const admin = adminClient()
    const { schoolId } = await createSchoolWithAdmin(admin, schoolInput(), DOMAIN)
    await setSchoolStatus(admin, schoolId, 'suspended')
    expect((await admin.from('schools').select('status').eq('id', schoolId).single()).data?.status).toBe('suspended')
    await setSchoolStatus(admin, schoolId, 'active')
    expect((await admin.from('schools').select('status').eq('id', schoolId).single()).data?.status).toBe('active')
  })
})
```

- [ ] **Step 3: Run tests to verify they fail**

Run: `npm run test:db -- tests/db/platform-schools.test.ts`
Expected: FAIL — cannot resolve `@/lib/platform/schools`.

- [ ] **Step 4: Implement `env.ts` and `admin.ts`**

```ts
// src/lib/env.ts
function required(name: string, value: string | undefined): string {
  if (!value) throw new Error(`Missing environment variable ${name}`)
  return value
}

// NEXT_PUBLIC_* must be referenced literally so Next.js inlines them in the browser bundle
export function publicEnv() {
  return {
    supabaseUrl: required('NEXT_PUBLIC_SUPABASE_URL', process.env.NEXT_PUBLIC_SUPABASE_URL),
    publishableKey: required(
      'NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY',
      process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY,
    ),
  }
}

export function serverEnv() {
  return {
    secretKey: required('SUPABASE_SECRET_KEY', process.env.SUPABASE_SECRET_KEY),
    accountEmailDomain: required('ACCOUNT_EMAIL_DOMAIN', process.env.ACCOUNT_EMAIL_DOMAIN),
  }
}
```

```ts
// src/lib/supabase/admin.ts
import 'server-only'
import { createClient, type SupabaseClient } from '@supabase/supabase-js'
import { publicEnv, serverEnv } from '@/lib/env'

export function createAdminClient(): SupabaseClient {
  return createClient(publicEnv().supabaseUrl, serverEnv().secretKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  })
}
```

- [ ] **Step 5: Implement `create-account.ts`**

```ts
// src/lib/accounts/create-account.ts
import 'server-only'
import type { SupabaseClient } from '@supabase/supabase-js'
import {
  formatUsername, generateTempPassword, internalEmailFor, nextUsernameCandidate, usernameLocal,
} from './credentials'

export type Credentials = {
  userId: string
  fullName: string
  login: string
  temporaryPassword: string
}

export class AccountExistsError extends Error {
  constructor(login: string) {
    super(`An account with ${login} already exists`)
  }
}

export async function createAccount(
  admin: SupabaseClient,
  input: {
    fullName: string
    email: string | null
    phone: string | null
    usernameBase: string
    schoolSlug: string
  },
  accountDomain: string,
): Promise<Credentials> {
  let username: string | null = null
  let authEmail: string

  if (input.email) {
    authEmail = input.email
  } else {
    const base = usernameLocal(input.usernameBase)
    const { data, error } = await admin
      .from('profiles')
      .select('username')
      .like('username', `${base}%@${input.schoolSlug}`)
    if (error) throw error
    const taken = new Set((data ?? []).map((r) => String(r.username).split('@')[0]))
    username = formatUsername(nextUsernameCandidate(base, taken), input.schoolSlug)
    authEmail = internalEmailFor(username, accountDomain)
  }

  const temporaryPassword = generateTempPassword()
  const { data: created, error } = await admin.auth.admin.createUser({
    email: authEmail,
    password: temporaryPassword,
    email_confirm: true,
    user_metadata: { full_name: input.fullName },
  })
  if (error) {
    if (error.code === 'email_exists') throw new AccountExistsError(input.email ?? username!)
    throw error
  }

  const { error: profileError } = await admin.from('profiles').insert({
    id: created.user.id,
    full_name: input.fullName,
    email: input.email,
    phone: input.phone,
    username,
    must_change_password: true,
  })
  if (profileError) {
    await admin.auth.admin.deleteUser(created.user.id)
    throw profileError
  }

  return {
    userId: created.user.id,
    fullName: input.fullName,
    login: input.email ?? username!,
    temporaryPassword,
  }
}
```

- [ ] **Step 6: Implement `schools.ts`**

```ts
// src/lib/platform/schools.ts
import 'server-only'
import type { SupabaseClient } from '@supabase/supabase-js'
import { createAccount, type Credentials } from '@/lib/accounts/create-account'
import { generateTempPassword } from '@/lib/accounts/credentials'
import type { AdminAccountInput, NewSchoolInput } from './validation'

export class SlugTakenError extends Error {
  constructor(slug: string) {
    super(`The address "${slug}" is already used by another school`)
  }
}
export class LastAdminError extends Error {
  constructor() {
    super('A school must keep at least one admin. Add a new admin first.')
  }
}
export class NotSchoolAdminError extends Error {
  constructor() {
    super('That person is not an admin of this school')
  }
}

export async function createSchoolWithAdmin(
  admin: SupabaseClient,
  input: NewSchoolInput,
  accountDomain: string,
): Promise<{ schoolId: string; credentials: Credentials }> {
  const { data: school, error } = await admin
    .from('schools')
    .insert({
      name: input.name,
      slug: input.slug,
      city: input.city,
      contact_name: input.contactName,
      contact_phone: input.contactPhone,
      time_zone: input.timeZone,
    })
    .select('id')
    .single()
  if (error) {
    if (error.code === '23505') throw new SlugTakenError(input.slug)
    throw error
  }

  let credentials: Credentials | null = null
  try {
    credentials = await createAccount(
      admin,
      { ...input.admin, usernameBase: 'admin', schoolSlug: input.slug },
      accountDomain,
    )
    const { error: mErr } = await admin
      .from('memberships')
      .insert({ school_id: school.id, user_id: credentials.userId, role: 'admin' })
    if (mErr) throw mErr
    return { schoolId: school.id, credentials }
  } catch (e) {
    if (credentials) await admin.auth.admin.deleteUser(credentials.userId)
    await admin.from('schools').delete().eq('id', school.id)
    throw e
  }
}

export async function addSchoolAdmin(
  admin: SupabaseClient,
  schoolId: string,
  input: AdminAccountInput,
  accountDomain: string,
): Promise<Credentials> {
  const { data: school, error } = await admin.from('schools').select('slug').eq('id', schoolId).single()
  if (error) throw error

  const credentials = await createAccount(
    admin,
    { ...input, usernameBase: 'admin', schoolSlug: school.slug },
    accountDomain,
  )
  const { error: mErr } = await admin
    .from('memberships')
    .insert({ school_id: schoolId, user_id: credentials.userId, role: 'admin' })
  if (mErr) {
    await admin.auth.admin.deleteUser(credentials.userId)
    throw mErr
  }
  return credentials
}

async function activeAdminIds(admin: SupabaseClient, schoolId: string): Promise<string[]> {
  const { data, error } = await admin
    .from('memberships')
    .select('user_id')
    .eq('school_id', schoolId)
    .eq('role', 'admin')
    .eq('active', true)
  if (error) throw error
  return data.map((r) => r.user_id)
}

export async function removeSchoolAdmin(admin: SupabaseClient, schoolId: string, userId: string) {
  const ids = await activeAdminIds(admin, schoolId)
  if (!ids.includes(userId)) throw new NotSchoolAdminError()
  if (ids.length <= 1) throw new LastAdminError()
  const { error } = await admin
    .from('memberships')
    .update({ active: false })
    .eq('school_id', schoolId)
    .eq('user_id', userId)
  if (error) throw error
}

export async function resetSchoolAdminPassword(
  admin: SupabaseClient,
  schoolId: string,
  userId: string,
): Promise<{ login: string; temporaryPassword: string }> {
  if (!(await activeAdminIds(admin, schoolId)).includes(userId)) throw new NotSchoolAdminError()

  const temporaryPassword = generateTempPassword()
  const { error } = await admin.auth.admin.updateUserById(userId, { password: temporaryPassword })
  if (error) throw error

  const { data: profile, error: pErr } = await admin
    .from('profiles')
    .update({ must_change_password: true })
    .eq('id', userId)
    .select('email, username')
    .single()
  if (pErr) throw pErr
  return { login: profile.email ?? profile.username, temporaryPassword }
}

export async function setSchoolStatus(
  admin: SupabaseClient,
  schoolId: string,
  status: 'active' | 'suspended',
) {
  const { error } = await admin.from('schools').update({ status }).eq('id', schoolId)
  if (error) throw error
}
```

- [ ] **Step 7: Run tests to verify they pass**

Run: `npm run test:db -- tests/db/platform-schools.test.ts`
Expected: PASS, 5 tests.

- [ ] **Step 8: Run all DB tests together**

Run: `npm run test:db`
Expected: PASS — schema, rls-core, platform-overview, platform-schools.

- [ ] **Step 9: Commit**

```powershell
git add src/lib tests/db
git commit -m "feat: server services for creating schools and managing school admins"
```

---

### Task 7: Sessions, login, logout, forced password change, role guards

**Files:**
- Create: `src/lib/supabase/server.ts`, `src/lib/supabase/proxy.ts`, `src/proxy.ts`, `src/lib/auth/account-context.ts`, `src/lib/auth/guards.ts`, `src/components/submit-button.tsx`, `src/app/login/page.tsx`, `src/app/login/login-form.tsx`, `src/app/login/actions.ts`, `src/app/change-password/page.tsx`, `src/app/change-password/form.tsx`, `src/app/change-password/actions.ts`, `src/app/logout/route.ts`, `src/app/admin/page.tsx`, `src/app/teacher/page.tsx`, `src/app/diary/page.tsx`
- Modify: `src/app/page.tsx` (replace), `src/app/globals.css` (replace), `src/app/layout.tsx` (metadata)

**Interfaces:**
- Consumes: Task 5 `resolveLoginEmail`, `LOGIN_ERRORS`, `homePathFor`, `toAccountContext`, `passwordSchema`, `toFieldErrors`; Task 6 `publicEnv`, `serverEnv`, `createAdminClient`
- Produces:
  - `server.ts`: `createClient(): Promise<SupabaseClient>` (cookie session)
  - `account-context.ts`: `loadAccountContext(supabase: SupabaseClient): Promise<AccountContext | null>`, `getAccountContext(): Promise<AccountContext | null>` (cached per request)
  - `guards.ts`: `requireAccount(): Promise<AccountContext>`, `requireSuperAdmin(): Promise<AccountContext>`, `requireMember(roles: Role[]): Promise<{ ctx: AccountContext; memberships: Membership[] }>`
  - `<SubmitButton pendingText className?>` client component
  - CSS component classes: `.input`, `.btn-primary`, `.btn-secondary`, `.btn-danger`, `.field-error`, `.card`
  - Routes: `/login`, `/logout?next=/login?...` (GET/POST), `/change-password`, `/admin`, `/teacher`, `/diary`

Pages and actions in this task are verified by the Playwright flows in Task 9; logic they depend on is already unit-tested.

- [ ] **Step 1: Supabase server client and proxy**

```ts
// src/lib/supabase/server.ts
import 'server-only'
import { createServerClient } from '@supabase/ssr'
import { cookies } from 'next/headers'
import { publicEnv } from '@/lib/env'

export async function createClient() {
  const cookieStore = await cookies()
  const { supabaseUrl, publishableKey } = publicEnv()
  return createServerClient(supabaseUrl, publishableKey, {
    cookies: {
      getAll() {
        return cookieStore.getAll()
      },
      setAll(cookiesToSet) {
        try {
          cookiesToSet.forEach(({ name, value, options }) => cookieStore.set(name, value, options))
        } catch {
          // Called from a Server Component, where cookies are read-only; proxy.ts refreshes sessions.
        }
      },
    },
  })
}
```

```ts
// src/lib/supabase/proxy.ts
import { createServerClient } from '@supabase/ssr'
import { NextResponse, type NextRequest } from 'next/server'
import { publicEnv } from '@/lib/env'

const PUBLIC_PATHS = ['/login']

export async function updateSession(request: NextRequest) {
  let response = NextResponse.next({ request })
  const { supabaseUrl, publishableKey } = publicEnv()

  const supabase = createServerClient(supabaseUrl, publishableKey, {
    cookies: {
      getAll() {
        return request.cookies.getAll()
      },
      setAll(cookiesToSet) {
        cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value))
        response = NextResponse.next({ request })
        cookiesToSet.forEach(({ name, value, options }) => response.cookies.set(name, value, options))
      },
    },
  })

  // Do not put code between client creation and getClaims(): it refreshes the token.
  const { data } = await supabase.auth.getClaims()
  const signedIn = Boolean(data?.claims)
  const isPublic = PUBLIC_PATHS.some((p) => request.nextUrl.pathname.startsWith(p))

  if (!signedIn && !isPublic) {
    const url = request.nextUrl.clone()
    url.pathname = '/login'
    url.search = ''
    return NextResponse.redirect(url)
  }
  return response
}
```

```ts
// src/proxy.ts
import { type NextRequest } from 'next/server'
import { updateSession } from '@/lib/supabase/proxy'

export async function proxy(request: NextRequest) {
  return await updateSession(request)
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)'],
}
```

- [ ] **Step 2: Account context and guards**

```ts
// src/lib/auth/account-context.ts
import 'server-only'
import { cache } from 'react'
import type { SupabaseClient } from '@supabase/supabase-js'
import { createClient } from '@/lib/supabase/server'
import { toAccountContext, type AccountContext } from './home-path'

export async function loadAccountContext(supabase: SupabaseClient): Promise<AccountContext | null> {
  const { data: claims } = await supabase.auth.getClaims()
  const userId = claims?.claims?.sub
  if (!userId) return null

  const [profileResult, membershipsResult] = await Promise.all([
    supabase
      .from('profiles')
      .select('full_name, is_super_admin, must_change_password')
      .eq('id', userId)
      .maybeSingle(),
    supabase.rpc('my_memberships'),
  ])
  if (profileResult.error || membershipsResult.error || !profileResult.data) return null
  return toAccountContext(userId, profileResult.data, membershipsResult.data ?? [])
}

export const getAccountContext = cache(async () => loadAccountContext(await createClient()))
```

```ts
// src/lib/auth/guards.ts
import 'server-only'
import { redirect } from 'next/navigation'
import { getAccountContext } from './account-context'
import { homePathFor, type AccountContext, type Membership, type Role } from './home-path'

function leave(ctx: AccountContext): never {
  const home = homePathFor(ctx)
  // Blocked users (suspended / no access) must also lose their session
  if (home.startsWith('/login')) redirect(`/logout?next=${encodeURIComponent(home)}`)
  redirect(home)
}

export async function requireAccount(): Promise<AccountContext> {
  const ctx = await getAccountContext()
  if (!ctx) redirect('/login')
  const home = homePathFor(ctx)
  if (home.startsWith('/login')) leave(ctx)
  if (home === '/change-password') redirect('/change-password')
  return ctx
}

export async function requireSuperAdmin(): Promise<AccountContext> {
  const ctx = await requireAccount()
  if (!ctx.isSuperAdmin) leave(ctx)
  return ctx
}

export async function requireMember(
  roles: Role[],
): Promise<{ ctx: AccountContext; memberships: Membership[] }> {
  const ctx = await requireAccount()
  const memberships = ctx.memberships.filter(
    (m) => m.schoolStatus === 'active' && roles.includes(m.role),
  )
  if (memberships.length === 0) leave(ctx)
  return { ctx, memberships }
}
```

- [ ] **Step 3: Shared UI pieces and global styles**

Replace `src/app/globals.css` entirely:

```css
@import "tailwindcss";

body {
  @apply bg-gray-50 text-gray-900 antialiased;
}

@layer components {
  .input {
    @apply mt-1 block w-full rounded-md border border-gray-300 bg-white px-3 py-2 text-base
      focus:border-blue-600 focus:outline-none focus:ring-2 focus:ring-blue-600/30;
  }
  .btn-primary {
    @apply inline-flex items-center justify-center rounded-md bg-blue-600 px-4 py-2.5 font-medium text-white
      hover:bg-blue-700 disabled:opacity-60;
  }
  .btn-secondary {
    @apply inline-flex items-center justify-center rounded-md border border-gray-300 bg-white px-4 py-2.5 font-medium
      hover:bg-gray-50 disabled:opacity-60;
  }
  .btn-danger {
    @apply inline-flex items-center justify-center rounded-md bg-red-600 px-4 py-2.5 font-medium text-white
      hover:bg-red-700 disabled:opacity-60;
  }
  .field-error {
    @apply mt-1 text-sm text-red-600;
  }
  .card {
    @apply rounded-lg border border-gray-200 bg-white p-4 shadow-sm;
  }
}
```

In `src/app/layout.tsx`, change the `metadata` export to:

```ts
export const metadata: Metadata = {
  title: 'ClassBoard',
  description: 'Digital school diary',
}
```

```tsx
// src/components/submit-button.tsx
'use client'
import { useFormStatus } from 'react-dom'

export function SubmitButton({
  children,
  pendingText,
  className = 'btn-primary w-full',
}: {
  children: React.ReactNode
  pendingText: string
  className?: string
}) {
  const { pending } = useFormStatus()
  return (
    <button type="submit" disabled={pending} className={className}>
      {pending ? pendingText : children}
    </button>
  )
}
```

- [ ] **Step 4: Login**

```ts
// src/app/login/actions.ts
'use server'
import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { serverEnv } from '@/lib/env'
import { resolveLoginEmail } from '@/lib/auth/login-identifier'
import { loadAccountContext } from '@/lib/auth/account-context'
import { homePathFor } from '@/lib/auth/home-path'
import { LOGIN_ERRORS } from '@/lib/auth/messages'

export type LoginState = { error: string | null; login: string }

export async function loginAction(_prev: LoginState, formData: FormData): Promise<LoginState> {
  const login = String(formData.get('login') ?? '')
  const password = String(formData.get('password') ?? '')

  const resolved = resolveLoginEmail(login, serverEnv().accountEmailDomain)
  if (!resolved) return { error: LOGIN_ERRORS.format, login }

  const supabase = await createClient()
  const { error } = await supabase.auth.signInWithPassword({ email: resolved.email, password })
  if (error) return { error: LOGIN_ERRORS.invalid, login }

  const ctx = await loadAccountContext(supabase)
  const home = ctx ? homePathFor(ctx) : '/login?error=no-access'
  if (home.startsWith('/login')) {
    await supabase.auth.signOut()
    return { error: home.endsWith('suspended') ? LOGIN_ERRORS.suspended : LOGIN_ERRORS['no-access'], login }
  }
  redirect(home)
}
```

```tsx
// src/app/login/login-form.tsx
'use client'
import { useActionState } from 'react'
import { loginAction, type LoginState } from './actions'
import { SubmitButton } from '@/components/submit-button'

export function LoginForm({ initialError }: { initialError: string | null }) {
  const [state, action] = useActionState<LoginState, FormData>(loginAction, {
    error: initialError,
    login: '',
  })

  return (
    <form action={action} className="space-y-4">
      <label className="block">
        <span className="text-sm font-medium">Email or username</span>
        <input name="login" defaultValue={state.login} autoComplete="username" required className="input" />
      </label>
      <label className="block">
        <span className="text-sm font-medium">Password</span>
        <input name="password" type="password" autoComplete="current-password" required className="input" />
      </label>
      {state.error && (
        <p role="alert" className="field-error">
          {state.error}
        </p>
      )}
      <SubmitButton pendingText="Logging in…">Log in</SubmitButton>
    </form>
  )
}
```

```tsx
// src/app/login/page.tsx
import { LoginForm } from './login-form'
import { LOGIN_ERRORS } from '@/lib/auth/messages'

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>
}) {
  const { error } = await searchParams
  const initialError = error === 'suspended' || error === 'no-access' ? LOGIN_ERRORS[error] : null

  return (
    <main className="grid min-h-dvh place-items-center px-4">
      <div className="w-full max-w-sm space-y-6">
        <h1 className="text-center text-2xl font-semibold">ClassBoard</h1>
        <div className="card">
          <LoginForm initialError={initialError} />
        </div>
        <p className="text-center text-sm text-gray-500">
          Forgot your password? Ask your school admin to reset it.
        </p>
      </div>
    </main>
  )
}
```

- [ ] **Step 5: Logout route**

```ts
// src/app/logout/route.ts
import { NextResponse, type NextRequest } from 'next/server'
import { createClient } from '@/lib/supabase/server'

async function signOut(request: NextRequest) {
  const supabase = await createClient()
  await supabase.auth.signOut()
  const next = request.nextUrl.searchParams.get('next')
  const target = next && next.startsWith('/login') ? next : '/login'
  return NextResponse.redirect(new URL(target, request.url), { status: 303 })
}

export const GET = signOut
export const POST = signOut
```

- [ ] **Step 6: Forced password change**

```ts
// src/app/change-password/actions.ts
'use server'
import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { loadAccountContext } from '@/lib/auth/account-context'
import { homePathFor } from '@/lib/auth/home-path'
import { passwordSchema, toFieldErrors } from '@/lib/platform/validation'

export type PasswordState = { errors: Record<string, string> }

export async function changePasswordAction(_prev: PasswordState, formData: FormData): Promise<PasswordState> {
  const parsed = passwordSchema.safeParse({
    password: String(formData.get('password') ?? ''),
    confirm: String(formData.get('confirm') ?? ''),
  })
  if (!parsed.success) return { errors: toFieldErrors(parsed.error) }

  const supabase = await createClient()
  const ctx = await loadAccountContext(supabase)
  if (!ctx) redirect('/login')

  const { error } = await supabase.auth.updateUser({ password: parsed.data.password })
  if (error) {
    return {
      errors: {
        password:
          error.code === 'same_password'
            ? 'Choose a password different from the temporary one'
            : 'Could not change the password. Try again.',
      },
    }
  }

  const { error: profileError } = await createAdminClient()
    .from('profiles')
    .update({ must_change_password: false })
    .eq('id', ctx.userId)
  if (profileError) throw profileError

  const home = homePathFor({ ...ctx, mustChangePassword: false })
  redirect(home.startsWith('/login') ? `/logout?next=${encodeURIComponent(home)}` : home)
}
```

```tsx
// src/app/change-password/form.tsx
'use client'
import { useActionState } from 'react'
import { changePasswordAction, type PasswordState } from './actions'
import { SubmitButton } from '@/components/submit-button'

export function ChangePasswordForm() {
  const [state, action] = useActionState<PasswordState, FormData>(changePasswordAction, { errors: {} })
  return (
    <form action={action} className="space-y-4">
      <label className="block">
        <span className="text-sm font-medium">New password</span>
        <input name="password" type="password" autoComplete="new-password" required className="input" />
        {state.errors.password && <p className="field-error">{state.errors.password}</p>}
      </label>
      <label className="block">
        <span className="text-sm font-medium">Type it again</span>
        <input name="confirm" type="password" autoComplete="new-password" required className="input" />
        {state.errors.confirm && <p className="field-error">{state.errors.confirm}</p>}
      </label>
      <SubmitButton pendingText="Saving…">Save password</SubmitButton>
    </form>
  )
}
```

```tsx
// src/app/change-password/page.tsx
import { redirect } from 'next/navigation'
import { getAccountContext } from '@/lib/auth/account-context'
import { homePathFor } from '@/lib/auth/home-path'
import { ChangePasswordForm } from './form'

export default async function ChangePasswordPage() {
  const ctx = await getAccountContext()
  if (!ctx) redirect('/login')
  const home = homePathFor({ ...ctx, mustChangePassword: false })
  if (home.startsWith('/login')) redirect(`/logout?next=${encodeURIComponent(home)}`)

  return (
    <main className="grid min-h-dvh place-items-center px-4">
      <div className="w-full max-w-sm space-y-6">
        <div className="text-center">
          <h1 className="text-2xl font-semibold">Set your password</h1>
          <p className="mt-1 text-sm text-gray-600">
            Hi {ctx.fullName}, choose a new password to replace the temporary one.
          </p>
        </div>
        <div className="card">
          <ChangePasswordForm />
        </div>
      </div>
    </main>
  )
}
```

- [ ] **Step 7: Root redirect and guarded role homes**

```tsx
// src/app/page.tsx
import { redirect } from 'next/navigation'
import { getAccountContext } from '@/lib/auth/account-context'
import { homePathFor } from '@/lib/auth/home-path'

export default async function Home() {
  const ctx = await getAccountContext()
  if (!ctx) redirect('/login')
  const home = homePathFor(ctx)
  redirect(home.startsWith('/login') ? `/logout?next=${encodeURIComponent(home)}` : home)
}
```

```tsx
// src/app/admin/page.tsx
import { requireMember } from '@/lib/auth/guards'

export default async function AdminHome() {
  const { memberships } = await requireMember(['admin'])
  return (
    <main className="mx-auto max-w-3xl space-y-2 p-6">
      <h1 className="text-xl font-semibold">{memberships[0].schoolName}</h1>
      <p className="text-gray-600">School admin panel</p>
      <a href="/logout" className="text-sm underline">Log out</a>
    </main>
  )
}
```

```tsx
// src/app/teacher/page.tsx
import { requireMember } from '@/lib/auth/guards'

export default async function TeacherHome() {
  const { memberships } = await requireMember(['teacher'])
  return (
    <main className="mx-auto max-w-3xl space-y-2 p-6">
      <h1 className="text-xl font-semibold">{memberships[0].schoolName}</h1>
      <p className="text-gray-600">Teacher home</p>
      <a href="/logout" className="text-sm underline">Log out</a>
    </main>
  )
}
```

```tsx
// src/app/diary/page.tsx
import { requireMember } from '@/lib/auth/guards'

export default async function DiaryHome() {
  const { memberships } = await requireMember(['student', 'guardian'])
  return (
    <main className="mx-auto max-w-3xl space-y-2 p-6">
      <h1 className="text-xl font-semibold">{memberships[0].schoolName}</h1>
      <p className="text-gray-600">Diary</p>
      <a href="/logout" className="text-sm underline">Log out</a>
    </main>
  )
}
```

- [ ] **Step 8: Verify types, unit tests, and build**

Run: `npm run typecheck` → Expected: no errors.
Run: `npm test` → Expected: PASS.
Run: `npm run build` → Expected: build succeeds; route list includes `/login`, `/change-password`, `/logout`, `/admin`, `/teacher`, `/diary`, and `Proxy` is reported.

- [ ] **Step 9: Manual smoke check**

Run: `npm run dev`, open `http://localhost:3000/`.
Expected: redirected to `/login`; submitting `ali` shows "Enter your email or username (like ali.7b@cityschool)."; submitting `nobody@example.com` / `x` shows "Wrong login or password."

- [ ] **Step 10: Commit**

```powershell
git add src
git commit -m "feat: login, logout, forced password change and role guards"
```

---

### Task 8: Super admin panel — schools list, new school, school detail

**Files:**
- Create: `src/lib/accounts/share-message.ts`, `src/components/credentials-card.tsx`, `src/app/platform/layout.tsx`, `src/app/platform/page.tsx`, `src/app/platform/new/page.tsx`, `src/app/platform/new/form.tsx`, `src/app/platform/new/actions.ts`, `src/app/platform/schools/[id]/page.tsx`, `src/app/platform/schools/[id]/admin-forms.tsx`, `src/app/platform/schools/[id]/actions.ts`
- Test: `tests/unit/share-message.test.ts`

**Interfaces:**
- Consumes: Task 5 validation + `slugify`; Task 6 services, errors, `createAdminClient`, `serverEnv`, `Credentials`; Task 7 `requireSuperAdmin`, `createClient`, `SubmitButton`, CSS classes
- Produces:
  - `share-message.ts`: `credentialsMessage(i: { schoolName: string; fullName: string; login: string; temporaryPassword: string; appUrl: string }): string`, `whatsappShareUrl(message: string): string`
  - `<CredentialsCard schoolName fullName login temporaryPassword />`
  - Server actions: `createSchoolAction(prev: NewSchoolState, fd: FormData)`, `addAdminAction(schoolId: string, prev: AddAdminState, fd: FormData)`, `removeAdminAction(schoolId: string, userId: string, prev: RowState, fd: FormData)`, `resetPasswordAction(schoolId: string, userId: string, prev: RowState, fd: FormData)`, `setStatusAction(schoolId: string, status: 'active' | 'suspended', fd: FormData)`
  - Routes: `/platform`, `/platform/new`, `/platform/schools/[id]`

Every page **and** every server action calls `requireSuperAdmin()` itself — the layout check alone does not protect server actions.

- [ ] **Step 1: Write the failing share-message test**

```ts
// tests/unit/share-message.test.ts
import { describe, expect, it } from 'vitest'
import { credentialsMessage, whatsappShareUrl } from '@/lib/accounts/share-message'

describe('credentialsMessage', () => {
  it('lists the app link, login and temporary password', () => {
    const msg = credentialsMessage({
      schoolName: 'City School', fullName: 'Asad Ali', login: 'admin@city-school',
      temporaryPassword: 'Ab3dEf7hJk', appUrl: 'https://classboard.example',
    })
    expect(msg).toBe(
      [
        'City School – ClassBoard login for Asad Ali',
        'Open: https://classboard.example/login',
        'Login: admin@city-school',
        'Temporary password: Ab3dEf7hJk',
        'You will be asked to set a new password.',
      ].join('\n'),
    )
  })
})

describe('whatsappShareUrl', () => {
  it('encodes the message for wa.me', () => {
    expect(whatsappShareUrl('Login: a@b\nPass: x&y')).toBe('https://wa.me/?text=Login%3A%20a%40b%0APass%3A%20x%26y')
  })
})
```

- [ ] **Step 2: Run to verify it fails**

Run: `npm test -- tests/unit/share-message.test.ts`
Expected: FAIL — cannot resolve `@/lib/accounts/share-message`.

- [ ] **Step 3: Implement `share-message.ts`**

```ts
// src/lib/accounts/share-message.ts
export function credentialsMessage(i: {
  schoolName: string
  fullName: string
  login: string
  temporaryPassword: string
  appUrl: string
}): string {
  return [
    `${i.schoolName} – ClassBoard login for ${i.fullName}`,
    `Open: ${i.appUrl}/login`,
    `Login: ${i.login}`,
    `Temporary password: ${i.temporaryPassword}`,
    'You will be asked to set a new password.',
  ].join('\n')
}

export function whatsappShareUrl(message: string): string {
  return `https://wa.me/?text=${encodeURIComponent(message)}`
}
```

- [ ] **Step 4: Run to verify it passes**

Run: `npm test -- tests/unit/share-message.test.ts`
Expected: PASS, 2 tests.

- [ ] **Step 5: Credentials card**

```tsx
// src/components/credentials-card.tsx
'use client'
import { useState } from 'react'
import { credentialsMessage, whatsappShareUrl } from '@/lib/accounts/share-message'

export function CredentialsCard(props: {
  schoolName: string
  fullName: string
  login: string
  temporaryPassword: string
}) {
  const [copied, setCopied] = useState(false)
  const message = () => credentialsMessage({ ...props, appUrl: window.location.origin })

  return (
    <div className="card space-y-3 border-green-300 bg-green-50" data-testid="credentials-card">
      <p className="font-medium">Login details for {props.fullName}</p>
      <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1 text-sm">
        <dt className="text-gray-600">Login</dt>
        <dd className="font-mono" data-testid="credentials-login">{props.login}</dd>
        <dt className="text-gray-600">Temporary password</dt>
        <dd className="font-mono" data-testid="credentials-password">{props.temporaryPassword}</dd>
      </dl>
      <p className="text-sm text-gray-600">This password is shown only once. Share it now.</p>
      <div className="flex flex-wrap gap-2">
        <button
          type="button"
          className="btn-secondary"
          onClick={async () => {
            await navigator.clipboard.writeText(message())
            setCopied(true)
          }}
        >
          {copied ? 'Copied' : 'Copy'}
        </button>
        <button
          type="button"
          className="btn-secondary"
          onClick={() => window.open(whatsappShareUrl(message()), '_blank', 'noopener')}
        >
          Share on WhatsApp
        </button>
      </div>
    </div>
  )
}
```

- [ ] **Step 6: Platform layout and schools list**

```tsx
// src/app/platform/layout.tsx
import Link from 'next/link'
import { requireSuperAdmin } from '@/lib/auth/guards'

export default async function PlatformLayout({ children }: { children: React.ReactNode }) {
  const ctx = await requireSuperAdmin()
  return (
    <div className="min-h-dvh">
      <header className="border-b border-gray-200 bg-white">
        <div className="mx-auto flex max-w-5xl items-center justify-between gap-4 px-4 py-3">
          <Link href="/platform" className="font-semibold">ClassBoard Platform</Link>
          <div className="flex items-center gap-4 text-sm">
            <span className="hidden text-gray-600 sm:inline">{ctx.fullName}</span>
            <a href="/logout" className="underline">Log out</a>
          </div>
        </div>
      </header>
      <main className="mx-auto max-w-5xl px-4 py-6">{children}</main>
    </div>
  )
}
```

```tsx
// src/app/platform/page.tsx
import Link from 'next/link'
import { requireSuperAdmin } from '@/lib/auth/guards'
import { createClient } from '@/lib/supabase/server'

type OverviewRow = {
  id: string
  name: string
  slug: string
  city: string | null
  status: 'active' | 'suspended'
  admin_count: number
  teacher_count: number
  student_count: number
  last_activity: string
}

export default async function SchoolsPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string }>
}) {
  await requireSuperAdmin()
  const { q = '' } = await searchParams
  const supabase = await createClient()
  const { data, error } = await supabase.rpc('platform_school_overview')
  if (error) throw error

  const term = q.trim().toLowerCase()
  const rows = (data as OverviewRow[]).filter(
    (r) => !term || r.name.toLowerCase().includes(term) || (r.city ?? '').toLowerCase().includes(term),
  )

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-2xl font-semibold">Schools</h1>
        <Link href="/platform/new" className="btn-primary">+ New school</Link>
      </div>

      <form className="max-w-sm">
        <input name="q" defaultValue={q} placeholder="Search by name or city" className="input" />
      </form>

      {rows.length === 0 ? (
        <p className="text-gray-600">{term ? 'No schools match your search.' : 'No schools yet.'}</p>
      ) : (
        <div className="overflow-x-auto rounded-lg border border-gray-200 bg-white">
          <table className="w-full text-left text-sm">
            <thead className="bg-gray-50 text-gray-600">
              <tr>
                <th className="px-4 py-2">School</th>
                <th className="px-4 py-2">City</th>
                <th className="px-4 py-2 text-right">Teachers</th>
                <th className="px-4 py-2 text-right">Students</th>
                <th className="px-4 py-2">Last activity</th>
                <th className="px-4 py-2">Status</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.id} className="border-t border-gray-100">
                  <td className="px-4 py-2">
                    <Link href={`/platform/schools/${r.id}`} className="font-medium text-blue-700 underline">
                      {r.name}
                    </Link>
                  </td>
                  <td className="px-4 py-2">{r.city ?? '—'}</td>
                  <td className="px-4 py-2 text-right">{r.teacher_count}</td>
                  <td className="px-4 py-2 text-right">{r.student_count}</td>
                  <td className="px-4 py-2">{new Date(r.last_activity).toLocaleDateString('en-GB')}</td>
                  <td className="px-4 py-2">
                    {r.status === 'active' ? (
                      <span className="text-green-700">● Active</span>
                    ) : (
                      <span className="text-red-700">● Suspended</span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}
```

- [ ] **Step 7: New school action**

```ts
// src/app/platform/new/actions.ts
'use server'
import { revalidatePath } from 'next/cache'
import { requireSuperAdmin } from '@/lib/auth/guards'
import { createAdminClient } from '@/lib/supabase/admin'
import { serverEnv } from '@/lib/env'
import { newSchoolFromForm, newSchoolSchema, toFieldErrors } from '@/lib/platform/validation'
import { createSchoolWithAdmin, SlugTakenError } from '@/lib/platform/schools'
import { AccountExistsError, type Credentials } from '@/lib/accounts/create-account'

export type NewSchoolState = {
  errors: Record<string, string>
  values: Record<string, string>
  created: { schoolId: string; schoolName: string; credentials: Credentials } | null
}

export async function createSchoolAction(_prev: NewSchoolState, formData: FormData): Promise<NewSchoolState> {
  await requireSuperAdmin()
  const values = Object.fromEntries([...formData.entries()].map(([k, v]) => [k, String(v)]))

  const parsed = newSchoolSchema.safeParse(newSchoolFromForm(formData))
  if (!parsed.success) return { errors: toFieldErrors(parsed.error), values, created: null }

  try {
    const { schoolId, credentials } = await createSchoolWithAdmin(
      createAdminClient(),
      parsed.data,
      serverEnv().accountEmailDomain,
    )
    revalidatePath('/platform')
    return { errors: {}, values: {}, created: { schoolId, schoolName: parsed.data.name, credentials } }
  } catch (e) {
    if (e instanceof SlugTakenError) return { errors: { slug: e.message }, values, created: null }
    if (e instanceof AccountExistsError) return { errors: { 'admin.email': e.message }, values, created: null }
    throw e
  }
}
```

- [ ] **Step 8: New school page and form**

```tsx
// src/app/platform/new/page.tsx
import { requireSuperAdmin } from '@/lib/auth/guards'
import { NewSchoolForm } from './form'

export default async function NewSchoolPage() {
  await requireSuperAdmin()
  // Computed on the server so the client renders the same list (no hydration mismatch)
  const timeZones = Intl.supportedValuesOf('timeZone')
  return (
    <div className="max-w-xl space-y-4">
      <h1 className="text-2xl font-semibold">New school</h1>
      <NewSchoolForm timeZones={timeZones} />
    </div>
  )
}
```

```tsx
// src/app/platform/new/form.tsx
'use client'
import Link from 'next/link'
import { useActionState, useState } from 'react'
import { createSchoolAction, type NewSchoolState } from './actions'
import { SubmitButton } from '@/components/submit-button'
import { CredentialsCard } from '@/components/credentials-card'
import { slugify } from '@/lib/accounts/credentials'

const initial: NewSchoolState = { errors: {}, values: {}, created: null }

function Field(props: {
  label: string
  name: string
  error?: string
  defaultValue?: string
  type?: string
  required?: boolean
  hint?: string
}) {
  return (
    <label className="block">
      <span className="text-sm font-medium">{props.label}</span>
      <input
        name={props.name}
        type={props.type ?? 'text'}
        defaultValue={props.defaultValue}
        required={props.required}
        className="input"
      />
      {props.hint && <span className="mt-1 block text-xs text-gray-500">{props.hint}</span>}
      {props.error && <p className="field-error">{props.error}</p>}
    </label>
  )
}

export function NewSchoolForm({ timeZones }: { timeZones: string[] }) {
  const [state, action] = useActionState(createSchoolAction, initial)
  const [slug, setSlug] = useState(state.values.slug ?? '')
  const [slugEdited, setSlugEdited] = useState(Boolean(state.values.slug))

  if (state.created) {
    return (
      <div className="space-y-4">
        <p className="text-green-800">School “{state.created.schoolName}” created.</p>
        <CredentialsCard schoolName={state.created.schoolName} {...state.created.credentials} />
        <div className="flex flex-wrap gap-2">
          <Link href={`/platform/schools/${state.created.schoolId}`} className="btn-primary">Open school</Link>
          <a href="/platform/new" className="btn-secondary">Create another</a>
        </div>
      </div>
    )
  }

  const v = state.values
  const e = state.errors
  return (
    <form action={action} className="space-y-6">
      <fieldset className="card space-y-4">
        <legend className="px-1 font-medium">School</legend>
        <label className="block">
          <span className="text-sm font-medium">School name</span>
          <input
            name="name"
            defaultValue={v.name}
            required
            className="input"
            onChange={(ev) => {
              if (!slugEdited) setSlug(slugify(ev.target.value))
            }}
          />
          {e.name && <p className="field-error">{e.name}</p>}
        </label>
        <label className="block">
          <span className="text-sm font-medium">School address (used in usernames)</span>
          <input
            name="slug"
            value={slug}
            required
            className="input font-mono"
            onChange={(ev) => {
              setSlugEdited(true)
              setSlug(ev.target.value)
            }}
          />
          <span className="mt-1 block text-xs text-gray-500">Example username: ali.7b@{slug || 'school'}</span>
          {e.slug && <p className="field-error">{e.slug}</p>}
        </label>
        <Field label="City" name="city" defaultValue={v.city} error={e.city} />
        <Field label="Contact person" name="contactName" defaultValue={v.contactName} error={e.contactName} />
        <Field label="Contact phone" name="contactPhone" type="tel" defaultValue={v.contactPhone} error={e.contactPhone} />
        <label className="block">
          <span className="text-sm font-medium">Time zone</span>
          <select name="timeZone" defaultValue={v.timeZone ?? ''} required className="input">
            <option value="" disabled>Choose…</option>
            {timeZones.map((tz) => (
              <option key={tz} value={tz}>{tz}</option>
            ))}
          </select>
          {e.timeZone && <p className="field-error">{e.timeZone}</p>}
        </label>
      </fieldset>

      <fieldset className="card space-y-4">
        <legend className="px-1 font-medium">School admin</legend>
        <Field label="Full name" name="adminFullName" defaultValue={v.adminFullName} error={e['admin.fullName']} required />
        <Field
          label="Email (optional)"
          name="adminEmail"
          type="email"
          defaultValue={v.adminEmail}
          error={e['admin.email']}
          hint="Without an email, a username like admin@school-address is created."
        />
        <Field label="Phone (optional)" name="adminPhone" type="tel" defaultValue={v.adminPhone} error={e['admin.phone']} />
      </fieldset>

      <SubmitButton pendingText="Creating…" className="btn-primary">Create school</SubmitButton>
    </form>
  )
}
```

- [ ] **Step 9: School detail actions**

```ts
// src/app/platform/schools/[id]/actions.ts
'use server'
import { revalidatePath } from 'next/cache'
import { z } from 'zod'
import { requireSuperAdmin } from '@/lib/auth/guards'
import { createAdminClient } from '@/lib/supabase/admin'
import { serverEnv } from '@/lib/env'
import { adminAccountFromForm, adminAccountSchema, toFieldErrors } from '@/lib/platform/validation'
import {
  addSchoolAdmin, LastAdminError, NotSchoolAdminError, removeSchoolAdmin,
  resetSchoolAdminPassword, setSchoolStatus,
} from '@/lib/platform/schools'
import { AccountExistsError, type Credentials } from '@/lib/accounts/create-account'

export type AddAdminState = { errors: Record<string, string>; created: Credentials | null }
export type RowState = { error: string | null; reset: { login: string; temporaryPassword: string } | null }

const id = z.uuid()

export async function addAdminAction(schoolId: string, _prev: AddAdminState, formData: FormData): Promise<AddAdminState> {
  await requireSuperAdmin()
  const parsed = adminAccountSchema.safeParse(adminAccountFromForm(formData))
  if (!parsed.success) return { errors: toFieldErrors(parsed.error), created: null }
  try {
    const created = await addSchoolAdmin(createAdminClient(), id.parse(schoolId), parsed.data, serverEnv().accountEmailDomain)
    revalidatePath(`/platform/schools/${schoolId}`)
    return { errors: {}, created }
  } catch (e) {
    if (e instanceof AccountExistsError) return { errors: { email: e.message }, created: null }
    throw e
  }
}

export async function removeAdminAction(schoolId: string, userId: string, _prev: RowState, _fd: FormData): Promise<RowState> {
  await requireSuperAdmin()
  try {
    await removeSchoolAdmin(createAdminClient(), id.parse(schoolId), id.parse(userId))
    revalidatePath(`/platform/schools/${schoolId}`)
    return { error: null, reset: null }
  } catch (e) {
    if (e instanceof LastAdminError || e instanceof NotSchoolAdminError) return { error: e.message, reset: null }
    throw e
  }
}

export async function resetPasswordAction(schoolId: string, userId: string, _prev: RowState, _fd: FormData): Promise<RowState> {
  await requireSuperAdmin()
  try {
    const reset = await resetSchoolAdminPassword(createAdminClient(), id.parse(schoolId), id.parse(userId))
    return { error: null, reset }
  } catch (e) {
    if (e instanceof NotSchoolAdminError) return { error: e.message, reset: null }
    throw e
  }
}

export async function setStatusAction(schoolId: string, status: 'active' | 'suspended', _fd: FormData): Promise<void> {
  await requireSuperAdmin()
  await setSchoolStatus(createAdminClient(), id.parse(schoolId), z.enum(['active', 'suspended']).parse(status))
  revalidatePath(`/platform/schools/${schoolId}`)
  revalidatePath('/platform')
}
```

- [ ] **Step 10: School detail client forms**

```tsx
// src/app/platform/schools/[id]/admin-forms.tsx
'use client'
import { useActionState } from 'react'
import {
  addAdminAction, removeAdminAction, resetPasswordAction, setStatusAction,
  type AddAdminState, type RowState,
} from './actions'
import { SubmitButton } from '@/components/submit-button'
import { CredentialsCard } from '@/components/credentials-card'

const emptyRow: RowState = { error: null, reset: null }

export function AddAdminForm({ schoolId, schoolName }: { schoolId: string; schoolName: string }) {
  const [state, action] = useActionState<AddAdminState, FormData>(addAdminAction.bind(null, schoolId), {
    errors: {},
    created: null,
  })
  return (
    <div className="space-y-3">
      {state.created && <CredentialsCard schoolName={schoolName} {...state.created} />}
      <form action={action} className="card grid gap-3 sm:grid-cols-3">
        <label className="block">
          <span className="text-sm font-medium">Full name</span>
          <input name="adminFullName" required className="input" />
          {state.errors.fullName && <p className="field-error">{state.errors.fullName}</p>}
        </label>
        <label className="block">
          <span className="text-sm font-medium">Email (optional)</span>
          <input name="adminEmail" type="email" className="input" />
          {state.errors.email && <p className="field-error">{state.errors.email}</p>}
        </label>
        <label className="block">
          <span className="text-sm font-medium">Phone (optional)</span>
          <input name="adminPhone" type="tel" className="input" />
        </label>
        <div className="sm:col-span-3">
          <SubmitButton pendingText="Adding…" className="btn-primary">Add admin</SubmitButton>
        </div>
      </form>
    </div>
  )
}

export function AdminRowActions(props: {
  schoolId: string
  schoolName: string
  userId: string
  fullName: string
}) {
  const [removeState, removeAction] = useActionState<RowState, FormData>(
    removeAdminAction.bind(null, props.schoolId, props.userId),
    emptyRow,
  )
  const [resetState, resetAction] = useActionState<RowState, FormData>(
    resetPasswordAction.bind(null, props.schoolId, props.userId),
    emptyRow,
  )
  const error = removeState.error ?? resetState.error

  return (
    <div className="space-y-2">
      <div className="flex flex-wrap gap-2">
        <form
          action={resetAction}
          onSubmit={(e) => {
            if (!confirm(`Reset the password for ${props.fullName}?`)) e.preventDefault()
          }}
        >
          <SubmitButton pendingText="Resetting…" className="btn-secondary">Reset password</SubmitButton>
        </form>
        <form
          action={removeAction}
          onSubmit={(e) => {
            if (!confirm(`Remove ${props.fullName} as admin?`)) e.preventDefault()
          }}
        >
          <SubmitButton pendingText="Removing…" className="btn-secondary">Remove</SubmitButton>
        </form>
      </div>
      {error && <p className="field-error">{error}</p>}
      {resetState.reset && (
        <CredentialsCard schoolName={props.schoolName} fullName={props.fullName} {...resetState.reset} />
      )}
    </div>
  )
}

export function StatusForm({ schoolId, status }: { schoolId: string; status: 'active' | 'suspended' }) {
  const next = status === 'active' ? 'suspended' : 'active'
  return (
    <form
      action={setStatusAction.bind(null, schoolId, next)}
      onSubmit={(e) => {
        const msg =
          next === 'suspended'
            ? 'Suspend this school? Nobody in it will be able to use the app.'
            : 'Reactivate this school?'
        if (!confirm(msg)) e.preventDefault()
      }}
    >
      <SubmitButton
        pendingText="Saving…"
        className={next === 'suspended' ? 'btn-danger' : 'btn-primary'}
      >
        {next === 'suspended' ? 'Suspend school' : 'Reactivate school'}
      </SubmitButton>
    </form>
  )
}
```

- [ ] **Step 11: School detail page**

```tsx
// src/app/platform/schools/[id]/page.tsx
import Link from 'next/link'
import { notFound } from 'next/navigation'
import { z } from 'zod'
import { requireSuperAdmin } from '@/lib/auth/guards'
import { createClient } from '@/lib/supabase/server'
import { AddAdminForm, AdminRowActions, StatusForm } from './admin-forms'

export default async function SchoolDetailPage({ params }: { params: Promise<{ id: string }> }) {
  await requireSuperAdmin()
  const { id } = await params
  if (!z.uuid().safeParse(id).success) notFound()

  const supabase = await createClient()
  const [{ data: overview, error }, { data: memberships, error: mErr }] = await Promise.all([
    supabase.rpc('platform_school_overview'),
    supabase.from('memberships').select('user_id').eq('school_id', id).eq('role', 'admin').eq('active', true),
  ])
  if (error) throw error
  if (mErr) throw mErr

  const school = (overview as Array<Record<string, unknown>>).find((r) => r.id === id) as
    | {
        id: string; name: string; slug: string; city: string | null; contact_name: string | null
        contact_phone: string | null; status: 'active' | 'suspended'
        admin_count: number; teacher_count: number; student_count: number
      }
    | undefined
  if (!school) notFound()

  const adminIds = (memberships ?? []).map((m) => m.user_id as string)
  const { data: admins, error: pErr } = adminIds.length
    ? await supabase.from('profiles').select('id, full_name, email, username, phone').in('id', adminIds).order('full_name')
    : { data: [], error: null }
  if (pErr) throw pErr

  return (
    <div className="space-y-8">
      <div className="space-y-1">
        <Link href="/platform" className="text-sm text-blue-700 underline">← Schools</Link>
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h1 className="text-2xl font-semibold">{school.name}</h1>
          <StatusForm schoolId={school.id} status={school.status} />
        </div>
        <p className="text-sm text-gray-600">
          {school.status === 'active' ? '● Active' : '● Suspended'} · address <span className="font-mono">{school.slug}</span>
          {school.city && <> · {school.city}</>}
        </p>
      </div>

      <section className="grid grid-cols-3 gap-3">
        {[
          ['Admins', school.admin_count],
          ['Teachers', school.teacher_count],
          ['Students', school.student_count],
        ].map(([label, value]) => (
          <div key={label} className="card text-center">
            <div className="text-2xl font-semibold">{value}</div>
            <div className="text-sm text-gray-600">{label}</div>
          </div>
        ))}
      </section>

      <section className="space-y-2">
        <h2 className="text-lg font-semibold">Contact</h2>
        <p className="text-sm">{school.contact_name ?? '—'} · {school.contact_phone ?? '—'}</p>
      </section>

      <section className="space-y-3">
        <h2 className="text-lg font-semibold">School admins</h2>
        <ul className="space-y-3">
          {(admins ?? []).map((a) => (
            <li key={a.id} className="card space-y-2">
              <div>
                <p className="font-medium">{a.full_name}</p>
                <p className="text-sm text-gray-600">
                  <span className="font-mono">{a.email ?? a.username}</span>
                  {a.phone && <> · {a.phone}</>}
                </p>
              </div>
              <AdminRowActions schoolId={school.id} schoolName={school.name} userId={a.id} fullName={a.full_name} />
            </li>
          ))}
        </ul>
        <h3 className="pt-2 font-medium">Add another admin</h3>
        <AddAdminForm schoolId={school.id} schoolName={school.name} />
      </section>
    </div>
  )
}
```

- [ ] **Step 12: Verify**

Run: `npm run typecheck` → Expected: no errors.
Run: `npm test` → Expected: PASS.
Run: `npm run build` → Expected: succeeds; routes include `/platform`, `/platform/new`, `/platform/schools/[id]`.

- [ ] **Step 13: Commit**

```powershell
git add src tests/unit/share-message.test.ts
git commit -m "feat: super admin panel for schools, admins and suspension"
```

---

### Task 9: Super admin bootstrap script and end-to-end tests

**Files:**
- Create: `scripts/create-super-admin.ts`, `playwright.config.ts`, `e2e/global-setup.ts`, `e2e/global-teardown.ts`, `e2e/login.ts`, `e2e/platform.spec.ts`

**Interfaces:**
- Consumes: everything above; `tests/db/helpers.ts` (`createTestUser`, `createTestSchool`, `addMember`, `adminClient`, `cleanupTestData`)
- Produces: `npx tsx scripts/create-super-admin.ts "Full Name" email password [--test]`; `npm run test:e2e`

- [ ] **Step 1: Bootstrap script**

```ts
// scripts/create-super-admin.ts
// Usage: npx tsx scripts/create-super-admin.ts "Full Name" you@example.com "a-strong-password" [--test]
import { config } from 'dotenv'
import { createClient } from '@supabase/supabase-js'

const args = process.argv.slice(2)
config({ path: args.includes('--test') ? '.env.test' : '.env.local' })

async function main() {
  const [fullName, email, password] = args.filter((a) => a !== '--test')
  if (!fullName || !email || !password || password.length < 8) {
    console.error('Usage: npx tsx scripts/create-super-admin.ts "Full Name" email password(8+ chars) [--test]')
    process.exit(1)
  }

  const admin = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SECRET_KEY!, {
    auth: { persistSession: false, autoRefreshToken: false },
  })
  const { data, error } = await admin.auth.admin.createUser({ email, password, email_confirm: true })
  if (error) throw error

  const { error: profileError } = await admin
    .from('profiles')
    .insert({ id: data.user.id, full_name: fullName, email, is_super_admin: true })
  if (profileError) {
    await admin.auth.admin.deleteUser(data.user.id)
    throw profileError
  }
  console.log(`Super admin created: ${email}`)
}

main().catch((e) => {
  console.error(e instanceof Error ? e.message : e)
  process.exit(1)
})
```

- [ ] **Step 2: Create your own super admin on the dev project**

Run: `npx tsx scripts/create-super-admin.ts "Your Name" your-email@example.com "YourStrongPassword"`
Expected: `Super admin created: your-email@example.com`

Then `npm run dev`, log in at `http://localhost:3000/login` with that email/password.
Expected: lands on `/platform` showing "Schools" and "No schools yet." (or existing schools).

- [ ] **Step 3: Playwright config and global setup/teardown**

`npm run dev` reads `.env.local`; tests read `.env.test`. Both must point at the same **dev** project (Task 2, Step 1).

```ts
// playwright.config.ts
import { defineConfig, devices } from '@playwright/test'
import { config } from 'dotenv'

config({ path: '.env.test' })

export default defineConfig({
  testDir: 'e2e',
  workers: 1,
  fullyParallel: false,
  timeout: 60_000,
  globalSetup: './e2e/global-setup.ts',
  globalTeardown: './e2e/global-teardown.ts',
  use: { baseURL: 'http://localhost:3000', trace: 'retain-on-failure' },
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],
  webServer: {
    command: 'npm run dev',
    url: 'http://localhost:3000/login',
    reuseExistingServer: true,
    timeout: 120_000,
  },
})
```

```ts
// e2e/global-setup.ts
import { mkdirSync, writeFileSync } from 'node:fs'
import { createTestUser } from '../tests/db/helpers'

export default async function globalSetup() {
  const boss = await createTestUser({ superAdmin: true, fullName: 'E2E Super Admin' })
  mkdirSync('e2e/.auth', { recursive: true })
  writeFileSync('e2e/.auth/super-admin.json', JSON.stringify(boss))
}
```

```ts
// e2e/global-teardown.ts
import { cleanupTestData } from '../tests/db/helpers'

export default async function globalTeardown() {
  await cleanupTestData()
}
```

```ts
// e2e/login.ts
import { readFileSync } from 'node:fs'
import type { Page } from '@playwright/test'

export const superAdmin = () =>
  JSON.parse(readFileSync('e2e/.auth/super-admin.json', 'utf8')) as { email: string; password: string }

export async function login(page: Page, login: string, password: string) {
  await page.goto('/login')
  await page.getByLabel('Email or username').fill(login)
  await page.getByLabel('Password', { exact: true }).fill(password)
  await page.getByRole('button', { name: 'Log in' }).click()
}

export async function logout(page: Page) {
  await page.goto('/logout')
  await page.waitForURL(/\/login/)
}
```

- [ ] **Step 4: Write the E2E specs**

```ts
// e2e/platform.spec.ts
import { expect, test } from '@playwright/test'
import { randomUUID } from 'node:crypto'
import { addMember, adminClient, createTestSchool, createTestUser } from '../tests/db/helpers'
import { login, logout, superAdmin } from './login'

test('super admin creates a school; its admin sets a password and reaches the admin panel', async ({ page }) => {
  const boss = superAdmin()
  const slug = `test-${randomUUID().slice(0, 8)}`

  await login(page, boss.email, boss.password)
  await expect(page).toHaveURL(/\/platform$/)
  await page.getByRole('link', { name: '+ New school' }).click()

  await page.getByLabel('School name').fill('E2E Test School')
  await page.getByLabel('School address (used in usernames)').fill(slug)
  await page.getByLabel('Time zone').selectOption('Asia/Karachi')
  await page.getByLabel('Full name').fill('Asad Ali')
  await page.getByRole('button', { name: 'Create school' }).click()

  await expect(page.getByTestId('credentials-card')).toBeVisible()
  const adminLogin = await page.getByTestId('credentials-login').innerText()
  const tempPassword = await page.getByTestId('credentials-password').innerText()
  expect(adminLogin).toBe(`admin@${slug}`)

  await logout(page)
  await login(page, adminLogin, tempPassword)
  await expect(page).toHaveURL(/\/change-password$/)
  await page.getByLabel('New password').fill('NewPassword123')
  await page.getByLabel('Type it again').fill('NewPassword123')
  await page.getByRole('button', { name: 'Save password' }).click()

  await expect(page).toHaveURL(/\/admin$/)
  await expect(page.getByRole('heading', { name: 'E2E Test School' })).toBeVisible()
})

test('suspending a school blocks its admin at login; reactivating restores access', async ({ page }) => {
  const boss = superAdmin()
  const school = await createTestSchool()
  const schoolAdmin = await createTestUser({ fullName: 'Suspend Me' })
  await addMember(school.id, schoolAdmin.id, 'admin')

  await login(page, boss.email, boss.password)
  await page.goto(`/platform/schools/${school.id}`)
  page.once('dialog', (d) => d.accept())
  await page.getByRole('button', { name: 'Suspend school' }).click()
  await expect(page.getByRole('button', { name: 'Reactivate school' })).toBeVisible()

  await logout(page)
  await login(page, schoolAdmin.email, schoolAdmin.password)
  await expect(page.getByRole('alert')).toHaveText("Your school's account is inactive. Contact your school.")

  await login(page, boss.email, boss.password)
  await page.goto(`/platform/schools/${school.id}`)
  page.once('dialog', (d) => d.accept())
  await page.getByRole('button', { name: 'Reactivate school' }).click()
  await expect(page.getByRole('button', { name: 'Suspend school' })).toBeVisible()

  await logout(page)
  await login(page, schoolAdmin.email, schoolAdmin.password)
  await expect(page).toHaveURL(/\/admin$/)
})

test('a signed-in admin is signed out on their next request after suspension', async ({ page }) => {
  const school = await createTestSchool()
  const schoolAdmin = await createTestUser()
  await addMember(school.id, schoolAdmin.id, 'admin')

  await login(page, schoolAdmin.email, schoolAdmin.password)
  await expect(page).toHaveURL(/\/admin$/)

  await adminClient().from('schools').update({ status: 'suspended' }).eq('id', school.id)
  await page.reload()

  await expect(page).toHaveURL(/\/login\?error=suspended$/)
  await expect(page.getByRole('alert')).toHaveText("Your school's account is inactive. Contact your school.")
  await page.goto('/admin')
  await expect(page).toHaveURL(/\/login$/) // session is gone, not just redirected
})

test('a school admin cannot open the platform panel', async ({ page }) => {
  const school = await createTestSchool()
  const schoolAdmin = await createTestUser()
  await addMember(school.id, schoolAdmin.id, 'admin')

  await login(page, schoolAdmin.email, schoolAdmin.password)
  await page.goto('/platform')
  await expect(page).toHaveURL(/\/admin$/)
})
```

- [ ] **Step 5: Run the E2E suite**

Run: `npm run test:e2e`
Expected: PASS, 4 tests.

- [ ] **Step 6: Run everything**

Run: `npm run typecheck; npm run lint; npm test; npm run test:db; npm run test:e2e`
Expected: all pass with no type or lint errors.

- [ ] **Step 7: Commit**

```powershell
git add scripts playwright.config.ts e2e
git commit -m "test: super admin bootstrap script and end-to-end platform flows"
```

---

## Done criteria for Plan 1

- The platform owner can log in, create a school with its admin, share the admin's login on WhatsApp, add/remove/reset admins, and suspend/reactivate schools.
- A new admin is forced to set a password and lands on `/admin`.
- Suspended schools' users are refused at login and signed out on their next request.
- RLS tests prove: no cross-school reads, super admin sees only school-admin accounts and counts.
- `npm run typecheck`, `npm run lint`, `npm test`, `npm run test:db`, `npm run test:e2e` all pass.
