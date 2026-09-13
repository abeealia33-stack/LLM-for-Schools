import 'server-only'
import type { SupabaseClient } from '@supabase/supabase-js'
import {
  formatUsername, generateTempPassword, internalEmailFor, nextUsernameCandidate, usernameLocal,
} from './credentials'

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
    await admin.auth.admin.deleteUser(created.user.id)
    throw profileError
  }

  return {
    userId: created.user.id,
    fullName: input.fullName,
    login: input.email ?? username!,
    temporaryPassword,
  }
}
