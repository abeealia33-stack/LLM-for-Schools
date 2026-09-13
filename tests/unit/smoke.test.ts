import { describe, it, expect } from 'vitest'

describe('tooling', () => {
  it('runs Vitest and loads the test setup', () => {
    expect(typeof process.env).toBe('object')
  })
})
