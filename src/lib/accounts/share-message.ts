export function credentialsMessage(i: {
  schoolName: string
  fullName: string
  login: string
  temporaryPassword: string
  appUrl: string
}): string {
  return [
    `${i.schoolName} – ClassBoard login for ${i.fullName}`,
    `Open: ${i.appUrl}/login`,
    `Login: ${i.login}`,
    `Temporary password: ${i.temporaryPassword}`,
    'You will be asked to set a new password.',
  ].join('\n')
}

export function whatsappShareUrl(message: string): string {
  return `https://wa.me/?text=${encodeURIComponent(message)}`
}
