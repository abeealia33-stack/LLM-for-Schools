import { internalEmailFor } from '@/lib/accounts/credentials'

const USERNAME = /^[a-z0-9]+(\.[a-z0-9]+)*@[a-z0-9]+(-[a-z0-9]+)*$/
const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

export function resolveLoginEmail(
  raw: string,
  domain: string,
): { kind: 'email' | 'username'; email: string } | null {
  const value = raw.trim().toLowerCase()
  if (USERNAME.test(value)) return { kind: 'username', email: internalEmailFor(value, domain) }
  if (EMAIL.test(value)) return { kind: 'email', email: value }
  return null
}
