'use client'
import { useActionState } from 'react'
import { loginAction, type LoginState } from './actions'
import { SubmitButton } from '@/components/submit-button'

export function LoginForm({ initialError }: { initialError: string | null }) {
  const [state, action] = useActionState<LoginState, FormData>(loginAction, {
    error: initialError,
    login: '',
  })

  return (
    <form action={action} className="space-y-4">
      <label className="block">
        <span className="text-sm font-medium">Email or username</span>
        <input name="login" defaultValue={state.login} autoComplete="username" required className="input" />
      </label>
      <label className="block">
        <span className="text-sm font-medium">Password</span>
        <input name="password" type="password" autoComplete="current-password" required className="input" />
      </label>
      {state.error && (
        <p role="alert" className="field-error">
          {state.error}
        </p>
      )}
      <SubmitButton pendingText="Logging in…">Log in</SubmitButton>
    </form>
  )
}
