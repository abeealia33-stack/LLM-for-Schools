import { z, type ZodError } from 'zod'

export const SLUG_PATTERN = /^[a-z0-9]+(-[a-z0-9]+)*$/
const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

const optionalText = (max: number) =>
  z.string().trim().max(max).transform((v) => (v === '' ? null : v))

function isTimeZone(tz: string): boolean {
  try {
    new Intl.DateTimeFormat('en', { timeZone: tz })
    return true
  } catch {
    return false
  }
}

export const adminAccountSchema = z.object({
  fullName: z.string().trim().min(1, "Enter the admin's name").max(120),
  email: z
    .string()
    .trim()
    .toLowerCase()
    .refine((v) => v === '' || EMAIL.test(v), 'Enter a valid email')
    .transform((v) => (v === '' ? null : v)),
  phone: optionalText(30),
})

export const newSchoolSchema = z.object({
  name: z.string().trim().min(2, 'Enter the school name').max(120),
  slug: z
    .string()
    .trim()
    .max(40, 'Use at most 40 characters')
    .regex(SLUG_PATTERN, 'Use lowercase letters, numbers and single hyphens'),
  city: optionalText(80),
  contactName: optionalText(120),
  contactPhone: optionalText(30),
  timeZone: z.string().refine(isTimeZone, 'Choose a valid time zone'),
  admin: adminAccountSchema,
})

export const passwordSchema = z
  .object({
    current: z.string().min(1, 'Enter your current password'),
    password: z.string().min(8, 'Use at least 8 characters').max(72, 'Use at most 72 characters'),
    confirm: z.string(),
  })
  .refine((d) => d.password === d.confirm, { message: 'Passwords do not match', path: ['confirm'] })

export type NewSchoolInput = z.infer<typeof newSchoolSchema>
export type AdminAccountInput = z.infer<typeof adminAccountSchema>

const text = (fd: FormData, key: string) => String(fd.get(key) ?? '')

export function adminAccountFromForm(fd: FormData): unknown {
  return { fullName: text(fd, 'adminFullName'), email: text(fd, 'adminEmail'), phone: text(fd, 'adminPhone') }
}

export function newSchoolFromForm(fd: FormData): unknown {
  return {
    name: text(fd, 'name'),
    slug: text(fd, 'slug'),
    city: text(fd, 'city'),
    contactName: text(fd, 'contactName'),
    contactPhone: text(fd, 'contactPhone'),
    timeZone: text(fd, 'timeZone'),
    admin: adminAccountFromForm(fd),
  }
}

export function toFieldErrors(error: ZodError): Record<string, string> {
  const out: Record<string, string> = {}
  for (const issue of error.issues) {
    const key = issue.path.join('.')
    if (!(key in out)) out[key] = issue.message
  }
  return out
}
