import { tool } from 'ai'
import { z } from 'zod'
import { type DB } from '@/lib/assistant/tools/shared'

export function buildDataQualityTools(supabase: DB, userId: string) {
  return {
    // ── Vertrauensschicht: taugen die Zahlen ueberhaupt? ─────────────────────
    checkDataQuality: tool({
      description:
        'Prüft, ob die Zahlen tragen, auf die sich alle anderen Werkzeuge stützen: Alter und Lücken der ' +
        'Snapshots, Abweichung zwischen Bankstand und App-Saldo je Konto, hängende Bank-Syncs, Anteil ' +
        'unkategorisierter Buchungen, Alter der Kurs-Caches. Liefert fertige Befunde mit Schweregrad — ' +
        'du musst keine eigenen Schwellen erfinden. Aufrufen BEVOR du eine Vermögens-, Verlaufs- oder ' +
        'Saldozahl nennst, und immer dann, wenn eine Zahl unplausibel wirkt.',
      inputSchema: z.object({}),
      execute: async () => {
        const heute = new Date()
        const iso = (d: Date) => d.toISOString().slice(0, 10)
        const tageSeit = (wert: string | null | undefined): number | null => {
          if (!wert) return null
          const diff = heute.getTime() - new Date(wert).getTime()
          return Math.floor(diff / 86_400_000)
        }
        const vorTagen = (n: number) => {
          const d = new Date(heute)
          d.setDate(d.getDate() - n)
          return iso(d)
        }

        const befunde: { schwere: 'kritisch' | 'hinweis'; text: string }[] = []
        const melde = (schwere: 'kritisch' | 'hinweis', text: string) => befunde.push({ schwere, text })

        // 1) Snapshots — Alter, Lücken, Nullwerte.
        const { data: snaps, error: snapErr } = await supabase
          .from('net_worth_snapshots')
          .select('snapshot_date, net_worth, total_checking')
          .eq('user_id', userId)
          .gte('snapshot_date', vorTagen(30))
          .order('snapshot_date', { ascending: false })
        if (snapErr) return { error: snapErr.message }

        const letzterSnapshot = snaps?.[0]?.snapshot_date ?? null
        const snapshotAlter   = tageSeit(letzterSnapshot)
        // Lücken: wie viele der letzten 30 Tage haben gar keinen Snapshot.
        const vorhandeneTage = new Set((snaps ?? []).map(s => s.snapshot_date))
        const luecken: string[] = []
        for (let i = 1; i <= 30; i++) {
          const tag = vorTagen(i)
          if (!vorhandeneTage.has(tag)) luecken.push(tag)
        }
        const nullTage = (snaps ?? [])
          .filter(s => Number(s.net_worth) === 0 || Number(s.total_checking) === 0)
          .map(s => s.snapshot_date)

        if (snapshotAlter === null) {
          melde('kritisch', 'Es gibt überhaupt keinen Snapshot der letzten 30 Tage. Jede Vermögenszahl wäre geraten.')
        } else if (snapshotAlter > 1) {
          melde('kritisch', `Der jüngste Snapshot ist vom ${letzterSnapshot} und damit ${snapshotAlter} Tage alt — der Cron läuft nicht.`)
        }
        if (luecken.length > 3) {
          melde('kritisch', `${luecken.length} der letzten 30 Tage haben keinen Snapshot (u. a. ${luecken.slice(0, 3).join(', ')}). Der Verlauf hat Löcher.`)
        } else if (luecken.length > 0) {
          melde('hinweis', `Einzelne Tage ohne Snapshot: ${luecken.join(', ')}.`)
        }
        if (nullTage.length > 0) {
          melde('kritisch', `${nullTage.length} Snapshot-Tage stehen auf 0 € (u. a. ${nullTage.slice(0, 3).join(', ')}) — das ist ein Rechenfehler, kein leeres Konto.`)
        }

        // 2) Konten — App-Saldo gegen Bankstand, und wie frisch die Buchungen sind.
        const { data: konten, error: kontenErr } = await supabase
          .from('accounts')
          .select('id, name, type, bank_iban')
          .eq('user_id', userId)
          .eq('is_active', true)
          .order('sort_order')
        if (kontenErr) return { error: kontenErr.message }

        const kontoIds = (konten ?? []).map(k => k.id)
        const saldoMap = new Map<string, { balance: number; stand: string }>()
        if (kontoIds.length > 0) {
          const { data: salden } = await supabase
            .from('account_balances')
            .select('account_id, balance, snapshot_date')
            .in('account_id', kontoIds)
            .order('snapshot_date', { ascending: false })
          for (const s of salden ?? []) {
            if (!saldoMap.has(s.account_id)) {
              saldoMap.set(s.account_id, { balance: Number(s.balance), stand: s.snapshot_date })
            }
          }
        }

        const { data: bankStaende } = await supabase
          .from('bank_balance')
          .select('account_iban, booked_balance, fetched_at')
          .eq('user_id', userId)
        const bankMap = new Map(
          (bankStaende ?? []).map(b => [b.account_iban, { stand: Number(b.booked_balance), geholt: b.fetched_at }]),
        )

        // Jüngste Buchung je Konto: eine winzige Abfrage pro Konto statt einer
        // grossen über alle Zeilen — PostgREST kann kein max() je Gruppe.
        const letzteBuchungen = await Promise.all(
          (konten ?? []).map(async k => {
            const { data } = await supabase
              .from('unified_transactions')
              .select('date')
              .eq('user_id', userId)
              .eq('account_id', k.id)
              .order('date', { ascending: false })
              .limit(1)
            return [k.id, data?.[0]?.date ?? null] as const
          }),
        )
        const buchungMap = new Map(letzteBuchungen)

        const kontenBericht = (konten ?? []).map(k => {
          const saldo = saldoMap.get(k.id) ?? null
          const bank  = k.bank_iban ? bankMap.get(k.bank_iban) ?? null : null
          const diff  = saldo && bank ? Math.round((saldo.balance - bank.stand) * 100) / 100 : null
          const letzteBuchung = buchungMap.get(k.id) ?? null

          if (saldo && bank && diff !== null && Math.abs(diff) > 1) {
            melde(
              'kritisch',
              `${k.name}: App zeigt ${saldo.balance} €, die Bank meldet ${bank.stand} € — ${diff} € Unterschied. ` +
              'Nenne den Saldo dieses Kontos nicht, ohne das dazuzusagen.',
            )
          }
          if (k.bank_iban) {
            const bankAlter = tageSeit(bank?.geholt ?? null)
            if (bankAlter === null) {
              melde('kritisch', `${k.name} ist mit einer IBAN verknüpft, aber es liegt kein einziger Bankstand vor — der Sync hat für dieses Konto nie funktioniert.`)
            } else if (bankAlter > 3) {
              melde('hinweis', `${k.name}: letzter Bank-Sync vor ${bankAlter} Tagen.`)
            }
            const buchungsAlter = tageSeit(letzteBuchung)
            if (buchungsAlter !== null && buchungsAlter > 14) {
              melde('hinweis', `${k.name}: jüngste Buchung ist ${buchungsAlter} Tage alt — entweder war nichts los oder der Abruf hängt.`)
            }
          }

          return {
            name:            k.name,
            typ:             k.type,
            bank_verknuepft: k.bank_iban !== null,
            saldo_app:       saldo?.balance ?? null,
            saldo_stand:     saldo?.stand ?? null,
            saldo_bank:      bank?.stand ?? null,
            bank_geholt_am:  bank?.geholt?.slice(0, 10) ?? null,
            differenz:       diff,
            letzte_buchung:  letzteBuchung,
          }
        })

        // 3) Buchungen — wie viel davon ist ungepflegt.
        const seit90 = vorTagen(90)
        // Beide Zaehlungen und die beiden Kursabfragen haengen nicht voneinander
        // ab — nacheinander erwartet waeren es vier Roundtrips, bevor Athena
        // ueberhaupt anfangen kann zu antworten.
        const [{ count: buchungenGesamt }, { count: buchungenOhneKategorie }] = await Promise.all([
          supabase
            .from('unified_transactions')
            .select('id', { count: 'exact', head: true })
            .eq('user_id', userId)
            .eq('flow_kind', 'echt')
            .gte('date', seit90),
          supabase
            .from('unified_transactions')
            .select('id', { count: 'exact', head: true })
            .eq('user_id', userId)
            .eq('flow_kind', 'echt')
            .gte('date', seit90)
            .is('category_id', null),
        ])

        const anteilOhneKategorie =
          buchungenGesamt && buchungenGesamt > 0
            ? Math.round(((buchungenOhneKategorie ?? 0) / buchungenGesamt) * 1000) / 10
            : 0
        if (anteilOhneKategorie > 10) {
          melde(
            'hinweis',
            `${anteilOhneKategorie} % der echten Buchungen der letzten 90 Tage haben keine Kategorie ` +
            `(${buchungenOhneKategorie} von ${buchungenGesamt}). Jede Auswertung nach Kategorie ist um diesen Anteil unvollständig.`,
          )
        }

        // 4) Kurse — ein alter Cache macht Krypto- und Depotwerte still falsch.
        const [{ data: kryptoPreis }, { data: fondsPreis }] = await Promise.all([
          supabase
            .from('crypto_price_cache')
            .select('updated_at')
            .order('updated_at', { ascending: false })
            .limit(1),
          supabase
            .from('fund_price_cache')
            .select('fetched_at')
            .order('fetched_at', { ascending: false })
            .limit(1),
        ])

        const kryptoAlterStunden = kryptoPreis?.[0]?.updated_at
          ? Math.floor((heute.getTime() - new Date(kryptoPreis[0].updated_at).getTime()) / 3_600_000)
          : null
        const fondsAlterTage = tageSeit(fondsPreis?.[0]?.fetched_at ?? null)

        if (kryptoAlterStunden === null) {
          melde('hinweis', 'Es liegt kein einziger Krypto-Kurs vor.')
        } else if (kryptoAlterStunden > 72) {
          melde('kritisch', `Die Krypto-Kurse sind ${kryptoAlterStunden} Stunden alt — jeder Krypto-Wert ist damit veraltet.`)
        } else if (kryptoAlterStunden > 24) {
          melde('hinweis', `Die Krypto-Kurse sind ${kryptoAlterStunden} Stunden alt.`)
        }
        if (fondsAlterTage !== null && fondsAlterTage > 7) {
          melde('hinweis', `Die Fondskurse sind ${fondsAlterTage} Tage alt — der Depotwert hinkt entsprechend nach.`)
        }

        return {
          geprueft_am: iso(heute),
          // `ok` ist die Zahl, an der du dich orientierst: false heisst, dass vor
          // jeder Vermoegenszahl der Befund steht — nicht danach als Fussnote.
          ok: befunde.every(b => b.schwere !== 'kritisch'),
          befunde,
          kennzahlen: {
            letzter_snapshot:              letzterSnapshot,
            snapshot_alter_tage:           snapshotAlter,
            snapshot_luecken_30t:          luecken.length,
            snapshot_nulltage_30t:         nullTage.length,
            buchungen_echt_90t:            buchungenGesamt ?? 0,
            buchungen_ohne_kategorie_90t:  buchungenOhneKategorie ?? 0,
            anteil_ohne_kategorie_prozent: anteilOhneKategorie,
            krypto_kurse_alter_stunden:    kryptoAlterStunden,
            fondskurse_alter_tage:         fondsAlterTage,
          },
          konten: kontenBericht,
        }
      },
    }),

  }
}
