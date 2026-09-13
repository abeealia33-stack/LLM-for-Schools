import { createServerClient } from '@supabase/ssr'
import { NextResponse, type NextRequest } from 'next/server'
import { publicEnv } from '@/lib/env'

const PUBLIC_PATHS = ['/login']

export async function updateSession(request: NextRequest) {
  let response = NextResponse.next({ request })
  const { supabaseUrl, publishableKey } = publicEnv()

  const supabase = createServerClient(supabaseUrl, publishableKey, {
    cookies: {
      getAll() {
        return request.cookies.getAll()
      },
      setAll(cookiesToSet) {
        cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value))
        response = NextResponse.next({ request })
        cookiesToSet.forEach(({ name, value, options }) => response.cookies.set(name, value, options))
      },
    },
  })

  // Do not put code between client creation and getClaims(): it refreshes the token.
  const { data } = await supabase.auth.getClaims()
  const signedIn = Boolean(data?.claims)
  const isPublic = PUBLIC_PATHS.some((p) => request.nextUrl.pathname.startsWith(p))

  if (!signedIn && !isPublic) {
    const url = request.nextUrl.clone()
    url.pathname = '/login'
    url.search = ''
    return NextResponse.redirect(url)
  }
  return response
}
