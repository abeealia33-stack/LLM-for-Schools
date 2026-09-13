import { requireMember } from '@/lib/auth/guards'

export default async function TeacherHome() {
  const { memberships } = await requireMember(['teacher'])
  return (
    <main className="mx-auto max-w-3xl space-y-2 p-6">
      <h1 className="text-xl font-semibold">{memberships[0].schoolName}</h1>
      <p className="text-gray-600">Teacher home</p>
      <a href="/logout" className="text-sm underline">Log out</a>
    </main>
  )
}
