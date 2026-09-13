import { describe, expect, it } from 'vitest'
import {
  newSchoolFromForm, newSchoolSchema, passwordSchema, toFieldErrors,
} from '@/lib/platform/validation'

function form(values: Record<string, string>) {
  const fd = new FormData()
  for (const [k, v] of Object.entries(values)) fd.set(k, v)
  return fd
}

const valid = {
  name: 'City School G7', slug: 'city-school-g7', city: 'Islamabad', contactName: '', contactPhone: '',
  timeZone: 'Asia/Karachi', adminFullName: 'Asad Ali', adminEmail: '', adminPhone: '0300 1234567',
}

describe('newSchoolSchema', () => {
  it('accepts a valid form and normalises empty strings to null', () => {
    const r = newSchoolSchema.safeParse(newSchoolFromForm(form(valid)))
    expect(r.success).toBe(true)
    expect(r.data).toMatchObject({
      name: 'City School G7', slug: 'city-school-g7', contactName: null,
      admin: { fullName: 'Asad Ali', email: null, phone: '0300 1234567' },
    })
  })

  it('reports field errors with dotted paths', () => {
    const r = newSchoolSchema.safeParse(
      newSchoolFromForm(form({ ...valid, slug: 'Bad Slug', timeZone: 'Mars/Base', adminFullName: '', adminEmail: 'nope' })),
    )
    expect(r.success).toBe(false)
    const errors = toFieldErrors(r.error!)
    expect(Object.keys(errors).sort()).toEqual(['admin.email', 'admin.fullName', 'slug', 'timeZone'])
  })
})

describe('passwordSchema', () => {
  it('requires 8+ characters and matching confirmation', () => {
    expect(passwordSchema.safeParse({ current: 'Temp12345', password: 'short', confirm: 'short' }).success).toBe(false)
    const mismatch = passwordSchema.safeParse({ current: 'Temp12345', password: 'longenough1', confirm: 'longenough2' })
    expect(toFieldErrors(mismatch.error!)).toEqual({ confirm: 'Passwords do not match' })
    expect(passwordSchema.safeParse({ current: 'Temp12345', password: 'longenough1', confirm: 'longenough1' }).success).toBe(true)
  })

  it('requires the current password', () => {
    const r = passwordSchema.safeParse({ current: '', password: 'longenough1', confirm: 'longenough1' })
    expect(r.success).toBe(false)
    expect(toFieldErrors(r.error!)).toEqual({ current: 'Enter your current password' })
  })
})
