import type { MetadataRoute } from 'next'
import { PRIVATE_PREFIXES, SITE, abs } from '@/lib/seo'

/**
 * robots.txt — bisher gab es gar keine, Suchmaschinen sind also durch die
 * gesamte App gelaufen und bei jedem geschützten Pfad auf /login gelandet.
 *
 * `disallow` ist hier kein Sicherheitsmittel (das ist die Middleware), sondern
 * eine Wegbeschreibung: ein Crawler hat pro Domain ein begrenztes Budget, und
 * jede Umleitung nach /login verbraucht davon etwas, ohne dass eine indexierbare
 * Seite dabei herauskommt.
 */
export default function robots(): MetadataRoute.Robots {
  return {
    rules: [
      {
        userAgent: '*',
        allow: '/',
        disallow: [...PRIVATE_PREFIXES],
      },
    ],
    sitemap: abs('/sitemap.xml'),
    host: SITE.url,
  }
}
