import { describe, expect, it } from 'vitest'
import { credentialsMessage, whatsappShareUrl } from '@/lib/accounts/share-message'

describe('credentialsMessage', () => {
  it('lists the app link, login and temporary password', () => {
    const msg = credentialsMessage({
      schoolName: 'City School', fullName: 'Asad Ali', login: 'admin@city-school',
      temporaryPassword: 'Ab3dEf7hJk', appUrl: 'https://classboard.example',
    })
    expect(msg).toBe(
      [
        'City School – ClassBoard login for Asad Ali',
        'Open: https://classboard.example/login',
        'Login: admin@city-school',
        'Temporary password: Ab3dEf7hJk',
        'You will be asked to set a new password.',
      ].join('\n'),
    )
  })
})

describe('whatsappShareUrl', () => {
  it('encodes the message for wa.me', () => {
    expect(whatsappShareUrl('Login: a@b\nPass: x&y')).toBe('https://wa.me/?text=Login%3A%20a%40b%0APass%3A%20x%26y')
  })
})
