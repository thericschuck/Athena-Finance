/**
 * PDF-Fassung desselben Reports, für den Belegordner bzw. den Mail-Anhang. Eigene
 * react-pdf-Primitive statt des HTML-Renderings aus render-html.ts — beide Formate haben zu
 * unterschiedliche Layout-Modelle (Flow-HTML vs. react-pdf-Flexbox), um Markup zu teilen; die
 * Zahlen kommen aus derselben ReportData, nur einmal berechnet in build.ts.
 */
import { Document, Page, Text, View, StyleSheet, Font, renderToBuffer } from '@react-pdf/renderer'
import type { ReportData } from './types'

const fmtEur = (n: number): string =>
  new Intl.NumberFormat('de-DE', { style: 'currency', currency: 'EUR' }).format(n)

const fmtSigned = (n: number): string => (n > 0 ? '+' : '') + fmtEur(n)

// Helvetica ist eine der 14 in jedem PDF-Reader eingebauten Standardschriften — kein
// Font.register() mit externem Download nötig, das in einer Cron-Function ohnehin fragil wäre.
Font.registerHyphenationCallback(word => [word])

const COLOR = {
  ink:      '#1B1D19',
  inkSoft:  '#4A4D45',
  inkMute:  '#74776C',
  rule:     '#E0DED5',
  gold:     '#8A6A2F',
  olive:    '#55684A',
  rust:     '#9B4127',
}

const styles = StyleSheet.create({
  page:       { padding: 40, fontSize: 10.5, fontFamily: 'Helvetica', color: COLOR.ink },
  eyebrow:    { fontSize: 9, color: COLOR.gold, marginBottom: 10, textTransform: 'uppercase', letterSpacing: 1.5 },
  h1:         { fontSize: 22, marginBottom: 4 },
  meta:       { fontSize: 9, color: COLOR.inkMute, marginBottom: 20 },
  figureRow:  { flexDirection: 'row', gap: 10, marginBottom: 22 },
  figure:     { flex: 1, borderWidth: 1, borderColor: COLOR.rule, padding: 10 },
  figureVal:  { fontSize: 15, fontWeight: 700, marginBottom: 3 },
  figureLbl:  { fontSize: 8, color: COLOR.inkMute },
  section:    { marginBottom: 18 },
  h2:         { fontSize: 11, fontWeight: 700, marginBottom: 8, textTransform: 'uppercase', letterSpacing: 0.5, color: COLOR.inkSoft },
  row:        { flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 5, borderBottomWidth: 1, borderBottomColor: COLOR.rule },
  rowLabel:   { color: COLOR.inkSoft },
  rowValue:   { fontWeight: 700 },
  empty:      { fontSize: 10, color: COLOR.inkMute },
  footer:     { position: 'absolute', bottom: 30, left: 40, right: 40, fontSize: 8, color: COLOR.inkMute },
})

function ReportDocument({ data }: { data: ReportData }) {
  const title = data.type === 'monthly' ? 'Monatsreport' : 'Jahresreport'
  const netWorthColor = (data.netWorth.delta ?? 0) >= 0 ? COLOR.olive : COLOR.rust
  const netColor = data.totals.net >= 0 ? COLOR.olive : COLOR.rust

  return (
    <Document title={`${title} ${data.label}`}>
      <Page size="A4" style={styles.page}>
        <Text style={styles.eyebrow}>athena-finance · {title}</Text>
        <Text style={styles.h1}>{data.label}</Text>
        <Text style={styles.meta}>Erzeugt am {new Date(data.generatedAt).toLocaleDateString('de-DE')}</Text>

        <View style={styles.figureRow}>
          <View style={styles.figure}>
            <Text style={[styles.figureVal, { color: netWorthColor }]}>
              {data.netWorth.end != null ? fmtEur(data.netWorth.end) : '—'}
            </Text>
            <Text style={styles.figureLbl}>
              Nettovermögen{data.netWorth.delta != null ? ` (${fmtSigned(data.netWorth.delta)})` : ''}
            </Text>
          </View>
          <View style={styles.figure}>
            <Text style={styles.figureVal}>{fmtEur(data.totals.income)}</Text>
            <Text style={styles.figureLbl}>Einnahmen</Text>
          </View>
          <View style={styles.figure}>
            <Text style={styles.figureVal}>{fmtEur(data.totals.expenses)}</Text>
            <Text style={styles.figureLbl}>Ausgaben</Text>
          </View>
          <View style={styles.figure}>
            <Text style={[styles.figureVal, { color: netColor }]}>{fmtSigned(data.totals.net)}</Text>
            <Text style={styles.figureLbl}>Netto-Cashflow</Text>
          </View>
        </View>

        <View style={styles.section}>
          <Text style={styles.h2}>Top-Ausgabenkategorien</Text>
          {data.topExpenseCategories.length === 0
            ? <Text style={styles.empty}>Keine Ausgaben in diesem Zeitraum.</Text>
            : data.topExpenseCategories.map(c => (
              <View style={styles.row} key={c.name}>
                <Text style={styles.rowLabel}>{c.name}</Text>
                <Text style={styles.rowValue}>{fmtEur(c.amount)}</Text>
              </View>
            ))}
        </View>

        {data.notableChanges.length > 0 && (
          <View style={styles.section}>
            <Text style={styles.h2}>Auffällige Veränderungen ggü. {data.previousLabel}</Text>
            {data.notableChanges.map(c => (
              <View style={styles.row} key={c.name}>
                <Text style={styles.rowLabel}>{c.name}</Text>
                <Text style={[styles.rowValue, { color: c.delta > 0 ? COLOR.rust : COLOR.olive }]}>
                  {fmtSigned(c.delta)}
                </Text>
              </View>
            ))}
          </View>
        )}

        <View style={styles.section}>
          <Text style={styles.h2}>Offene Hinweise</Text>
          {data.openInsights.length === 0
            ? <Text style={styles.empty}>Keine offenen Hinweise.</Text>
            : data.openInsights.map((insight, idx) => (
              <View style={styles.row} key={idx}>
                <Text style={styles.rowLabel}>{insight.title}</Text>
              </View>
            ))}
        </View>

        {data.tax && (
          <View style={styles.section}>
            <Text style={styles.h2}>Steuer-Anhang {data.tax.year}</Text>
            {[
              ['Gewinn Schuck Webdesign', fmtEur(data.tax.profit)],
              ['Zu versteuerndes Einkommen (geschätzt)', fmtEur(data.tax.taxableIncome)],
              ['Einkommensteuer gesamt (geschätzt)', fmtEur(data.tax.estimatedTax)],
              ['Grenzsteuersatz auf den nächsten Euro', `${data.tax.marginalRatePct.toLocaleString('de-DE', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} %`],
              ['Steuerrücklage Soll / Ist', `${fmtEur(data.tax.reserveTarget)} / ${data.tax.reserveActual === null ? 'kein Sparziel' : fmtEur(data.tax.reserveActual)}`],
              ...(data.tax.crypto
                ? [
                  ['Krypto (Kraken): steuerpflichtiger Saldo', fmtEur(data.tax.crypto.taxableBalance)],
                  [`Krypto: zu versteuern (Freigrenze ${fmtEur(data.tax.crypto.allowance)})`, fmtEur(data.tax.crypto.toTax)],
                  ['Krypto: steuerfreier Gewinn (Haltefrist)', fmtEur(data.tax.crypto.taxFreeGain)],
                ]
                : []),
            ].map(([label, value]) => (
              <View style={styles.row} key={label}>
                <Text style={styles.rowLabel}>{label}</Text>
                <Text style={styles.rowValue}>{value}</Text>
              </View>
            ))}
            {data.tax.warnings.map(w => (
              <Text key={w} style={[styles.empty, { marginTop: 4 }]}>• {w}</Text>
            ))}
            <Text style={[styles.empty, { marginTop: 6 }]}>Schätzung, kein Steuerbescheid und keine Steuerberatung.</Text>
          </View>
        )}
        {!data.tax && data.taxError && (
          <View style={styles.section}>
            <Text style={styles.h2}>Steuer-Anhang</Text>
            <Text style={styles.empty}>Der Steuer-Anhang konnte nicht erstellt werden: {data.taxError}</Text>
          </View>
        )}

        <Text style={styles.footer}>
          Automatisch erzeugt von Athena — athena-finance.de/finance/reports
        </Text>
      </Page>
    </Document>
  )
}

export async function renderReportPdf(data: ReportData): Promise<Buffer> {
  return renderToBuffer(<ReportDocument data={data} />)
}
