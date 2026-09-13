import { afterEach, describe, expect, it, vi } from 'vitest'
import { bestEffort } from '@/lib/accounts/best-effort'

describe('bestEffort', () => {
  afterEach(() => vi.restoreAllMocks())

  it('logs and swallows thrown errors and returned { error } results', async () => {
    const log = vi.spyOn(console, 'error').mockImplementation(() => {})
    const boom = new Error('boom')
    await expect(bestEffort('throws', async () => { throw boom })).resolves.toBeUndefined()
    await expect(bestEffort('returns error', async () => ({ data: null, error: boom }))).resolves.toBeUndefined()
    expect(log).toHaveBeenCalledWith('cleanup failed: throws', boom)
    expect(log).toHaveBeenCalledWith('cleanup failed: returns error', boom)
  })

  it('stays quiet on success', async () => {
    const log = vi.spyOn(console, 'error').mockImplementation(() => {})
    await bestEffort('ok', async () => ({ data: 1, error: null }))
    expect(log).not.toHaveBeenCalled()
  })
})
