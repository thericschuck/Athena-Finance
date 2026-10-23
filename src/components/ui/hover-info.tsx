import { cn } from '@/lib/utils'

/**
 * Erklaerung beim Ueberfahren oder Fokussieren statt des nackten Browser-Tooltips: Titel, ein paar
 * Zahlen und ein Satz, was die Zahl ist. Rein ueber CSS (`group-hover` und `group-focus-within`),
 * ohne Zustand und ohne Client-Code; per Tastatur und Fingertipp erreichbar, weil der Wrapper
 * fokussierbar ist (`tabIndex=0`).
 *
 * Gleiche Gestaltung wie die Karte in BankKategorien.tsx (dort noch eine eigene Kopie).
 *
 * `bare` laesst die gepunktete Unterstreichung weg (fuer ganze Kacheln als Ausloeser);
 * `className` gilt fuer den Ausloeser, `popClassName` fuer die Karte (z. B. `right-0`, damit sie in
 * der rechten Spalte nicht ueber den Bildschirmrand ragt).
 */
export function HoverInfo({
  titel, zeilen = [], text, children, bare = false, className, popClassName,
}: {
  titel: string
  zeilen?: readonly (readonly [string, string])[]
  text: string
  children: React.ReactNode
  bare?: boolean
  className?: string
  popClassName?: string
}) {
  return (
    <span className={cn('group relative inline-flex cursor-help items-baseline', className)} tabIndex={0}>
      {bare ? children : (
        <span className="underline decoration-dotted decoration-muted-foreground/40 underline-offset-4">{children}</span>
      )}
      <span
        role="tooltip"
        className={cn(
          'pointer-events-none invisible absolute left-0 top-full z-30 mt-2 w-64 max-w-[calc(100vw-2rem)] rounded-lg border border-border bg-popover p-3 text-left text-xs font-normal normal-case tracking-normal text-foreground opacity-0 shadow-lg transition-opacity group-hover:visible group-hover:opacity-100 group-focus-within:visible group-focus-within:opacity-100',
          popClassName,
        )}
      >
        <span className="block font-medium">{titel}</span>
        {zeilen.map(([k, v]) => (
          <span key={k} className="mt-1 flex items-baseline justify-between gap-3">
            <span className="text-muted-foreground">{k}</span>
            <span className="font-semibold tabular-nums">{v}</span>
          </span>
        ))}
        <span className="mt-2 block leading-snug text-muted-foreground">{text}</span>
      </span>
    </span>
  )
}
