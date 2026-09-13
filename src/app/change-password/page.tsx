import { redirect } from 'next/navigation'
import { getAccountContext } from '@/lib/auth/account-context'
import { homePathFor } from '@/lib/auth/home-path'
import { ChangePasswordForm } from './form'

export default async function ChangePasswordPage() {
  const ctx = await getAccountContext()
  if (!ctx) redirect('/login')
  const home = homePathFor({ ...ctx, mustChangePassword: false })
  if (home.startsWith('/login')) redirect(`/logout?next=${encodeURIComponent(home)}`)

  return (
    <main className="grid min-h-dvh place-items-center px-4">
      <div className="w-full max-w-sm space-y-6">
        <div className="text-center">
          <h1 className="text-2xl font-semibold">Set your password</h1>
          <p className="mt-1 text-sm text-gray-600">
            Hi {ctx.fullName}, choose a new password to replace the temporary one.
          </p>
        </div>
        <div className="card">
          <ChangePasswordForm />
        </div>
      </div>
    </main>
  )
}
