import { redirect } from 'next/navigation'
import { getAuthUser } from '@/lib/supabase/server'
import { DepotDashboard } from '@/components/depot/DepotDashboard'

export default async function DepotPage() {
  const { user } = await getAuthUser()

  if (!user) {
    redirect('/login')
  }

  return <DepotDashboard />
}
