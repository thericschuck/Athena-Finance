import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { DepotDashboard } from '@/components/depot/DepotDashboard'

export default async function DepotPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  if (!user) {
    redirect('/login')
  }

  return <DepotDashboard />
}
