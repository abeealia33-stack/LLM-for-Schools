'use client'
import { useActionState } from 'react'
import { changePasswordAction, type PasswordState } from './actions'
import { SubmitButton } from '@/components/submit-button'

export function ChangePasswordForm() {
  const [state, action] = useActionState<PasswordState, FormData>(changePasswordAction, { errors: {} })
  return (
    <form action={action} className="space-y-4">
      <label className="block">
        <span className="text-sm font-medium">New password</span>
        <input name="password" type="password" autoComplete="new-password" required className="input" />
        {state.errors.password && <p className="field-error">{state.errors.password}</p>}
      </label>
      <label className="block">
        <span className="text-sm font-medium">Type it again</span>
        <input name="confirm" type="password" autoComplete="new-password" required className="input" />
        {state.errors.confirm && <p className="field-error">{state.errors.confirm}</p>}
      </label>
      <SubmitButton pendingText="Saving…">Save password</SubmitButton>
    </form>
  )
}
