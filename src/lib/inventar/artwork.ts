import type { SupabaseClient } from '@supabase/supabase-js'
import type { Database } from '@/types/database'
import { kategorieEn, zustandEn, MAX_VORLAGEN, HINWEIS_MAX } from '@/lib/valuables'

// Weiterreichen, damit Aufrufer dieser Datei die Grenzen nicht aus zwei Modulen
// zusammensuchen muessen.
export { MAX_VORLAGEN, HINWEIS_MAX }

type DB = SupabaseClient<Database>

/**
 * Erzeugen von Inventar-Artwork — der gemeinsame Kern.
 *
 * Lag vorher komplett in `api/inventar/artwork/route.ts`. Herausgezogen, weil es jetzt zwei
 * Aufrufer gibt: den Knopf in der Vitrine und Athena über eine bestätigungspflichtige
 * Aktion (siehe WRITE_ACTIONS.generateValuableArtwork). Zwei Kopien des Stil-Bausteins
 * wären das Ende der Bildsprache — die Sammlung sieht nur wie ein Set aus, solange jedes
 * Bild durch denselben Prompt-Rahmen läuft.
 *
 * Warum OpenAI und nicht Claude: Claude erzeugt keine Bilder. Die App hat sonst nur einen
 * Anthropic-Key, deshalb hängt das hier an einem eigenen `OPENAI_API_KEY`.
 */

/** Bildmodell. Als Konstante, damit ein Wechsel eine Zeile ist. */
const MODEL = 'gpt-image-1'

/**
 * Einheitliches Ausgabeformat für alle Artworks.
 *
 * Quadratisch, weil die Vitrine ein quadratisches Raster ist — gemischte Seitenverhältnisse
 * sähen dort unruhig aus.
 *
 * WebP statt PNG ist der eigentliche Geschwindigkeitsgewinn: die PNGs kamen mit rund 1,9 MB
 * zurück, und genau daran hing das zähe Erscheinen der Bilder. Dieselbe Zeichnung als WebP
 * bei Kompressionsstufe 80 liegt bei einem Bruchteil davon, ohne sichtbaren Verlust bei
 * gemalten Flächen.
 */
const SIZE = '1024x1024'
const OUTPUT_FORMAT = 'webp'
const OUTPUT_COMPRESSION = 80

/**
 * Parameter, die nicht jede API-Version kennt.
 *
 * `input_fidelity`, `output_format` und `output_compression` sind junge Felder. Lehnt die
 * API eines davon ab, ist das kein Grund, die ganze Erzeugung scheitern zu lassen — dann
 * eben ohne. Das Ergebnis ist nur weniger vorlagentreu bzw. wieder ein grosses PNG.
 */
const OPTIONALE_PARAMETER = ['input_fidelity', 'output_format', 'output_compression']

/** `true`, wenn eine 400-Antwort einen dieser optionalen Parameter bemaengelt. */
function meckertUeberOptionales(text: string): boolean {
  return OPTIONALE_PARAMETER.some((p) => text.includes(p))
}

/** Notizen können lang sein; für einen Bildprompt zählen nur die ersten Sätze. */
const NOTIZ_MAX = 220

/**
 * Die Maltechnik — das, was alle Bilder als ein Set zusammenhält.
 *
 * Bewusst NUR Technik, keine Inszenierung. Vorher steckte in diesem Block auch
 * „Background: one plain warm cream tone, nothing else in the frame" und „Single object,
 * centered, three-quarter view" — und weil er an JEDEN Prompt gehängt wurde, galt das auch
 * für den Foto-Weg. Das Modell hat den Gegenstand also pflichtgemäß freigestellt und neu
 * aufgebaut, statt das vorhandene Bild umzumalen. Die Inszenierung steht jetzt in TAFEL und
 * kommt nur zum Zug, wenn es keine Vorlage gibt.
 *
 * Die Fassung davor war zu zaghaft: „museum catalogue illustration, subtle painterly
 * texture" neben Anweisungen wie „soft directional studio light" ergab ein astreines
 * Produktfoto. gpt-image-1 fällt ohne ausdrückliches Verbot immer auf Fotorealismus zurück,
 * deshalb steht das Verbot vorn und ausformuliert.
 *
 * Die Fassung danach schoss übers Ziel hinaus: „forms simplified into a few flat tonal
 * steps" und „slightly uneven edges" sind wörtlich die Anweisung für einen naiven
 * Bilderbuch-Look. Nicht-fotografisch heißt nicht detailarm — gemeint ist eine
 * Auktionskatalog-Tafel: fein gezeichnet, viel Materialdetail, aber jeder Strich sichtbar
 * von Hand. Deshalb steht der Detailgrad jetzt genauso ausdrücklich da wie das Fotoverbot,
 * und die typischen Comic-Merkmale sind einzeln ausgeschlossen.
 */
const STIL = [
  // Zuerst und mit Nachdruck: KEIN Foto. gpt-image-1 rendert sonst grundsaetzlich
  // fotorealistisch, und die frueheren Formulierungen ("studio light", "soft falloff")
  // waren im Grunde Fotoanweisungen.
  'IMPORTANT: this must look like a hand-made ILLUSTRATION, not a photograph and not a',
  'glossy 3D product render.',
  // ... aber ausdruecklich eine FEIN gearbeitete. Ohne diesen Absatz landet das Modell bei
  // Bilderbuch-Vereinfachung.
  'Style: a highly detailed, finely worked plate from a fine-art auction catalogue — the',
  'tradition of a vintage steel engraving finished with watercolour and gouache washes.',
  'Precise, controlled draughtsmanship: crisp fine ink linework of varying weight, delicate',
  'cross-hatching and stippling for shading, rich tonal modelling with many subtle steps,',
  'carefully observed highlights and reflected light.',
  'Render fine material detail by hand: guilloche and engine-turned patterns, leather grain,',
  'visible stitching, brushed and polished metal, fabric weave, tiny screws and edges.',
  'Aim for the level of DETAIL a photograph would have, while every mark stays visibly made',
  'by hand. Subtle paper grain underneath, running edge to edge across the whole image.',
  // Die Comic-Register einzeln ausschliessen -- "detailliert" allein reicht nicht.
  'NOT cartoonish, NOT naive, NOT a childrens book illustration, NOT clip art and NOT flat',
  'vector art. No thick uniform outlines, no posterised blocks of flat colour, no',
  'oversimplified shapes, no chunky brush strokes.',
  'Avoid photographic artefacts: no glossy blown-out speculars, no mirror reflections, no',
  'lens blur or bokeh, no studio product photography look.',
  'Muted, slightly desaturated but nuanced colours.',
  // Erfundene Schrift ist das auffaelligste KI-Merkmal. Lieber leer als falsch.
  'Do NOT render brand names, model names, serial numbers or any fine print — leave those',
  'surfaces clean and unlettered rather than inventing words. Plain dial indices or numerals',
  'as abstract marks are fine.',
  'No watermark, no added props.',
].join(' ')

/**
 * Inszenierung — NUR ohne Vorlage.
 *
 * Gibt es kein Bild, gibt es auch keine Komposition, die man erhalten könnte; dann wird eine
 * gesetzt. Sobald eine Vorlage da ist, darf dieser Block nicht mitlaufen, sonst überschreibt
 * er genau das, was erhalten bleiben soll.
 */
const TAFEL = [
  'A single object, centered, three-quarter view, on a plain warm cream background with a',
  'soft painted shadow beneath it. Nothing else in the frame.',
  // Ohne diesen Zusatz malt das Modell die Katalogseite mit: Tafel in der Mitte, weisser
  // Rand darum. Der Hintergrund ist die Bildflaeche -- nicht ein Blatt IN der Bildflaeche.
  'The cream background is the whole picture surface: it runs to all four edges and into the',
  'corners with no border around it.',
  // Der Hintergrund traegt die Sammlungsfarbe -- NICHT das Objekt. Ohne diese
  // Einschraenkung faerbte das Modell ein Edelstahlgehaeuse in Gold um.
  'The cream tone applies to the BACKGROUND only — never recolour the object itself to match',
  'it; keep plausible real materials (steel stays steel, not gold).',
  'No hands, no packaging.',
].join(' ')

/**
 * Foto-Weg: ein FILTER auf das vorhandene Bild, keine Neuinszenierung.
 *
 * Das war der eigentliche Denkfehler der ersten Fassungen. Hier stand wörtlich „ignore the
 * photographs entirely for everything else: drop their background, their box, their
 * lighting and their perspective distortion" — zusammen mit „single object, centered" im
 * Stilblock. Damit war ausdrücklich bestellt, was danach als Fehler auffiel: der Gegenstand
 * wurde ausgeschnitten und neu aufgebaut, Hintergrund und Bildidee waren weg.
 *
 * Jetzt gilt das Gegenteil: Bildaufbau, Perspektive und alles im Bild bleiben. Geändert wird
 * ausschließlich die Maltechnik — wie ein Filter, den man über das Foto legt.
 */
const AUS_FOTO = [
  'Repaint THE SUPPLIED PHOTOGRAPH as an illustration. Treat this as a painterly filter laid',
  'over the existing picture — not as a new artwork of the same subject.',
  'Keep the composition, the framing, the camera angle, the perspective, and the position and',
  'size of everything in the frame — including the background, the surface it rests on and any',
  'box or surroundings that are visible. Do not add, remove, move or crop anything, do not',
  'centre or straighten the subject, and do not cut the object out of its scene.',
  'Keep every colour and material true to the photograph, part by part: case, dial, strap,',
  'buckle, stitching, leather, fabric, metal — and the background too. If the strap is brown',
  'leather it stays brown; if the case is steel it stays steel.',
  'You may warm the overall palette slightly towards cream and bronze, the way a filter would,',
  'but never change what anything IS.',
  'Do not substitute an idealised catalogue version of the model from memory.',
  'If several photographs are supplied, the FIRST one defines the composition to repaint; the',
  'others are only extra reference for details that are unclear in it.',
  // Das Ergebnis MUSS quadratisch sein (siehe SIZE). Ohne diese Anweisung loest das Modell
  // die Formatvorgabe, indem es das Motiv beschneidet -- und schneidet dabei gern das Objekt
  // an. Besser: Hintergrund weiterfuehren.
  'The output must be SQUARE. Fit the scene into a square frame by PAINTING MORE of the',
  'existing background outwards where needed, continuing its colour, texture and lighting —',
  'never by cropping into the object, never by rearranging the scene, and never by adding',
  'blank bars, padding or a border at the sides or at the top and bottom. The subject keeps',
  'its position, angle and relative size.',
].join(' ')

/**
 * Zusatz für die Verfeinerungsrunde — Vorlage ist ein bereits erzeugtes Artwork.
 *
 * Der Unterschied zu AUS_FOTO ist der Punkt der ganzen Übung: beim Foto ist die Vorlage
 * roher Beleg, den es zu übersetzen gilt; beim Artwork ist sie das Ergebnis, das erhalten
 * bleiben soll. Ohne diese Unterscheidung zeichnet das Modell bei „mach den Hintergrund
 * dunkler" das ganze Bild neu und man verliert alles, was schon stimmte.
 */
const AUS_ARTWORK = [
  'The supplied image is a PREVIOUS VERSION of this illustration and is already in the',
  'target style. Keep it: same object, same pose, same framing, same palette, same brush',
  'handling. Redraw it only as far as the requested change below demands, and leave every',
  'other part of the picture as it is. This is a revision, not a new drawing.',
].join(' ')

/**
 * Randlos — gilt in JEDEM Weg.
 *
 * Der weisse Rahmen bei der Tissot kam aus zwei Richtungen gleichzeitig, und deshalb steht
 * das hier als eigener Block und nicht als Halbsatz in einem der drei Wege:
 *
 * 1. Der Stil bestellt eine „plate from a fine-art auction catalogue" mit Papierkorn. Ein
 *    Bildmodell nimmt das wörtlich und malt die SEITE mit — Tafel in der Mitte, Passepartout
 *    und weisser Papierrand darum. Gemeint war immer nur die Maltechnik, nie das Blatt.
 * 2. Ist die Vorlage kein Quadrat, ist der billigste Weg zum quadratischen Ausgabeformat
 *    ein Letterbox: Motiv unverändert, oben und unten je ein leerer Balken.
 *
 * Beides sieht in der Vitrine gleich falsch aus — die Kachel ist selbst schon ein Rahmen,
 * ein zweiter darin lässt das Bild schrumpfen. Deshalb ausformuliert und mit den einzelnen
 * Erscheinungsformen benannt: „no border" allein deckt Passepartout und Balken nicht ab.
 */
const RANDLOS = [
  'FULL BLEED, absolutely essential: the illustration itself fills the entire square canvas',
  'from edge to edge and into all four corners. The picture bleeds off every side.',
  'Do NOT draw the catalogue page, sheet or mount around the illustration — only the',
  'illustration itself. No border, no frame, no outline around the picture, no passepartout',
  'or mat, no white or cream margin, no paper edge, no letterbox or pillarbox bars, no',
  'padding, no rounded corners, no vignette ring, no drop shadow around the image, no',
  'caption strip, plate number or label area.',
  'Every pixel at the outer edge belongs to the scene itself (background, surface or object)',
  'and continues past the edge.',
].join(' ')

/** Zeilenform, die für den Prompt gebraucht wird. */
export interface ArtworkItem {
  id: string
  name: string
  kategorie: string
  marke: string | null
  modell: string | null
  referenz: string | null
  zustand: string | null
  notizen: string | null
}

/** Eine Vorlage, aufgelöst aus `valuable_images`. */
export interface ArtworkVorlage {
  id: string
  pfad: string
  art: 'foto' | 'artwork'
}

/**
 * Fehler mit HTTP-Status. Der Aufrufer entscheidet, was er damit macht: die Route gibt ihn
 * als Antwort zurück, die Athena-Aktion lässt ihn als Werkzeugfehler durchschlagen.
 */
export class ArtworkFehler extends Error {
  constructor(
    message: string,
    readonly status: number = 500,
  ) {
    super(message)
    this.name = 'ArtworkFehler'
  }
}

/** Text, den beide Aufrufer zeigen, wenn kein Schlüssel hinterlegt ist. */
export const OHNE_SCHLUESSEL =
  'Bildgenerierung ist nicht eingerichtet. Trage OPENAI_API_KEY in .env.local ein ' +
  '(und in Vercel unter Environment Variables), dann funktioniert es. Bis dahin: Foto hochladen.'

export function artworkVerfuegbar(): boolean {
  return !!process.env.OPENAI_API_KEY
}

/**
 * Baut die Beschreibung des Gegenstands aus allem, was in der Zeile steht.
 *
 * Bewusst nicht alle Felder: Kaufpreis, Lagerort oder Versicherungsnummer sagen nichts
 * darüber, wie das Stück aussieht, und verdünnen den Prompt nur. Drin ist, was sich in
 * Optik übersetzt — Marke, Modell, Referenznummer, Zustand und die Notizen, in denen
 * erfahrungsgemäß Farbe und Material stehen.
 */
export function beschreibung(item: ArtworkItem): string {
  const teile: string[] = [`A ${kategorieEn(item.kategorie)}`]

  const bezeichnung = [item.marke, item.modell].filter(Boolean).join(' ') || item.name
  teile.push(`: ${bezeichnung}`)
  // Referenznummern sind bei Uhren die genaueste Angabe überhaupt — bekannte Referenzen
  // kennt das Modell oft besser als den Modellnamen.
  if (item.referenz) teile.push(` (reference ${item.referenz})`)

  const zustand = zustandEn(item.zustand)
  if (zustand) teile.push(`, ${zustand}`)

  teile.push('.')

  if (item.notizen) {
    const notiz = item.notizen.replace(/\s+/g, ' ').trim().slice(0, NOTIZ_MAX)
    if (notiz) teile.push(` Additional detail: ${notiz}.`)
  }

  return teile.join('')
}

/**
 * Setzt den vollständigen Prompt zusammen.
 *
 * Reihenfolge ist Absicht: was gezeichnet wird, dann wie die Vorlage zu behandeln ist, dann
 * der Stil — und der Änderungswunsch ganz zuletzt. Bildmodelle gewichten den Schluss stark,
 * und der Wunsch ist das Einzige, was diese Runde von der vorigen unterscheidet.
 */
export function baueArtworkPrompt(
  item: ArtworkItem,
  vorlagen: ArtworkVorlage[],
  hinweis?: string | null,
): string {
  const teile: string[] = []

  if (vorlagen.length > 0) {
    // MIT Vorlage steht der Auftrag „male dieses Bild um" ganz vorn und die Beschreibung nur
    // als Kontext dahinter. Andersherum liest das Modell die Beschreibung als Malauftrag und
    // baut das Bild neu auf, statt das vorhandene umzumalen.
    //
    // Ist auch nur ein Foto dabei, gilt die Foto-Regel: ein echtes Foto ist immer die
    // bessere Quelle für Form und Farbe als eine Zeichnung, die selbst schon interpretiert.
    teile.push(vorlagen.some((v) => v.art === 'foto') ? AUS_FOTO : AUS_ARTWORK)
    teile.push(STIL)
    teile.push(`For context, the object shown is: ${beschreibung(item)}`)
  } else {
    // Ohne Vorlage gibt es keine Komposition zu erhalten — also wird eine gesetzt.
    teile.push(beschreibung(item))
    teile.push(TAFEL)
    teile.push(STIL)
  }

  // Nach den Wegen und nicht in ihnen: gilt fuer alle drei gleich, und so steht es spaet im
  // Prompt — direkt vor dem Wunsch, den es ueberleben soll.
  teile.push(RANDLOS)

  const wunsch = kurz(hinweis, HINWEIS_MAX)
  if (wunsch) {
    teile.push(
      'MOST IMPORTANT — requested change for this revision, it overrides the style notes ' +
        'above wherever the two disagree, with one exception: the full-bleed rule stays, ' +
        `the picture always fills the whole canvas. The change: ${wunsch}`,
    )
  }

  return teile.join(' ')
}

/** Whitespace normalisieren und kappen — `null`, wenn nichts übrig bleibt. */
function kurz(text: string | null | undefined, max: number): string | null {
  const sauber = (text ?? '').replace(/\s+/g, ' ').trim().slice(0, max)
  return sauber || null
}

export interface ArtworkAuftrag {
  valuableId: string
  /** Bild-IDs aus `valuable_images`, die als Vorlage dienen. Leer = frei nach Beschreibung. */
  basisBildIds?: string[]
  /** Änderungswunsch für diese Runde („dunklerer Hintergrund", „mehr Patina"). */
  hinweis?: string | null
  /** `high` kostet spürbar mehr. Ohne Angabe entscheidet die API (`auto`). */
  qualitaet?: 'auto' | 'high'
}

export interface ArtworkErgebnis {
  bildId: string
  pfad: string
  prompt: string
  hinweis: string | null
  /** Woraus gezeichnet wurde — die Rückmeldung, ohne die man das Ergebnis nicht einordnen kann. */
  basis: 'foto' | 'artwork' | 'text'
  vorlagen: number
}

/**
 * Erzeugt ein Artwork und legt es als eigene Zeile in `valuable_images` ab.
 *
 * Vorlagen werden nie überschrieben und altes Artwork nicht gelöscht: man will Varianten
 * vergleichen können. Aufräumen geht über die Galerie im Detail-Panel.
 *
 * Wirft `ArtworkFehler` — der Aufrufer übersetzt in Antwort oder Werkzeugfehler.
 */
export async function erzeugeArtwork(
  supabase: DB,
  userId: string,
  auftrag: ArtworkAuftrag,
): Promise<ArtworkErgebnis> {
  const apiKey = process.env.OPENAI_API_KEY
  if (!apiKey) throw new ArtworkFehler(OHNE_SCHLUESSEL, 501)

  const { data: row, error: readErr } = await supabase
    .from('valuables')
    .select('id, name, kategorie, marke, modell, referenz, zustand, notizen')
    .eq('id', auftrag.valuableId)
    .eq('user_id', userId)
    .maybeSingle()

  if (readErr) throw new ArtworkFehler(readErr.message)
  if (!row) throw new ArtworkFehler('Gegenstand nicht gefunden', 404)
  const item = row as ArtworkItem

  const vorlagen = await ladeVorlagen(supabase, userId, item.id, auftrag.basisBildIds ?? [])
  const hinweis = kurz(auftrag.hinweis, HINWEIS_MAX)
  const prompt = baueArtworkPrompt(item, vorlagen, hinweis)

  const bytes = await rendern(supabase, apiKey, prompt, vorlagen, auftrag.qualitaet)

  // Pfad mit User-Präfix — genau darauf prüfen die Storage-Policies. Endung und
  // Content-Type folgen OUTPUT_FORMAT, sonst liegt ein WebP unter `.png` im Bucket und der
  // Browser bekommt einen falschen Typ gemeldet.
  const pfad = `${userId}/${item.id}-art-${Date.now()}.${OUTPUT_FORMAT}`
  const { error: upErr } = await supabase.storage
    .from('valuables')
    .upload(pfad, bytes, { contentType: `image/${OUTPUT_FORMAT}`, upsert: false })
  if (upErr) throw new ArtworkFehler(upErr.message)

  // Frisches Artwork wird gleich Hauptbild — es ist der Grund, warum man das ausgeloest hat.
  // Erst alle zuruecksetzen, dann setzen: andersherum gaebe es fuer einen Moment zwei
  // Hauptbilder und der partielle Unique-Index schlaegt zu.
  await supabase
    .from('valuable_images')
    .update({ ist_hauptbild: false } as never)
    .eq('valuable_id', item.id)
    .eq('user_id', userId)

  const { data: neu, error: insErr } = await supabase
    .from('valuable_images')
    .insert({
      valuable_id: item.id,
      user_id: userId,
      pfad,
      art: 'artwork',
      ist_hauptbild: true,
      prompt,
      hinweis,
      // Bei mehreren Vorlagen die erste: die Kette soll zeigen, worauf aufgebaut wurde,
      // und dafür ist die Hauptvorlage die interessante.
      basis_bild_id: vorlagen[0]?.id ?? null,
    } as never)
    .select('id')
    .single()

  if (insErr) {
    await supabase.storage.from('valuables').remove([pfad])
    throw new ArtworkFehler(insErr.message)
  }

  return {
    bildId: (neu as { id: string }).id,
    pfad,
    prompt,
    hinweis,
    basis:
      vorlagen.length === 0 ? 'text' : vorlagen.some((v) => v.art === 'foto') ? 'foto' : 'artwork',
    vorlagen: vorlagen.length,
  }
}

/**
 * Löst Bild-IDs zu Vorlagen auf. Die Zugehörigkeit wird mitgeprüft: eine fremde Bild-ID
 * darf nicht die Vorlage für das eigene Objekt werden.
 *
 * Reihenfolge folgt der übergebenen Liste und nicht der DB — bei mehreren Referenzbildern
 * ist die erste die wichtigste, und die bestimmt der Aufrufer.
 */
async function ladeVorlagen(
  supabase: DB,
  userId: string,
  valuableId: string,
  ids: string[],
): Promise<ArtworkVorlage[]> {
  const gewuenscht = [...new Set(ids)].slice(0, MAX_VORLAGEN)
  if (gewuenscht.length === 0) return []

  const { data } = await supabase
    .from('valuable_images')
    .select('id, pfad, art')
    .in('id', gewuenscht)
    .eq('valuable_id', valuableId)
    .eq('user_id', userId)

  const gefunden = new Map(
    ((data ?? []) as { id: string; pfad: string; art: string }[]).map((b) => [
      b.id,
      {
        id: b.id,
        pfad: b.pfad,
        art: b.art === 'artwork' ? ('artwork' as const) : ('foto' as const),
      },
    ]),
  )

  const fehlend = gewuenscht.filter((id) => !gefunden.has(id))
  if (fehlend.length > 0) {
    throw new ArtworkFehler(`Vorlagenbild nicht gefunden: ${fehlend.join(', ')}`, 400)
  }

  return gewuenscht.map((id) => gefunden.get(id)!)
}

/** Ruft OpenAI auf und gibt die rohen PNG-Bytes zurück. */
async function rendern(
  supabase: DB,
  apiKey: string,
  prompt: string,
  vorlagen: ArtworkVorlage[],
  qualitaet: 'auto' | 'high' | undefined,
): Promise<Buffer> {
  let res: Response
  try {
    res =
      vorlagen.length > 0
        ? await bearbeiten(supabase, apiKey, prompt, vorlagen, qualitaet)
        : await erzeugen(apiKey, prompt, qualitaet)
  } catch (err) {
    if (err instanceof ArtworkFehler) throw err
    throw new ArtworkFehler(err instanceof Error ? err.message : 'Bilddienst nicht erreichbar', 502)
  }

  if (!res.ok) {
    const detail = await res.text()
    // Die Rohantwort mitgeben, aber gekürzt: bei einem falschen Key steht die Ursache
    // wörtlich drin, und ein reines „500" schickt einen auf die Suche.
    throw new ArtworkFehler(`Bilddienst antwortete ${res.status}: ${detail.slice(0, 300)}`, 502)
  }

  const data = (await res.json()) as { data?: { b64_json?: string; url?: string }[] }
  let b64 = data.data?.[0]?.b64_json
  if (!b64) {
    const url = data.data?.[0]?.url
    if (!url) throw new ArtworkFehler('Bilddienst lieferte kein Bild', 502)
    const bild = await fetch(url)
    b64 = Buffer.from(await bild.arrayBuffer()).toString('base64')
  }
  return Buffer.from(b64, 'base64')
}

async function erzeugen(apiKey: string, prompt: string, qualitaet: 'auto' | 'high' | undefined) {
  const senden = (mitExtras: boolean) =>
    fetch('https://api.openai.com/v1/images/generations', {
      method: 'POST',
      headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: MODEL,
        prompt,
        size: SIZE,
        n: 1,
        ...(mitExtras
          ? { output_format: OUTPUT_FORMAT, output_compression: OUTPUT_COMPRESSION }
          : {}),
        ...(qualitaet === 'high' ? { quality: 'high' } : {}),
      }),
    })

  const res = await senden(true)
  // Nur bei 400 und nur einmal: alles andere ist ein echter Fehler und soll durchschlagen.
  if (res.status === 400) {
    const text = await res.clone().text()
    if (meckertUeberOptionales(text)) return senden(false)
  }
  return res
}

async function bearbeiten(
  supabase: DB,
  apiKey: string,
  prompt: string,
  vorlagen: ArtworkVorlage[],
  qualitaet: 'auto' | 'high' | undefined,
) {
  // Vorlagen aus dem privaten Bucket holen. `download` läuft über denselben Client und
  // damit unter der RLS des Nutzers — ein fremder Pfad käme hier gar nicht erst an.
  const dateien: Blob[] = []
  for (const v of vorlagen) {
    const { data, error } = await supabase.storage.from('valuables').download(v.pfad)
    if (error || !data) {
      throw new ArtworkFehler(
        `Vorlage konnte nicht geladen werden: ${error?.message ?? 'unbekannt'}`,
      )
    }
    dateien.push(data)
  }

  // /v1/images/edits erwartet multipart/form-data, nicht JSON. Ein FormData-Objekt lässt
  // sich nicht zuverlässig zweimal senden, deshalb wird es pro Versuch neu gebaut.
  const bauen = (mitExtras: boolean) => {
    const fd = new FormData()
    fd.set('model', MODEL)
    fd.set('prompt', prompt)
    // Immer quadratisch, auch mit Vorlage.
    //
    // Kurzzeitig stand hier 'auto', damit ein Hochformat-Foto sein Format behält. Das ist
    // für die Vitrine aber falsch: gemischte Seitenverhältnisse lassen das Raster unruhig
    // wirken, und ein Hochformat-Artwork sitzt in einer quadratischen Kachel mit Rändern
    // oben und unten. Einheitliches Format schlägt originalgetreue Proportion — dass die
    // Bildidee trotzdem erhalten bleibt, regelt QUADRAT im Prompt.
    fd.set('size', SIZE)
    fd.set('n', '1')
    if (mitExtras) {
      fd.set('output_format', OUTPUT_FORMAT)
      fd.set('output_compression', String(OUTPUT_COMPRESSION))
    }
    if (qualitaet === 'high') fd.set('quality', 'high')
    // Bei mehreren Vorlagen erwartet die API den wiederholten Feldnamen `image[]`.
    // Dateiname passend zum Inhalt: Uploads liegen als JPEG im Bucket, hiessen hier aber
    // pauschal `.png`. Ein Empfaenger, der die Endung ernst nimmt, bekommt damit
    // widerspruechliche Angaben.
    const nenn = (d: Blob, i: number) =>
      `vorlage-${i}.${(d.type || 'image/png').includes('jpeg') ? 'jpg' : (d.type || '').includes('webp') ? 'webp' : 'png'}`
    if (dateien.length === 1) fd.set('image', dateien[0], nenn(dateien[0], 0))
    else dateien.forEach((d, i) => fd.append('image[]', d, nenn(d, i)))
    // Hält Form und Farbe der Vorlage deutlich strenger als die Voreinstellung — genau das,
    // was „mein Stück, nicht das Katalogbild" bedeutet.
    if (mitExtras) fd.set('input_fidelity', 'high')
    return fd
  }

  const senden = (fd: FormData) =>
    fetch('https://api.openai.com/v1/images/edits', {
      method: 'POST',
      headers: { Authorization: `Bearer ${apiKey}` },
      body: fd,
    })

  const res = await senden(bauen(true))
  // Nur bei 400 und nur einmal: alles andere ist ein echter Fehler.
  if (res.status === 400) {
    const text = await res.clone().text()
    if (meckertUeberOptionales(text)) return senden(bauen(false))
  }
  return res
}
