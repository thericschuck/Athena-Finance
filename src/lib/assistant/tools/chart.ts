import { tool } from 'ai'
import { z } from 'zod'

export function buildChartTools() {
  return {
    // ── Visualisierung ─────────────────────────────────────────────────────────
    // Reine Darstellungs-Direktive: kein Supabase-Zugriff, keine eigene Wahrheit.
    // Die Zahlen MÜSSEN aus einem vorherigen Werkzeug-Ergebnis dieses Zugs
    // stammen (siehe "Unverhandelbar" #1 im System-Prompt) — dieses Werkzeug
    // rechnet nichts nach und akzeptiert jede Zahl, die es bekommt.
    showChart: tool({
      description:
        'Rendert ein Diagramm im Chat statt einer Zahlenkette in Prosa — Athenas bevorzugter Weg, ' +
        'Zeitreihen, Kategorien-Vergleiche oder Anteile zu zeigen. "line" für einen Verlauf über ' +
        'Zeit (z. B. Vermögen, Kontostand), "bar" für einen Vergleich über benannte Punkte ' +
        '(Kategorien, Monate) — mit optionalem y2 für eine zweite Reihe (z. B. Ausgaben neben ' +
        'Einnahmen), "donut" für Anteile an einem Ganzen (z. B. Vermögen nach Anlageklasse). ' +
        'NUR mit Zahlen füllen, die aus einem Werkzeug-Ergebnis in diesem Gespräch stammen — nie ' +
        'schätzen oder interpolieren. Ein Chart ersetzt die Zahlenkette in der Textantwort, nicht ' +
        'die Einordnung: der Text bleibt kurz (Ursache, Konsequenz, Tritt), die Zahlen zeigt der Chart.',
      inputSchema: z.object({
        type: z.enum(['line', 'bar', 'donut']),
        title: z.string().min(1).max(80).describe('Kurzer Titel, z. B. "Vermögen, 6 Monate"'),
        unit: z.enum(['eur', 'percent', 'count']).default('eur'),
        seriesLabel: z
          .string()
          .max(40)
          .optional()
          .describe('Label der Werte in y, z. B. "Netto-Vermögen" oder "Einnahmen"'),
        series2Label: z
          .string()
          .max(40)
          .optional()
          .describe('Label der Werte in y2, nur relevant wenn y2 gesetzt ist, z. B. "Ausgaben"'),
        points: z
          .array(
            z.object({
              x: z.string().describe('Datum (YYYY-MM oder YYYY-MM-DD) oder Kategorie-Label'),
              y: z.number(),
              y2: z.number().optional(),
            }),
          )
          .min(1)
          .max(60),
      }),
      execute: async (input) => ({ status: 'chart' as const, spec: input }),
    }),

  }
}
