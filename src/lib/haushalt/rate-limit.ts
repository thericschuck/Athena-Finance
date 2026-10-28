/**
 * Einfache Begrenzung gegen Token-Raten und Passwort-Probieren auf der Einladungsseite.
 * Fester Zeitraum je Schluessel (z. B. IP), im Speicher der Instanz: auf Serverless nur Best-Effort (jede Instanz zaehlt
 * fuer sich). Der eigentliche Schutz ist das 256-Bit-Token (nicht erratbar) und die einheitliche Fehlermeldung.
 */
export function neuesLimit(max: number, fensterMs: number) {
  const eintraege = new Map<string, { start: number; n: number }>()
  return {
    /** true = erlaubt (und gezaehlt), false = Limit erreicht. */
    erlaube(key: string, jetzt: number = Date.now()): boolean {
      if (eintraege.size > 5000) {
        for (const [k, v] of eintraege) if (jetzt - v.start >= fensterMs) eintraege.delete(k)
      }
      const e = eintraege.get(key)
      if (!e || jetzt - e.start >= fensterMs) {
        eintraege.set(key, { start: jetzt, n: 1 })
        return true
      }
      if (e.n >= max) return false
      e.n += 1
      return true
    },
  }
}
