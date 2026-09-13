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
