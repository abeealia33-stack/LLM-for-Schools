'use client'
import { useActionState } from 'react'
import {
  addAdminAction, removeAdminAction, resetPasswordAction, setStatusAction,
  type AddAdminState, type RowState,
} from './actions'
import { SubmitButton } from '@/components/submit-button'
import { CredentialsCard } from '@/components/credentials-card'

const emptyRow: RowState = { error: null, reset: null }

export function AddAdminForm({ schoolId, schoolName }: { schoolId: string; schoolName: string }) {
  const [state, action] = useActionState<AddAdminState, FormData>(addAdminAction.bind(null, schoolId), {
    errors: {},
    created: null,
  })
  return (
    <div className="space-y-3">
      {state.created && <CredentialsCard schoolName={schoolName} {...state.created} />}
      <form action={action} className="card grid gap-3 sm:grid-cols-3">
        <label className="block">
          <span className="text-sm font-medium">Full name</span>
          <input name="adminFullName" required className="input" />
          {state.errors.fullName && <p className="field-error">{state.errors.fullName}</p>}
        </label>
        <label className="block">
          <span className="text-sm font-medium">Email (optional)</span>
          <input name="adminEmail" type="email" className="input" />
          {state.errors.email && <p className="field-error">{state.errors.email}</p>}
        </label>
        <label className="block">
          <span className="text-sm font-medium">Phone (optional)</span>
          <input name="adminPhone" type="tel" className="input" />
        </label>
        <div className="sm:col-span-3">
          <SubmitButton pendingText="Adding…" className="btn-primary">Add admin</SubmitButton>
        </div>
      </form>
    </div>
  )
}

export function AdminRowActions(props: {
  schoolId: string
  schoolName: string
  userId: string
  fullName: string
}) {
  const [removeState, removeAction] = useActionState<RowState, FormData>(
    removeAdminAction.bind(null, props.schoolId, props.userId),
    emptyRow,
  )
  const [resetState, resetAction] = useActionState<RowState, FormData>(
    resetPasswordAction.bind(null, props.schoolId, props.userId),
    emptyRow,
  )
  const error = removeState.error ?? resetState.error

  return (
    <div className="space-y-2">
      <div className="flex flex-wrap gap-2">
        <form
          action={resetAction}
          onSubmit={(e) => {
            if (!confirm(`Reset the password for ${props.fullName}?`)) e.preventDefault()
          }}
        >
          <SubmitButton pendingText="Resetting…" className="btn-secondary">Reset password</SubmitButton>
        </form>
        <form
          action={removeAction}
          onSubmit={(e) => {
            if (!confirm(`Remove ${props.fullName} as admin?`)) e.preventDefault()
          }}
        >
          <SubmitButton pendingText="Removing…" className="btn-secondary">Remove</SubmitButton>
        </form>
      </div>
      {error && <p className="field-error">{error}</p>}
      {resetState.reset && (
        <CredentialsCard schoolName={props.schoolName} fullName={props.fullName} {...resetState.reset} />
      )}
    </div>
  )
}

export function StatusForm({ schoolId, status }: { schoolId: string; status: 'active' | 'suspended' }) {
  const next = status === 'active' ? 'suspended' : 'active'
  return (
    <form
      action={setStatusAction.bind(null, schoolId, next)}
      onSubmit={(e) => {
        const msg =
          next === 'suspended'
            ? 'Suspend this school? Nobody in it will be able to use the app.'
            : 'Reactivate this school?'
        if (!confirm(msg)) e.preventDefault()
      }}
    >
      <SubmitButton
        pendingText="Saving…"
        className={next === 'suspended' ? 'btn-danger' : 'btn-primary'}
      >
        {next === 'suspended' ? 'Suspend school' : 'Reactivate school'}
      </SubmitButton>
    </form>
  )
}
