import 'server-only'
import type { SupabaseClient } from '@supabase/supabase-js'
import {
  formatUsername, internalEmailFor, nextUsernameCandidate, usernameLocal,
} from './credentials'
import { bestEffort } from './best-effort'
import { generateTempPassword } from './temp-password'

export type Credentials = {
  userId: string
  fullName: string
  login: string
  temporaryPassword: string
}

export class AccountExistsError extends Error {
  constructor(login: string) {
    super(`An account with ${login} already exists`)
  }
}

export class ReservedEmailError extends Error {
  constructor(accountDomain: string) {
    super(`Emails on ${accountDomain} are reserved for generated usernames`)
  }
}

export async function createAccount(
  admin: SupabaseClient,
  input: {
    fullName: string
    email: string | null
    phone: string | null
    usernameBase: string
    schoolSlug: string
  },
  accountDomain: string,
): Promise<Credentials> {
  if (input.email) {
    const domain = input.email.slice(input.email.lastIndexOf('@') + 1).toLowerCase()
    if (domain === accountDomain.toLowerCase()) throw new ReservedEmailError(accountDomain)
  }

  let username: string | null = null
  let authEmail: string

  if (input.email) {
    authEmail = input.email
  } else {
    const base = usernameLocal(input.usernameBase)
    const { data, error } = await admin
      .from('profiles')
      .select('username')
      .like('username', `${base}%@${input.schoolSlug}`)
    if (error) throw error
    const taken = new Set((data ?? []).map((r) => String(r.username).split('@')[0]))
    username = formatUsername(nextUsernameCandidate(base, taken), input.schoolSlug)
    authEmail = internalEmailFor(username, accountDomain)
  }

  const temporaryPassword = generateTempPassword()
  const { data: created, error } = await admin.auth.admin.createUser({
    email: authEmail,
    password: temporaryPassword,
    email_confirm: true,
    user_metadata: { full_name: input.fullName },
  })
  if (error) {
    if (error.code === 'email_exists') throw new AccountExistsError(input.email ?? username!)
    throw error
  }

  const { error: profileError } = await admin.from('profiles').insert({
    id: created.user.id,
    full_name: input.fullName,
    email: input.email,
    phone: input.phone,
    username,
    must_change_password: true,
  })
  if (profileError) {
    const userId = created.user.id
    await bestEffort(`delete auth user ${userId}`, () => admin.auth.admin.deleteUser(userId))
    throw profileError
  }

  return {
    userId: created.user.id,
    fullName: input.fullName,
    login: input.email ?? username!,
    temporaryPassword,
  }
}
