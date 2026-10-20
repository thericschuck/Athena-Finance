import { tool } from 'ai'
import { z } from 'zod'
import { alsTag, alsIso, tageDazu, faelligkeitenIm } from '@/lib/assistant/recurrence'
import { ROW_CAP, untrust, type DB } from '@/lib/assistant/tools/shared'

export function buildObligationTools(supabase: DB, userId: string) {
  return {
    // ── Verpflichtungs-Kalender ──────────────────────────────────────────────
    getObligationCalendar: tool({
      description:
        'Der Verpflichtungs-Kalender: welche Vertragsabbuchungen in den nächsten N Tagen fällig werden ' +
        '(mit Datum, Betrag und Konto), welche Kündigungsfristen in dem Fenster ablaufen, wie viel pro Monat ' +
        'zusammenkommt, und rückblickend: welche Fälligkeiten der letzten 90 Tage weder als Cron-Buchung ' +
        'noch als echte Bankbuchung auftauchen (also wirklich offen sind) und welche bezahlt wurden, aber an ' +
        'einem anderen Tag als im Vertrag steht. ' +
        'Dazu die Schulden mit Rate und letzter Tilgung. Die Fälligkeitsrechnung ist dieselbe wie im Cron, ' +
        'der die Buchungen anlegt — die Termine hier sind die, an denen wirklich abgebucht wird.',
      inputSchema: z.object({
        days: z.number().int().min(7).max(365).default(90)
          .describe('Länge des Vorausblicks in Tagen'),
      }),
      execute: async ({ days }) => {
        const heute = alsTag(new Date().toISOString().slice(0, 10))
        const bis   = tageDazu(heute, days)
        const vor90 = tageDazu(heute, -90)

        const [vertraegeRes, kontenRes, schuldenRes] = await Promise.all([
          supabase
            .from('contracts')
            .select('id, name, type, provider, frequency, amount, currency, billing_day, start_date, end_date, notice_days, auto_renews, account_id')
            .eq('user_id', userId)
            .eq('is_active', true),
          supabase.from('accounts').select('id, name').eq('user_id', userId),
          supabase
            .from('debts')
            .select('id, name, type, creditor, outstanding, monthly_payment, interest_rate, due_date')
            .eq('user_id', userId)
            .eq('is_active', true),
        ])
        if (vertraegeRes.error) return { error: vertraegeRes.error.message }
        if (schuldenRes.error) return { error: schuldenRes.error.message }

        const vertraege = vertraegeRes.data ?? []
        const kontoName = new Map((kontenRes.data ?? []).map(k => [k.id, k.name]))

        // Ausführungen, Tilgungen und die Buchungs-Kandidaten für den Rückblick
        // hängen alle nur an den IDs von oben — also ein Zug, drei Abfragen.
        const vertragIds = vertraege.map(v => v.id)
        const schuldIds  = (schuldenRes.data ?? []).map(d => d.id)
        const rueckblickVon = tageDazu(vor90, -7)
        const betraege = Array.from(new Set(vertraege.map(v => Number(v.amount))))
        const [ausfuehrungenRes, tilgungenRes, kandidatenRes] = await Promise.all([
          vertragIds.length > 0
            ? supabase
                .from('contract_executions')
                .select('contract_id, execution_date')
                .in('contract_id', vertragIds)
                .gte('execution_date', alsIso(vor90))
            : Promise.resolve({ data: [], error: null }),
          schuldIds.length > 0
            ? supabase
                .from('debt_payments')
                .select('debt_id, amount, payment_date')
                .in('debt_id', schuldIds)
                .order('payment_date', { ascending: false })
            : Promise.resolve({ data: [], error: null }),
          betraege.length > 0
            ? supabase
                .from('unified_transactions')
                .select('id, date, amount, account_id')
                .eq('user_id', userId)
                .gte('date', alsIso(rueckblickVon))
                .lte('date', alsIso(heute))
                .in('amount', betraege)
                .limit(ROW_CAP)
            : Promise.resolve({ data: [], error: null }),
        ])

        const gebucht = new Set(
          (ausfuehrungenRes.data ?? []).map(a => `${a.contract_id}|${a.execution_date}`),
        )

        // 1) Fälligkeiten im Vorausblick.
        type Termin = {
          datum: string
          name: string
          typ: string
          betrag: number
          waehrung: string | null
          konto: string | null
        }
        const termine: Termin[] = []
        for (const v of vertraege) {
          for (const datum of faelligkeitenIm(v, heute, bis)) {
            termine.push({
              datum,
              name:     v.name,
              typ:      v.type,
              betrag:   Number(v.amount),
              waehrung: v.currency,
              konto:    v.account_id ? kontoName.get(v.account_id) ?? null : null,
            })
          }
        }
        termine.sort((a, b) => a.datum.localeCompare(b.datum))
        // Deckel wie bei jedem zeilenbasierten Ergebnis — aber nicht stillschweigend:
        // `termine_gekuerzt` sagt, dass hinter dem Fenster noch etwas liegt.
        const termineGekuerzt = termine.length > ROW_CAP
        const termineGezeigt  = termine.slice(0, ROW_CAP)

        const summeJeMonat = new Map<string, number>()
        for (const t of termine) {
          const monat = t.datum.slice(0, 7)
          summeJeMonat.set(monat, Math.round(((summeJeMonat.get(monat) ?? 0) + t.betrag) * 100) / 100)
        }

        // 2) Kündigungsfristen. Ohne end_date gibt es keinen berechenbaren
        // letzten Kündigungstag — das steht dann als eigener Status da, statt
        // ein Datum zu erfinden.
        const fristen = vertraege
          .filter(v => (v.notice_days ?? 0) > 0 || v.end_date !== null)
          .map(v => {
            const frist = v.notice_days ?? 0
            if (!v.end_date) {
              return {
                name: v.name, typ: v.type, end_date: null, notice_days: frist,
                auto_renews: v.auto_renews, letzter_kuendigungstag: null,
                tage_bis: null, status: 'kein_enddatum' as const,
              }
            }
            const letzter = tageDazu(alsTag(v.end_date), -frist)
            const tageBis = Math.round((letzter.getTime() - heute.getTime()) / 86_400_000)
            const status =
              tageBis < 0      ? 'verstrichen' as const
              : letzter <= bis ? 'im_fenster'  as const
              :                  'spaeter'     as const
            return {
              name: v.name, typ: v.type, end_date: v.end_date, notice_days: frist,
              auto_renews: v.auto_renews, letzter_kuendigungstag: alsIso(letzter),
              tage_bis: tageBis, status,
            }
          })

        // 3) Was fällig war — und ob es wirklich bezahlt wurde.
        //
        // `contract_executions` allein reicht dafür NICHT, und zwar aus einem
        // Grund, der bei Eric direkt zuschlägt: bei Verträgen auf einem
        // bank-verknüpften Konto legt der Cron absichtlich keine Buchung an, weil
        // der Bank-Sync die echte Abbuchung schon importiert — sonst stünde jede
        // Rate doppelt in den Zahlen. Ein leerer Ausführungs-Eintrag ist dort
        // also der Normalfall und kein Ausfall.
        //
        // Jede offene Fälligkeit wird deshalb gegen die echten Buchungen
        // geprüft: gleicher Betrag, dasselbe Konto, und entweder derselbe
        // Kalendermonat oder höchstens sieben Tage Abstand. Der Monat muss mit
        // hinein, weil der erwartete Termin oft schlicht falsch ist — Erics
        // Coaching-Vertrag hat keinen `billing_day`, das Modell rechnet daher mit
        // dem Tag des Vertragsbeginns (23.), abgebucht wird aber um den 3./4.
        // Ein reines Tagesfenster würde vier bezahlte Raten als "fehlt" melden.
        //
        // Jede Buchung wird höchstens einer Fälligkeit zugeordnet. Ohne das
        // würde bei zwölf gleich hohen Monatsraten eine einzige Buchung alle
        // zwölf Termine "bezahlen".
        const kandidaten = (kandidatenRes.data ?? []).filter(k => k.date !== null)
        const verbraucht = new Set<string>()

        const tageAbstand = (a: string, b: string) =>
          Math.round((alsTag(a).getTime() - alsTag(b).getTime()) / 86_400_000)

        const nichtBezahlt: { name: string; faellig_am: string; betrag: number; waehrung: string | null }[] = []
        const abweichendeBuchungstage: {
          name: string; faellig_am: string; gebucht_am: string; tage_versatz: number; betrag: number
        }[] = []

        for (const v of vertraege) {
          const betrag = Number(v.amount)
          for (const datum of faelligkeitenIm(v, vor90, tageDazu(heute, -1))) {
            if (gebucht.has(`${v.id}|${datum}`)) continue

            const treffer = kandidaten
              .filter(k => {
                if (verbraucht.has(k.id!) || Number(k.amount) !== betrag) return false
                if (v.account_id && k.account_id && k.account_id !== v.account_id) return false
                return k.date!.slice(0, 7) === datum.slice(0, 7) || Math.abs(tageAbstand(k.date!, datum)) <= 7
              })
              .sort((x, y) => Math.abs(tageAbstand(x.date!, datum)) - Math.abs(tageAbstand(y.date!, datum)))[0]

            if (!treffer) {
              nichtBezahlt.push({ name: v.name, faellig_am: datum, betrag, waehrung: v.currency })
              continue
            }

            verbraucht.add(treffer.id!)
            const versatz = tageAbstand(treffer.date!, datum)
            if (Math.abs(versatz) > 2) {
              abweichendeBuchungstage.push({
                name: v.name, faellig_am: datum, gebucht_am: treffer.date!,
                tage_versatz: versatz, betrag,
              })
            }
          }
        }
        nichtBezahlt.sort((a, b) => b.faellig_am.localeCompare(a.faellig_am))
        abweichendeBuchungstage.sort((a, b) => b.faellig_am.localeCompare(a.faellig_am))

        // 4) Schulden. Das Datenmodell kennt keinen Abbuchungstag je Schuld,
        // nur eine Monatsrate — deshalb stehen sie NICHT als datierte Termine
        // im Kalender, sondern als eigene Liste. Ein erfundener Tag wäre eine
        // Zahl, die nach Buchhaltung aussieht und keine ist.
        const tilgungenJeSchuld = new Map<string, { letzte: string; summe: number; anzahl: number }>()
        for (const t of tilgungenRes.data ?? []) {
          const eintrag = tilgungenJeSchuld.get(t.debt_id)
          if (eintrag) {
            eintrag.summe += Number(t.amount)
            eintrag.anzahl += 1
          } else {
            // Absteigend sortiert — der erste Treffer je Schuld ist die jüngste Tilgung.
            tilgungenJeSchuld.set(t.debt_id, { letzte: t.payment_date, summe: Number(t.amount), anzahl: 1 })
          }
        }
        const schulden = (schuldenRes.data ?? []).map(d => {
          const t = tilgungenJeSchuld.get(d.id)
          return {
            ...untrust(d, ['creditor']),
            letzte_tilgung:    t?.letzte ?? null,
            tilgungen_gesamt:  t ? Math.round(t.summe * 100) / 100 : 0,
            anzahl_tilgungen:  t?.anzahl ?? 0,
          }
        })

        const summeVertraegeImFenster =
          Math.round(termine.reduce((s, t) => s + t.betrag, 0) * 100) / 100
        const summeRaten =
          Math.round((schuldenRes.data ?? []).reduce((s, d) => s + Number(d.monthly_payment ?? 0), 0) * 100) / 100

        return {
          fenster: { von: alsIso(heute), bis: alsIso(bis), tage: days },
          faelligkeiten: termineGezeigt.map(t => untrust(t, ['name'])),
          termine_gekuerzt: termineGekuerzt,
          termine_gesamt: termine.length,
          summe_vertraege_im_fenster: summeVertraegeImFenster,
          summe_je_monat: Array.from(summeJeMonat, ([monat, betrag]) => ({ monat, betrag })),
          kuendigungsfristen: fristen.map(f => untrust(f, ['name'])),
          nicht_bezahlt: nichtBezahlt.slice(0, 50).map(n => untrust(n, ['name'])),
          abweichende_buchungstage: abweichendeBuchungstage.slice(0, 50).map(n => untrust(n, ['name'])),
          hinweis_zur_deutung:
            'nicht_bezahlt heisst: zu dieser Faelligkeit gibt es weder eine Cron-Ausfuehrung noch eine ' +
            'echte Buchung mit demselben Betrag im Umfeld von sieben Tagen. Das ist der Fall, den es ' +
            'wert ist zu melden. abweichende_buchungstage heisst dagegen: bezahlt wurde, aber an einem ' +
            'anderen Tag als im Vertrag steht — dort gehoert der billing_day korrigiert, nicht das Geld ' +
            'gesucht.',
          schulden,
          summe_monatsraten_schulden: summeRaten,
        }
      },
    }),

  }
}
