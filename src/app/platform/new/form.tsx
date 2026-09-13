'use client'
import Link from 'next/link'
import { useActionState, useState } from 'react'
import { createSchoolAction, type NewSchoolState } from './actions'
import { SubmitButton } from '@/components/submit-button'
import { CredentialsCard } from '@/components/credentials-card'
import { slugify } from '@/lib/accounts/credentials'

const initial: NewSchoolState = { errors: {}, values: {}, created: null }

function Field(props: {
  label: string
  name: string
  error?: string
  defaultValue?: string
  type?: string
  required?: boolean
  hint?: string
}) {
  return (
    <label className="block">
      <span className="text-sm font-medium">{props.label}</span>
      <input
        name={props.name}
        type={props.type ?? 'text'}
        defaultValue={props.defaultValue}
        required={props.required}
        className="input"
      />
      {props.hint && <span className="mt-1 block text-xs text-gray-500">{props.hint}</span>}
      {props.error && <p className="field-error">{props.error}</p>}
    </label>
  )
}

export function NewSchoolForm({ timeZones }: { timeZones: string[] }) {
  const [state, action] = useActionState(createSchoolAction, initial)
  const [slug, setSlug] = useState(state.values.slug ?? '')
  const [slugEdited, setSlugEdited] = useState(Boolean(state.values.slug))

  if (state.created) {
    return (
      <div className="space-y-4">
        <p className="text-green-800">School “{state.created.schoolName}” created.</p>
        <CredentialsCard schoolName={state.created.schoolName} {...state.created.credentials} />
        <div className="flex flex-wrap gap-2">
          <Link href={`/platform/schools/${state.created.schoolId}`} className="btn-primary">Open school</Link>
          <a href="/platform/new" className="btn-secondary">Create another</a>
        </div>
      </div>
    )
  }

  const v = state.values
  const e = state.errors
  return (
    <form action={action} className="space-y-6">
      <fieldset className="card space-y-4">
        <legend className="px-1 font-medium">School</legend>
        <label className="block">
          <span className="text-sm font-medium">School name</span>
          <input
            name="name"
            defaultValue={v.name}
            required
            className="input"
            onChange={(ev) => {
              if (!slugEdited) setSlug(slugify(ev.target.value))
            }}
          />
          {e.name && <p className="field-error">{e.name}</p>}
        </label>
        <label className="block">
          <span className="text-sm font-medium">School address (used in usernames)</span>
          <input
            name="slug"
            value={slug}
            required
            className="input font-mono"
            onChange={(ev) => {
              setSlugEdited(true)
              setSlug(ev.target.value)
            }}
          />
          <span className="mt-1 block text-xs text-gray-500">Example username: ali.7b@{slug || 'school'}</span>
          {e.slug && <p className="field-error">{e.slug}</p>}
        </label>
        <Field label="City" name="city" defaultValue={v.city} error={e.city} />
        <Field label="Contact person" name="contactName" defaultValue={v.contactName} error={e.contactName} />
        <Field label="Contact phone" name="contactPhone" type="tel" defaultValue={v.contactPhone} error={e.contactPhone} />
        <label className="block">
          <span className="text-sm font-medium">Time zone</span>
          <select name="timeZone" defaultValue={v.timeZone ?? ''} required className="input">
            <option value="" disabled>Choose…</option>
            {timeZones.map((tz) => (
              <option key={tz} value={tz}>{tz}</option>
            ))}
          </select>
          {e.timeZone && <p className="field-error">{e.timeZone}</p>}
        </label>
      </fieldset>

      <fieldset className="card space-y-4">
        <legend className="px-1 font-medium">School admin</legend>
        <Field label="Full name" name="adminFullName" defaultValue={v.adminFullName} error={e['admin.fullName']} required />
        <Field
          label="Email (optional)"
          name="adminEmail"
          type="email"
          defaultValue={v.adminEmail}
          error={e['admin.email']}
          hint="Without an email, a username like admin@school-address is created."
        />
        <Field label="Phone (optional)" name="adminPhone" type="tel" defaultValue={v.adminPhone} error={e['admin.phone']} />
      </fieldset>

      <SubmitButton pendingText="Creating…" className="btn-primary">Create school</SubmitButton>
    </form>
  )
}
