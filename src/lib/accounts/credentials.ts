export function slugify(input: string): string {
  return input
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 40)
    .replace(/-+$/g, '')
}

export function usernameLocal(input: string): string {
  const local = input
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '.')
    .replace(/^\.+|\.+$/g, '')
    .slice(0, 30)
    .replace(/\.+$/g, '')
  return local || 'user'
}

export function formatUsername(local: string, schoolSlug: string): string {
  return `${local}@${schoolSlug}`
}

export function internalEmailFor(username: string, domain: string): string {
  const [local, slug] = username.split('@')
  return `${local}--${slug}@${domain}`
}

export function nextUsernameCandidate(base: string, taken: ReadonlySet<string>): string {
  if (!taken.has(base)) return base
  let n = 2
  while (taken.has(`${base}${n}`)) n++
  return `${base}${n}`
}
