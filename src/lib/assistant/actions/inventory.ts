import { z } from 'zod'
import {
  erzeugeArtwork,
  artworkVerfuegbar,
  HINWEIS_MAX,
  MAX_VORLAGEN,
  OHNE_SCHLUESSEL,
} from '@/lib/inventar/artwork'
import { type ActionContext, type ActionDetail, defineAction, type ActionDefinition } from '@/lib/assistant/actions/types'

/**
 * Name eines Inventarstuecks fuer die Bestaetigungskarte. Faellt auf die rohe ID zurueck,
 * statt zu werfen: die Karte ist die Darstellung des Vorschlags, nicht der Vorschlag selbst.
 */
async function valuableName(id: string, ctx: ActionContext): Promise<string> {
  const { data } = await ctx.supabase
    .from('valuables')
    .select('name, marke, modell')
    .eq('id', id)
    .eq('user_id', ctx.userId)
    .maybeSingle()
  if (!data) return id
  const row = data as { name: string; marke: string | null; modell: string | null }
  const bezeichnung = [row.marke, row.modell].filter(Boolean).join(' ')
  return bezeichnung && bezeichnung !== row.name ? `${row.name} (${bezeichnung})` : row.name
}

export const inventoryActions = {
  // ── Inventar: Artwork ──────────────────────────────────────────────────────
  //
  // Die einzige Aktion, die Geld nach draußen ausgibt (ein Bildlauf bei OpenAI) und die
  // einzige, die 15–60 s braucht. Beides ist ein Grund mehr, sie wie jede andere Schreib-
  // aktion hinter die Bestätigung zu stellen statt sie sofort auszuführen.
  generateValuableArtwork: defineAction({
    label: 'Artwork erzeugen',
    description:
      'Zeichnet eine Illustration für einen Gegenstand aus dem Inventar und legt sie dort als ' +
      'zusätzliches Bild ab — vorhandene Fotos und älteres Artwork bleiben unangetastet, das ' +
      'neue Bild wird das angezeigte Hauptbild. Vorher getValuables aufrufen, um die id zu ' +
      'bekommen, und getValuableImages, um zu sehen, welche Vorlagen es gibt und mit welchem ' +
      'Prompt die letzte Runde lief. ' +
      'basisBildIds: bis zu vier Bilder DIESES Gegenstands als Vorlage. Fotos ⇒ das Ergebnis ' +
      'zeigt sein echtes Stück statt einer Katalogversion aus dem Modellgedächtnis; mehrere ' +
      'Fotos (Vorder-, Rückseite, Detail) ergeben ein Objekt, das rundum stimmt. Ein früheres ' +
      'Artwork als einzige Vorlage ⇒ Verfeinerungsrunde: das Bild bleibt, wie es war, und ' +
      'ändert sich nur dort, wo der hinweis es verlangt. Leer ⇒ frei nach der Beschreibung. ' +
      'hinweis: der eine Satz, der diese Runde von der letzten unterscheidet („dunklerer ' +
      'Hintergrund", „mehr Patina am Gehäuse", „Zifferblatt frontaler"). Deutsch oder ' +
      'Englisch, beides geht. ' +
      'Schlage IMMER nur eine Runde auf einmal vor und warte das Ergebnis ab, bevor du die ' +
      'nächste vorschlägst — jede kostet Geld, und ohne das fertige Bild weißt du nicht, was ' +
      'überhaupt noch zu ändern ist.',
    schema: z.object({
      valuableId: z.string().uuid(),
      basisBildIds: z.array(z.string().uuid()).max(MAX_VORLAGEN).default([]),
      hinweis: z.string().max(HINWEIS_MAX).nullish(),
      qualitaet: z
        .enum(['auto', 'high'])
        .default('auto')
        .describe('high kostet ein Vielfaches — nur wenn Eric ausdrücklich mehr Qualität will'),
    }),
    validate: async (input, ctx) => {
      if (!artworkVerfuegbar()) return OHNE_SCHLUESSEL

      const { data: item } = await ctx.supabase
        .from('valuables')
        .select('id')
        .eq('id', input.valuableId)
        .eq('user_id', ctx.userId)
        .maybeSingle()
      if (!item) return 'Gegenstand nicht gefunden'

      if (input.basisBildIds.length === 0) return null
      // Die Zugehörigkeit hier schon prüfen und nicht erst beim Ausführen: sonst steht die
      // Karte bei Eric und scheitert beim Klick an einer Bild-ID, die das Modell geraten hat.
      const { data: bilder } = await ctx.supabase
        .from('valuable_images')
        .select('id')
        .in('id', input.basisBildIds)
        .eq('valuable_id', input.valuableId)
        .eq('user_id', ctx.userId)
      const gefunden = new Set((bilder ?? []).map((b) => b.id))
      const fehlend = input.basisBildIds.filter((id) => !gefunden.has(id))
      if (fehlend.length > 0) {
        return `Diese Bilder gehören nicht zu dem Gegenstand: ${fehlend.join(', ')}`
      }
      return null
    },
    summarize: async (input, ctx) => {
      const name = await valuableName(input.valuableId, ctx)
      const woraus =
        input.basisBildIds.length === 0
          ? 'frei nach der Beschreibung'
          : `nach ${input.basisBildIds.length} ${input.basisBildIds.length === 1 ? 'Vorlage' : 'Vorlagen'}`
      return `Artwork für „${name}" zeichnen — ${woraus}`
    },
    details: async (input, ctx) => {
      const rows: ActionDetail[] = [
        { label: 'Gegenstand', value: await valuableName(input.valuableId, ctx) },
      ]

      if (input.basisBildIds.length === 0) {
        rows.push({
          label: 'Vorlage',
          value: 'keine',
          hint: 'wird allein aus Marke, Modell, Referenz, Zustand und Notizen gezeichnet',
        })
      } else {
        const { data } = await ctx.supabase
          .from('valuable_images')
          .select('id, art, created_at')
          .in('id', input.basisBildIds)
          .eq('user_id', ctx.userId)
        const bilder = (data ?? []) as { id: string; art: string; created_at: string }[]
        const fotos = bilder.filter((b) => b.art === 'foto').length
        const artworks = bilder.length - fotos
        rows.push({
          label: 'Vorlage',
          value: [fotos && `${fotos} Foto${fotos === 1 ? '' : 's'}`, artworks && `${artworks}× Artwork`]
            .filter(Boolean)
            .join(' + '),
          hint:
            artworks > 0 && fotos === 0
              ? 'Verfeinerungsrunde — das bestehende Bild bleibt, nur der Wunsch unten wird umgesetzt'
              : 'das Ergebnis zeigt dein Stück, nicht die Katalogversion',
        })
      }

      if (input.hinweis?.trim()) {
        rows.push({ label: 'Änderungswunsch', value: input.hinweis.trim() })
      }
      if (input.qualitaet === 'high') {
        rows.push({ label: 'Qualität', value: 'hoch', hint: 'kostet ein Vielfaches des Standards' })
      }

      rows.push({
        label: 'Kosten & Dauer',
        value: '1 Bildlauf',
        hint: 'geht an OpenAI und dauert meist 15–60 Sekunden',
      })
      return rows
    },
    execute: async (input, ctx) => {
      // Wirft ArtworkFehler; confirmPendingAction fängt das, setzt den Vorschlag auf
      // `failed` und zeigt die Meldung auf der Karte.
      const ergebnis = await erzeugeArtwork(ctx.supabase, ctx.userId, {
        valuableId: input.valuableId,
        basisBildIds: input.basisBildIds,
        hinweis: input.hinweis,
        qualitaet: input.qualitaet,
      })
      // `bildId` ist der Haken, an dem die Karte im Chat das fertige Bild nachlädt (siehe
      // PendingActionCard) — der Bucket ist privat, eine fertige URL wäre nach einer Stunde
      // tot und im gespeicherten Ergebnis für immer kaputt.
      //
      // Der volle Prompt bleibt hier bewusst draußen: er steht schon an der Bildzeile
      // (valuable_images.prompt), und diese Rückgabe landet in ai_pending_actions.result
      // UND im Log — zweimal 1.200 Zeichen für dieselbe Zeichenkette.
      return {
        bildId: ergebnis.bildId,
        valuableId: input.valuableId,
        basis: ergebnis.basis,
        vorlagen: ergebnis.vorlagen,
        hinweis: ergebnis.hinweis,
      }
    },
  }),
} satisfies Record<string, ActionDefinition<z.ZodType>>
