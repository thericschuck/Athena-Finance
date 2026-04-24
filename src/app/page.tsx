import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import { LandingClient } from '@/components/landing/LandingClient'

export default async function LandingPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (user) redirect('/dashboard')
  return <LandingClient />
}
