import { NextResponse, type NextRequest } from 'next/server'
import { createClient } from '@/lib/supabase/server'

async function signOut(request: NextRequest) {
  const supabase = await createClient()
  await supabase.auth.signOut()
  const next = request.nextUrl.searchParams.get('next')
  const target = next && next.startsWith('/login') ? next : '/login'
  return NextResponse.redirect(new URL(target, request.url), { status: 303 })
}

export const GET = signOut
export const POST = signOut
