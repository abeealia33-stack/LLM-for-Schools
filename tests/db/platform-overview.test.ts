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
