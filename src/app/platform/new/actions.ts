'use server'
import { revalidatePath } from 'next/cache'
import { requireSuperAdmin } from '@/lib/auth/guards'
import { createAdminClient } from '@/lib/supabase/admin'
import { serverEnv } from '@/lib/env'
import { newSchoolFromForm, newSchoolSchema, toFieldErrors } from '@/lib/platform/validation'
import { createSchoolWithAdmin, SlugTakenError } from '@/lib/platform/schools'
import { AccountExistsError, ReservedEmailError, type Credentials } from '@/lib/accounts/create-account'

export type NewSchoolState = {
  errors: Record<string, string>
  values: Record<string, string>
  created: { schoolId: string; schoolName: string; credentials: Credentials } | null
}

export async function createSchoolAction(_prev: NewSchoolState, formData: FormData): Promise<NewSchoolState> {
  await requireSuperAdmin()
  const values = Object.fromEntries([...formData.entries()].map(([k, v]) => [k, String(v)]))

  const parsed = newSchoolSchema.safeParse(newSchoolFromForm(formData))
  if (!parsed.success) return { errors: toFieldErrors(parsed.error), values, created: null }

  try {
    const { schoolId, credentials } = await createSchoolWithAdmin(
      createAdminClient(),
      parsed.data,
      serverEnv().accountEmailDomain,
    )
    revalidatePath('/platform')
    return { errors: {}, values: {}, created: { schoolId, schoolName: parsed.data.name, credentials } }
  } catch (e) {
    if (e instanceof SlugTakenError) return { errors: { slug: e.message }, values, created: null }
    if (e instanceof AccountExistsError || e instanceof ReservedEmailError) return { errors: { 'admin.email': e.message }, values, created: null }
    throw e
  }
}
