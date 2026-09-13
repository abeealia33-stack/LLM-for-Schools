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

/** Cleanup helper: attempt the operation but swallow errors so the original error is preserved */
async function bestEffort(fn: () => Promise<unknown>) {
  try {
    await fn()
  } catch {
    // cleanup is best-effort; original error wins
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
    if (credentials) {
      const userId = credentials.userId
      await bestEffort(async () => admin.auth.admin.deleteUser(userId))
    }
    await bestEffort(async () => admin.from('schools').delete().eq('id', school.id))
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
    const userId = credentials.userId
    await bestEffort(async () => admin.auth.admin.deleteUser(userId))
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
