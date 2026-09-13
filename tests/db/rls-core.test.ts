import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import type { SupabaseClient } from '@supabase/supabase-js'
import {
  addMember, adminClient, anonClient, cleanupTestData, createTestSchool, createTestUser, signInAs, type TestUser,
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

describe('write denial', () => {
  it('a user cannot make themselves super admin', async () => {
    await teacher1C.from('profiles').update({ is_super_admin: true }).eq('id', teacher1.id)
    const { data } = await adminClient().from('profiles').select('is_super_admin').eq('id', teacher1.id).single()
    expect(data?.is_super_admin).toBe(false)
  })

  it('a teacher cannot insert an admin membership for another school', async () => {
    const { error } = await teacher1C
      .from('memberships')
      .insert({ school_id: s2.id, user_id: teacher1.id, role: 'admin' })
    expect(error).not.toBeNull()
    const { data } = await adminClient()
      .from('memberships').select('user_id').eq('school_id', s2.id).eq('user_id', teacher1.id)
    expect(data ?? []).toEqual([])
  })

  it('a school admin cannot change their own membership', async () => {
    await admin1C.from('memberships').update({ role: 'teacher', active: false }).eq('school_id', s1.id).eq('user_id', admin1.id)
    const { data } = await adminClient()
      .from('memberships').select('role, active').eq('school_id', s1.id).eq('user_id', admin1.id).single()
    expect(data).toEqual({ role: 'admin', active: true })
  })

  it('a school admin cannot change their school status', async () => {
    await admin1C.from('schools').update({ status: 'suspended' }).eq('id', s1.id)
    const { data } = await adminClient().from('schools').select('status').eq('id', s1.id).single()
    expect(data?.status).toBe('active')
  })

  it('anon reads nothing and cannot call the RPCs', async () => {
    const anon = anonClient()
    for (const table of ['schools', 'profiles', 'memberships']) {
      const { data } = await anon.from(table).select('*')
      expect((data ?? []).length).toBe(0)
    }
    expect((await anon.rpc('my_memberships')).error).not.toBeNull()
    expect((await anon.rpc('platform_school_overview')).error).not.toBeNull()
  })
})
