import 'server-only'

/** Run a cleanup step without letting it mask the original error, but never fail silently. */
export async function bestEffort(label: string, fn: () => PromiseLike<unknown>): Promise<void> {
  try {
    const result = await fn()
    if (result && typeof result === 'object' && 'error' in result && result.error) {
      console.error(`cleanup failed: ${label}`, result.error)
    }
  } catch (err) {
    console.error(`cleanup failed: ${label}`, err)
  }
}
