import { readFileSync } from 'node:fs'
import type { Page } from '@playwright/test'

export const superAdmin = () =>
  JSON.parse(readFileSync('e2e/.auth/super-admin.json', 'utf8')) as { email: string; password: string }

export async function login(page: Page, login: string, password: string) {
  await page.goto('/login')
  await page.getByLabel('Email or username').fill(login)
  await page.getByLabel('Password', { exact: true }).fill(password)
  await page.getByRole('button', { name: 'Log in' }).click()
}

export async function logout(page: Page) {
  await page.goto('/logout')
  await page.waitForURL(/\/login/)
}
