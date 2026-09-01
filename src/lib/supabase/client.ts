import { createBrowserClient } from '@supabase/ssr'
import { Database } from '@/types/database'

/**
 * Supabase-Client für den Browser.
 *
 * Gab es bisher nicht — alles lief über Server Actions und Route Handler. Für Datei-Uploads
 * geht das aber nicht: eine Server Action nimmt standardmäßig nur **1 MB** Body entgegen
 * (`serverActions.bodySizeLimit`), und jedes Handyfoto ist größer. Der Upload schlug damit
 * fehl, bevor der eigene Code überhaupt lief.
 *
 * Direkt aus dem Browser in den Storage zu laden umgeht das Limit vollständig, spart den
 * Umweg über den Server und lässt sich pro Datei mit Fortschritt anzeigen. Die Absicherung
 * ändert sich dadurch nicht: der Client trägt den Session-Cookie, und die Storage-Policies
 * auf `valuables` prüfen weiterhin, dass der Pfad mit der eigenen User-ID beginnt.
 */
export function createClient() {
  return createBrowserClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
  )
}
