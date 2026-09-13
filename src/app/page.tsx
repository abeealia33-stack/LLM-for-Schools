import { redirect } from 'next/navigation'
import { getAccountContext } from '@/lib/auth/account-context'
import { homePathFor } from '@/lib/auth/home-path'

export default async function Home() {
  const ctx = await getAccountContext()
  if (!ctx) redirect('/login')
  const home = homePathFor(ctx)
  redirect(home.startsWith('/login') ? `/logout?next=${encodeURIComponent(home)}` : home)
}
