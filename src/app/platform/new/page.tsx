import { requireSuperAdmin } from '@/lib/auth/guards'
import { NewSchoolForm } from './form'

export default async function NewSchoolPage() {
  await requireSuperAdmin()
  // Computed on the server so the client renders the same list (no hydration mismatch)
  const timeZones = Intl.supportedValuesOf('timeZone')
  return (
    <div className="max-w-xl space-y-4">
      <h1 className="text-2xl font-semibold">New school</h1>
      <NewSchoolForm timeZones={timeZones} />
    </div>
  )
}
