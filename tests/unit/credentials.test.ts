import { describe, expect, it } from 'vitest'
import {
  formatUsername, internalEmailFor, nextUsernameCandidate, slugify, usernameLocal,
} from '@/lib/accounts/credentials'

describe('slugify', () => {
  it('lowercases and hyphenates', () => {
    expect(slugify('  City School — G7 Campus! ')).toBe('city-school-g7-campus')
  })
  it('caps at 40 characters without a trailing hyphen', () => {
    const s = slugify('a'.repeat(39) + ' bbb')
    expect(s.length).toBeLessThanOrEqual(40)
    expect(s.endsWith('-')).toBe(false)
  })
})

describe('usernameLocal', () => {
  it('turns names into dotted lowercase', () => {
    expect(usernameLocal('Ali Khan 7B')).toBe('ali.khan.7b')
  })
  it('falls back to "user" when nothing usable remains', () => {
    expect(usernameLocal('!!!')).toBe('user')
  })
})

describe('formatUsername / internalEmailFor', () => {
  it('builds the visible username and its internal email', () => {
    const u = formatUsername('ali.7b', 'city-school')
    expect(u).toBe('ali.7b@city-school')
    expect(internalEmailFor(u, 'accounts.classboard.test')).toBe('ali.7b--city-school@accounts.classboard.test')
  })
})

describe('nextUsernameCandidate', () => {
  it('returns the base when free, else appends the first free number', () => {
    expect(nextUsernameCandidate('admin', new Set())).toBe('admin')
    expect(nextUsernameCandidate('admin', new Set(['admin', 'admin2']))).toBe('admin3')
  })
})
