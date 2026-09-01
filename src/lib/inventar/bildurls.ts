/**
 * Signierte Bild-URLs, die zwischen zwei Seitenaufrufen gleich bleiben.
 *
 * NUR serverseitig verwenden — der Zwischenspeicher liegt im Arbeitsspeicher des Servers.
 *
 * Der Bucket `valuables` ist privat, die Seite muss also für jedes Bild eine signierte URL
 * erzeugen. `createSignedUrls` liefert bei jedem Aufruf ein FRISCHES Token — also bei jedem
 * Rendern eine andere URL für dieselbe Datei. Für den Browser ist das jedes Mal ein neues
 * Bild: der Cache greift nie, und nach jedem `router.refresh()` (Upload, Artwork,
 * Hauptbildwechsel) lädt die ganze Vitrine erneut herunter. Genau das fühlte sich an wie
 * „dauert, bis die Bilder angezeigt werden".
 *
 * Mit diesem Zwischenspeicher bekommt derselbe Pfad innerhalb der Gültigkeit dieselbe URL
 * zurück — und damit greift der Browser-Cache.
 *
 * Bewusst nur im Arbeitsspeicher: der Cache darf verloren gehen, dann wird eben neu
 * signiert. Bei mehreren Server-Instanzen hat jede ihren eigenen; das kostet höchstens einen
 * zusätzlichen Download und ist kein Korrektheitsproblem. Nichts davon umgeht die
 * Zugriffsprüfung — signiert wird weiterhin über den Client des angemeldeten Nutzers, und
 * der Schlüssel ist der Storage-Pfad, der die User-ID enthält.
 */

/** Gültigkeit der Signatur gegenüber Supabase. */
const TTL_SEKUNDEN = 60 * 60

/**
 * Wann wir eine URL selbst für verbraucht halten — früher als Supabase.
 *
 * Der Abstand verhindert, dass eine URL ausgeliefert wird, die auf dem Weg zum Browser
 * abläuft. Fünf Minuten sind großzügig genug für einen Seitenaufbau.
 */
const PUFFER_MS = 5 * 60 * 1000

interface Eintrag {
  url: string
  /** Zeitpunkt, ab dem neu signiert wird (Epoch-ms). */
  gueltigBis: number
}

const cache = new Map<string, Eintrag>()

/** Client-Ausschnitt, den diese Datei braucht — hält sie frei von Supabase-Typen. */
interface StorageClient {
  storage: {
    from(bucket: string): {
      createSignedUrls(
        paths: string[],
        expiresIn: number,
      ): Promise<{ data: { path?: string | null; signedUrl?: string | null }[] | null }>
    }
  }
}

/**
 * Signierte URLs für mehrere Pfade — aus dem Zwischenspeicher, was noch gilt, der Rest in
 * EINEM Aufruf nachsigniert.
 */
export async function signierteBildUrls(
  supabase: StorageClient,
  pfade: string[],
): Promise<Map<string, string>> {
  const jetzt = Date.now()
  const ergebnis = new Map<string, string>()
  const fehlend: string[] = []

  for (const pfad of new Set(pfade)) {
    const treffer = cache.get(pfad)
    if (treffer && treffer.gueltigBis > jetzt) ergebnis.set(pfad, treffer.url)
    else fehlend.push(pfad)
  }

  if (fehlend.length > 0) {
    const { data } = await supabase.storage.from('valuables').createSignedUrls(fehlend, TTL_SEKUNDEN)
    const gueltigBis = jetzt + TTL_SEKUNDEN * 1000 - PUFFER_MS
    for (const s of data ?? []) {
      if (!s.path || !s.signedUrl) continue
      cache.set(s.path, { url: s.signedUrl, gueltigBis })
      ergebnis.set(s.path, s.signedUrl)
    }
  }

  // Abgelaufene Einträge wegräumen. Ohne das wüchse die Map mit jedem gelöschten Bild
  // weiter — bei einem persönlichen Inventar unkritisch, aber unnötig.
  if (cache.size > 500) {
    for (const [pfad, eintrag] of cache) {
      if (eintrag.gueltigBis <= jetzt) cache.delete(pfad)
    }
  }

  return ergebnis
}

/** Entfernt einen Pfad aus dem Zwischenspeicher — nach dem Löschen einer Datei. */
export function vergisseBildUrl(pfad: string): void {
  cache.delete(pfad)
}
