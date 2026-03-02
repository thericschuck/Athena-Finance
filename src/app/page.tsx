import { createClient } from '@/lib/supabase/server'

export default async function Home() {
  const supabase = await createClient()
  
  const { data, error } = await supabase
    .from('user_profiles')
    .select('count')
  
  return (
    <main>
      <h1>Athena Finance</h1>
      <p>DB Connection: {error ? '❌ ' + error.message : '✅ Connected'}</p>
      <p>Supabase URL: {process.env.NEXT_PUBLIC_SUPABASE_URL}</p>
    </main>
  )
}