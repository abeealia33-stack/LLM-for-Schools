'use server'
import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { serverEnv } from '@/lib/env'
import { resolveLoginEmail } from '@/lib/auth/login-identifier'
import { loadAccountContext } from '@/lib/auth/account-context'
import { homePathFor } from '@/lib/auth/home-path'
import { LOGIN_ERRORS } from '@/lib/auth/messages'

export type LoginState = { error: string | null; login: string }

export async function loginAction(_prev: LoginState, formData: FormData): Promise<LoginState> {
  const login = String(formData.get('login') ?? '')
  const password = String(formData.get('password') ?? '')

  const resolved = resolveLoginEmail(login, serverEnv().accountEmailDomain)
  if (!resolved) return { error: LOGIN_ERRORS.format, login }

  const supabase = await createClient()
  const { error } = await supabase.auth.signInWithPassword({ email: resolved.email, password })
  if (error) {
    return { error: error.code === 'invalid_credentials' ? LOGIN_ERRORS.invalid : LOGIN_ERRORS.unavailable, login }
  }

  const ctx = await loadAccountContext(supabase)
  const home = ctx ? homePathFor(ctx) : '/login?error=no-access'
  if (home.startsWith('/login')) {
    await supabase.auth.signOut()
    return { error: home.endsWith('suspended') ? LOGIN_ERRORS.suspended : LOGIN_ERRORS['no-access'], login }
  }
  redirect(home)
}
