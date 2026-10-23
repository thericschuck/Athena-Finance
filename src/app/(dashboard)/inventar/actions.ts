'use server'

import { getAuthUser } from '@/lib/supabase/server'
import { revalidatePath } from 'next/cache'
import { parseCsvAmount } from '@/lib/csv'
import { vergisseBildUrl } from '@/lib/inventar/bildurls'
import { NUTZUNGEN, WERTMODI } from '@/lib/inventar/wertmodell'
import { z } from 'zod'
import { parseForm, parseInput, issueMessage } from '@/lib/api/validate'
import { idField, uuid, isoDate, money, MAX_AMOUNT, optDate, optText } from '@/lib/api/schemas'

// Textfelder und Datumsangaben des Formulars. Beträge laufen weiter über `zahl()`
// (parseCsvAmount versteht beide Schreibweisen) und werden danach auf Endlichkeit geprüft.
const textfelderSchema = z.object({
  name: z.string({ error: 'Bezeichnung ist erforderlich' }).trim().min(1, 'Bezeichnung ist erforderlich').max(200),
  kategorie: optText(50),
  marke: optText(100),
  modell: optText(200),
  referenz: optText(100),
  seriennummer: optText(100),
  gekauft_am: optDate,
  kaufquelle: optText(200),
  zustand: optText(100),
  lagerort: optText(200),
  versicherungsnummer: optText(100),
  notizen: optText(5000),
  verkauft_am: optDate,
})
const betragSchema = z.number().min(-MAX_AMOUNT).max(MAX_AMOUNT)

// Bewusst NUR '/inventar' revalidieren, nie '/dashboard'.
//
// Das Dashboard ist eine dynamisch gerenderte Seite (ƒ) und fragt seine Daten bei jedem
// Aufruf neu ab -- die Revalidierung braucht es also gar nicht. Sie zieht dafuer eine sehr
// schwere Route (Depot, Strategie, Vertraege, recharts) in die Antwort dieser Action, im
// Dev-Server samt Kompilieren. Genau das liess das Formular minutenlang in „Speichert…"
// stehen, obwohl die Zeile in der DB laengst geschrieben war.

export type ValuableActionState = { error: string } | { success: true } | null

/** Prüft das Formular und liefert die Felder; sonst die Fehlermeldung. */
function pruefeFelder(formData: FormData): { f: ReturnType<typeof felder> } | { error: string } {
  const roh = parseForm(formData, textfelderSchema)
  if (!roh.ok) return { error: issueMessage(roh) }
  const f = felder(formData)
  for (const wert of [f.kaufpreis, f.verkaufspreis, zahl(formData, 'aktueller_wert')]) {
    if (wert !== null && !betragSchema.safeParse(wert).success) return { error: 'Betrag ist ungültig' }
  }
  return { f }
}

/** Leerer String aus einem Formular ist „nicht ausgefüllt", nicht „leerer Text". */
function text(formData: FormData, key: string): string | null {
  const v = (formData.get(key) as string | null)?.trim()
  return v ? v : null
}

function zahl(formData: FormData, key: string): number | null {
  const raw = (formData.get(key) as string | null)?.trim()
  if (!raw) return null
  // `parseCsvAmount` statt eigener Logik: das „letztes Trennzeichen gewinnt"-Verfahren
  // steht schon in lib/csv und deckt beide Schreibweisen ab.
  //
  // Die frühere Zeile hier war schlicht falsch: sie warf ALLE Punkte weg. Ein
  // `<input type="number">` übermittelt aber immer die Punkt-Schreibweise — aus 710,50 €
  // wurde damit 71050 €. Bei runden Beträgen fiel es nicht auf, bei jedem Cent-Betrag
  // hätte es die Sammlung um den Faktor 100 aufgeblasen.
  return parseCsvAmount(raw)
}

function schalter(formData: FormData, key: string): boolean {
  return formData.get(key) === 'on' || formData.get(key) === 'true'
}

/** Feldwerte, die create und update gemeinsam aus dem Formular ziehen. */
function felder(formData: FormData) {
  return {
    name:                (formData.get('name') as string)?.trim(),
    kategorie:           text(formData, 'kategorie') ?? 'sonstiges',
    marke:               text(formData, 'marke'),
    modell:              text(formData, 'modell'),
    referenz:            text(formData, 'referenz'),
    seriennummer:        text(formData, 'seriennummer'),
    gekauft_am:          text(formData, 'gekauft_am'),
    kaufpreis:           zahl(formData, 'kaufpreis'),
    kaufquelle:          text(formData, 'kaufquelle'),
    zustand:             text(formData, 'zustand'),
    box_vorhanden:       schalter(formData, 'box_vorhanden'),
    papiere_vorhanden:   schalter(formData, 'papiere_vorhanden'),
    lagerort:            text(formData, 'lagerort'),
    versichert:          schalter(formData, 'versichert'),
    versicherungsnummer: text(formData, 'versicherungsnummer'),
    notizen:             text(formData, 'notizen'),
    im_vermoegen:        schalter(formData, 'im_vermoegen'),
    verkauft_am:         text(formData, 'verkauft_am'),
    verkaufspreis:       zahl(formData, 'verkaufspreis'),
    nutzung:             auswahl(formData, 'nutzung', NUTZUNGEN.map(n => n.key), 'regelmaessig'),
    wertmodus:           auswahl(formData, 'wertmodus', WERTMODI.map(m => m.key), 'nutzung'),
  }
}

/** Nur bekannte Schluessel durchlassen; die DB lehnt alles andere per CHECK ohnehin ab. */
function auswahl<T extends string>(formData: FormData, key: string, erlaubt: readonly T[], fallback: T): T {
  const v = text(formData, key)
  return erlaubt.find(e => e === v) ?? fallback
}

// ── Anlegen ───────────────────────────────────────────────────────────────────
export async function createValuable(
  _prev: ValuableActionState,
  formData: FormData,
): Promise<ValuableActionState> {
  const { supabase, user } = await getAuthUser()
  if (!user) return { error: 'Nicht eingeloggt' }

  const geprueft = pruefeFelder(formData)
  if ('error' in geprueft) return { error: geprueft.error }
  const f = geprueft.f

  const { data, error } = await supabase
    .from('valuables')
    .insert({ ...f, user_id: user.id } as never)
    .select('id')
    .single()

  if (error) return { error: error.message }

  // Bewertungen anlegen. Ohne mindestens eine stünde das Objekt in der Vitrine als „—".
  //
  // Bis zu ZWEI Zeilen, und das ist der Punkt: der Kaufpreis gilt zum Kaufdatum, ein davon
  // abweichender aktueller Wert gilt ab HEUTE. Vorher wurde nur ein Wert geschrieben und
  // auf das Kaufdatum gelegt — wer eine 2025 für 845 EUR gekaufte Uhr heute mit 900 EUR
  // eintrug, behauptete damit, sie sei schon beim Kauf 900 EUR wert gewesen, und der
  // Kaufpreis fehlte in der Historie ganz. Der Wertverlauf war eine gerade Linie.
  const heute = new Date().toISOString().split('T')[0]
  const kaufdatum = f.gekauft_am ?? heute
  const aktuell = zahl(formData, 'aktueller_wert')

  const bewertungen: { valuable_id: string; user_id: string; wert: number; bewertet_am: string; quelle: string }[] = []
  const id = (data as { id: string } | null)?.id

  if (id) {
    if (f.kaufpreis !== null) {
      bewertungen.push({ valuable_id: id, user_id: user.id, wert: f.kaufpreis, bewertet_am: kaufdatum, quelle: 'kauf' })
    }
    // Zweite Zeile nur, wenn sie etwas Neues sagt: gleicher Wert am selben Tag wäre ein
    // Duplikat und verletzt `unique (valuable_id, bewertet_am)`.
    if (aktuell !== null && !(aktuell === f.kaufpreis && kaufdatum === heute)) {
      bewertungen.push({ valuable_id: id, user_id: user.id, wert: aktuell, bewertet_am: heute, quelle: 'manuell' })
    }
    // Weder Kaufpreis noch aktueller Wert: dann gibt es schlicht keine Bewertung, und die
    // Karte zeigt ehrlich „—" statt einer erfundenen Null.
  }

  if (bewertungen.length > 0) {
    const { error: wertErr } = await supabase
      .from('valuable_valuations')
      .upsert(bewertungen as never, { onConflict: 'valuable_id,bewertet_am' })
    if (wertErr) return { error: wertErr.message }
  }

  revalidatePath('/inventar')
  return { success: true }
}

// ── Bearbeiten ────────────────────────────────────────────────────────────────
export async function updateValuable(
  _prev: ValuableActionState,
  formData: FormData,
): Promise<ValuableActionState> {
  const { supabase, user } = await getAuthUser()
  if (!user) return { error: 'Nicht eingeloggt' }

  const idP = parseInput(idField(), formData.get('id'))
  if (!idP.ok) return { error: issueMessage(idP) }
  const id = idP.data

  const geprueft = pruefeFelder(formData)
  if ('error' in geprueft) return { error: geprueft.error }
  const f = geprueft.f

  // Ein gesetztes Verkaufsdatum nimmt das Stueck aus der Vitrine und aus der Summe. Die
  // Zeile bleibt samt Wertverlauf erhalten -- fuer die Frage „was war die Sammlung 2025
  // wert“ zaehlt es an Stichtagen VOR dem Verkauf weiterhin mit.
  const { error } = await supabase
    .from('valuables')
    .update({ ...f, is_active: !f.verkauft_am, updated_at: new Date().toISOString() } as never)
    .eq('id', id)
    .eq('user_id', user.id)

  if (error) return { error: error.message }

  // Die Kaufbewertung folgt Kaufdatum und Kaufpreis. Vorher blieb sie beim Datum stehen, das
  // beim Anlegen galt: wer ein vertipptes Kaufdatum korrigierte (Prada: 2026 statt 2025),
  // behielt eine Bewertung in der Zukunft, und der Sammlungsverlauf zeigte das Stück erst ab
  // der naechsten Handeingabe — waehrend die Kaufsummen-Linie es schon fuehrte.
  //
  // Ein Konflikt mit `unique (valuable_id, bewertet_am)` (am Zieltag existiert schon eine
  // andere Bewertung) wird bewusst ignoriert: die Kaufbewertung bleibt dann, wo sie ist, und
  // das Speichern scheitert nicht an einem Verlaufsdetail.
  if (f.gekauft_am && f.kaufpreis !== null) {
    await supabase
      .from('valuable_valuations')
      .update({ bewertet_am: f.gekauft_am, wert: f.kaufpreis } as never)
      .eq('valuable_id', id)
      .eq('user_id', user.id)
      .eq('quelle', 'kauf')
  }

  // Ein im Formular geänderter Wert wird als Bewertung von HEUTE geschrieben, nicht als
  // Korrektur der letzten — sonst verlöre der Verlauf genau die Bewegung, die er zeigen soll.
  //
  // Aber nur, wenn er sich tatsächlich unterscheidet: das Formular füllt das Feld mit dem
  // aktuellen Wert vor, also speichert jeder Klick auf „Speichern" sonst eine Bewertung von
  // heute, die exakt dasselbe sagt wie die letzte. Nach drei Korrekturen an der Beschreibung
  // stünden drei identische Zeilen im Wertverlauf.
  const neuerWert = zahl(formData, 'aktueller_wert')
  if (neuerWert !== null) {
    const heute = new Date().toISOString().split('T')[0]
    // `lte('bewertet_am', heute)` ist entscheidend: ohne diese Grenze verglich der Schutz
    // gegen eine Bewertung, die in der ZUKUNFT liegt. Genau das passierte bei einem
    // Gegenstand mit vertipptem Kaufdatum (2026 statt 2025) — der eingegebene Wert galt
    // als „unverändert" und wurde stillschweigend verworfen.
    const { data: letzte } = await supabase
      .from('valuable_valuations')
      .select('wert')
      .eq('valuable_id', id)
      .eq('user_id', user.id)
      .lte('bewertet_am', heute)
      .order('bewertet_am', { ascending: false })
      .limit(1)
      .maybeSingle()

    const bisher = (letzte as { wert: number } | null)?.wert
    if (bisher === undefined || Number(bisher) !== neuerWert) {
      const { error: wertErr } = await supabase
        .from('valuable_valuations')
        .upsert(
          { valuable_id: id, user_id: user.id, wert: neuerWert, bewertet_am: heute, quelle: 'manuell' } as never,
          { onConflict: 'valuable_id,bewertet_am' },
        )
      if (wertErr) return { error: wertErr.message }
    }
  }

  revalidatePath('/inventar')
  return { success: true }
}

// ── Bewertung nachtragen ──────────────────────────────────────────────────────
export async function addValuation(
  valuableId: string,
  wert: number,
  bewertetAm: string,
  notiz?: string,
): Promise<{ error?: string }> {
  const { supabase, user } = await getAuthUser()
  if (!user) return { error: 'Nicht eingeloggt' }
  const args = parseInput(
    z.object({ valuableId: uuid, wert: money, bewertetAm: isoDate, notiz: z.string().max(1000).optional() }),
    { valuableId, wert, bewertetAm, notiz },
  )
  if (!args.ok) return { error: issueMessage(args) }

  const { error } = await supabase.from('valuable_valuations').upsert(
    {
      valuable_id: valuableId,
      user_id: user.id,
      wert,
      bewertet_am: bewertetAm,
      quelle: 'schaetzung',
      notiz: notiz ?? null,
    } as never,
    { onConflict: 'valuable_id,bewertet_am' },
  )

  if (error) return { error: error.message }
  revalidatePath('/inventar')
  return {}
}

// ── Bilder ────────────────────────────────────────────────────────────────────
/**
 * Verbucht ein bereits hochgeladenes Bild.
 *
 * Die DATEI geht nicht durch diese Action, sondern direkt aus dem Browser in den Storage
 * (siehe lib/supabase/client.ts). Grund: eine Server Action nimmt standardmäßig nur 1 MB
 * Body entgegen, und jedes Handyfoto ist größer — der alte Upload scheiterte daran, bevor
 * eine Zeile eigener Code lief. Hier kommt nur noch der fertige Pfad an.
 *
 * Das Präfix wird trotzdem geprüft: die Storage-Policy lässt zwar keinen fremden Pfad zu,
 * aber ein Eintrag, der auf eine Datei eines anderen Nutzers ZEIGT, wäre auch ohne
 * Lesezugriff eine Falschangabe in der eigenen Tabelle.
 */
export async function registerValuableImage(
  valuableId: string,
  pfad: string,
  art: 'foto' | 'artwork' = 'foto',
): Promise<{ error?: string }> {
  const { supabase, user } = await getAuthUser()
  if (!user) return { error: 'Nicht eingeloggt' }
  const args = parseInput(
    z.object({ valuableId: uuid, pfad: z.string().min(1).max(500), art: z.enum(['foto', 'artwork']) }),
    { valuableId, pfad, art },
  )
  if (!args.ok) return { error: issueMessage(args) }
  if (!pfad.startsWith(`${user.id}/`) || pfad.includes('..')) return { error: 'Ungültiger Pfad' }

  // Erstes Bild wird automatisch Hauptbild — sonst bliebe die Vitrine nach dem ersten
  // Upload beim Kategorie-Icon stehen und man müsste noch einmal klicken.
  const { count } = await supabase
    .from('valuable_images')
    .select('id', { count: 'exact', head: true })
    .eq('valuable_id', valuableId)
    .eq('user_id', user.id)

  const { error } = await supabase.from('valuable_images').insert({
    valuable_id: valuableId,
    user_id: user.id,
    pfad,
    art,
    ist_hauptbild: (count ?? 0) === 0,
  } as never)

  if (error) return { error: error.message }
  revalidatePath('/inventar')
  return {}
}

/** Legt fest, welches Bild die Vitrine zeigt. */
export async function setHauptbild(bildId: string, valuableId: string): Promise<{ error?: string }> {
  const { supabase, user } = await getAuthUser()
  if (!user) return { error: 'Nicht eingeloggt' }
  const args = parseInput(z.object({ bildId: uuid, valuableId: uuid }), { bildId, valuableId })
  if (!args.ok) return { error: issueMessage(args) }

  // Erst alle zurücksetzen, dann eins setzen. Andersherum verletzt es den partiellen
  // Unique-Index `valuable_images_ein_hauptbild_idx` (zwei Hauptbilder für einen Moment).
  const { error: clearErr } = await supabase
    .from('valuable_images')
    .update({ ist_hauptbild: false } as never)
    .eq('valuable_id', valuableId)
    .eq('user_id', user.id)
  if (clearErr) return { error: clearErr.message }

  const { error } = await supabase
    .from('valuable_images')
    .update({ ist_hauptbild: true } as never)
    .eq('id', bildId)
    .eq('user_id', user.id)

  if (error) return { error: error.message }
  revalidatePath('/inventar')
  return {}
}

/** Entfernt ein einzelnes Bild samt Datei. */
export async function deleteValuableImage(bildId: string): Promise<{ error?: string }> {
  const { supabase, user } = await getAuthUser()
  if (!user) return { error: 'Nicht eingeloggt' }
  const idP = parseInput(uuid, bildId)
  if (!idP.ok) return { error: issueMessage(idP) }

  const { data: row } = await supabase
    .from('valuable_images')
    .select('pfad, valuable_id, ist_hauptbild')
    .eq('id', bildId)
    .eq('user_id', user.id)
    .maybeSingle()

  const bild = row as { pfad: string; valuable_id: string; ist_hauptbild: boolean } | null
  if (!bild) return { error: 'Bild nicht gefunden' }

  const { error } = await supabase
    .from('valuable_images')
    .delete()
    .eq('id', bildId)
    .eq('user_id', user.id)
  if (error) return { error: error.message }

  await supabase.storage.from('valuables').remove([bild.pfad])
  vergisseBildUrl(bild.pfad)

  // War es das Hauptbild, rückt das nächste nach — sonst fiele die Karte auf das
  // Kategorie-Icon zurück, obwohl noch Bilder da sind.
  if (bild.ist_hauptbild) {
    const { data: naechstes } = await supabase
      .from('valuable_images')
      .select('id')
      .eq('valuable_id', bild.valuable_id)
      .eq('user_id', user.id)
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle()
    const next = naechstes as { id: string } | null
    if (next) {
      await supabase
        .from('valuable_images')
        .update({ ist_hauptbild: true } as never)
        .eq('id', next.id)
        .eq('user_id', user.id)
    }
  }

  revalidatePath('/inventar')
  return {}
}

// ── Löschen ───────────────────────────────────────────────────────────────────
export async function deleteValuable(id: string): Promise<{ error?: string }> {
  const { supabase, user } = await getAuthUser()
  if (!user) return { error: 'Nicht eingeloggt' }
  const idP = parseInput(uuid, id)
  if (!idP.ok) return { error: issueMessage(idP) }

  // Dateien mitentfernen, sonst bleiben verwaiste Bilder im Bucket liegen. Die ZEILEN in
  // valuable_images gehen per `on delete cascade` mit, die Dateien nicht — Storage weiß
  // nichts von der Tabelle. Fehler hier sind bewusst nicht fatal: ein übrig gebliebenes
  // Bild ist harmloser als eine Zeile, die sich nicht löschen lässt.
  const { data: bilder } = await supabase
    .from('valuable_images')
    .select('pfad')
    .eq('valuable_id', id)
    .eq('user_id', user.id)

  const dateien = ((bilder ?? []) as { pfad: string }[]).map(b => b.pfad)
  if (dateien.length > 0) {
    await supabase.storage.from('valuables').remove(dateien)
    dateien.forEach(vergisseBildUrl)
  }

  // valuable_valuations hängt per `on delete cascade` dran und geht automatisch mit.
  const { error } = await supabase
    .from('valuables')
    .delete()
    .eq('id', id)
    .eq('user_id', user.id)

  if (error) return { error: error.message }
  revalidatePath('/inventar')
  return {}
}
