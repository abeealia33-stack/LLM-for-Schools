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
