import 'server-only'
import { createClient, type SupabaseClient } from '@supabase/supabase-js'
import { publicEnv, serverEnv } from '@/lib/env'

export function createAdminClient(): SupabaseClient {
  return createClient(publicEnv().supabaseUrl, serverEnv().secretKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  })
}
