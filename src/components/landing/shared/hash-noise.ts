/**
 * Deterministisches Pseudo-Rauschen — ganzzahliger Hash (Math.imul, XOR,
 * Shift), reicht von -1 bis 1. Ersetzt an allen drei Stellen unten (Kerzen,
 * GuV-Heatmap, Kalender) ein `Math.sin(i * seed) * .5 + ...`-Muster mit der
 * Behauptung, das sei „für Server/Client identisch" — stimmt nicht:
 * ECMAScript lässt transzendente Funktionen wie `Math.sin` ausdrücklich
 * implementierungsapproximiert, und selbst innerhalb DESSELBEN Browsers/Node
 * weichen der SSR-Aufruf und der Hydration-Aufruf im Client im letzten Bit
 * ab, sobald unterschiedliche JIT-Tiers/Codepfade greifen (dieselbe
 * Begründung wie bei `wobble()` in olive-vines.tsx, nur dort schon immer
 * richtig gemacht) — bei den Kerzen hat das den `y1`-Attributwert minimal
 * verschoben und einen echten Hydration-Mismatch ausgelöst; bei GuV-Heatmap
 * und Kalender bisher nur deshalb nicht sichtbar geworden, weil dort direkt
 * gerundet wird (ein 1-Bit-Unterschied kippt fast nie eine .5-Rundungsgrenze)
 * — derselbe fehlerhafte Ansatz, nur mit Glück bisher folgenlos. 32-Bit-
 * Ganzzahlarithmetik ist dagegen exakt spezifiziert und liefert überall
 * dasselbe Bitmuster.
 */
export function hashNoise(seed: number) {
  let h = Math.imul(seed | 0, 0x27d4eb2d)
  h ^= h >>> 15
  h = Math.imul(h, 0x85ebca6b)
  h ^= h >>> 13
  return ((h >>> 0) / 0xffffffff) * 2 - 1
}
