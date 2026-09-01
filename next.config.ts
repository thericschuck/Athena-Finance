import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  /**
   * Banking war bis vor Kurzem ein eigener Hauptbereich. Der Sync sitzt jetzt im Kopf von
   * Finance/Konten, die Auswertung als Unterpunkt von Analyse — die alten URLs stehen aber
   * in Lesezeichen, im Browserverlauf und potenziell in Antworten von Athena. Weiterleiten
   * statt 404: eine tote URL erklärt niemandem, wohin die Seite gewandert ist.
   *
   * `permanent: false` (307), nicht 308: eine 308 brennt sich dauerhaft in den Browser-Cache
   * ein und wäre nur schwer wieder loszuwerden, falls die Struktur noch einmal wandert.
   */
  async redirects() {
    return [
      { source: '/bank', destination: '/finance/accounts', permanent: false },
      { source: '/bank/auswertung', destination: '/analyse/banking', permanent: false },
      // Dasselbe für den zweiten Aufräum-Durchgang: „Historie" ist zum Analyse-
      // Unterpunkt „Verlauf" geworden, „Fixkosten" zu Finance/Budget (der Name
      // kollidierte mit den gebuchten Fixkosten auf der Vertragsseite).
      { source: '/history', destination: '/analyse/verlauf', permanent: false },
      { source: '/lebenshaltungskosten', destination: '/finance/budget', permanent: false },
    ]
  },
};

export default nextConfig;
