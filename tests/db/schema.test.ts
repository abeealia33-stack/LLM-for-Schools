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
