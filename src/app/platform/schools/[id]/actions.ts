'use server'
import { revalidatePath } from 'next/cache'
import { z } from 'zod'
import { requireSuperAdmin } from '@/lib/auth/guards'
import { createAdminClient } from '@/lib/supabase/admin'
import { serverEnv } from '@/lib/env'
import { adminAccountFromForm, adminAccountSchema, toFieldErrors } from '@/lib/platform/validation'
import {
  addSchoolAdmin, LastAdminError, NotSchoolAdminError, removeSchoolAdmin,
  resetSchoolAdminPassword, setSchoolStatus,
} from '@/lib/platform/schools'
import { AccountExistsError, type Credentials } from '@/lib/accounts/create-account'

export type AddAdminState = { errors: Record<string, string>; created: Credentials | null }
export type RowState = { error: string | null; reset: { login: string; temporaryPassword: string } | null }

const id = z.uuid()

export async function addAdminAction(schoolId: string, _prev: AddAdminState, formData: FormData): Promise<AddAdminState> {
  await requireSuperAdmin()
  const parsed = adminAccountSchema.safeParse(adminAccountFromForm(formData))
  if (!parsed.success) return { errors: toFieldErrors(parsed.error), created: null }
  try {
    const created = await addSchoolAdmin(createAdminClient(), id.parse(schoolId), parsed.data, serverEnv().accountEmailDomain)
    revalidatePath(`/platform/schools/${schoolId}`)
    return { errors: {}, created }
  } catch (e) {
    if (e instanceof AccountExistsError) return { errors: { email: e.message }, created: null }
    throw e
  }
}

export async function removeAdminAction(schoolId: string, userId: string, _prev: RowState, _fd: FormData): Promise<RowState> {
  await requireSuperAdmin()
  try {
    await removeSchoolAdmin(createAdminClient(), id.parse(schoolId), id.parse(userId))
    revalidatePath(`/platform/schools/${schoolId}`)
    return { error: null, reset: null }
  } catch (e) {
    if (e instanceof LastAdminError || e instanceof NotSchoolAdminError) return { error: e.message, reset: null }
    throw e
  }
}

export async function resetPasswordAction(schoolId: string, userId: string, _prev: RowState, _fd: FormData): Promise<RowState> {
  await requireSuperAdmin()
  try {
    const reset = await resetSchoolAdminPassword(createAdminClient(), id.parse(schoolId), id.parse(userId))
    return { error: null, reset }
  } catch (e) {
    if (e instanceof NotSchoolAdminError) return { error: e.message, reset: null }
    throw e
  }
}

export async function setStatusAction(schoolId: string, status: 'active' | 'suspended', _fd: FormData): Promise<void> {
  await requireSuperAdmin()
  await setSchoolStatus(createAdminClient(), id.parse(schoolId), z.enum(['active', 'suspended']).parse(status))
  revalidatePath(`/platform/schools/${schoolId}`)
  revalidatePath('/platform')
}
