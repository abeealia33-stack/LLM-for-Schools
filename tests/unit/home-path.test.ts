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
