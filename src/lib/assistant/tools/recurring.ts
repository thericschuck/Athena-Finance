import { tool } from 'ai'
import { z } from 'zod'
import { erkenneWiederkehrend, type WiederkehrBuchung } from '@/lib/finance/wiederkehrend'
import { untrust, type DB } from '@/lib/assistant/tools/shared'

export function buildRecurringTools(supabase: DB, userId: string) {
  return {
    // ── Wiederkehrende Zahlungen erkennen ────────────────────────────────────
    findRecurringPayments: tool({
      description:
        'Findet wiederkehrende Zahlungen in den Buchungen, für die noch kein Vertrag existiert: ' +
        'gleicher Empfänger, stabiler Betrag, regelmäßiger Abstand. Liefert je Kandidat Betrag, ' +
        'Frequenz, den tatsächlichen Abbuchungstag, die Jahreskosten und eine Begründung — sowie ' +
        '`hat_vertrag`, wenn ein aktiver Vertrag schon dazu passt. ' +
        'Benutze das für "was zahle ich alles regelmäßig", "was kann ich kündigen" und um von dir aus ' +
        'einen createContract-Vorschlag zu machen. Schlag NICHTS vor, was `hat_vertrag: true` trägt.',
      inputSchema: z.object({
        months: z.number().int().min(6).max(36).default(18)
          .describe('Wie weit zurück gesucht wird. 18 Monate, damit auch jährliche Zahlungen zweimal vorkommen.'),
        nurOffene: z.boolean().default(true)
          .describe('true = nur Kandidaten ohne passenden Vertrag'),
      }),
      execute: async ({ months, nurOffene }) => {
        const seit = new Date()
        seit.setMonth(seit.getMonth() - months)
        const seitIso = seit.toISOString().slice(0, 10)

        // Seitenweise: eine Erkennung auf abgeschnittenen Daten findet
        // Serien nicht oder haelt sie faelschlich fuer beendet. Der
        // 1.000-Zeilen-Deckel von PostgREST wuerde hier still zuschlagen.
        const SEITE = 1000
        const roh: WiederkehrBuchung[] = []
        for (let seite = 0; seite < 50; seite++) {
          const { data, error } = await supabase
            .from('unified_transactions')
            .select('id, date, signed_amount, description, merchant, account_id, category_id')
            .eq('user_id', userId)
            .gte('date', seitIso)
            .order('date', { ascending: true })
            .order('id', { ascending: true })
            .range(seite * SEITE, seite * SEITE + SEITE - 1)
          if (error) return { error: error.message }
          if (!data || data.length === 0) break
          for (const r of data) {
            if (r.date === null || r.signed_amount === null) continue
            roh.push({
              id: r.id,
              datum: r.date,
              betrag: Number(r.signed_amount),
              beschreibung: r.description,
              merchant: r.merchant,
              konto_id: r.account_id,
              kategorie_id: r.category_id,
            })
          }
          if (data.length < SEITE) break
        }

        const { data: vertraege } = await supabase
          .from('contracts')
          .select('name, amount, is_active')
          .eq('user_id', userId)

        const alle = erkenneWiederkehrend(
          roh,
          (vertraege ?? []).map(v => ({
            name: v.name,
            betrag: Number(v.amount),
            aktiv: v.is_active !== false,
          })),
        )
        const gezeigt = nurOffene ? alle.filter(k => !k.hat_vertrag) : alle

        return {
          zeitraum: { von: seitIso, monate: months },
          gefunden: alle.length,
          davon_ohne_vertrag: alle.filter(k => !k.hat_vertrag).length,
          // `bezeichnung` ist der Verwendungszweck der Bank -- Fremdtext.
          kandidaten: gezeigt.slice(0, 40).map(k => untrust(k, ['bezeichnung'])),
          hinweis_zur_deutung:
            'Das sind Beobachtungen aus den Buchungen, keine Verträge. Bevor du createContract ' +
            'vorschlägst: `hat_vertrag` prüfen (dann NICHT vorschlagen) und `laeuft_noch` — eine ' +
            'beendete Serie gehört nicht als laufender Vertrag angelegt. ' +
            'WICHTIG für das startDate: setz es auf einen Tag, dessen Tag-im-Monat `tag_im_monat` ' +
            'entspricht. Das Vertragsmodell kennt in createContract kein eigenes Abbuchungsdatum, ' +
            'und ohne billing_day rechnet die Fälligkeit mit dem Tag des Startdatums — steht dort ' +
            'der falsche Tag, sagt der Verpflichtungs-Kalender später Termine voraus, an denen ' +
            'nichts passiert.',
        }
      },
    }),

  }
}
