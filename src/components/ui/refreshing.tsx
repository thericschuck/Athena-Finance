import { cn } from '@/lib/utils'

interface Props {
  /** Der Server holt gerade neue Daten für diesen Bereich. */
  pending: boolean
  children: React.ReactNode
  /**
   * Layout-Klassen für die Kinder, z. B. `space-y-6`.
   *
   * Landet bewusst auf dem INHALTS-Div und nicht auf dem äußeren Wrapper: der äußere
   * trägt nur `relative` für den Fortschrittsbalken und hat genau ein Kind — ein
   * `space-y-*` darauf hätte keinerlei Wirkung, weil `space-y` die Abstände ZWISCHEN
   * Geschwistern setzt. Genau so waren auf der Kontodetailseite und in der Analyse alle
   * Karten ohne Abstand aneinandergeklebt.
   */
  className?: string
}

/**
 * Hüllt Inhalt ein, der gerade durch frische Server-Daten ersetzt wird.
 *
 * Bewusst kein Skeleton: die alten Daten bleiben stehen und werden nur abgeblendet. Ein
 * Skeleton würde bei jedem Filter-Klick den kompletten Inhalt wegblitzen lassen, und weil
 * die Antwort meist in 100–300 ms da ist, sähe man vor allem Geflacker. Der Balken oben
 * quittiert den Klick sofort — die Zahlen dürfen dann nachkommen.
 *
 * Skeletons gehören an die Stellen, an denen es noch gar nichts zu zeigen gibt
 * (Erstaufruf einer Seite) — dafür ist `loading.tsx` bzw. `SkeletonChart` da.
 */
export function Refreshing({ pending, children, className }: Props) {
  return (
    <div className="relative">
      {pending && (
        <div
          aria-hidden
          className="pointer-events-none absolute inset-x-0 -top-1 z-10 h-0.5 overflow-hidden rounded-full bg-muted"
        >
          {/* dieselbe Animation wie der globale Navigations-Balken in page-wrapper.tsx */}
          <div className="nav-progress-bar h-full w-1/2 rounded-full bg-primary" />
        </div>
      )}
      <div
        aria-busy={pending}
        className={cn(
          'transition-opacity duration-200',
          pending && 'pointer-events-none opacity-50',
          className,
        )}
      >
        {children}
      </div>
    </div>
  )
}
