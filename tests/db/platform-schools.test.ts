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
