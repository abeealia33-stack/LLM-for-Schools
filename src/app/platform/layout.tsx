import Link from 'next/link'
import { requireSuperAdmin } from '@/lib/auth/guards'

export default async function PlatformLayout({ children }: { children: React.ReactNode }) {
  const ctx = await requireSuperAdmin()
  return (
    <div className="min-h-dvh">
      <header className="border-b border-gray-200 bg-white">
        <div className="mx-auto flex max-w-5xl items-center justify-between gap-4 px-4 py-3">
          <Link href="/platform" className="font-semibold">ClassBoard Platform</Link>
          <div className="flex items-center gap-4 text-sm">
            <span className="hidden text-gray-600 sm:inline">{ctx.fullName}</span>
            <a href="/logout" className="underline">Log out</a>
          </div>
        </div>
      </header>
      <main className="mx-auto max-w-5xl px-4 py-6">{children}</main>
    </div>
  )
}
