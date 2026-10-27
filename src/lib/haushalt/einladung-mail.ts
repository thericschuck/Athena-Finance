/**
 * Versand der Einladungsmail ueber Resend (gleiche Konfiguration wie der Monatsreport: RESEND_API_KEY und
 * REPORT_FROM_EMAIL). Nur auf ausdrueckliche Aktion im UI; ohne Konfiguration ist der Versand nicht verfuegbar.
 */
import { Resend } from 'resend'

export function mailKonfiguriert(): boolean {
  return !!process.env.RESEND_API_KEY && !!process.env.REPORT_FROM_EMAIL
}

function esc(s: string): string {
  return s.replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c] ?? c)
}

export async function sendeEinladungsMail(opts: { to: string; link: string; haushalt: string; von: string }): Promise<void> {
  const apiKey = process.env.RESEND_API_KEY
  const from = process.env.REPORT_FROM_EMAIL
  if (!apiKey || !from) throw new Error('Mailversand ist nicht konfiguriert')
  const html = `<p>Hallo,</p><p>${esc(opts.von)} lädt dich in den Haushalt „${esc(opts.haushalt)}“ bei Athena Finance ein.</p>` +
    `<p><a href="${esc(opts.link)}">Einladung annehmen</a></p>` +
    `<p>Der Link ist 7 Tage gültig und nur für diese E-Mail-Adresse bestimmt. Wenn du die Einladung nicht erwartet hast, ignoriere diese Mail.</p>`
  const { error } = await new Resend(apiKey).emails.send({
    from, to: opts.to, subject: 'Einladung zu Athena Finance', html,
    text: `${opts.von} lädt dich in den Haushalt "${opts.haushalt}" bei Athena Finance ein.\n\nEinladung annehmen: ${opts.link}\n\nDer Link ist 7 Tage gültig und nur für diese E-Mail-Adresse bestimmt.`,
  })
  if (error) throw new Error(error.message ?? 'Versand fehlgeschlagen')
}
