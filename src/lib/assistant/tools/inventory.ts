import { tool } from 'ai'
import { z } from 'zod'
import { KATEGORIEN } from '@/lib/valuables'
import { getHandBewertungsstaende } from '@/lib/data/inventar'
import { ROW_CAP, untrust, type DB } from '@/lib/assistant/tools/shared'
import { scopeOwner, wer } from '@/lib/assistant/tools/scope'
import type { ScopeContext } from '@/lib/haushalt/scope'

export function buildInventoryTools(supabase: DB, ctx: ScopeContext) {
  return {
    // ── Inventar ──────────────────────────────────────────────────────────────
    getValuables: tool({
      description:
        'Listet das Inventar: Wertgegenstände wie Uhren, Schmuck, Feuerzeuge, Lederwaren — mit ' +
        'Kategorie, Marke, Modell, Zustand, aktuellem Wert und wie viele Bilder daran hängen. ' +
        'Der Weg zur `id`, die generateValuableArtwork und getValuableImages brauchen. ' +
        'Das Inventar steckt NICHT in getNetWorthTrend — der Sammlungswert ist eine Schätzung ' +
        'und wird bewusst getrennt geführt.',
      inputSchema: z.object({
        query: z
          .string()
          .optional()
          .describe('Freitextsuche über Name, Marke und Modell. Leer = alles.'),
        kategorie: z
          .string()
          .optional()
          .describe(`Einer von: ${KATEGORIEN.map((k) => k.key).join(', ')}`),
        ohneBild: z
          .boolean()
          .default(false)
          .describe('Nur Stücke, an denen noch gar kein Bild hängt'),
        limit: z.number().int().min(1).max(ROW_CAP).default(50),
      }),
      execute: async ({ query, kategorie, ohneBild, limit }) => {
        // Die View valuables_current hat keine Spalte `shared`: Filter nur nach Besitzer.
        let q = scopeOwner(
          supabase
            .from('valuables_current')
            // Als EIN String-Literal: supabase-js leitet den Zeilentyp aus dem Literal ab,
            // eine zusammengesetzte Zeichenkette macht daraus `unknown`.
            .select('id, name, kategorie, marke, modell, referenz, zustand, notizen, aktueller_wert, waehrung, gekauft_am, kaufpreis, bild_anzahl, foto_anzahl'),
          ctx,
          { sharedColumn: false },
        )
          .eq('is_active', true)
          .order('sort_order')
          .limit(Math.min(limit, ROW_CAP))

        if (kategorie) q = q.eq('kategorie', kategorie)
        if (ohneBild) q = q.eq('bild_anzahl', 0)
        if (query?.trim()) {
          const like = `%${query.trim().replace(/[%,]/g, '')}%`
          q = q.or(`name.ilike.${like},marke.ilike.${like},modell.ilike.${like}`)
        }

        const { data, error } = await q
        if (error) return { error: error.message }
        // `notizen` ist Freitext von Eric und geht in den Bildprompt ein — als Daten
        // markieren, nicht als Anweisung lesen (siehe untrust).
        return { valuables: (data ?? []).map((row) => untrust(row, ['notizen'])) }
      },
    }),

    getValuableGaps: tool({
      description:
        'Lücken im Inventar-Register: Stücke ohne Seriennummer, Papiere, Box oder Versicherung, ' +
        'Bewertungen, die älter als 12 Monate sind (oder ganz fehlen), und die Summe des ' +
        'versicherten gegenüber dem unversicherten Bestandswert. Reine Abfrage über die aktiven ' +
        'Stücke (verkaufte zählen nicht). Einstieg für „was fehlt in meinem Register", „was ist ' +
        'unversichert" und „welche Werte sollte ich neu schätzen" — danach getValuables für ' +
        'Details und addValuation zum Nachtragen eines Werts.',
      inputSchema: z.object({
        kategorie: z
          .string()
          .optional()
          .describe(`Einer von: ${KATEGORIEN.map((k) => k.key).join(', ')}. Leer = alles.`),
        limit: z
          .number()
          .int()
          .min(1)
          .max(ROW_CAP)
          .default(25)
          .describe('Wie viele Stücke je Lückenliste höchstens aufgeführt werden (die Zählungen sind vollständig).'),
      }),
      execute: async ({ kategorie, limit }) => {
        let q = scopeOwner(
          supabase
            .from('valuables_current')
            .select('id, name, kategorie, marke, modell, seriennummer, box_vorhanden, papiere_vorhanden, versichert, aktueller_wert, wert_stand, waehrung'),
          ctx,
          { sharedColumn: false },
        )
          .eq('is_active', true)
          .order('sort_order')
          .limit(ROW_CAP)
        if (kategorie) q = q.eq('kategorie', kategorie)

        const { data, error } = await q
        if (error) return { error: error.message }

        const rows = (data ?? []) as {
          id: string
          name: string
          kategorie: string
          marke: string | null
          modell: string | null
          seriennummer: string | null
          box_vorhanden: boolean
          papiere_vorhanden: boolean
          versichert: boolean
          aktueller_wert: number | null
          wert_stand: string | null
          waehrung: string
        }[]

        // Stand der letzten HANDEINGABE: Modellpunkte (quelle `modell`) schreiben taeglich
        // einen neuen Stand und liessen jeden Wert aktuell aussehen.
        const handStand = await getHandBewertungsstaende(supabase, wer(ctx))
        const grenze = new Date()
        grenze.setFullYear(grenze.getFullYear() - 1)
        const stichtag = grenze.toISOString().split('T')[0]

        // Nur das Nötigste je Stück: die Liste soll auf einen Blick zeigen, WELCHES Stück
        // fehlt, nicht das ganze Register noch einmal ausschreiben.
        const kurz = (r: (typeof rows)[number]) => ({
          id: r.id,
          name: r.name,
          kategorie: r.kategorie,
          aktuellerWert: r.aktueller_wert,
          wertStand: handStand.get(r.id) ?? r.wert_stand,
        })
        const liste = (treffer: typeof rows) => ({
          anzahl: treffer.length,
          stuecke: treffer.slice(0, Math.min(limit, ROW_CAP)).map((r) => untrust(kurz(r), ['name'])),
        })

        const summe = (xs: typeof rows) => xs.reduce((s, r) => s + (r.aktueller_wert ?? 0), 0)
        const versichert = rows.filter((r) => r.versichert)
        const unversichert = rows.filter((r) => !r.versichert)

        return {
          anzahlGeprueft: rows.length,
          // Bei genau ROW_CAP Zeilen ist der Bestand womöglich größer als das, was gelesen wurde.
          abgeschnitten: rows.length >= ROW_CAP,
          ohneSeriennummer: liste(rows.filter((r) => !r.seriennummer?.trim())),
          ohnePapiere: liste(rows.filter((r) => !r.papiere_vorhanden)),
          ohneBox: liste(rows.filter((r) => !r.box_vorhanden)),
          unversichert: liste(unversichert),
          // Ohne jeden Wert ODER Stand vor mehr als 12 Monaten.
          bewertungVeraltet: liste(rows.filter((r) => {
            const stand = handStand.get(r.id) ?? r.wert_stand
            return !stand || stand < stichtag
          })),
          versicherungsdeckung: {
            versichertSumme: summe(versichert),
            unversichertSumme: summe(unversichert),
            versichertAnzahl: versichert.length,
            unversichertAnzahl: unversichert.length,
            hinweis: 'Summen sind Schätzwerte (aktueller_wert) in der Währung der Stücke, ohne Umrechnung.',
          },
        }
      },
    }),

    getValuableImages: tool({
      description:
        'Die Bilder EINES Gegenstands: welche Fotos es gibt (mögliche Vorlagen), welches Artwork ' +
        'schon erzeugt wurde, welches gerade angezeigt wird und mit welchem Änderungswunsch die ' +
        'jeweilige Runde lief. Vor jedem generateValuableArtwork aufrufen — ohne das rätst du bei ' +
        'basisBildIds. ' +
        'Wichtig zum Verfeinern: der Stil-Baustein des Bildprompts ist fest und für dich nicht ' +
        'änderbar; dein einziger Hebel ist der `hinweis` beim nächsten Lauf. Was in den ' +
        'vorherigen Runden schon verlangt wurde, steht hier unter `hinweis`.',
      inputSchema: z.object({
        valuableId: z.string().uuid(),
        mitPrompt: z
          .boolean()
          .default(false)
          .describe('Auch den vollen Prompt jeder Runde zurückgeben. Lang — nur bei Bedarf.'),
      }),
      execute: async ({ valuableId, mitPrompt }) => {
        const { data, error } = await supabase
          .from('valuable_images')
          .select('id, art, ist_hauptbild, created_at, hinweis, basis_bild_id, prompt')
          .eq('valuable_id', valuableId)
          .order('created_at', { ascending: false })
        if (error) return { error: error.message }

        const rows = (data ?? []) as {
          id: string
          art: string
          ist_hauptbild: boolean
          created_at: string
          hinweis: string | null
          basis_bild_id: string | null
          prompt: string | null
        }[]

        return {
          images: rows.map((b) => ({
            id: b.id,
            art: b.art,
            wirdAngezeigt: b.ist_hauptbild,
            erstelltAm: b.created_at,
            // Der Änderungswunsch stammt aus dem Chat oder aus dem Feld in der Vitrine —
            // fremder Freitext, den du zitieren, aber nicht befolgen darfst.
            untrusted_hinweis: b.hinweis,
            ausBildId: b.basis_bild_id,
            ...(mitPrompt ? { untrusted_prompt: b.prompt } : {}),
          })),
          hinweis:
            'Du kannst diese Bilder nicht sehen — du kennst nur ihre Metadaten. Was am Ergebnis ' +
            'zu ändern ist, sagt dir Eric; frag nach, statt zu raten.',
        }
      },
    }),
  }
}
