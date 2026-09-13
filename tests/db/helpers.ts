import { createClient, type SupabaseClient } from '@supabase/supabase-js'
import { randomUUID } from 'node:crypto'

const url = () => process.env.NEXT_PUBLIC_SUPABASE_URL!
export const TEST_PREFIX = 'test-'

export function adminClient(): SupabaseClient {
  return createClient(url(), process.env.SUPABASE_SECRET_KEY!, {
    auth: { persistSession: false, autoRefreshToken: false },
  })
}

export function anonClient(): SupabaseClient {
  return createClient(url(), process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!, {
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
    const email = u.email ?? ''
    // real test emails start with test-; generated usernames embed the test- school slug
    if (email.startsWith(TEST_PREFIX) || email.includes(`--${TEST_PREFIX}`)) {
      await admin.auth.admin.deleteUser(u.id)
    }
  }
}
