import { describe, expect, it } from 'vitest'
import { resolveLoginEmail } from '@/lib/auth/login-identifier'

const D = 'accounts.classboard.test'

describe('resolveLoginEmail', () => {
  it('passes real emails through, lowercased', () => {
    expect(resolveLoginEmail('  Hina@School.PK ', D)).toEqual({ kind: 'email', email: 'hina@school.pk' })
  })
  it('maps generated usernames to internal emails', () => {
    expect(resolveLoginEmail('Ali.7B@City-School', D)).toEqual({
      kind: 'username',
      email: 'ali.7b--city-school@accounts.classboard.test',
    })
  })
  it('rejects anything else', () => {
    expect(resolveLoginEmail('ali', D)).toBeNull()
    expect(resolveLoginEmail('', D)).toBeNull()
    expect(resolveLoginEmail('a b@c.d', D)).toBeNull()
  })
})
