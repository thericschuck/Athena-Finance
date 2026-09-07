import type { MetadataRoute } from 'next'
import { PUBLIC_PATHS, abs } from '@/lib/seo'

/**
 * sitemap.xml — bisher ebenfalls nicht vorhanden.
 *
 * Enthält ausschließlich Seiten, die auch auf `index` stehen. Eine Sitemap, die
 * eine `noindex`-Seite anmeldet, ist ein Widerspruch in sich: die Search Console
 * meldet sie als „Durch 'noindex'-Tag ausgeschlossen" und man sucht den Fehler
 * an der falschen Stelle. Impressum und Datenschutzerklärung stehen deshalb
 * nicht drin (siehe deren `robots`-Angaben) — sie sind über den Fuß der
 * Startseite verlinkt und damit auffindbar, sollen aber keine Suchtreffer sein.
 *
 * `lastModified` bewusst zur Bauzeit statt eines fest notierten Datums: eine
 * Sitemap, die behauptet, die Seite sei seit einem Jahr unverändert, führt dazu,
 * dass sie seltener geholt wird.
 */
export default function sitemap(): MetadataRoute.Sitemap {
  const lastModified = new Date()

  return PUBLIC_PATHS.map((path) => ({
    url: abs(path),
    lastModified,
    changeFrequency: path === '/' ? ('weekly' as const) : ('monthly' as const),
    // Relativ zueinander, nicht absolut: der Wert sagt einer Suchmaschine nur,
    // welche Seite dieser Domain die wichtigere ist.
    priority: path === '/' ? 1 : 0.8,
  }))
}
