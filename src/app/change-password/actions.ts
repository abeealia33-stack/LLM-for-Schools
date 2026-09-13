'use server'
import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { loadAccountContext } from '@/lib/auth/account-context'
import { homePathFor } from '@/lib/auth/home-path'
import { passwordSchema, toFieldErrors } from '@/lib/platform/validation'

export type PasswordState = { errors: Record<string, string> }

export async function changePasswordAction(_prev: PasswordState, formData: FormData): Promise<PasswordState> {
  const parsed = passwordSchema.safeParse({
    current: String(formData.get('current') ?? ''),
    password: String(formData.get('password') ?? ''),
    confirm: String(formData.get('confirm') ?? ''),
  })
  if (!parsed.success) return { errors: toFieldErrors(parsed.error) }

  const supabase = await createClient()
  const ctx = await loadAccountContext(supabase)
  if (!ctx) redirect('/login')

  const { current, password } = parsed.data
  if (password === current) {
    return { errors: { password: 'Choose a password different from the temporary one' } }
  }
  const email = (await supabase.auth.getClaims()).data?.claims?.email
  if (!email) return { errors: { current: 'Current password is incorrect' } }
  const { error: currentError } = await supabase.auth.signInWithPassword({ email, password: current })
  if (currentError) return { errors: { current: 'Current password is incorrect' } }

  const { error } = await supabase.auth.updateUser({ password })
  if (error) {
    return {
      errors: {
        password:
          error.code === 'same_password'
            ? 'Choose a password different from the temporary one'
            : 'Could not change the password. Try again.',
      },
    }
  }

  const { error: profileError } = await createAdminClient()
    .from('profiles')
    .update({ must_change_password: false })
    .eq('id', ctx.userId)
  if (profileError) {
    return {
      errors: {
        password:
          "Your new password was saved, but setup didn't finish. Log out, log in with your new password, and choose another new password.",
      },
    }
  }

  const home = homePathFor({ ...ctx, mustChangePassword: false })
  redirect(home.startsWith('/login') ? `/logout?next=${encodeURIComponent(home)}` : home)
}
