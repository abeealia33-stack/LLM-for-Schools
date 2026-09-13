function required(name: string, value: string | undefined): string {
  if (!value) throw new Error(`Missing environment variable ${name}`)
  return value
}

// NEXT_PUBLIC_* must be referenced literally so Next.js inlines them in the browser bundle
export function publicEnv() {
  return {
    supabaseUrl: required('NEXT_PUBLIC_SUPABASE_URL', process.env.NEXT_PUBLIC_SUPABASE_URL),
    publishableKey: required(
      'NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY',
      process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY,
    ),
  }
}

export function serverEnv() {
  return {
    secretKey: required('SUPABASE_SECRET_KEY', process.env.SUPABASE_SECRET_KEY),
    accountEmailDomain: required('ACCOUNT_EMAIL_DOMAIN', process.env.ACCOUNT_EMAIL_DOMAIN),
  }
}
