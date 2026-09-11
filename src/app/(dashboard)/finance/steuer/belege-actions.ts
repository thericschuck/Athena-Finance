'use server'

import { getAuthUser } from '@/lib/supabase/server'
import { revalidatePath } from 'next/cache'

/**
 * Belegupload.
 *
 * Zwei Regeln aus den GoBD stecken hier drin, und beide sind der Grund, warum
 * das nicht einfach ein Upload ist:
 *
 *  - Ein Beleg wird NIE ueberschrieben. Der Speicherpfad enthaelt einen
 *    Zeitstempel, `upsert` steht auf false, und der Bucket hat gar keine
 *    Update-Policy. Wer einen falschen Beleg erwischt hat, laedt den richtigen
 *    hoch; der alte wird als ersetzt markiert und bleibt lesbar.
 *  - Von jeder Datei wird ein SHA-256 gespeichert. Damit laesst sich spaeter
 *    zeigen, dass der Beleg derselbe ist wie beim Hochladen.
 */

export type BelegState = { error: string } | { success: true } | null

const ERLAUBT = new Set([
  'application/pdf',
  'image/jpeg',
  'image/png',
  'image/heic',
  'image/webp',
])

const MAX_BYTES = 10 * 1024 * 1024

/** Dateiname auf etwas reduzieren, das als Speicherschluessel taugt. */
function saubererName(name: string): string {
  const ohnePfad = name.split(/[/\\]/).pop() ?? 'beleg'
  return ohnePfad
    .normalize('NFKD')
    .replace(/[^\w.\-]/g, '_')
    .slice(0, 120)
}

export async function belegHochladen(
  _prev: BelegState,
  formData: FormData,
): Promise<BelegState> {
  const { supabase, user } = await getAuthUser()
  if (!user) return { error: 'Nicht eingeloggt' }

  const datei = formData.get('datei')
  if (!(datei instanceof File) || datei.size === 0) return { error: 'Keine Datei gewählt' }
  if (datei.size > MAX_BYTES) return { error: 'Die Datei ist größer als 10 MB' }
  if (!ERLAUBT.has(datei.type)) {
    return { error: `Dateityp ${datei.type || 'unbekannt'} wird nicht angenommen — PDF oder Bild` }
  }

  const transactionId = (formData.get('transaction_id') as string | null) || null
  const belegDatum    = (formData.get('beleg_datum') as string | null) || null
  const betragRoh     = (formData.get('betrag') as string | null) || null
  const aussteller    = (formData.get('aussteller') as string | null)?.trim() || null

  const bytes = await datei.arrayBuffer()
  const sha256 = Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256', bytes)))
    .map(b => b.toString(16).padStart(2, '0'))
    .join('')

  // Pfad: <user>/<jahr>/<zeitstempel>-<name>. Der Zeitstempel macht ihn
  // eindeutig, ohne dass je eine bestehende Datei ueberschrieben wird.
  const jahr = (belegDatum ?? new Date().toISOString()).slice(0, 4)
  const stempel = new Date().toISOString().replace(/[:.]/g, '-')
  const pfad = `${user.id}/${jahr}/${stempel}-${saubererName(datei.name)}`

  const { error: uploadFehler } = await supabase.storage
    .from('belege')
    .upload(pfad, datei, { contentType: datei.type, upsert: false })
  if (uploadFehler) return { error: `Upload fehlgeschlagen: ${uploadFehler.message}` }

  const { error: zeilenFehler } = await supabase.from('belege').insert({
    user_id: user.id,
    transaction_id: transactionId,
    pfad,
    dateiname: saubererName(datei.name),
    mime: datei.type,
    groesse_bytes: datei.size,
    sha256,
    beleg_datum: belegDatum,
    betrag: betragRoh ? Number(betragRoh) : null,
    aussteller,
  })

  if (zeilenFehler) {
    // Die Datei liegt schon im Speicher, die Zeile fehlt. Aufraeumen ist hier
    // nicht moeglich -- der Bucket hat bewusst keine Delete-Policy. Also ehrlich
    // melden: die Datei ist da, nur nicht verknuepft.
    return {
      error:
        `Die Datei wurde gespeichert, konnte aber nicht verknüpft werden: ${zeilenFehler.message}. ` +
        `Pfad: ${pfad}`,
    }
  }

  revalidatePath('/finance/steuer/euer')
  return { success: true }
}

/**
 * Einen Beleg als ersetzt markieren. Kein Loeschen -- der alte Eintrag bleibt
 * und zeigt auf seinen Nachfolger.
 */
export async function belegErsetzen(alt: string, neu: string): Promise<{ error?: string }> {
  const { supabase, user } = await getAuthUser()
  if (!user) return { error: 'Nicht eingeloggt' }

  const { error } = await supabase
    .from('belege')
    .update({ ersetzt_durch: neu })
    .eq('id', alt)
    .eq('user_id', user.id)

  if (error) return { error: error.message }
  revalidatePath('/finance/steuer/euer')
  return {}
}
