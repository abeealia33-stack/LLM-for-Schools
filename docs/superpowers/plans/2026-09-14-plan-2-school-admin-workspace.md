# Plan 2: School Admin Workspace Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A school admin logs in to a branded workspace with a dashboard, manages teachers (invite, "can create classes", remove, reset password), and edits school settings (name, logo, colour, time zone, academic year); accounts can be re-added or shared across schools safely, and password resets sign the user out everywhere.

**Architecture:** Builds on Plan 1. Reads go through the user's cookie session and existing RLS (a school admin can already read their school, its memberships and member profiles). Every write runs in a server action that first calls a new `requireSchoolAdmin()` guard, takes the school id **from the server-side account context (never from the client)**, then uses the secret-key client. A shared `addMember()` service creates or links accounts; a shared `resetPassword()` sets a temporary password and revokes sessions via a service-role-only database function. Logos live in a public Supabase Storage bucket.

**Tech Stack:** Next.js 16.3.5 App Router, React 19, TypeScript, Tailwind v4, `@supabase/supabase-js` + `@supabase/ssr`, Zod 4, Vitest 5, Playwright. Supabase dev project `iokgyepsplyscxmrpzmf` (migrations pushed with `SUPABASE_DB_URL` from `.env.local`).

**Spec:** `docs/superpowers/specs/2026-09-13-school-diary-design.md`

## Roadmap update

Plan 2 in the original roadmap was too large for one plan and is split:

| Plan | Delivers |
|---|---|
| 1. Foundation + Super admin | ✅ merged |
| **2. School admin workspace** (this file) | Admin layout + dashboard, teachers, settings + logo, account linking, session revocation |
| 3. Classes, students & guardians | Classes, subjects/teachers, students (single/paste/CSV), guardian accounts + slips, sibling linking, teacher "My classes" |
| 4. Diary | Posts, attachments, multi-class posting, student/guardian diary, done marks, calendar, school notices |
| 5. Consents | Consent requests, guardian answers, tracker, deadline rules |
| 6. Notifications | Web push, in-app badges, scheduler, quiet hours |
| 7. PWA + offline + pilot readiness | Installable app, offline cache, forgot-password by email, full E2E |

## Global Constraints

- Every school-admin page **and** every school-admin server action calls `requireSchoolAdmin()` itself; the layout check alone does not protect actions.
- The school id used by any school-admin write comes from `requireSchoolAdmin()`'s result, never from a form field or bound argument. Only target ids (e.g. a teacher's user id) come from the client, and each is re-checked to belong to that school.
- Writes to `schools`, `profiles`, `memberships` and Storage use the secret-key client (`createAdminClient()`) only after the guard; reads for rendering use the cookie client (`createClient()`) so RLS applies.
- A school admin may reset the password only of an account whose **every** active membership is in their own school and which is not a super admin. Otherwise the error text is exactly `This account is also used at another school. Ask the platform owner to reset it.`
- Every password reset (super admin or school admin) sets a temporary password, sets `must_change_password = true`, and revokes all of that user's sessions.
- Adding a person by an email that already has a ClassBoard account links that account (no new password is issued) instead of failing; a super-admin account is never linked.
- Suspended schools stay blocked by existing guards and RLS; nothing in this plan bypasses `requireMember`.
- Logos: PNG, JPEG or WebP only, at most 1 MB (1048576 bytes), stored in bucket `school-logos` under `<school_id>/`.
- Pages work at phone width (≈400px): tables inside `overflow-x-auto`, navigation wraps.
- Tests run against the dev Supabase project only. E2E runs on port 3100 (`E2E_PORT` override).

## Decisions made while planning

- **Account linking (parked finding F7 from Plan 1):** `addMember()` looks up `profiles.email`. Existing account + no membership in this school → insert membership; inactive membership → reactivate with the new role (and `can_create_classes = false`); active membership → `MemberExistsError`. Usernames without email always create new accounts.
- **Session revocation (Plan 1 ruling F3):** `public.admin_revoke_sessions(p_user)` deletes `auth.sessions` rows (refresh tokens cascade). Verified on the dev project that the `postgres` role may delete from `auth.sessions`. Access tokens already issued stay valid until expiry (≤1 hour), but `must_change_password` forces `/change-password`, which requires the new temporary password.
- **Multi-school admins:** `requireSchoolAdmin()` uses the first active admin membership (alphabetical by school name, as `my_memberships()` orders). A school switcher is out of scope.
- **Dashboard** shows only what exists now (admins, teachers, teachers who can create classes). Class, student, diary and consent tiles arrive with Plans 3–5.
- **Removing a teacher** deactivates the membership only; guards already block them on their next request. It does not revoke sessions (they may belong to other schools).
- **Forgot password by email** stays out (needs a mail provider); moved to Plan 7.

## File Structure

```
supabase/migrations/20260914000001_sessions_and_logos.sql   admin_revoke_sessions() + school-logos bucket
src/lib/accounts/create-account.ts      (modify) export assertNotReservedEmail
src/lib/accounts/security.ts            revokeSessions, resetPassword, CrossSchoolAccountError, assertResettableBySchool
src/lib/accounts/add-member.ts          addMember, MemberResult, MemberExistsError
src/lib/platform/schools.ts             (modify) use addMember + resetPassword
src/lib/platform/validation.ts          (modify) personAccountSchema factory, accountFromForm(prefix)
src/components/credentials-card.tsx     (modify) support linked accounts (temporaryPassword null)
src/app/platform/new/{actions.ts,form.tsx}              (modify) MemberResult + MemberExistsError
src/app/platform/schools/[id]/{actions.ts,admin-forms.tsx} (modify) MemberResult + MemberExistsError
src/lib/auth/guards.ts                  (modify) requireSchoolAdmin
src/lib/school/branding.ts              logoPublicUrl, getSchoolBranding
src/lib/school/validation.ts            teacherAccountSchema, schoolSettingsSchema, form parsers
src/lib/school/teachers.ts              inviteTeacher, setCanCreateClasses, removeTeacher, resetTeacherPassword, NotSchoolTeacherError
src/lib/school/settings.ts              updateSchoolSettings, uploadSchoolLogo, InvalidLogoError
src/app/admin/layout.tsx                branded shell + nav (guarded)
src/app/admin/nav.tsx                   client nav with active link
src/app/admin/page.tsx                  (replace) dashboard
src/app/admin/teachers/{page.tsx,actions.ts,teacher-forms.tsx}
src/app/admin/settings/{page.tsx,actions.ts,settings-form.tsx}
tests/db/helpers.ts                     (modify) cleanup also removes test logos
tests/db/sessions.test.ts
tests/db/add-member.test.ts
tests/db/school-teachers.test.ts
tests/db/school-settings.test.ts
tests/unit/school-validation.test.ts
tests/unit/validation.test.ts           (modify) personAccountSchema
e2e/school-admin.spec.ts
```

---

### Task 1: Session revocation function and logo bucket

**Files:**
- Create: `supabase/migrations/20260914000001_sessions_and_logos.sql`, `tests/db/sessions.test.ts`

**Interfaces:**
- Consumes: Plan 1 `tests/db/helpers.ts` (`adminClient`, `anonClient`, `createTestUser`, `signInAs`, `cleanupTestData`)
- Produces: RPC `public.admin_revoke_sessions(p_user uuid) returns void` (EXECUTE for `service_role` only); public Storage bucket `school-logos` (1 MB limit, png/jpeg/webp)

- [ ] **Step 1: Write the failing test**

```ts
// tests/db/sessions.test.ts
import { afterAll, describe, expect, it } from 'vitest'
import { adminClient, anonClient, cleanupTestData, createTestUser, signInAs } from './helpers'

afterAll(cleanupTestData)

describe('admin_revoke_sessions', () => {
  it("revokes a user's sessions so their refresh token stops working", async () => {
    const user = await createTestUser()
    const client = await signInAs(user)

    const { error } = await adminClient().rpc('admin_revoke_sessions', { p_user: user.id })
    expect(error).toBeNull()

    const refreshed = await client.auth.refreshSession()
    expect(refreshed.error).not.toBeNull()
  })

  it('cannot be called by signed-in users or anonymous visitors', async () => {
    const victim = await createTestUser()
    const attacker = await signInAs(await createTestUser())

    expect((await attacker.rpc('admin_revoke_sessions', { p_user: victim.id })).error).not.toBeNull()
    expect((await anonClient().rpc('admin_revoke_sessions', { p_user: victim.id })).error).not.toBeNull()
  })
})

describe('school-logos bucket', () => {
  it('exists, is public, and limits size and type', async () => {
    const { data, error } = await adminClient().storage.getBucket('school-logos')
    expect(error).toBeNull()
    expect(data).toMatchObject({
      public: true,
      file_size_limit: 1048576,
      allowed_mime_types: ['image/png', 'image/jpeg', 'image/webp'],
    })
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm run test:db -- tests/db/sessions.test.ts`
Expected: FAIL — `Could not find the function public.admin_revoke_sessions` and `Bucket not found`.

- [ ] **Step 3: Write the migration**

```sql
-- supabase/migrations/20260914000001_sessions_and_logos.sql

-- Signs a user out everywhere: deleting sessions cascades to their refresh tokens.
create function public.admin_revoke_sessions(p_user uuid)
returns void
language sql volatile security definer set search_path = ''
as $$
  delete from auth.sessions where user_id = p_user;
$$;

revoke execute on function public.admin_revoke_sessions(uuid) from public, anon, authenticated;
grant execute on function public.admin_revoke_sessions(uuid) to service_role;

-- Public read so logos render in headers; uploads happen only with the secret key.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('school-logos', 'school-logos', true, 1048576, array['image/png', 'image/jpeg', 'image/webp'])
on conflict (id) do nothing;
```

- [ ] **Step 4: Push the migration**

Run (Git Bash, from the project root — prints no secrets):

```bash
node -e "require('dotenv').config({path:'.env.local',quiet:true});const r=require('child_process').spawnSync('npx supabase db push --yes --db-url \"'+process.env.SUPABASE_DB_URL+'\"',{shell:true,encoding:'utf8'});console.log((r.stdout+r.stderr).split(process.env.SUPABASE_DB_URL).join('<DB_URL>'));process.exit(r.status)"
```

Expected: `Applying migration 20260914000001_sessions_and_logos.sql...` then `Finished supabase db push.`

- [ ] **Step 5: Run test to verify it passes**

Run: `npm run test:db -- tests/db/sessions.test.ts`
Expected: PASS, 3 tests.

- [ ] **Step 6: Commit**

```bash
git add supabase/migrations/20260914000001_sessions_and_logos.sql tests/db/sessions.test.ts
git commit -m "feat(db): service-role session revocation and school logo bucket"
```

---

### Task 2: Account linking, shared password reset, and platform refactor

**Files:**
- Create: `src/lib/accounts/security.ts`, `src/lib/accounts/add-member.ts`, `tests/db/add-member.test.ts`
- Modify: `src/lib/accounts/create-account.ts`, `src/lib/platform/schools.ts`, `src/lib/platform/validation.ts`, `tests/unit/validation.test.ts`, `src/components/credentials-card.tsx`, `src/app/platform/new/actions.ts`, `src/app/platform/new/form.tsx`, `src/app/platform/schools/[id]/actions.ts`, `src/app/platform/schools/[id]/admin-forms.tsx`, `tests/db/platform-schools.test.ts`

**Interfaces:**
- Consumes: Task 1 RPC `admin_revoke_sessions`; Plan 1 `createAccount`, `bestEffort`, `generateTempPassword`, `Role`
- Produces:
  - `create-account.ts`: `assertNotReservedEmail(email: string, accountDomain: string): void` (throws `ReservedEmailError`)
  - `security.ts`: `revokeSessions(admin, userId: string): Promise<void>`; `resetPassword(admin, userId: string): Promise<{ login: string; temporaryPassword: string }>`; class `CrossSchoolAccountError`; `assertResettableBySchool(admin, userId: string, schoolId: string): Promise<void>`
  - `add-member.ts`: type `MemberResult = { userId: string; fullName: string; login: string; temporaryPassword: string | null; linked: boolean }`; class `MemberExistsError`; `addMember(admin, input: { schoolId: string; schoolSlug: string; role: Role; fullName: string; email: string | null; phone: string | null; usernameBase: string }, accountDomain: string): Promise<MemberResult>`
  - `validation.ts`: `personAccountSchema(nameMessage: string)`, `accountFromForm(fd: FormData, prefix: string): unknown`; `adminAccountSchema`, `adminAccountFromForm` keep their names and behaviour; type `PersonAccountInput`
  - `schools.ts`: `createSchoolWithAdmin(...)` now returns `{ schoolId: string; credentials: MemberResult }`; `addSchoolAdmin(...)` returns `MemberResult`; `resetSchoolAdminPassword` revokes sessions
  - `<CredentialsCard schoolName fullName login temporaryPassword: string | null />` — when `temporaryPassword` is null it renders a "linked" message (test id `credentials-linked`) and no password or share buttons

- [ ] **Step 1: Write the failing unit test for the schema factory**

In `tests/unit/validation.test.ts`, add `accountFromForm` and `personAccountSchema` to the existing `@/lib/platform/validation` import at the top of the file, then append:

```ts
describe('personAccountSchema / accountFromForm', () => {
  it('uses the given name message and reads prefixed fields', () => {
    const fd = new FormData()
    fd.set('teacherFullName', '')
    fd.set('teacherEmail', 'Hina@School.PK')
    fd.set('teacherPhone', '')
    const schema = personAccountSchema("Enter the teacher's name")

    const bad = schema.safeParse(accountFromForm(fd, 'teacher'))
    expect(toFieldErrors(bad.error!)).toEqual({ fullName: "Enter the teacher's name" })

    fd.set('teacherFullName', 'Hina Khan')
    const good = schema.safeParse(accountFromForm(fd, 'teacher'))
    expect(good.data).toEqual({ fullName: 'Hina Khan', email: 'hina@school.pk', phone: null })
  })
})
```

- [ ] **Step 2: Write the failing DB tests**

```ts
// tests/db/add-member.test.ts
import { afterAll, describe, expect, it } from 'vitest'
import { createClient } from '@supabase/supabase-js'
import { randomUUID } from 'node:crypto'
import { adminClient, cleanupTestData, createTestSchool, createTestUser, signInAs, TEST_PREFIX } from './helpers'
import { addMember, MemberExistsError } from '@/lib/accounts/add-member'
import { AccountExistsError, ReservedEmailError } from '@/lib/accounts/create-account'
import { CrossSchoolAccountError, assertResettableBySchool, resetPassword } from '@/lib/accounts/security'

const DOMAIN = process.env.ACCOUNT_EMAIL_DOMAIN!
afterAll(cleanupTestData)

const email = () => `${TEST_PREFIX}${randomUUID().slice(0, 8)}@school.test`
const person = (over: Partial<{ email: string | null; fullName: string }> = {}) => ({
  fullName: 'Hina Khan', email: null as string | null, phone: null, usernameBase: 'hina', ...over,
})

async function canSignIn(authEmail: string, password: string) {
  const c = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!, {
    auth: { persistSession: false },
  })
  return (await c.auth.signInWithPassword({ email: authEmail, password })).error === null
}

describe('addMember', () => {
  it('creates a new account with a temporary password when the email is unknown', async () => {
    const school = await createTestSchool()
    const e = email()
    const r = await addMember(adminClient(), { schoolId: school.id, schoolSlug: school.slug, role: 'teacher', ...person({ email: e }) }, DOMAIN)
    expect(r).toMatchObject({ login: e, linked: false })
    expect(r.temporaryPassword).toEqual(expect.any(String))
    expect(await canSignIn(e, r.temporaryPassword!)).toBe(true)
  })

  it('creates a username account when no email is given', async () => {
    const school = await createTestSchool()
    const r = await addMember(adminClient(), { schoolId: school.id, schoolSlug: school.slug, role: 'teacher', ...person() }, DOMAIN)
    expect(r).toMatchObject({ login: `hina@${school.slug}`, linked: false })
  })

  it('links an existing account into a second school without a new password', async () => {
    const a = await createTestSchool()
    const b = await createTestSchool()
    const e = email()
    const first = await addMember(adminClient(), { schoolId: a.id, schoolSlug: a.slug, role: 'teacher', ...person({ email: e }) }, DOMAIN)

    const second = await addMember(adminClient(), { schoolId: b.id, schoolSlug: b.slug, role: 'admin', ...person({ email: e, fullName: 'Ignored' }) }, DOMAIN)
    expect(second).toEqual({ userId: first.userId, fullName: 'Hina Khan', login: e, temporaryPassword: null, linked: true })

    const { data } = await adminClient().from('memberships').select('school_id, role, active').eq('user_id', first.userId)
    expect(data).toHaveLength(2)
    expect(await canSignIn(e, first.temporaryPassword!)).toBe(true) // password unchanged
  })

  it('reactivates a removed member with the new role', async () => {
    const school = await createTestSchool()
    const e = email()
    const r = await addMember(adminClient(), { schoolId: school.id, schoolSlug: school.slug, role: 'teacher', ...person({ email: e }) }, DOMAIN)
    await adminClient().from('memberships').update({ active: false, can_create_classes: true }).eq('school_id', school.id).eq('user_id', r.userId)

    const again = await addMember(adminClient(), { schoolId: school.id, schoolSlug: school.slug, role: 'admin', ...person({ email: e }) }, DOMAIN)
    expect(again.linked).toBe(true)
    const { data } = await adminClient().from('memberships').select('role, active, can_create_classes').eq('school_id', school.id).eq('user_id', r.userId).single()
    expect(data).toEqual({ role: 'admin', active: true, can_create_classes: false })
  })

  it('refuses an active member, a super admin email, and reserved emails', async () => {
    const school = await createTestSchool()
    const e = email()
    await addMember(adminClient(), { schoolId: school.id, schoolSlug: school.slug, role: 'teacher', ...person({ email: e }) }, DOMAIN)
    await expect(addMember(adminClient(), { schoolId: school.id, schoolSlug: school.slug, role: 'teacher', ...person({ email: e }) }, DOMAIN))
      .rejects.toBeInstanceOf(MemberExistsError)

    const boss = await createTestUser({ superAdmin: true })
    await expect(addMember(adminClient(), { schoolId: school.id, schoolSlug: school.slug, role: 'teacher', ...person({ email: boss.email }) }, DOMAIN))
      .rejects.toBeInstanceOf(AccountExistsError)

    await expect(addMember(adminClient(), { schoolId: school.id, schoolSlug: school.slug, role: 'teacher', ...person({ email: `x@${DOMAIN}` }) }, DOMAIN))
      .rejects.toBeInstanceOf(ReservedEmailError)
  })
})

describe('resetPassword / assertResettableBySchool', () => {
  it('sets a new temporary password, forces a change, and revokes sessions', async () => {
    const school = await createTestSchool()
    const e = email()
    const r = await addMember(adminClient(), { schoolId: school.id, schoolSlug: school.slug, role: 'teacher', ...person({ email: e }) }, DOMAIN)
    const session = await signInAs({ id: r.userId, email: e, password: r.temporaryPassword! })
    await adminClient().from('profiles').update({ must_change_password: false }).eq('id', r.userId)

    const reset = await resetPassword(adminClient(), r.userId)
    expect(reset.login).toBe(e)
    expect(await canSignIn(e, reset.temporaryPassword)).toBe(true)
    expect((await session.auth.refreshSession()).error).not.toBeNull()
    const { data } = await adminClient().from('profiles').select('must_change_password').eq('id', r.userId).single()
    expect(data?.must_change_password).toBe(true)
  })

  it('allows only accounts used solely in this school', async () => {
    const a = await createTestSchool()
    const b = await createTestSchool()
    const e = email()
    const r = await addMember(adminClient(), { schoolId: a.id, schoolSlug: a.slug, role: 'teacher', ...person({ email: e }) }, DOMAIN)
    await expect(assertResettableBySchool(adminClient(), r.userId, a.id)).resolves.toBeUndefined()

    await addMember(adminClient(), { schoolId: b.id, schoolSlug: b.slug, role: 'teacher', ...person({ email: e }) }, DOMAIN)
    await expect(assertResettableBySchool(adminClient(), r.userId, a.id)).rejects.toBeInstanceOf(CrossSchoolAccountError)
  })
})
```

Also append to the `describe('school admin management', ...)` block in `tests/db/platform-schools.test.ts`:

```ts
  it('re-adds a removed admin by email by reactivating the same account', async () => {
    const admin = adminClient()
    const adminEmail = `${TEST_PREFIX}${randomUUID().slice(0, 8)}@school.test`
    const { schoolId, credentials: first } = await createSchoolWithAdmin(
      admin, schoolInput({ admin: { fullName: 'Hina', email: adminEmail, phone: null } }), DOMAIN,
    )
    const second = await addSchoolAdmin(admin, schoolId, { fullName: 'Other', email: null, phone: null }, DOMAIN)
    await removeSchoolAdmin(admin, schoolId, first.userId)

    const again = await addSchoolAdmin(admin, schoolId, { fullName: 'Hina', email: adminEmail, phone: null }, DOMAIN)
    expect(again).toMatchObject({ userId: first.userId, linked: true, temporaryPassword: null })
    expect(second.linked).toBe(false)
  })
```

- [ ] **Step 3: Run tests to verify they fail**

Run: `npm test -- tests/unit/validation.test.ts` → Expected: FAIL (`personAccountSchema` is not exported).
Run: `npm run test:db -- tests/db/add-member.test.ts tests/db/platform-schools.test.ts` → Expected: FAIL (cannot resolve `@/lib/accounts/add-member`).

- [ ] **Step 4: Export `assertNotReservedEmail` from `create-account.ts`**

In `src/lib/accounts/create-account.ts`, add after the `ReservedEmailError` class:

```ts
export function assertNotReservedEmail(email: string, accountDomain: string): void {
  const domain = email.slice(email.lastIndexOf('@') + 1).toLowerCase()
  if (domain === accountDomain.toLowerCase()) throw new ReservedEmailError(accountDomain)
}
```

and replace the inline check at the top of `createAccount` with:

```ts
  if (input.email) assertNotReservedEmail(input.email, accountDomain)
```

- [ ] **Step 5: Create `security.ts`**

```ts
// src/lib/accounts/security.ts
import 'server-only'
import type { SupabaseClient } from '@supabase/supabase-js'
import { generateTempPassword } from './temp-password'

export class CrossSchoolAccountError extends Error {
  constructor() {
    super('This account is also used at another school. Ask the platform owner to reset it.')
  }
}

export async function revokeSessions(admin: SupabaseClient, userId: string): Promise<void> {
  const { error } = await admin.rpc('admin_revoke_sessions', { p_user: userId })
  if (error) throw error
}

export async function resetPassword(
  admin: SupabaseClient,
  userId: string,
): Promise<{ login: string; temporaryPassword: string }> {
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

  await revokeSessions(admin, userId)
  return { login: profile.email ?? profile.username, temporaryPassword }
}

export async function assertResettableBySchool(
  admin: SupabaseClient,
  userId: string,
  schoolId: string,
): Promise<void> {
  const [{ data: profile, error: pErr }, { data: memberships, error: mErr }] = await Promise.all([
    admin.from('profiles').select('is_super_admin').eq('id', userId).single(),
    admin.from('memberships').select('school_id').eq('user_id', userId).eq('active', true),
  ])
  if (pErr) throw pErr
  if (mErr) throw mErr
  if (profile.is_super_admin || memberships.some((m) => m.school_id !== schoolId)) {
    throw new CrossSchoolAccountError()
  }
}
```

- [ ] **Step 6: Create `add-member.ts`**

```ts
// src/lib/accounts/add-member.ts
import 'server-only'
import type { SupabaseClient } from '@supabase/supabase-js'
import type { Role } from '@/lib/auth/home-path'
import { bestEffort } from './best-effort'
import { AccountExistsError, assertNotReservedEmail, createAccount } from './create-account'

export type MemberResult = {
  userId: string
  fullName: string
  login: string
  /** null when an existing account was linked; they keep their current password */
  temporaryPassword: string | null
  linked: boolean
}

const ROLE_LABEL: Record<Role, string> = {
  admin: 'an admin',
  teacher: 'a teacher',
  student: 'a student',
  guardian: 'a guardian',
}

export class MemberExistsError extends Error {
  constructor(role: Role) {
    super(`This person is already ${ROLE_LABEL[role]} in this school`)
  }
}

export async function addMember(
  admin: SupabaseClient,
  input: {
    schoolId: string
    schoolSlug: string
    role: Role
    fullName: string
    email: string | null
    phone: string | null
    usernameBase: string
  },
  accountDomain: string,
): Promise<MemberResult> {
  if (input.email) {
    assertNotReservedEmail(input.email, accountDomain)
    const { data: existing, error } = await admin
      .from('profiles')
      .select('id, full_name, is_super_admin')
      .eq('email', input.email)
      .maybeSingle()
    if (error) throw error

    if (existing) {
      if (existing.is_super_admin) throw new AccountExistsError(input.email)
      const { data: membership, error: mErr } = await admin
        .from('memberships')
        .select('role, active')
        .eq('school_id', input.schoolId)
        .eq('user_id', existing.id)
        .maybeSingle()
      if (mErr) throw mErr
      if (membership?.active) throw new MemberExistsError(membership.role)

      const { error: writeErr } = membership
        ? await admin
            .from('memberships')
            .update({ role: input.role, active: true, can_create_classes: false })
            .eq('school_id', input.schoolId)
            .eq('user_id', existing.id)
        : await admin
            .from('memberships')
            .insert({ school_id: input.schoolId, user_id: existing.id, role: input.role })
      if (writeErr) throw writeErr

      return { userId: existing.id, fullName: existing.full_name, login: input.email, temporaryPassword: null, linked: true }
    }
  }

  const credentials = await createAccount(
    admin,
    {
      fullName: input.fullName,
      email: input.email,
      phone: input.phone,
      usernameBase: input.usernameBase,
      schoolSlug: input.schoolSlug,
    },
    accountDomain,
  )
  const { error: mErr } = await admin
    .from('memberships')
    .insert({ school_id: input.schoolId, user_id: credentials.userId, role: input.role })
  if (mErr) {
    const userId = credentials.userId
    await bestEffort(`delete auth user ${userId}`, () => admin.auth.admin.deleteUser(userId))
    throw mErr
  }
  return { ...credentials, linked: false }
}
```

- [ ] **Step 7: Refactor `schools.ts` to use the shared services**

In `src/lib/platform/schools.ts`:

1. Replace the imports block with:

```ts
import 'server-only'
import type { SupabaseClient } from '@supabase/supabase-js'
import { bestEffort } from '@/lib/accounts/best-effort'
import { addMember, type MemberResult } from '@/lib/accounts/add-member'
import { resetPassword } from '@/lib/accounts/security'
import type { AdminAccountInput, NewSchoolInput } from './validation'
```

2. Replace `createSchoolWithAdmin`'s return type and `try/catch` block (keep the school insert above it unchanged):

```ts
): Promise<{ schoolId: string; credentials: MemberResult }> {
```

```ts
  try {
    const credentials = await addMember(
      admin,
      { ...input.admin, schoolId: school.id, schoolSlug: input.slug, role: 'admin', usernameBase: 'admin' },
      accountDomain,
    )
    return { schoolId: school.id, credentials }
  } catch (e) {
    // addMember removes any account it created; the membership cascades with the school
    await bestEffort(`delete school ${school.id}`, () => admin.from('schools').delete().eq('id', school.id))
    throw e
  }
}
```

3. Replace `addSchoolAdmin` entirely:

```ts
export async function addSchoolAdmin(
  admin: SupabaseClient,
  schoolId: string,
  input: AdminAccountInput,
  accountDomain: string,
): Promise<MemberResult> {
  const { data: school, error } = await admin.from('schools').select('slug').eq('id', schoolId).single()
  if (error) throw error
  return addMember(
    admin,
    { ...input, schoolId, schoolSlug: school.slug, role: 'admin', usernameBase: 'admin' },
    accountDomain,
  )
}
```

4. Replace the body of `resetSchoolAdminPassword` after its admin check with a call to the shared reset:

```ts
export async function resetSchoolAdminPassword(
  admin: SupabaseClient,
  schoolId: string,
  userId: string,
): Promise<{ login: string; temporaryPassword: string }> {
  if (!(await activeAdminIds(admin, schoolId)).includes(userId)) throw new NotSchoolAdminError()
  return resetPassword(admin, userId)
}
```

- [ ] **Step 8: Add the schema factory to `platform/validation.ts`**

Replace the `adminAccountSchema` definition with:

```ts
export const personAccountSchema = (nameMessage: string) =>
  z.object({
    fullName: z.string().trim().min(1, nameMessage).max(120),
    email: z
      .string()
      .trim()
      .toLowerCase()
      .refine((v) => v === '' || EMAIL.test(v), 'Enter a valid email')
      .transform((v) => (v === '' ? null : v)),
    phone: optionalText(30),
  })

export const adminAccountSchema = personAccountSchema("Enter the admin's name")
```

Add below `export type AdminAccountInput ...`:

```ts
export type PersonAccountInput = AdminAccountInput
```

Replace `adminAccountFromForm` with:

```ts
export function accountFromForm(fd: FormData, prefix: string): unknown {
  return {
    fullName: text(fd, `${prefix}FullName`),
    email: text(fd, `${prefix}Email`),
    phone: text(fd, `${prefix}Phone`),
  }
}

export function adminAccountFromForm(fd: FormData): unknown {
  return accountFromForm(fd, 'admin')
}
```

- [ ] **Step 9: Support linked accounts in `CredentialsCard`**

In `src/components/credentials-card.tsx`, change the prop type to `temporaryPassword: string | null`, and at the top of the component body (after the `useState`/`message` lines) add:

```tsx
  if (props.temporaryPassword === null) {
    return (
      <div className="card space-y-1 border-blue-300 bg-blue-50" data-testid="credentials-linked">
        <p className="font-medium">{props.fullName} was added</p>
        <p className="text-sm text-gray-700">
          They already have a ClassBoard account (<span className="font-mono">{props.login}</span>) and log in with
          their existing password.
        </p>
      </div>
    )
  }
```

Hooks stay above the early return. Change `const message = () => credentialsMessage({ ...props, appUrl: window.location.origin })` to pass `temporaryPassword: props.temporaryPassword ?? ''` so it type-checks; it is only called when a password exists.

- [ ] **Step 10: Update the platform actions and forms for `MemberResult`**

`src/app/platform/new/actions.ts`: replace the `create-account` import with

```ts
import { AccountExistsError, ReservedEmailError } from '@/lib/accounts/create-account'
import { MemberExistsError, type MemberResult } from '@/lib/accounts/add-member'
```

change `credentials: Credentials` to `credentials: MemberResult` in `NewSchoolState`, and extend the error mapping:

```ts
    if (e instanceof AccountExistsError || e instanceof ReservedEmailError || e instanceof MemberExistsError) {
      return { errors: { 'admin.email': e.message }, values, created: null }
    }
```

`src/app/platform/schools/[id]/actions.ts`: same import change; `AddAdminState` becomes `{ errors: Record<string, string>; created: MemberResult | null }`; add `|| e instanceof MemberExistsError` to the `addAdminAction` error mapping.

`src/app/platform/new/form.tsx` and `src/app/platform/schools/[id]/admin-forms.tsx` need no change beyond type-checking (they spread the result into `CredentialsCard`).

- [ ] **Step 11: Run the tests**

Run: `npm test` → Expected: PASS (all unit tests including the new factory test).
Run: `npm run test:db` → Expected: PASS (all DB files, including `add-member` 7 tests and the new platform-schools case).
Run: `npm run typecheck` and `npm run lint` → Expected: no errors, no warnings.

- [ ] **Step 12: Commit**

```bash
git add src tests
git commit -m "feat: link existing accounts, reactivate removed members, revoke sessions on password reset"
```

---

### Task 3: School admin guard, branded layout, and dashboard

**Files:**
- Create: `src/lib/school/logo-url.ts`, `src/lib/school/branding.ts`, `src/app/admin/layout.tsx`, `src/app/admin/nav.tsx`, `tests/unit/logo-url.test.ts`
- Modify: `src/lib/auth/guards.ts`, `src/app/admin/page.tsx` (replace), `e2e/platform.spec.ts` (heading assertion)

**Interfaces:**
- Consumes: Plan 1 `requireMember`, `createClient`, `publicEnv`, `Membership`
- Produces:
  - `guards.ts`: `requireSchoolAdmin(): Promise<{ ctx: AccountContext; school: Membership }>`
  - `logo-url.ts`: `logoPublicUrl(supabaseUrl: string, path: string | null): string | null`
  - `branding.ts`: type `SchoolBranding = { id: string; name: string; slug: string; brandColor: string; logoPath: string | null; logoUrl: string | null; timeZone: string; academicYear: string | null }`; `getSchoolBranding(schoolId: string): Promise<SchoolBranding>` (cached per request, RLS read)
  - Layout test ids: `school-name` (header school name), `school-logo` (header logo `<img>`)
  - Routes linked from nav: `/admin`, `/admin/teachers`, `/admin/settings`

- [ ] **Step 1: Write the failing unit test**

```ts
// tests/unit/logo-url.test.ts
import { describe, expect, it } from 'vitest'
import { logoPublicUrl } from '@/lib/school/logo-url'

describe('logoPublicUrl', () => {
  it('builds the public storage URL for a logo path', () => {
    expect(logoPublicUrl('https://abc.supabase.co', 'school-1/logo-1.png')).toBe(
      'https://abc.supabase.co/storage/v1/object/public/school-logos/school-1/logo-1.png',
    )
  })
  it('returns null when there is no logo', () => {
    expect(logoPublicUrl('https://abc.supabase.co', null)).toBeNull()
  })
})
```

- [ ] **Step 2: Run it to verify it fails**

Run: `npm test -- tests/unit/logo-url.test.ts`
Expected: FAIL — cannot resolve `@/lib/school/logo-url`.

- [ ] **Step 3: Implement `logo-url.ts` and `branding.ts`**

```ts
// src/lib/school/logo-url.ts
export function logoPublicUrl(supabaseUrl: string, path: string | null): string | null {
  if (!path) return null
  return `${supabaseUrl}/storage/v1/object/public/school-logos/${path}`
}
```

```ts
// src/lib/school/branding.ts
import 'server-only'
import { cache } from 'react'
import { createClient } from '@/lib/supabase/server'
import { publicEnv } from '@/lib/env'
import { logoPublicUrl } from './logo-url'

export type SchoolBranding = {
  id: string
  name: string
  slug: string
  brandColor: string
  logoPath: string | null
  logoUrl: string | null
  timeZone: string
  academicYear: string | null
}

export const getSchoolBranding = cache(async (schoolId: string): Promise<SchoolBranding> => {
  const supabase = await createClient()
  const { data, error } = await supabase
    .from('schools')
    .select('id, name, slug, brand_color, logo_path, time_zone, academic_year')
    .eq('id', schoolId)
    .single()
  if (error) throw error
  return {
    id: data.id,
    name: data.name,
    slug: data.slug,
    brandColor: data.brand_color,
    logoPath: data.logo_path,
    logoUrl: logoPublicUrl(publicEnv().supabaseUrl, data.logo_path),
    timeZone: data.time_zone,
    academicYear: data.academic_year,
  }
})
```

- [ ] **Step 4: Run the unit test to verify it passes**

Run: `npm test -- tests/unit/logo-url.test.ts`
Expected: PASS, 2 tests.

- [ ] **Step 5: Add `requireSchoolAdmin` to `guards.ts`**

Append to `src/lib/auth/guards.ts`:

```ts
export async function requireSchoolAdmin(): Promise<{ ctx: AccountContext; school: Membership }> {
  const { ctx, memberships } = await requireMember(['admin'])
  // my_memberships() orders by school name; multi-school admins use the first (no switcher yet)
  return { ctx, school: memberships[0] }
}
```

- [ ] **Step 6: Admin navigation (client) and layout**

```tsx
// src/app/admin/nav.tsx
'use client'
import Link from 'next/link'
import { usePathname } from 'next/navigation'

const LINKS = [
  { href: '/admin', label: 'Dashboard' },
  { href: '/admin/teachers', label: 'Teachers' },
  { href: '/admin/settings', label: 'Settings' },
]

export function AdminNav() {
  const pathname = usePathname()
  return (
    <nav className="mx-auto flex max-w-5xl flex-wrap gap-1 px-4" aria-label="School admin">
      {LINKS.map((link) => {
        const active = link.href === '/admin' ? pathname === '/admin' : pathname.startsWith(link.href)
        return (
          <Link
            key={link.href}
            href={link.href}
            aria-current={active ? 'page' : undefined}
            className={`border-b-2 px-3 py-2 text-sm font-medium ${
              active ? 'border-blue-600 text-blue-700' : 'border-transparent text-gray-600 hover:text-gray-900'
            }`}
          >
            {link.label}
          </Link>
        )
      })}
    </nav>
  )
}
```

```tsx
// src/app/admin/layout.tsx
import { requireSchoolAdmin } from '@/lib/auth/guards'
import { getSchoolBranding } from '@/lib/school/branding'
import { AdminNav } from './nav'

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const { ctx, school } = await requireSchoolAdmin()
  const branding = await getSchoolBranding(school.schoolId)

  return (
    <div className="min-h-dvh">
      <header className="border-b border-gray-200 bg-white" style={{ borderTop: `4px solid ${branding.brandColor}` }}>
        <div className="mx-auto flex max-w-5xl flex-wrap items-center justify-between gap-3 px-4 py-3">
          <div className="flex min-w-0 items-center gap-3">
            {branding.logoUrl && (
              // Logos are small public Storage images; next/image would need remote host config for each project
              // eslint-disable-next-line @next/next/no-img-element
              <img src={branding.logoUrl} alt="" data-testid="school-logo" className="h-10 w-10 rounded object-contain" />
            )}
            <div className="min-w-0">
              <p className="truncate font-semibold" data-testid="school-name">{branding.name}</p>
              <p className="text-xs text-gray-500">School admin</p>
            </div>
          </div>
          <div className="flex items-center gap-4 text-sm">
            <span className="hidden text-gray-600 sm:inline">{ctx.fullName}</span>
            <a href="/logout" className="underline">Log out</a>
          </div>
        </div>
        <AdminNav />
      </header>
      <main className="mx-auto max-w-5xl px-4 py-6">{children}</main>
    </div>
  )
}
```

- [ ] **Step 7: Dashboard page**

```tsx
// src/app/admin/page.tsx
import Link from 'next/link'
import { requireSchoolAdmin } from '@/lib/auth/guards'
import { createClient } from '@/lib/supabase/server'

export default async function AdminDashboard() {
  const { school } = await requireSchoolAdmin()
  const supabase = await createClient()

  const active = () =>
    supabase
      .from('memberships')
      .select('user_id', { count: 'exact', head: true })
      .eq('school_id', school.schoolId)
      .eq('active', true)

  const [admins, teachers, creators] = await Promise.all([
    active().eq('role', 'admin'),
    active().eq('role', 'teacher'),
    active().eq('role', 'teacher').eq('can_create_classes', true),
  ])
  for (const r of [admins, teachers, creators]) if (r.error) throw r.error

  const tiles = [
    { label: 'Teachers', value: teachers.count ?? 0, testId: 'tile-teachers' },
    { label: 'Can create classes', value: creators.count ?? 0, testId: 'tile-creators' },
    { label: 'Admins', value: admins.count ?? 0, testId: 'tile-admins' },
  ]

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-semibold">Dashboard</h1>
      <section className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        {tiles.map((t) => (
          <div key={t.label} className="card text-center" data-testid={t.testId}>
            <div className="text-3xl font-semibold">{t.value}</div>
            <div className="text-sm text-gray-600">{t.label}</div>
          </div>
        ))}
      </section>
      <section className="flex flex-wrap gap-2">
        <Link href="/admin/teachers" className="btn-primary">Invite a teacher</Link>
        <Link href="/admin/settings" className="btn-secondary">School settings</Link>
      </section>
    </div>
  )
}
```

- [ ] **Step 8: Update the Plan 1 E2E assertion that looked for the old heading**

In `e2e/platform.spec.ts`, replace

```ts
  await expect(page.getByRole('heading', { name: 'E2E Test School' })).toBeVisible()
```

with

```ts
  await expect(page.getByTestId('school-name')).toHaveText('E2E Test School')
```

- [ ] **Step 9: Verify**

Run: `npm run typecheck`, `npm run lint`, `npm test` → Expected: no errors, 0 lint warnings, all unit tests pass.
Run: `npm run test:e2e -- e2e/platform.spec.ts` → Expected: PASS, 4 tests (the first one now lands on the branded dashboard).

- [ ] **Step 10: Commit**

```bash
git add src tests/unit/logo-url.test.ts e2e/platform.spec.ts
git commit -m "feat: branded school admin layout and dashboard"
```

---

### Task 4: Teachers — invite, can-create-classes, remove, reset password

**Files:**
- Create: `src/lib/school/validation.ts`, `src/lib/school/teachers.ts`, `src/app/admin/teachers/page.tsx`, `src/app/admin/teachers/actions.ts`, `src/app/admin/teachers/teacher-forms.tsx`, `tests/db/school-teachers.test.ts`, `tests/unit/school-validation.test.ts`
- Modify: `src/lib/platform/validation.ts` (export `optionalText`, `isTimeZone`)

**Interfaces:**
- Consumes: Task 2 `addMember`, `MemberResult`, `MemberExistsError`, `resetPassword`, `assertResettableBySchool`, `CrossSchoolAccountError`, `personAccountSchema`, `accountFromForm`, `PersonAccountInput`; Task 3 `requireSchoolAdmin`; Plan 1 `CredentialsCard`, `SubmitButton`, `AccountExistsError`, `ReservedEmailError`
- Produces:
  - `school/validation.ts`: `teacherAccountSchema`, `teacherAccountFromForm(fd: FormData): unknown` (fields `teacherFullName`, `teacherEmail`, `teacherPhone`)
  - `school/teachers.ts`: type `TeacherRow = { userId: string; fullName: string; login: string; phone: string | null; canCreateClasses: boolean }`; class `NotSchoolTeacherError`; `listTeachers(supabase: SupabaseClient, schoolId: string): Promise<TeacherRow[]>`; `inviteTeacher(admin, school: { id: string; slug: string }, input: PersonAccountInput, accountDomain: string): Promise<MemberResult>`; `setCanCreateClasses(admin, schoolId: string, userId: string, value: boolean): Promise<void>`; `removeTeacher(admin, schoolId: string, userId: string): Promise<void>`; `resetTeacherPassword(admin, schoolId: string, userId: string): Promise<{ login: string; temporaryPassword: string }>`
  - UI: each teacher is an `<li data-testid="teacher-row">`; toggle is `role="switch"` named `Can create classes`; buttons `Reset password`, `Remove`; invite button `Invite teacher`

- [ ] **Step 1: Export helpers from `platform/validation.ts`**

Change `const optionalText = ...` to `export const optionalText = ...` and `function isTimeZone(...)` to `export function isTimeZone(...)`. No behaviour change.

- [ ] **Step 2: Write the failing unit test**

```ts
// tests/unit/school-validation.test.ts
import { describe, expect, it } from 'vitest'
import { teacherAccountFromForm, teacherAccountSchema } from '@/lib/school/validation'
import { toFieldErrors } from '@/lib/platform/validation'

function form(values: Record<string, string>) {
  const fd = new FormData()
  for (const [k, v] of Object.entries(values)) fd.set(k, v)
  return fd
}

describe('teacherAccountSchema', () => {
  it('accepts a teacher without email and normalises blanks', () => {
    const r = teacherAccountSchema.safeParse(
      teacherAccountFromForm(form({ teacherFullName: ' Hina Khan ', teacherEmail: '', teacherPhone: '0300 1234567' })),
    )
    expect(r.data).toEqual({ fullName: 'Hina Khan', email: null, phone: '0300 1234567' })
  })

  it('asks for the teacher name and a valid email', () => {
    const r = teacherAccountSchema.safeParse(
      teacherAccountFromForm(form({ teacherFullName: '', teacherEmail: 'nope', teacherPhone: '' })),
    )
    expect(toFieldErrors(r.error!)).toEqual({ fullName: "Enter the teacher's name", email: 'Enter a valid email' })
  })
})
```

- [ ] **Step 3: Write the failing DB tests**

```ts
// tests/db/school-teachers.test.ts
import { afterAll, describe, expect, it } from 'vitest'
import { randomUUID } from 'node:crypto'
import {
  addMember as addTestMember, adminClient, cleanupTestData, createTestSchool, createTestUser, signInAs, TEST_PREFIX,
} from './helpers'
import {
  inviteTeacher, listTeachers, NotSchoolTeacherError, removeTeacher, resetTeacherPassword, setCanCreateClasses,
} from '@/lib/school/teachers'
import { CrossSchoolAccountError } from '@/lib/accounts/security'

const DOMAIN = process.env.ACCOUNT_EMAIL_DOMAIN!
afterAll(cleanupTestData)

async function schoolWithAdmin() {
  const school = await createTestSchool()
  const admin = await createTestUser({ fullName: 'School Admin' })
  await addTestMember(school.id, admin.id, 'admin')
  return { school, adminSession: await signInAs(admin), adminUser: admin }
}

describe('teachers service', () => {
  it('invites a username teacher and lists them for the school admin via RLS', async () => {
    const { school, adminSession } = await schoolWithAdmin()
    const invited = await inviteTeacher(adminClient(), school, { fullName: 'Hina Khan', email: null, phone: '0300' }, DOMAIN)
    expect(invited.login).toBe(`hina.khan@${school.slug}`)

    expect(await listTeachers(adminSession, school.id)).toEqual([
      { userId: invited.userId, fullName: 'Hina Khan', login: `hina.khan@${school.slug}`, phone: '0300', canCreateClasses: false },
    ])
  })

  it('toggles can-create-classes and removes a teacher', async () => {
    const { school, adminSession } = await schoolWithAdmin()
    const t = await inviteTeacher(adminClient(), school, { fullName: 'Asad Ali', email: null, phone: null }, DOMAIN)

    await setCanCreateClasses(adminClient(), school.id, t.userId, true)
    expect((await listTeachers(adminSession, school.id))[0].canCreateClasses).toBe(true)

    await removeTeacher(adminClient(), school.id, t.userId)
    expect(await listTeachers(adminSession, school.id)).toEqual([])
    await expect(setCanCreateClasses(adminClient(), school.id, t.userId, true)).rejects.toBeInstanceOf(NotSchoolTeacherError)
  })

  it('refuses targets that are not active teachers of this school', async () => {
    const { school, adminUser } = await schoolWithAdmin()
    const other = await createTestSchool()
    const outsider = await inviteTeacher(adminClient(), other, { fullName: 'Outsider', email: null, phone: null }, DOMAIN)

    await expect(removeTeacher(adminClient(), school.id, outsider.userId)).rejects.toBeInstanceOf(NotSchoolTeacherError)
    await expect(resetTeacherPassword(adminClient(), school.id, adminUser.id)).rejects.toBeInstanceOf(NotSchoolTeacherError)
  })

  it('resets a teacher used only here, but not one shared with another school', async () => {
    const { school } = await schoolWithAdmin()
    const solo = await inviteTeacher(adminClient(), school, { fullName: 'Solo Teacher', email: null, phone: null }, DOMAIN)
    const reset = await resetTeacherPassword(adminClient(), school.id, solo.userId)
    expect(reset.login).toBe(solo.login)

    const email = `${TEST_PREFIX}${randomUUID().slice(0, 8)}@school.test`
    const shared = await inviteTeacher(adminClient(), school, { fullName: 'Shared', email, phone: null }, DOMAIN)
    await inviteTeacher(adminClient(), await createTestSchool(), { fullName: 'Shared', email, phone: null }, DOMAIN)
    await expect(resetTeacherPassword(adminClient(), school.id, shared.userId)).rejects.toBeInstanceOf(CrossSchoolAccountError)
  })
})
```

- [ ] **Step 4: Run tests to verify they fail**

Run: `npm test -- tests/unit/school-validation.test.ts` → Expected: FAIL (cannot resolve `@/lib/school/validation`).
Run: `npm run test:db -- tests/db/school-teachers.test.ts` → Expected: FAIL (cannot resolve `@/lib/school/teachers`).

- [ ] **Step 5: Implement `school/validation.ts`**

```ts
// src/lib/school/validation.ts
import { accountFromForm, personAccountSchema } from '@/lib/platform/validation'

export const teacherAccountSchema = personAccountSchema("Enter the teacher's name")

export function teacherAccountFromForm(fd: FormData): unknown {
  return accountFromForm(fd, 'teacher')
}
```

- [ ] **Step 6: Implement `school/teachers.ts`**

```ts
// src/lib/school/teachers.ts
import 'server-only'
import type { SupabaseClient } from '@supabase/supabase-js'
import { addMember, type MemberResult } from '@/lib/accounts/add-member'
import { assertResettableBySchool, resetPassword } from '@/lib/accounts/security'
import type { PersonAccountInput } from '@/lib/platform/validation'

export type TeacherRow = {
  userId: string
  fullName: string
  login: string
  phone: string | null
  canCreateClasses: boolean
}

export class NotSchoolTeacherError extends Error {
  constructor() {
    super('That person is not a teacher in this school')
  }
}

async function assertActiveTeacher(admin: SupabaseClient, schoolId: string, userId: string) {
  const { data, error } = await admin
    .from('memberships')
    .select('active')
    .eq('school_id', schoolId)
    .eq('user_id', userId)
    .eq('role', 'teacher')
    .maybeSingle()
  if (error) throw error
  if (!data?.active) throw new NotSchoolTeacherError()
}

/** Reads with the caller's session, so RLS limits it to schools they administer. */
export async function listTeachers(supabase: SupabaseClient, schoolId: string): Promise<TeacherRow[]> {
  const { data: members, error } = await supabase
    .from('memberships')
    .select('user_id, can_create_classes')
    .eq('school_id', schoolId)
    .eq('role', 'teacher')
    .eq('active', true)
  if (error) throw error
  if (members.length === 0) return []

  const { data: profiles, error: pErr } = await supabase
    .from('profiles')
    .select('id, full_name, email, username, phone')
    .in('id', members.map((m) => m.user_id))
  if (pErr) throw pErr

  const byId = new Map(profiles.map((p) => [p.id, p]))
  return members
    .flatMap((m) => {
      const p = byId.get(m.user_id)
      if (!p) return []
      return [{
        userId: m.user_id as string,
        fullName: p.full_name as string,
        login: (p.email ?? p.username) as string,
        phone: p.phone as string | null,
        canCreateClasses: m.can_create_classes as boolean,
      }]
    })
    .sort((a, b) => a.fullName.localeCompare(b.fullName))
}

export async function inviteTeacher(
  admin: SupabaseClient,
  school: { id: string; slug: string },
  input: PersonAccountInput,
  accountDomain: string,
): Promise<MemberResult> {
  return addMember(
    admin,
    { ...input, schoolId: school.id, schoolSlug: school.slug, role: 'teacher', usernameBase: input.fullName },
    accountDomain,
  )
}

export async function setCanCreateClasses(admin: SupabaseClient, schoolId: string, userId: string, value: boolean) {
  await assertActiveTeacher(admin, schoolId, userId)
  const { error } = await admin
    .from('memberships')
    .update({ can_create_classes: value })
    .eq('school_id', schoolId)
    .eq('user_id', userId)
  if (error) throw error
}

export async function removeTeacher(admin: SupabaseClient, schoolId: string, userId: string) {
  await assertActiveTeacher(admin, schoolId, userId)
  const { error } = await admin
    .from('memberships')
    .update({ active: false, can_create_classes: false })
    .eq('school_id', schoolId)
    .eq('user_id', userId)
  if (error) throw error
}

export async function resetTeacherPassword(
  admin: SupabaseClient,
  schoolId: string,
  userId: string,
): Promise<{ login: string; temporaryPassword: string }> {
  await assertActiveTeacher(admin, schoolId, userId)
  await assertResettableBySchool(admin, userId, schoolId)
  return resetPassword(admin, userId)
}
```

- [ ] **Step 7: Run the tests to verify they pass**

Run: `npm test -- tests/unit/school-validation.test.ts` → Expected: PASS, 2 tests.
Run: `npm run test:db -- tests/db/school-teachers.test.ts` → Expected: PASS, 4 tests.

- [ ] **Step 8: Server actions**

```ts
// src/app/admin/teachers/actions.ts
'use server'
import { revalidatePath } from 'next/cache'
import { z } from 'zod'
import { requireSchoolAdmin } from '@/lib/auth/guards'
import { createAdminClient } from '@/lib/supabase/admin'
import { serverEnv } from '@/lib/env'
import { toFieldErrors } from '@/lib/platform/validation'
import { teacherAccountFromForm, teacherAccountSchema } from '@/lib/school/validation'
import {
  inviteTeacher, NotSchoolTeacherError, removeTeacher, resetTeacherPassword, setCanCreateClasses,
} from '@/lib/school/teachers'
import { AccountExistsError, ReservedEmailError } from '@/lib/accounts/create-account'
import { MemberExistsError, type MemberResult } from '@/lib/accounts/add-member'
import { CrossSchoolAccountError } from '@/lib/accounts/security'

export type InviteState = { errors: Record<string, string>; created: MemberResult | null }
export type TeacherRowState = { error: string | null; reset: { login: string; temporaryPassword: string } | null }

const uuid = z.uuid()

export async function inviteTeacherAction(_prev: InviteState, formData: FormData): Promise<InviteState> {
  const { school } = await requireSchoolAdmin()
  const parsed = teacherAccountSchema.safeParse(teacherAccountFromForm(formData))
  if (!parsed.success) return { errors: toFieldErrors(parsed.error), created: null }
  try {
    const created = await inviteTeacher(
      createAdminClient(),
      { id: school.schoolId, slug: school.schoolSlug },
      parsed.data,
      serverEnv().accountEmailDomain,
    )
    revalidatePath('/admin', 'layout')
    return { errors: {}, created }
  } catch (e) {
    if (e instanceof AccountExistsError || e instanceof ReservedEmailError || e instanceof MemberExistsError) {
      return { errors: { email: e.message }, created: null }
    }
    throw e
  }
}

export async function setCanCreateAction(userId: string, value: boolean, _fd: FormData): Promise<void> {
  const { school } = await requireSchoolAdmin()
  await setCanCreateClasses(createAdminClient(), school.schoolId, uuid.parse(userId), z.boolean().parse(value))
  revalidatePath('/admin', 'layout')
}

export async function removeTeacherAction(userId: string, _prev: TeacherRowState, _fd: FormData): Promise<TeacherRowState> {
  const { school } = await requireSchoolAdmin()
  try {
    await removeTeacher(createAdminClient(), school.schoolId, uuid.parse(userId))
    revalidatePath('/admin', 'layout')
    return { error: null, reset: null }
  } catch (e) {
    if (e instanceof NotSchoolTeacherError) return { error: e.message, reset: null }
    throw e
  }
}

export async function resetTeacherPasswordAction(
  userId: string,
  _prev: TeacherRowState,
  _fd: FormData,
): Promise<TeacherRowState> {
  const { school } = await requireSchoolAdmin()
  try {
    const reset = await resetTeacherPassword(createAdminClient(), school.schoolId, uuid.parse(userId))
    return { error: null, reset }
  } catch (e) {
    if (e instanceof NotSchoolTeacherError || e instanceof CrossSchoolAccountError) return { error: e.message, reset: null }
    throw e
  }
}
```

- [ ] **Step 9: Client forms**

```tsx
// src/app/admin/teachers/teacher-forms.tsx
'use client'
import { useActionState } from 'react'
import {
  inviteTeacherAction, removeTeacherAction, resetTeacherPasswordAction, setCanCreateAction,
  type InviteState, type TeacherRowState,
} from './actions'
import { SubmitButton } from '@/components/submit-button'
import { CredentialsCard } from '@/components/credentials-card'

const emptyRow: TeacherRowState = { error: null, reset: null }

export function InviteTeacherForm({ schoolName }: { schoolName: string }) {
  const [state, action] = useActionState<InviteState, FormData>(inviteTeacherAction, { errors: {}, created: null })
  return (
    <div className="space-y-3">
      {state.created && <CredentialsCard schoolName={schoolName} {...state.created} />}
      <form action={action} className="card grid gap-3 sm:grid-cols-3">
        <label className="block">
          <span className="text-sm font-medium">Teacher name</span>
          <input name="teacherFullName" required className="input" />
          {state.errors.fullName && <p className="field-error">{state.errors.fullName}</p>}
        </label>
        <label className="block">
          <span className="text-sm font-medium">Email (optional)</span>
          <input name="teacherEmail" type="email" className="input" />
          {state.errors.email && <p className="field-error">{state.errors.email}</p>}
        </label>
        <label className="block">
          <span className="text-sm font-medium">Phone (optional)</span>
          <input name="teacherPhone" type="tel" className="input" />
        </label>
        <p className="text-xs text-gray-500 sm:col-span-3">
          Without an email, a username like hina.khan@school-address is created.
        </p>
        <div className="sm:col-span-3">
          <SubmitButton pendingText="Inviting…" className="btn-primary">Invite teacher</SubmitButton>
        </div>
      </form>
    </div>
  )
}

export function CanCreateToggle({ userId, value }: { userId: string; value: boolean }) {
  return (
    <form action={setCanCreateAction.bind(null, userId, !value)}>
      <button
        type="submit"
        role="switch"
        aria-checked={value}
        aria-label="Can create classes"
        className="flex items-center gap-2 text-sm"
      >
        <span className={`relative h-6 w-11 rounded-full transition ${value ? 'bg-blue-600' : 'bg-gray-300'}`}>
          <span className={`absolute top-0.5 h-5 w-5 rounded-full bg-white shadow transition ${value ? 'left-5' : 'left-0.5'}`} />
        </span>
        Can create classes
      </button>
    </form>
  )
}

export function TeacherRowActions(props: { userId: string; fullName: string; schoolName: string }) {
  const [removeState, removeAction] = useActionState<TeacherRowState, FormData>(
    removeTeacherAction.bind(null, props.userId),
    emptyRow,
  )
  const [resetState, resetAction] = useActionState<TeacherRowState, FormData>(
    resetTeacherPasswordAction.bind(null, props.userId),
    emptyRow,
  )
  const error = removeState.error ?? resetState.error

  return (
    <div className="space-y-2">
      <div className="flex flex-wrap gap-2">
        <form
          action={resetAction}
          onSubmit={(e) => {
            if (!confirm(`Reset the password for ${props.fullName}? They will be signed out everywhere.`)) e.preventDefault()
          }}
        >
          <SubmitButton pendingText="Resetting…" className="btn-secondary">Reset password</SubmitButton>
        </form>
        <form
          action={removeAction}
          onSubmit={(e) => {
            if (!confirm(`Remove ${props.fullName} from this school?`)) e.preventDefault()
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
```

- [ ] **Step 10: Teachers page**

```tsx
// src/app/admin/teachers/page.tsx
import { requireSchoolAdmin } from '@/lib/auth/guards'
import { createClient } from '@/lib/supabase/server'
import { listTeachers } from '@/lib/school/teachers'
import { CanCreateToggle, InviteTeacherForm, TeacherRowActions } from './teacher-forms'

export default async function TeachersPage() {
  const { school } = await requireSchoolAdmin()
  const teachers = await listTeachers(await createClient(), school.schoolId)

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-semibold">Teachers</h1>

      <section className="space-y-2">
        <h2 className="font-medium">Invite a teacher</h2>
        <InviteTeacherForm schoolName={school.schoolName} />
      </section>

      <section className="space-y-3">
        <h2 className="font-medium">All teachers ({teachers.length})</h2>
        {teachers.length === 0 ? (
          <p className="text-gray-600">No teachers yet.</p>
        ) : (
          <ul className="space-y-3">
            {teachers.map((t) => (
              <li key={t.userId} className="card space-y-3" data-testid="teacher-row">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="font-medium">{t.fullName}</p>
                    <p className="break-all text-sm text-gray-600">
                      <span className="font-mono">{t.login}</span>
                      {t.phone && <> · {t.phone}</>}
                    </p>
                  </div>
                  <CanCreateToggle userId={t.userId} value={t.canCreateClasses} />
                </div>
                <TeacherRowActions userId={t.userId} fullName={t.fullName} schoolName={school.schoolName} />
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  )
}
```

- [ ] **Step 11: Verify**

Run: `npm run typecheck`, `npm run lint`, `npm test` → Expected: no errors, 0 warnings, all pass.
Run: `npm run test:db -- tests/db/school-teachers.test.ts` → Expected: PASS.

- [ ] **Step 12: Commit**

```bash
git add src tests
git commit -m "feat: school admin teacher management"
```

---

### Task 5: School settings and logo upload

**Files:**
- Create: `src/lib/school/settings.ts`, `src/app/admin/settings/page.tsx`, `src/app/admin/settings/actions.ts`, `src/app/admin/settings/settings-form.tsx`, `tests/db/school-settings.test.ts`
- Modify: `src/lib/school/validation.ts`, `tests/unit/school-validation.test.ts`, `tests/db/helpers.ts` (cleanup removes test logos), `next.config.ts` (server action body limit)

**Interfaces:**
- Consumes: Task 1 bucket `school-logos`; Task 3 `requireSchoolAdmin`, `getSchoolBranding`, `SchoolBranding`; Task 4 `school/validation.ts`; Plan 1 `optionalText`, `isTimeZone`, `toFieldErrors`, `bestEffort`, `SubmitButton`
- Produces:
  - `school/validation.ts`: `schoolSettingsSchema`, `schoolSettingsFromForm(fd: FormData): unknown`, type `SchoolSettingsInput = { name: string; brandColor: string; timeZone: string; academicYear: string | null }`
  - `school/settings.ts`: `MAX_LOGO_BYTES = 1048576`; class `InvalidLogoError`; `updateSchoolSettings(admin, schoolId: string, input: SchoolSettingsInput): Promise<void>`; `uploadSchoolLogo(admin, schoolId: string, file: File): Promise<string>` (returns the new `logo_path`)
  - Settings form labels: `School name`, `Brand colour`, `Time zone`, `Academic year (optional)`, `Logo (PNG, JPEG or WebP, up to 1 MB)`; button `Save settings`; success message test id `settings-saved`

- [ ] **Step 1: Write the failing unit tests**

In `tests/unit/school-validation.test.ts`, add `schoolSettingsFromForm` and `schoolSettingsSchema` to the existing `@/lib/school/validation` import at the top of the file, then append:

```ts
describe('schoolSettingsSchema', () => {
  it('accepts valid settings and blanks academic year to null', () => {
    const r = schoolSettingsSchema.safeParse(
      schoolSettingsFromForm(form({ name: ' City School ', brandColor: '#1D4ED8', timeZone: 'Asia/Karachi', academicYear: '' })),
    )
    expect(r.data).toEqual({ name: 'City School', brandColor: '#1D4ED8', timeZone: 'Asia/Karachi', academicYear: null })
  })

  it('rejects a bad colour, time zone and short name', () => {
    const r = schoolSettingsSchema.safeParse(
      schoolSettingsFromForm(form({ name: 'A', brandColor: 'blue', timeZone: 'Mars/Base', academicYear: '2026-27' })),
    )
    expect(Object.keys(toFieldErrors(r.error!)).sort()).toEqual(['brandColor', 'name', 'timeZone'])
  })
})
```

- [ ] **Step 2: Write the failing DB tests**

```ts
// tests/db/school-settings.test.ts
import { afterAll, describe, expect, it } from 'vitest'
import { adminClient, cleanupTestData, createTestSchool } from './helpers'
import { InvalidLogoError, MAX_LOGO_BYTES, updateSchoolSettings, uploadSchoolLogo } from '@/lib/school/settings'
import { logoPublicUrl } from '@/lib/school/logo-url'

afterAll(cleanupTestData)

// 1×1 transparent PNG
const PNG = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==',
  'base64',
)
const png = () => new File([PNG], 'logo.png', { type: 'image/png' })

describe('updateSchoolSettings', () => {
  it('saves name, colour, time zone and academic year', async () => {
    const school = await createTestSchool()
    await updateSchoolSettings(adminClient(), school.id, {
      name: 'Renamed School', brandColor: '#15803d', timeZone: 'Asia/Karachi', academicYear: '2026-27',
    })
    const { data } = await adminClient()
      .from('schools').select('name, brand_color, time_zone, academic_year').eq('id', school.id).single()
    expect(data).toEqual({ name: 'Renamed School', brand_color: '#15803d', time_zone: 'Asia/Karachi', academic_year: '2026-27' })
  })
})

describe('uploadSchoolLogo', () => {
  it('stores the logo publicly and replaces the previous file', async () => {
    const school = await createTestSchool()
    const first = await uploadSchoolLogo(adminClient(), school.id, png())
    expect(first).toMatch(new RegExp(`^${school.id}/logo-\\d+\\.png$`))

    const res = await fetch(logoPublicUrl(process.env.NEXT_PUBLIC_SUPABASE_URL!, first)!)
    expect(res.status).toBe(200)

    await new Promise((r) => setTimeout(r, 5)) // distinct Date.now() in the file name
    const second = await uploadSchoolLogo(adminClient(), school.id, png())
    const { data: row } = await adminClient().from('schools').select('logo_path').eq('id', school.id).single()
    expect(row?.logo_path).toBe(second)

    const { data: files } = await adminClient().storage.from('school-logos').list(school.id)
    expect(files?.map((f) => `${school.id}/${f.name}`)).toEqual([second])
  })

  it('rejects other file types, empty files and files over 1 MB', async () => {
    const school = await createTestSchool()
    await expect(uploadSchoolLogo(adminClient(), school.id, new File(['x'], 'logo.gif', { type: 'image/gif' })))
      .rejects.toBeInstanceOf(InvalidLogoError)
    await expect(uploadSchoolLogo(adminClient(), school.id, new File([], 'logo.png', { type: 'image/png' })))
      .rejects.toBeInstanceOf(InvalidLogoError)
    await expect(uploadSchoolLogo(adminClient(), school.id, new File([new Uint8Array(MAX_LOGO_BYTES + 1)], 'big.png', { type: 'image/png' })))
      .rejects.toBeInstanceOf(InvalidLogoError)
  })
})
```

- [ ] **Step 3: Run tests to verify they fail**

Run: `npm test -- tests/unit/school-validation.test.ts` → Expected: FAIL (`schoolSettingsSchema` not exported).
Run: `npm run test:db -- tests/db/school-settings.test.ts` → Expected: FAIL (cannot resolve `@/lib/school/settings`).

- [ ] **Step 4: Add the settings schema**

Append to `src/lib/school/validation.ts` (and extend its import line to `import { accountFromForm, isTimeZone, optionalText, personAccountSchema } from '@/lib/platform/validation'`, plus `import { z } from 'zod'`):

```ts
export const schoolSettingsSchema = z.object({
  name: z.string().trim().min(2, 'Enter the school name').max(120),
  brandColor: z.string().regex(/^#[0-9a-fA-F]{6}$/, 'Choose a colour'),
  timeZone: z.string().refine(isTimeZone, 'Choose a valid time zone'),
  academicYear: optionalText(20),
})

export type SchoolSettingsInput = z.infer<typeof schoolSettingsSchema>

export function schoolSettingsFromForm(fd: FormData): unknown {
  const text = (key: string) => String(fd.get(key) ?? '')
  return {
    name: text('name'),
    brandColor: text('brandColor'),
    timeZone: text('timeZone'),
    academicYear: text('academicYear'),
  }
}
```

- [ ] **Step 5: Implement `school/settings.ts`**

```ts
// src/lib/school/settings.ts
import 'server-only'
import type { SupabaseClient } from '@supabase/supabase-js'
import { bestEffort } from '@/lib/accounts/best-effort'
import type { SchoolSettingsInput } from './validation'

export const MAX_LOGO_BYTES = 1048576
const LOGO_EXTENSIONS: Record<string, string> = {
  'image/png': 'png',
  'image/jpeg': 'jpg',
  'image/webp': 'webp',
}

export class InvalidLogoError extends Error {}

export async function updateSchoolSettings(admin: SupabaseClient, schoolId: string, input: SchoolSettingsInput) {
  const { error } = await admin
    .from('schools')
    .update({
      name: input.name,
      brand_color: input.brandColor,
      time_zone: input.timeZone,
      academic_year: input.academicYear,
    })
    .eq('id', schoolId)
  if (error) throw error
}

export async function uploadSchoolLogo(admin: SupabaseClient, schoolId: string, file: File): Promise<string> {
  const ext = LOGO_EXTENSIONS[file.type]
  if (!ext) throw new InvalidLogoError('Use a PNG, JPEG or WebP image')
  if (file.size === 0) throw new InvalidLogoError('Choose an image file')
  if (file.size > MAX_LOGO_BYTES) throw new InvalidLogoError('Use an image of 1 MB or less')

  const { data: current, error: readErr } = await admin.from('schools').select('logo_path').eq('id', schoolId).single()
  if (readErr) throw readErr

  const path = `${schoolId}/logo-${Date.now()}.${ext}`
  const bucket = admin.storage.from('school-logos')
  const { error: uploadErr } = await bucket.upload(path, Buffer.from(await file.arrayBuffer()), {
    contentType: file.type,
    upsert: false,
  })
  if (uploadErr) throw uploadErr

  const { error: updateErr } = await admin.from('schools').update({ logo_path: path }).eq('id', schoolId)
  if (updateErr) {
    await bestEffort(`remove uploaded logo ${path}`, () => bucket.remove([path]))
    throw updateErr
  }

  const previous = current.logo_path as string | null
  if (previous) await bestEffort(`remove old logo ${previous}`, () => bucket.remove([previous]))
  return path
}
```

- [ ] **Step 6: Clean up test logos in `tests/db/helpers.ts`**

At the start of `cleanupTestData`, before the schools delete, insert:

```ts
  const { data: testSchools } = await admin.from('schools').select('id').like('slug', `${TEST_PREFIX}%`)
  for (const s of testSchools ?? []) {
    const { data: files } = await admin.storage.from('school-logos').list(s.id)
    if (files?.length) await admin.storage.from('school-logos').remove(files.map((f) => `${s.id}/${f.name}`))
  }
```

- [ ] **Step 7: Run tests to verify they pass**

Run: `npm test -- tests/unit/school-validation.test.ts` → Expected: PASS, 4 tests.
Run: `npm run test:db -- tests/db/school-settings.test.ts` → Expected: PASS, 3 tests.

- [ ] **Step 8: Allow logo-sized server action bodies**

Server Actions accept 1 MB bodies by default; a 1 MB logo plus the other fields exceeds that. Replace `next.config.ts` with:

```ts
import type { NextConfig } from 'next'

const nextConfig: NextConfig = {
  experimental: {
    // Logos may be up to 1 MB; leave room for the other settings fields
    serverActions: { bodySizeLimit: '2mb' },
  },
}

export default nextConfig
```

(Documented in `node_modules/next/dist/docs/01-app/03-api-reference/05-config/01-next-config-js/serverActions.md`.)

- [ ] **Step 9: Settings action**

```ts
// src/app/admin/settings/actions.ts
'use server'
import { revalidatePath } from 'next/cache'
import { requireSchoolAdmin } from '@/lib/auth/guards'
import { createAdminClient } from '@/lib/supabase/admin'
import { toFieldErrors } from '@/lib/platform/validation'
import { schoolSettingsFromForm, schoolSettingsSchema } from '@/lib/school/validation'
import { InvalidLogoError, updateSchoolSettings, uploadSchoolLogo } from '@/lib/school/settings'

export type SettingsState = { errors: Record<string, string>; saved: boolean }

export async function saveSettingsAction(_prev: SettingsState, formData: FormData): Promise<SettingsState> {
  const { school } = await requireSchoolAdmin()
  const parsed = schoolSettingsSchema.safeParse(schoolSettingsFromForm(formData))
  if (!parsed.success) return { errors: toFieldErrors(parsed.error), saved: false }

  const admin = createAdminClient()
  const logo = formData.get('logo')
  if (logo instanceof File && logo.size > 0) {
    try {
      await uploadSchoolLogo(admin, school.schoolId, logo)
    } catch (e) {
      if (e instanceof InvalidLogoError) return { errors: { logo: e.message }, saved: false }
      throw e
    }
  }
  await updateSchoolSettings(admin, school.schoolId, parsed.data)

  revalidatePath('/', 'layout')
  return { errors: {}, saved: true }
}
```

- [ ] **Step 10: Settings page and form**

```tsx
// src/app/admin/settings/page.tsx
import { requireSchoolAdmin } from '@/lib/auth/guards'
import { getSchoolBranding } from '@/lib/school/branding'
import { SettingsForm } from './settings-form'

export default async function SettingsPage() {
  const { school } = await requireSchoolAdmin()
  const branding = await getSchoolBranding(school.schoolId)
  return (
    <div className="max-w-xl space-y-4">
      <h1 className="text-2xl font-semibold">School settings</h1>
      <SettingsForm branding={branding} timeZones={Intl.supportedValuesOf('timeZone')} />
    </div>
  )
}
```

```tsx
// src/app/admin/settings/settings-form.tsx
'use client'
import { useActionState } from 'react'
import { saveSettingsAction, type SettingsState } from './actions'
import { SubmitButton } from '@/components/submit-button'
import type { SchoolBranding } from '@/lib/school/branding'

export function SettingsForm({ branding, timeZones }: { branding: SchoolBranding; timeZones: string[] }) {
  const [state, action] = useActionState<SettingsState, FormData>(saveSettingsAction, { errors: {}, saved: false })
  const e = state.errors

  return (
    <form action={action} className="card space-y-4">
      <label className="block">
        <span className="text-sm font-medium">School name</span>
        <input name="name" defaultValue={branding.name} required className="input" />
        {e.name && <p className="field-error">{e.name}</p>}
      </label>

      <label className="block">
        <span className="text-sm font-medium">Brand colour</span>
        <input name="brandColor" type="color" defaultValue={branding.brandColor} className="mt-1 block h-10 w-20 rounded border border-gray-300" />
        {e.brandColor && <p className="field-error">{e.brandColor}</p>}
      </label>

      <label className="block">
        <span className="text-sm font-medium">Time zone</span>
        <select name="timeZone" defaultValue={branding.timeZone} className="input">
          {timeZones.map((tz) => (
            <option key={tz} value={tz}>{tz}</option>
          ))}
        </select>
        {e.timeZone && <p className="field-error">{e.timeZone}</p>}
      </label>

      <label className="block">
        <span className="text-sm font-medium">Academic year (optional)</span>
        <input name="academicYear" defaultValue={branding.academicYear ?? ''} placeholder="2026-27" className="input" />
        {e.academicYear && <p className="field-error">{e.academicYear}</p>}
      </label>

      <div className="space-y-2">
        <label className="block">
          <span className="text-sm font-medium">Logo (PNG, JPEG or WebP, up to 1 MB)</span>
          <input name="logo" type="file" accept="image/png,image/jpeg,image/webp" className="mt-1 block w-full text-sm" />
        </label>
        {branding.logoUrl && (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={branding.logoUrl} alt="Current logo" className="h-16 w-16 rounded border border-gray-200 object-contain" />
        )}
        {e.logo && <p className="field-error">{e.logo}</p>}
      </div>

      {state.saved && (
        <p className="text-sm text-green-700" data-testid="settings-saved">Settings saved.</p>
      )}
      <SubmitButton pendingText="Saving…" className="btn-primary">Save settings</SubmitButton>
    </form>
  )
}
```

The time zone list comes from the server so the client renders the same options (no hydration mismatch).

- [ ] **Step 11: Verify**

Run: `npm run typecheck`, `npm run lint`, `npm test` → Expected: no errors, 0 warnings, all pass.
Run: `npm run test:db -- tests/db/school-settings.test.ts` → Expected: PASS.

- [ ] **Step 12: Commit**

```bash
git add src tests next.config.ts
git commit -m "feat: school settings with logo upload"
```

---

### Task 6: End-to-end school admin flows

**Files:**
- Create: `e2e/school-admin.spec.ts`

**Interfaces:**
- Consumes: Plan 1 `e2e/login.ts` (`login`, `logout`), `tests/db/helpers.ts` (`createTestSchool`, `createTestUser`, `addMember`); UI labels and test ids from Tasks 3–5
- Produces: `npm run test:e2e` covers school admin dashboard, teacher invite → teacher first login, can-create toggle, remove → teacher blocked, reset → teacher forced to change password, settings + logo

- [ ] **Step 1: Write the E2E specs**

```ts
// e2e/school-admin.spec.ts
import { expect, test, type Page } from '@playwright/test'
import { addMember, createTestSchool, createTestUser } from '../tests/db/helpers'
import { login } from './login'

const PNG = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==',
  'base64',
)

async function schoolAdminSession(page: Page) {
  const school = await createTestSchool()
  const admin = await createTestUser({ fullName: 'Principal' })
  await addMember(school.id, admin.id, 'admin')
  await login(page, admin.email, admin.password)
  await expect(page).toHaveURL(/\/admin$/)
  return school
}

async function inviteTeacher(page: Page, name: string) {
  await page.getByRole('link', { name: 'Teachers' }).click()
  await page.getByLabel('Teacher name').fill(name)
  await page.getByRole('button', { name: 'Invite teacher' }).click()
  // Wait for this teacher's card, not a card left over from a previous invite
  await expect(page.getByTestId('credentials-card')).toContainText(`Login details for ${name}`)
  return {
    login: await page.getByTestId('credentials-login').innerText(),
    password: await page.getByTestId('credentials-password').innerText(),
  }
}

async function firstLogin(page: Page, loginId: string, temporaryPassword: string) {
  await login(page, loginId, temporaryPassword)
  await expect(page).toHaveURL(/\/change-password$/)
  await page.getByLabel('Current (temporary) password').fill(temporaryPassword)
  await page.getByLabel('New password').fill('TeacherPass123')
  await page.getByLabel('Type it again').fill('TeacherPass123')
  await page.getByRole('button', { name: 'Save password' }).click()
}

test('admin sees the branded dashboard, invites a teacher who can then log in', async ({ page, browser }) => {
  const school = await schoolAdminSession(page)
  await expect(page.getByTestId('school-name')).toHaveText(`School ${school.slug}`)
  await expect(page.getByTestId('tile-teachers')).toContainText('0')

  const teacher = await inviteTeacher(page, 'Hina Khan')
  expect(teacher.login).toBe(`hina.khan@${school.slug}`)

  const row = page.getByTestId('teacher-row').filter({ hasText: 'Hina Khan' })
  await row.getByRole('switch', { name: 'Can create classes' }).click()
  await expect(row.getByRole('switch', { name: 'Can create classes' })).toHaveAttribute('aria-checked', 'true')

  await page.getByRole('link', { name: 'Dashboard' }).click()
  await expect(page.getByTestId('tile-teachers')).toContainText('1')
  await expect(page.getByTestId('tile-creators')).toContainText('1')

  const teacherContext = await browser.newContext()
  const teacherPage = await teacherContext.newPage()
  await firstLogin(teacherPage, teacher.login, teacher.password)
  await expect(teacherPage).toHaveURL(/\/teacher$/)
  await teacherContext.close()
})

test('removing a teacher blocks them; resetting a password forces a change on their next request', async ({ page, browser }) => {
  await schoolAdminSession(page)
  const removed = await inviteTeacher(page, 'Removed Teacher')
  const resetOne = await inviteTeacher(page, 'Reset Teacher')

  const removedContext = await browser.newContext()
  const removedPage = await removedContext.newPage()
  await firstLogin(removedPage, removed.login, removed.password)
  await expect(removedPage).toHaveURL(/\/teacher$/)

  const resetContext = await browser.newContext()
  const resetPage = await resetContext.newPage()
  await firstLogin(resetPage, resetOne.login, resetOne.password)
  await expect(resetPage).toHaveURL(/\/teacher$/)

  page.once('dialog', (d) => d.accept())
  await page.getByTestId('teacher-row').filter({ hasText: 'Removed Teacher' }).getByRole('button', { name: 'Remove' }).click()
  await expect(page.getByTestId('teacher-row').filter({ hasText: 'Removed Teacher' })).toHaveCount(0)
  await removedPage.reload()
  await expect(removedPage).toHaveURL(/\/login\?error=no-access$/)

  page.once('dialog', (d) => d.accept())
  const resetRow = page.getByTestId('teacher-row').filter({ hasText: 'Reset Teacher' })
  await resetRow.getByRole('button', { name: 'Reset password' }).click()
  await expect(resetRow.getByTestId('credentials-card')).toBeVisible()
  await resetPage.reload()
  // Revoked session: with asymmetric JWT keys the still-valid access token reaches the forced password change;
  // with symmetric keys getClaims() verifies against Auth and the user is sent to /login. Both mean no access.
  await expect(resetPage).toHaveURL(/\/(change-password|login)$/)
  await expect(resetPage).not.toHaveURL(/\/teacher$/)

  await removedContext.close()
  await resetContext.close()
})

test('admin updates school settings and uploads a logo', async ({ page }) => {
  await schoolAdminSession(page)
  await page.getByRole('link', { name: 'Settings' }).click()

  await page.getByLabel('School name').fill('Renamed E2E School')
  await page.getByLabel('Academic year (optional)').fill('2026-27')
  await page.getByLabel('Logo (PNG, JPEG or WebP, up to 1 MB)').setInputFiles({
    name: 'logo.png', mimeType: 'image/png', buffer: PNG,
  })
  await page.getByRole('button', { name: 'Save settings' }).click()

  await expect(page.getByTestId('settings-saved')).toBeVisible()
  await expect(page.getByTestId('school-name')).toHaveText('Renamed E2E School')
  await expect(page.getByTestId('school-logo')).toBeVisible()
})
```

- [ ] **Step 2: Run the E2E suite**

Run: `npm run test:e2e`
Expected: PASS — 4 platform tests + 3 school admin tests.

If a failure appears, debug it with superpowers:systematic-debugging before changing code (read `test-results/*/error-context.md` first).

- [ ] **Step 3: Run everything**

Run: `npm run typecheck; npm run lint; npm test; npm run test:db; npm run test:e2e`
Expected: all pass, 0 lint warnings.

- [ ] **Step 4: Commit**

```bash
git add e2e/school-admin.spec.ts
git commit -m "test: end-to-end school admin flows"
```

---

## Done criteria for Plan 2

- A school admin lands on a branded dashboard with teacher counts.
- They can invite teachers (username or email), share logins, toggle "can create classes", remove teachers (blocked on next request), and reset passwords (sessions revoked, forced change) — but never for accounts shared with another school.
- Existing accounts are linked or reactivated instead of failing; the super admin can re-add a removed admin.
- School name, colour, time zone, academic year and logo can be edited and show in the header.
- `npm run typecheck`, `npm run lint` (0 warnings), `npm test`, `npm run test:db`, `npm run test:e2e` all pass.
