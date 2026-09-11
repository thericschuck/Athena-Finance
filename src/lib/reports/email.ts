/**
 * Mail-Versand über Resend. Einziger E-Mail-Anbieter im Projekt — bewusst, siehe
 * docs/athenas-takt.html: kein SMTP, kein zweiter Vendor für dieselbe Aufgabe.
 *
 * Erwartete Env-Vars:
 *   RESEND_API_KEY     — aus dem Resend-Dashboard
 *   REPORT_FROM_EMAIL  — z. B. "Athena <reports@athena-finance.de>", braucht eine in Resend
 *                         verifizierte Absender-Domain, sonst lehnt Resend den Versand ab
 */
import { Resend } from 'resend'

let cached: Resend | null = null

function resendClient(): Resend {
  if (!cached) {
    const apiKey = process.env.RESEND_API_KEY
    if (!apiKey) throw new Error('RESEND_API_KEY nicht konfiguriert')
    cached = new Resend(apiKey)
  }
  return cached
}

export async function sendReportEmail(opts: {
  to:          string
  subject:     string
  html:        string
  pdfBuffer:   Buffer
  pdfFilename: string
}): Promise<void> {
  const from = process.env.REPORT_FROM_EMAIL
  if (!from) throw new Error('REPORT_FROM_EMAIL nicht konfiguriert')

  const { error } = await resendClient().emails.send({
    from,
    to:      opts.to,
    subject: opts.subject,
    html:    opts.html,
    attachments: [{ filename: opts.pdfFilename, content: opts.pdfBuffer }],
  })
  if (error) throw new Error(error.message ?? 'Resend-Versand fehlgeschlagen')
}
