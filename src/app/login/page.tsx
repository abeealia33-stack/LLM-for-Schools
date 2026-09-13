import { LoginForm } from './login-form'
import { LOGIN_ERRORS } from '@/lib/auth/messages'

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>
}) {
  const { error } = await searchParams
  const initialError = error === 'suspended' || error === 'no-access' ? LOGIN_ERRORS[error] : null

  return (
    <main className="grid min-h-dvh place-items-center px-4">
      <div className="w-full max-w-sm space-y-6">
        <h1 className="text-center text-2xl font-semibold">ClassBoard</h1>
        <div className="card">
          <LoginForm initialError={initialError} />
        </div>
        <p className="text-center text-sm text-gray-500">
          Forgot your password? Ask your school admin to reset it.
        </p>
      </div>
    </main>
  )
}
