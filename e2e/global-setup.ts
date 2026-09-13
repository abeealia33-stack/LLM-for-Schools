import { mkdirSync, writeFileSync } from 'node:fs'
import { createTestUser } from '../tests/db/helpers'

export default async function globalSetup() {
  const boss = await createTestUser({ superAdmin: true, fullName: 'E2E Super Admin' })
  mkdirSync('e2e/.auth', { recursive: true })
  writeFileSync('e2e/.auth/super-admin.json', JSON.stringify(boss))
}
