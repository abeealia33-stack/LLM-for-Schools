'use client'
import { useState } from 'react'
import { credentialsMessage, whatsappShareUrl } from '@/lib/accounts/share-message'

export function CredentialsCard(props: {
  schoolName: string
  fullName: string
  login: string
  temporaryPassword: string
}) {
  const [copied, setCopied] = useState(false)
  const message = () => credentialsMessage({ ...props, appUrl: window.location.origin })

  return (
    <div className="card space-y-3 border-green-300 bg-green-50" data-testid="credentials-card">
      <p className="font-medium">Login details for {props.fullName}</p>
      <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1 text-sm">
        <dt className="text-gray-600">Login</dt>
        <dd className="font-mono" data-testid="credentials-login">{props.login}</dd>
        <dt className="text-gray-600">Temporary password</dt>
        <dd className="font-mono" data-testid="credentials-password">{props.temporaryPassword}</dd>
      </dl>
      <p className="text-sm text-gray-600">This password is shown only once. Share it now.</p>
      <div className="flex flex-wrap gap-2">
        <button
          type="button"
          className="btn-secondary"
          onClick={async () => {
            await navigator.clipboard.writeText(message())
            setCopied(true)
          }}
        >
          {copied ? 'Copied' : 'Copy'}
        </button>
        <button
          type="button"
          className="btn-secondary"
          onClick={() => window.open(whatsappShareUrl(message()), '_blank', 'noopener')}
        >
          Share on WhatsApp
        </button>
      </div>
    </div>
  )
}
