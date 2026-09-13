import 'server-only'
import { randomInt } from 'node:crypto'

// No 0/O, 1/l/I — parents often copy these by hand
const PASSWORD_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnpqrstuvwxyz23456789'

export function generateTempPassword(length = 10): string {
  let out = ''
  for (let i = 0; i < length; i++) out += PASSWORD_ALPHABET[randomInt(PASSWORD_ALPHABET.length)]
  return out
}
