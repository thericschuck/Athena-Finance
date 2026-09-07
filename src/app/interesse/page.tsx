import type { Metadata } from 'next'
import { InteresseClient } from './InteresseClient'
import { JsonLd } from '@/components/seo/json-ld'
import { SITE, abs } from '@/lib/seo'

/**
 * Steht jetzt auf `index`.
 *
 * Vorher `noindex`, mit der Begründung, Impressum und Datenschutzerklärung seien
 * noch Entwürfe. Das Argument trägt an dieser Stelle nicht mehr: die Startseite
 * ist längst indexierbar, die Domain also ohnehin auffindbar — diese Seite
 * zusätzlich zu verstecken schützt vor nichts und kostet nur die einzige
 * Unterseite mit eigenem, indexierbarem Inhalt.
 *
 * Der Entwurfs-Status bleibt trotzdem ein echtes Problem, nur ein anderes: es
 * ist ein rechtliches, kein SEO-Thema, und es betrifft die ganze Domain (siehe
 * Hinweis in app/impressum/page.tsx — die Anschrift fehlt).
 */
export const metadata: Metadata = {
  title: { absolute: 'Warteliste – Athena Finance beim Aufbau begleiten' },
  description:
    'Athena Finance entsteht gerade: Konten, Depot und Verträge in einer Ansicht. '
    + 'Trag dich ein und erfahre, sobald sich beim Zugang etwas tut.',
  alternates: { canonical: '/interesse' },
  openGraph: {
    type: 'website',
    url: abs('/interesse'),
    title: 'Am Bau teilhaben – Athena Finance',
    description:
      'Konten, Depot und Verträge in einer Ansicht — noch im Bau. '
      + 'Trag dich ein, wenn du den Weg dorthin mitverfolgen willst.',
  },
  twitter: {
    card: 'summary_large_image',
    title: 'Am Bau teilhaben – Athena Finance',
    description: 'Konten, Depot und Verträge in einer Ansicht — noch im Bau.',
  },
}

/**
 * Breadcrumb als strukturierte Daten: Google zeigt damit im Suchtreffer
 * „athena-finance.de › Warteliste" statt der nackten URL. Das ist bei einer
 * Domain mit genau zwei öffentlichen Seiten kein Navigationsgewinn, aber es
 * macht den Treffer in der Ergebnisliste einen Tick lesbarer — und mehr
 * verspricht es auch nicht.
 */
const BREADCRUMB = {
  '@context': 'https://schema.org',
  '@type': 'BreadcrumbList',
  itemListElement: [
    { '@type': 'ListItem', position: 1, name: 'Startseite', item: SITE.url },
    { '@type': 'ListItem', position: 2, name: 'Warteliste', item: abs('/interesse') },
  ],
}

export default function InteressePage() {
  return (
    <>
      <JsonLd data={BREADCRUMB} />
      <InteresseClient />
    </>
  )
}
