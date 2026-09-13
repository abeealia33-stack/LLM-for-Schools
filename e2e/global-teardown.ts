import { cleanupTestData } from '../tests/db/helpers'

export default async function globalTeardown() {
  await cleanupTestData()
}
