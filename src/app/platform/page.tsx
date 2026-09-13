import Link from 'next/link'
import { requireSuperAdmin } from '@/lib/auth/guards'
import { createClient } from '@/lib/supabase/server'

type OverviewRow = {
  id: string
  name: string
  slug: string
  city: string | null
  status: 'active' | 'suspended'
  admin_count: number
  teacher_count: number
  student_count: number
  last_activity: string
}

export default async function SchoolsPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string }>
}) {
  await requireSuperAdmin()
  const { q = '' } = await searchParams
  const supabase = await createClient()
  const { data, error } = await supabase.rpc('platform_school_overview')
  if (error) throw error

  const term = q.trim().toLowerCase()
  const rows = (data as OverviewRow[]).filter(
    (r) => !term || r.name.toLowerCase().includes(term) || (r.city ?? '').toLowerCase().includes(term),
  )

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-2xl font-semibold">Schools</h1>
        <Link href="/platform/new" className="btn-primary">+ New school</Link>
      </div>

      <form className="max-w-sm">
        <input name="q" defaultValue={q} placeholder="Search by name or city" className="input" />
      </form>

      {rows.length === 0 ? (
        <p className="text-gray-600">{term ? 'No schools match your search.' : 'No schools yet.'}</p>
      ) : (
        <div className="overflow-x-auto rounded-lg border border-gray-200 bg-white">
          <table className="w-full text-left text-sm">
            <thead className="bg-gray-50 text-gray-600">
              <tr>
                <th className="px-4 py-2">School</th>
                <th className="px-4 py-2">City</th>
                <th className="px-4 py-2 text-right">Teachers</th>
                <th className="px-4 py-2 text-right">Students</th>
                <th className="px-4 py-2">Last activity</th>
                <th className="px-4 py-2">Status</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.id} className="border-t border-gray-100">
                  <td className="px-4 py-2">
                    <Link href={`/platform/schools/${r.id}`} className="font-medium text-blue-700 underline">
                      {r.name}
                    </Link>
                  </td>
                  <td className="px-4 py-2">{r.city ?? '—'}</td>
                  <td className="px-4 py-2 text-right">{r.teacher_count}</td>
                  <td className="px-4 py-2 text-right">{r.student_count}</td>
                  <td className="px-4 py-2">{new Date(r.last_activity).toLocaleDateString('en-GB')}</td>
                  <td className="px-4 py-2">
                    {r.status === 'active' ? (
                      <span className="text-green-700">● Active</span>
                    ) : (
                      <span className="text-red-700">● Suspended</span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}
