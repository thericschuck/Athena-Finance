/**
 * Strukturierte Daten als JSON-LD.
 *
 * Server-Komponente ohne eigenen Zustand: das Skript soll schon im ausgelieferten
 * HTML stehen. Käme es erst per Client-JavaScript dazu, würde es zwar von Google
 * gelesen (der rendert), aber von den meisten anderen Bots und von
 * Vorschau-Generatoren (Slack, WhatsApp, LinkedIn) nicht.
 *
 * `</script>` wird maskiert: taucht die Zeichenfolge in einem der Werte auf,
 * beendet der Browser sonst mitten im JSON das Skript-Tag. Hier stehen zwar nur
 * eigene, feste Texte drin — aber genau solche Annahmen halten selten so lange
 * wie der Code.
 */
export function JsonLd({ data }: { data: Record<string, unknown> }) {
  return (
    <script
      type="application/ld+json"
      dangerouslySetInnerHTML={{
        __html: JSON.stringify(data).replace(/</g, '\\u003c'),
      }}
    />
  )
}
