/**
 * Rendert denselben HTML-String für die Mail (Resend) und die In-App-Ansicht (Iframe mit
 * srcDoc auf /finance/reports) — ein Layout, keine zwei Pflegestellen. Bewusst mit einem
 * eingebetteten <style>-Block statt komplett inline-gestylter Tags: für einen an genau eine
 * Person geschickten Report reicht die Kompatibilität moderner Mail-Clients (Gmail, Apple
 * Mail) locker, und der Code bleibt wartbar.
 *
 * Palette identisch zu docs/athenas-takt.html / docs/athenas-augen.html (--af-gold-ink der
 * App selbst) — fest codiert statt Theme-Tokens, weil ein Mail-Client das App-Theme ohnehin
 * nicht kennt und ein Report in einem Jahr noch genauso aussehen soll wie heute.
 */
import type { ReportData } from './types'

const fmtEur = (n: number): string =>
  new Intl.NumberFormat('de-DE', { style: 'currency', currency: 'EUR' }).format(n)

const fmtSigned = (n: number): string => (n > 0 ? '+' : '') + fmtEur(n)

const fmtDate = (iso: string): string =>
  new Date(iso).toLocaleDateString('de-DE', { day: '2-digit', month: '2-digit', year: 'numeric' })

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}

const SEVERITY_LABEL: Record<string, string> = { info: 'Info', warning: 'Hinweis', critical: 'Kritisch' }
const SEVERITY_COLOR: Record<string, string> = { info: '#74776C', warning: '#7A5A1E', critical: '#9B4127' }

function figure(value: string, label: string, tone?: 'olive' | 'rust'): string {
  const color = tone === 'olive' ? '#55684A' : tone === 'rust' ? '#9B4127' : '#1B1D19'
  return `
    <td style="padding:14px 16px;border:1px solid #E0DED5;background:#FFFFFF;vertical-align:top;">
      <div style="font-family:Georgia,'Times New Roman',serif;font-size:22px;color:${color};line-height:1.1;margin-bottom:4px;">${value}</div>
      <div style="font-size:11px;color:#74776C;">${escapeHtml(label)}</div>
    </td>`
}

function row(left: string, right: string, rightColor = '#1B1D19'): string {
  return `
    <tr>
      <td style="padding:10px 0;border-bottom:1px solid #E0DED5;color:#4A4D45;font-size:14px;">${escapeHtml(left)}</td>
      <td style="padding:10px 0;border-bottom:1px solid #E0DED5;text-align:right;font-size:14px;font-weight:600;color:${rightColor};white-space:nowrap;">${right}</td>
    </tr>`
}

export function renderReportHtml(data: ReportData): string {
  const title = data.type === 'monthly' ? `Monatsreport ${data.label}` : `Jahresreport ${data.label}`

  const netWorthValue = data.netWorth.end != null ? fmtEur(data.netWorth.end) : '—'
  const netWorthDeltaLabel = data.netWorth.delta != null
    ? `${fmtSigned(data.netWorth.delta)} ggü. ${escapeHtml(data.previousLabel)}`
    : 'kein Vergleichswert'
  const netWorthTone = (data.netWorth.delta ?? 0) >= 0 ? 'olive' : 'rust'

  const categoriesHtml = data.topExpenseCategories.length > 0
    ? `<table role="presentation" width="100%" style="border-collapse:collapse;">
        ${data.topExpenseCategories.map(c => row(c.name, fmtEur(c.amount))).join('')}
      </table>`
    : `<p style="color:#74776C;font-size:14px;margin:0;">Keine Ausgaben in diesem Zeitraum.</p>`

  const changesHtml = data.notableChanges.length > 0
    ? `<table role="presentation" width="100%" style="border-collapse:collapse;">
        ${data.notableChanges.map(c => row(
          c.name,
          fmtSigned(c.delta),
          c.delta > 0 ? '#9B4127' : '#55684A',
        )).join('')}
      </table>`
    : ''

  const insightsHtml = data.openInsights.length > 0
    ? `<table role="presentation" width="100%" style="border-collapse:collapse;">
        ${data.openInsights.map(i => `
          <tr>
            <td style="padding:8px 0;border-bottom:1px solid #E0DED5;font-size:14px;color:#1B1D19;">
              <span style="display:inline-block;width:7px;height:7px;border-radius:50%;background:${SEVERITY_COLOR[i.severity] ?? '#74776C'};margin-right:8px;"></span>
              ${escapeHtml(i.title)}
              <span style="float:right;font-size:11px;color:#74776C;">${SEVERITY_LABEL[i.severity] ?? i.severity}</span>
            </td>
          </tr>`).join('')}
      </table>`
    : `<p style="color:#74776C;font-size:14px;margin:0;">Keine offenen Hinweise.</p>`

  return `<!doctype html>
<html lang="de">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>${escapeHtml(title)}</title>
<style>
  body { margin:0; padding:0; background:#F6F5F1; color:#1B1D19; font-family:-apple-system,Segoe UI,Helvetica,Arial,sans-serif; }
  .wrap { max-width:640px; margin:0 auto; padding:32px 20px 60px; }
  h1 { font-family:Georgia,'Times New Roman',serif; font-weight:400; font-size:30px; margin:0 0 4px; }
  h2 { font-size:14px; font-weight:600; margin:32px 0 12px; text-transform:uppercase; letter-spacing:0.04em; color:#4A4D45; }
  .eyebrow { font-family:ui-monospace,Consolas,monospace; font-size:11px; letter-spacing:0.12em; text-transform:uppercase; color:#8A6A2F; margin-bottom:10px; }
  .section { margin-top:8px; }
  a { color:#8A6A2F; }
</style>
</head>
<body>
<div class="wrap">
  <div class="eyebrow">athena-finance · ${data.type === 'monthly' ? 'Monatsreport' : 'Jahresreport'}</div>
  <h1>${escapeHtml(data.label)}</h1>
  <p style="color:#74776C;font-size:13px;margin:0 0 24px;">Erzeugt am ${fmtDate(data.generatedAt)}</p>

  <table role="presentation" width="100%" style="border-collapse:collapse;border-spacing:0;">
    <tr>
      ${figure(netWorthValue, `Nettovermögen (${netWorthDeltaLabel})`, netWorthTone)}
      ${figure(fmtEur(data.totals.income), 'Einnahmen')}
    </tr>
    <tr><td colspan="2" style="height:1px;"></td></tr>
    <tr>
      ${figure(fmtEur(data.totals.expenses), 'Ausgaben')}
      ${figure(fmtSigned(data.totals.net), 'Netto-Cashflow', data.totals.net >= 0 ? 'olive' : 'rust')}
    </tr>
  </table>

  <div class="section">
    <h2>Top-Ausgabenkategorien</h2>
    ${categoriesHtml}
  </div>

  ${changesHtml ? `<div class="section"><h2>Auffällige Veränderungen ggü. ${escapeHtml(data.previousLabel)}</h2>${changesHtml}</div>` : ''}

  <div class="section">
    <h2>Offene Hinweise</h2>
    ${insightsHtml}
  </div>

  <p style="margin-top:40px;font-size:12px;color:#74776C;">
    Automatisch erzeugt von Athena · <a href="https://athena-finance.de/finance/reports">In der App ansehen</a>
  </p>
</div>
</body>
</html>`
}
