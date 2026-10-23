import { HEAT_CAP, heatFarbe, type HeatmapZeile } from '@/lib/verlauf/monate'

/**
 * Sparquote je Monat: Zeilen = Jahre, Spalten = Monate. Grün = es blieb Geld übrig, Rot =
 * mehr Konsum als Einnahmen; je stärker die Quote, desto satter die Farbe (ab ±50 % voll).
 * Die Farben kommen aus den Theme-Tokens `--success`/`--danger` mit Deckkraft über
 * `color-mix`, damit Hell- und Dunkelmodus ohne eigene Paletten funktionieren.
 * Server Component: reine Darstellung, keine Interaktion außer dem `title`-Tooltip.
 */
export function SparquoteHeatmap({ zeilen, locale }: { zeilen: HeatmapZeile[]; locale: string }) {
  if (zeilen.length === 0) return null

  const monatFmt = new Intl.DateTimeFormat(locale, { month: 'short', timeZone: 'UTC' })
  const monate = Array.from({ length: 12 }, (_, i) => monatFmt.format(new Date(Date.UTC(2000, i, 1))))
  const farbe = (token: 'success' | 'danger', alpha: number) =>
    `color-mix(in srgb, var(--${token}) ${Math.round(alpha * 100)}%, transparent)`

  return (
    <div className="rounded-lg border border-border bg-card px-5 py-4">
      <p className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground">
        Sparquote nach Monat
      </p>

      <div className="mt-3 overflow-x-auto">
        <div className="min-w-[460px] space-y-1">
          <div className="grid grid-cols-[2.5rem_repeat(12,minmax(0,1fr))] gap-1 text-[10px] text-muted-foreground">
            <span />
            {monate.map(m => <span key={m} className="text-center">{m}</span>)}
          </div>
          {zeilen.map(z => (
            <div key={z.jahr} className="grid grid-cols-[2.5rem_repeat(12,minmax(0,1fr))] gap-1">
              <span className="self-center text-[11px] tabular-nums text-muted-foreground">{z.jahr}</span>
              {z.quoten.map((q, i) => {
                const f = q === null ? null : heatFarbe(q)
                const titel = `${monate[i]} ${z.jahr}: ${q === null ? 'keine Einnahmen, keine Quote' : `${q} %`}`
                return (
                  <div
                    key={i}
                    title={titel}
                    aria-label={titel}
                    className={`flex h-8 items-center justify-center rounded text-[10px] tabular-nums ${
                      q === null ? 'text-muted-foreground' : f ? 'text-foreground' : 'bg-muted/60 text-foreground'
                    }`}
                    style={f ? { backgroundColor: farbe(f.token, f.alpha) } : undefined}
                  >
                    {q === null ? '–' : q}
                  </div>
                )
              })}
            </div>
          ))}
        </div>
      </div>

      <div className="mt-3 flex items-center gap-2 text-[11px] text-muted-foreground">
        <span>−{HEAT_CAP} %</span>
        <span
          className="h-2 w-32 rounded-full"
          style={{
            background: `linear-gradient(to right, ${farbe('danger', 0.65)}, ${farbe('danger', 0.12)}, ${farbe('success', 0.12)}, ${farbe('success', 0.65)})`,
          }}
        />
        <span>+{HEAT_CAP} %</span>
        <span className="ml-2">· Zahl = Sparquote in %, &bdquo;–&ldquo; = keine Einnahmen</span>
      </div>
    </div>
  )
}
