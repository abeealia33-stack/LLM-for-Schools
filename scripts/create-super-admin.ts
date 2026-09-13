import { config } from 'dotenv'
import { createClient } from '@supabase/supabase-js'

const args = process.argv.slice(2)
config({ path: args.includes('--test') ? '.env.test' : '.env.local' })

async function main() {
  const [fullName, email, password] = args.filter((a) => a !== '--test')
  if (!fullName || !email || !password || password.length < 8) {
    console.error('Usage: npx tsx scripts/create-super-admin.ts "Full Name" email password(8+ chars) [--test]')
    process.exit(1)
  }

  const admin = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SECRET_KEY!, {
    auth: { persistSession: false, autoRefreshToken: false },
  })
  const { data, error } = await admin.auth.admin.createUser({ email, password, email_confirm: true })
  if (error) throw error

  const { error: profileError } = await admin
    .from('profiles')
    .insert({ id: data.user.id, full_name: fullName, email, is_super_admin: true })
  if (profileError) {
    await admin.auth.admin.deleteUser(data.user.id)
    throw profileError
  }
  console.log(`Super admin created: ${email}`)
}

main().catch((e) => {
  console.error(e instanceof Error ? e.message : e)
  process.exit(1)
})
