import { readFileSync } from 'node:fs'
import { expect, type Page } from '@playwright/test'

export const superAdmin = () =>
  JSON.parse(readFileSync('e2e/.auth/super-admin.json', 'utf8')) as { email: string; password: string }

export async function login(page: Page, login: string, password: string) {
  await page.goto('/login')
  await page.getByLabel('Email or username').fill(login)
  await page.getByLabel('Password', { exact: true }).fill(password)
  await page.getByRole('button', { name: 'Log in' }).click()
  // Wait for the login action to settle; navigating away early cancels it and no session is set.
  // It settles by leaving /login (success) or by showing an error (e.g. suspended school).
  await expect(async () => {
    const left = !new URL(page.url()).pathname.startsWith('/login')
    const errorShown = await page.getByTestId('login-error').isVisible()
    expect(left || errorShown).toBe(true)
  }).toPass()
}

export async function logout(page: Page) {
  await page.goto('/logout')
  await page.waitForURL(/\/login/)
}
