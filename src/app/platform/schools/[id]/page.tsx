import Link from 'next/link'
import { notFound } from 'next/navigation'
import { z } from 'zod'
import { requireSuperAdmin } from '@/lib/auth/guards'
import { createClient } from '@/lib/supabase/server'
import { AddAdminForm, AdminRowActions, StatusForm } from './admin-forms'

export default async function SchoolDetailPage({ params }: { params: Promise<{ id: string }> }) {
  await requireSuperAdmin()
  const { id } = await params
  if (!z.uuid().safeParse(id).success) notFound()

  const supabase = await createClient()
  const [{ data: overview, error }, { data: memberships, error: mErr }] = await Promise.all([
    supabase.rpc('platform_school_overview'),
    supabase.from('memberships').select('user_id').eq('school_id', id).eq('role', 'admin').eq('active', true),
  ])
  if (error) throw error
  if (mErr) throw mErr

  const school = (overview as Array<Record<string, unknown>>).find((r) => r.id === id) as
    | {
        id: string; name: string; slug: string; city: string | null; contact_name: string | null
        contact_phone: string | null; status: 'active' | 'suspended'
        admin_count: number; teacher_count: number; student_count: number
      }
    | undefined
  if (!school) notFound()

  const adminIds = (memberships ?? []).map((m) => m.user_id as string)
  const { data: admins, error: pErr } = adminIds.length
    ? await supabase.from('profiles').select('id, full_name, email, username, phone').in('id', adminIds).order('full_name')
    : { data: [], error: null }
  if (pErr) throw pErr

  return (
    <div className="space-y-8">
      <div className="space-y-1">
        <Link href="/platform" className="text-sm text-blue-700 underline">← Schools</Link>
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h1 className="text-2xl font-semibold">{school.name}</h1>
          <StatusForm schoolId={school.id} status={school.status} />
        </div>
        <p className="text-sm text-gray-600">
          {school.status === 'active' ? '● Active' : '● Suspended'} · address <span className="font-mono">{school.slug}</span>
          {school.city && <> · {school.city}</>}
        </p>
      </div>

      <section className="grid grid-cols-3 gap-3">
        {[
          ['Admins', school.admin_count],
          ['Teachers', school.teacher_count],
          ['Students', school.student_count],
        ].map(([label, value]) => (
          <div key={label} className="card text-center">
            <div className="text-2xl font-semibold">{value}</div>
            <div className="text-sm text-gray-600">{label}</div>
          </div>
        ))}
      </section>

      <section className="space-y-2">
        <h2 className="text-lg font-semibold">Contact</h2>
        <p className="text-sm">{school.contact_name ?? '—'} · {school.contact_phone ?? '—'}</p>
      </section>

      <section className="space-y-3">
        <h2 className="text-lg font-semibold">School admins</h2>
        <ul className="space-y-3">
          {(admins ?? []).map((a) => (
            <li key={a.id} className="card space-y-2">
              <div>
                <p className="font-medium">{a.full_name}</p>
                <p className="text-sm text-gray-600">
                  <span className="font-mono">{a.email ?? a.username}</span>
                  {a.phone && <> · {a.phone}</>}
                </p>
              </div>
              <AdminRowActions schoolId={school.id} schoolName={school.name} userId={a.id} fullName={a.full_name} />
            </li>
          ))}
        </ul>
        <h3 className="pt-2 font-medium">Add another admin</h3>
        <AddAdminForm schoolId={school.id} schoolName={school.name} />
      </section>
    </div>
  )
}
