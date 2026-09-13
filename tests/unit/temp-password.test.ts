import { describe, expect, it } from 'vitest'
import { generateTempPassword } from '@/lib/accounts/temp-password'

describe('generateTempPassword', () => {
  it('has the requested length and no look-alike characters', () => {
    for (let i = 0; i < 50; i++) {
      const pw = generateTempPassword(10)
      expect(pw).toHaveLength(10)
      expect(pw).not.toMatch(/[0O1lI]/)
    }
  })

  it('is different each time', () => {
    expect(generateTempPassword()).not.toBe(generateTempPassword())
  })
})
