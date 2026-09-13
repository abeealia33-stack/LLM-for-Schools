import 'server-only'
import { cache } from 'react'
import type { SupabaseClient } from '@supabase/supabase-js'
import { createClient } from '@/lib/supabase/server'
import { toAccountContext, type AccountContext } from './home-path'

export async function loadAccountContext(supabase: SupabaseClient): Promise<AccountContext | null> {
  const { data: claims } = await supabase.auth.getClaims()
  const userId = claims?.claims?.sub
  if (!userId) return null

  const [profileResult, membershipsResult] = await Promise.all([
    supabase
      .from('profiles')
      .select('full_name, is_super_admin, must_change_password')
      .eq('id', userId)
      .maybeSingle(),
    supabase.rpc('my_memberships'),
  ])
  if (profileResult.error || membershipsResult.error || !profileResult.data) return null
  return toAccountContext(userId, profileResult.data, membershipsResult.data ?? [])
}

export const getAccountContext = cache(async () => loadAccountContext(await createClient()))
