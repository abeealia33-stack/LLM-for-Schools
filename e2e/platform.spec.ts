import { expect, test } from '@playwright/test'
import { randomUUID } from 'node:crypto'
import { addMember, adminClient, createTestSchool, createTestUser } from '../tests/db/helpers'
import { login, logout, superAdmin } from './login'

test('super admin creates a school; its admin sets a password and reaches the admin panel', async ({ page }) => {
  const boss = superAdmin()
  const slug = `test-${randomUUID().slice(0, 8)}`

  await login(page, boss.email, boss.password)
  await expect(page).toHaveURL(/\/platform$/)
  await page.getByRole('link', { name: '+ New school' }).click()

  await page.getByLabel('School name').fill('E2E Test School')
  await page.getByLabel('School address (used in usernames)').fill(slug)
  await page.getByLabel('Time zone').selectOption('Asia/Karachi')
  await page.getByLabel('Full name').fill('Asad Ali')
  await page.getByRole('button', { name: 'Create school' }).click()

  await expect(page.getByTestId('credentials-card')).toBeVisible()
  const adminLogin = await page.getByTestId('credentials-login').innerText()
  const tempPassword = await page.getByTestId('credentials-password').innerText()
  expect(adminLogin).toBe(`admin@${slug}`)

  await logout(page)
  await login(page, adminLogin, tempPassword)
  await expect(page).toHaveURL(/\/change-password$/)
  await page.getByLabel('New password').fill('NewPassword123')
  await page.getByLabel('Type it again').fill('NewPassword123')
  await page.getByRole('button', { name: 'Save password' }).click()

  await expect(page).toHaveURL(/\/admin$/)
  await expect(page.getByRole('heading', { name: 'E2E Test School' })).toBeVisible()
})

test('suspending a school blocks its admin at login; reactivating restores access', async ({ page }) => {
  const boss = superAdmin()
  const school = await createTestSchool()
  const schoolAdmin = await createTestUser({ fullName: 'Suspend Me' })
  await addMember(school.id, schoolAdmin.id, 'admin')

  await login(page, boss.email, boss.password)
  await page.goto(`/platform/schools/${school.id}`)
  page.once('dialog', (d) => d.accept())
  await page.getByRole('button', { name: 'Suspend school' }).click()
  await expect(page.getByRole('button', { name: 'Reactivate school' })).toBeVisible()

  await logout(page)
  await login(page, schoolAdmin.email, schoolAdmin.password)
  await expect(page.getByRole('alert')).toHaveText("Your school's account is inactive. Contact your school.")

  await login(page, boss.email, boss.password)
  await page.goto(`/platform/schools/${school.id}`)
  page.once('dialog', (d) => d.accept())
  await page.getByRole('button', { name: 'Reactivate school' }).click()
  await expect(page.getByRole('button', { name: 'Suspend school' })).toBeVisible()

  await logout(page)
  await login(page, schoolAdmin.email, schoolAdmin.password)
  await expect(page).toHaveURL(/\/admin$/)
})

test('a signed-in admin is signed out on their next request after suspension', async ({ page }) => {
  const school = await createTestSchool()
  const schoolAdmin = await createTestUser()
  await addMember(school.id, schoolAdmin.id, 'admin')

  await login(page, schoolAdmin.email, schoolAdmin.password)
  await expect(page).toHaveURL(/\/admin$/)

  await adminClient().from('schools').update({ status: 'suspended' }).eq('id', school.id)
  await page.reload()

  await expect(page).toHaveURL(/\/login\?error=suspended$/)
  await expect(page.getByRole('alert')).toHaveText("Your school's account is inactive. Contact your school.")
  await page.goto('/admin')
  await expect(page).toHaveURL(/\/login$/) // session is gone, not just redirected
})

test('a school admin cannot open the platform panel', async ({ page }) => {
  const school = await createTestSchool()
  const schoolAdmin = await createTestUser()
  await addMember(school.id, schoolAdmin.id, 'admin')

  await login(page, schoolAdmin.email, schoolAdmin.password)
  await page.goto('/platform')
  await expect(page).toHaveURL(/\/admin$/)
})
