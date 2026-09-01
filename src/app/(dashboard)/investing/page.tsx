import { redirect } from 'next/navigation'

// „Investing" ist in der Sidebar nur eine Gruppe über /crypto, /depot und
// /strategy — die eigenen URLs der Bereiche bleiben bestehen. Diese Route
// existiert, damit der Gruppen-Pfad nicht ins Leere zeigt.
export default function InvestingPage() {
  redirect('/crypto')
}
