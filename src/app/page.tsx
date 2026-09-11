import type { Metadata } from 'next'
import { getAuthUser } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import { LandingClient } from '@/components/landing/LandingClient'
import { JsonLd } from '@/components/seo/json-ld'
import { SITE, abs } from '@/lib/seo'

/**
 * Eigene Metadaten statt der Layout-Vorgaben: die Startseite ist die einzige
 * öffentliche Seite mit Inhalt und damit die einzige, die überhaupt um
 * Sichtbarkeit konkurriert — sie darf nicht mit dem generischen App-Titel in
 * den Suchergebnissen stehen.
 *
 * `absolute`, weil das Template im Layout sonst „ · Athena Finance" anhängt und
 * der Markenname doppelt im Titel steht. Länge des Titels bewusst unter 60
 * Zeichen und die der Beschreibung unter 160: darüber schneidet Google ab, und
 * abgeschnitten wird immer das Ende — also das, was zum Klicken bewegen soll.
 */
export const metadata: Metadata = {
  title: { absolute: 'Athena Finance – Finanzübersicht für Konten, Depot & Krypto' },
  description: SITE.description,
  alternates: { canonical: '/' },
  openGraph: {
    type: 'website',
    url: abs('/'),
    title: 'Athena Finance – alles, was dir gehört, in einer Ansicht',
    description: SITE.description,
  },
  twitter: {
    card: 'summary_large_image',
    title: 'Athena Finance – alles, was dir gehört, in einer Ansicht',
    description: SITE.description,
  },
}

/**
 * Strukturierte Daten.
 *
 * Bewusst NUR Angaben, die stimmen. Kein `aggregateRating` (es gibt keine
 * Bewertungen), kein `offers` (es gibt keinen Preis und keinen Verkauf), keine
 * FAQ-Auszeichnung (es gibt keinen FAQ-Bereich auf der Seite). Solche Blöcke
 * erzeugen kurzfristig auffälligere Suchtreffer und sind der schnellste Weg zu
 * einer manuellen Maßnahme wegen „strukturierter Daten, die nicht dem Inhalt
 * der Seite entsprechen".
 *
 * `@graph` statt dreier einzelner Skripte: so lassen sich Website, Person und
 * Anwendung über `@id` aufeinander beziehen, statt dieselbe Person dreimal zu
 * beschreiben.
 */
const STRUCTURED_DATA = {
  '@context': 'https://schema.org',
  '@graph': [
    {
      '@type': 'WebSite',
      '@id': `${SITE.url}/#website`,
      url: SITE.url,
      name: SITE.name,
      description: SITE.description,
      inLanguage: SITE.lang,
      publisher: { '@id': `${SITE.url}/#person` },
    },
    {
      '@type': 'Person',
      '@id': `${SITE.url}/#person`,
      name: SITE.author,
      url: SITE.url,
    },
    {
      '@type': 'SoftwareApplication',
      '@id': `${SITE.url}/#app`,
      name: SITE.name,
      url: SITE.url,
      // Die Kategorie, unter der Google Finanzanwendungen führt.
      applicationCategory: 'FinanceApplication',
      operatingSystem: 'Web',
      inLanguage: SITE.lang,
      description: SITE.description,
      creator: { '@id': `${SITE.url}/#person` },
      featureList: [
        'Konten und Kontostände an einem Ort',
        'Depot und Krypto-Portfolio mit Verlauf',
        'Verträge, Fixkosten und Sparziele',
        'Ausgaben-Analyse mit Heatmap, Geldfluss und Cashflow-Kalender',
        'Steuerberechnung nach § 32a EStG',
      ],
    },
  ],
}

export default async function LandingPage() {
  const { user } = await getAuthUser()
  if (user) redirect('/dashboard')
  return (
    <>
      <JsonLd data={STRUCTURED_DATA} />
      <LandingClient />
    </>
  )
}
