# SEO — Stand und Texte zur Prüfung

> Stand: 06.09.2026 · Domain: `athena-finance.de`
> Verifiziert über `tsc`, ESLint, vollen `next build` und den Inhalt der erzeugten
> `robots.txt` / `sitemap.xml`. **Nicht im Browser angesehen.**

---

## 1. Zum Prüfen: Texte für Google

Titel unter 60, Beschreibungen unter 160 Zeichen. Darüber schneidet Google ab — und
abgeschnitten wird immer das Ende, also genau der Teil, der zum Klicken bewegen soll.

### Startseite `/`

| Feld | Zeichen | Text |
|---|---:|---|
| **Title** | 59 | `Athena Finance – Finanzübersicht für Konten, Depot & Krypto` |
| **Description** | 142 | `Konten, Depot, Verträge und Krypto in einer einzigen Ansicht. Jede Zahl stammt aus einer echten Buchung — keine Schätzung, keine Hochrechnung.` |
| **OG / Twitter Title** | 56 | `Athena Finance – alles, was dir gehört, in einer Ansicht` |
| **OG / Twitter Description** | 142 | wie Description |

Der OG-Titel ist bewusst ein anderer als der Google-Titel: In der Suche konkurriert man
mit neun weiteren Treffern und braucht die Keywords vorne. In einer geteilten Vorschau
(WhatsApp, Slack, LinkedIn) steht der Link allein — dort trägt der Satz, nicht das
Stichwort.

### `/interesse`

| Feld | Zeichen | Text |
|---|---:|---|
| **Title** | 49 | `Warteliste – Athena Finance beim Aufbau begleiten` |
| **Description** | 138 | `Athena Finance entsteht gerade: Konten, Depot und Verträge in einer Ansicht. Trag dich ein und erfahre, sobald sich beim Zugang etwas tut.` |
| **OG Title** | 33 | `Am Bau teilhaben – Athena Finance` |
| **OG Description** | 131 | `Konten, Depot und Verträge in einer Ansicht — noch im Bau. Trag dich ein, wenn du den Weg dorthin mitverfolgen willst.` |

### Fallback (Root-Layout)

Greift für jede Seite ohne eigene Angabe:

| Feld | Text |
|---|---|
| **Title-Template** | `%s · Athena Finance` |
| **Title-Default** | `Athena Finance` |
| **Description** | `Finanzübersicht: Konten, Depots, Verträge und Strategien an einem Ort.` |

---

## 2. Zum Prüfen: Überschriften-Gliederung

```
h1  Finanzen im Griff. Vollständig überblickt.
│
├── h2  Jede Dimension deiner Finanzen. Lückenlos erfasst.    (I · Das Instrumentarium)
│   └── h3  je Funktionskarte
│
├── h2  Vier Grundsätze. Ein Fundament.                       (II · Die Säulen)
│   └── h3  Überblick · Präzision · Regeln · Historie
│
├── h2  Ausgaben in einem ganz neuen Licht.                   (III · Die Analyse)
│
├── h2  In drei Schritten zum vollen Überblick.               (IV · Der Weg)
│   └── h3  Anmelden · Daten einrichten · Überblick behalten
│
├── h2  Weitere Eigenschaften                          ← NEU, nur für Screenreader
│   └── h3  Auto-Buchungen · Datenschutz · Überall verfügbar · Echtzeitdaten
│
└── h2  Klarheit über alles, was dir gehört.                  (Abschluss)
```

`/interesse` separat:

```
h1  Sieh dem Bau zu. Und schieb mit an.
└── h2  Kein Zugang, kein Datum. · Höchstens eine E-Mail. · Jederzeit wieder raus.
```

### Was daran korrigiert wurde

Die vier Kacheln von „Weitere Eigenschaften" waren `h4` in einem Abschnitt **ohne jede
Überschrift** — sie hingen also direkt unter dem `h1`, ohne `h2` und `h3` dazwischen. Ein
Sprung in der Ebenenfolge ist für Screenreader-Nutzer ein Orientierungsverlust, und
Suchmaschinen lesen die Gliederung als Aussage darüber, wie die Seite aufgebaut ist.

Gestalterisch braucht der Streifen keine sichtbare Überschrift — er ist der ruhige
Ausklang nach vier betitelten Kapiteln. Deshalb `sr-only`: unsichtbar, aber in der
Gliederung vorhanden. Die Kacheln sind jetzt `h3`.

### Offener Vorschlag: der `h1`

`Finanzen im Griff. Vollständig überblickt.` trägt kein starkes Keyword. Der Kicker
darüber sagt „Finanzen im Überblick", der Title trägt die Stichwörter — den Markenton der
Seite umzuschreiben ist aber eine Design- und keine SEO-Entscheidung, deshalb habe ich ihn
gelassen. Die keyword-nähere Variante wäre:

> `Finanzen im Griff. Konten, Depot und Verträge vollständig überblickt.`

---

## 3. Was implementiert wurde

### Infrastruktur, die vorher komplett gefehlt hat

| Datei | Wirkung |
|---|---|
| `src/app/robots.ts` | Es gab **keine robots.txt**. Suchmaschinen liefen durch die ganze App und landeten bei jedem geschützten Pfad auf `/login` — verbranntes Crawl-Budget und Rauschen in der Search Console („Seite mit Weiterleitung"), das echte Fehler schwerer auffindbar macht. Jetzt: alles erlaubt außer 12 App-Präfixen, plus Sitemap-Verweis. |
| `src/app/sitemap.ts` | Es gab **keine sitemap.xml**. Jetzt `/` und `/interesse` mit `lastModified` zur Bauzeit. Bewusst nur Seiten, die auch auf `index` stehen — eine Sitemap, die eine `noindex`-Seite anmeldet, produziert nur einen Fehlerbericht. |
| `src/lib/seo.ts` | Domain, Name, Beschreibung, öffentliche und private Pfade an einer Stelle. Eine Domain, die in vier Dateien getrennt notiert ist, steht irgendwann in dreien richtig. |
| `src/components/seo/json-ld.tsx` | Server-Komponente, damit die strukturierten Daten schon im ausgelieferten HTML stehen. Per Client-JavaScript nachgereicht würde Google sie lesen (er rendert), Slack/WhatsApp/LinkedIn aber nicht. |

**Erzeugte `robots.txt`:**

```
User-Agent: *
Allow: /
Disallow: /api/ /analyse /assistant /crypto /dashboard /depot
Disallow: /finance /inventar /investing /login /settings /strategy

Host: https://athena-finance.de
Sitemap: https://athena-finance.de/sitemap.xml
```

### Metadaten

- **`max-image-preview: large` + `max-snippet: -1`** für den Google-Bot. Ohne das bekommt
  eine unbekannte Domain nur eine Miniatur-Vorschau und einen gekürzten Textausschnitt.
  Das ist der größte Einzelhebel im ganzen Paket.
- `authors` / `creator` / `publisher` gesetzt.
- `formatDetection: { telephone: false }` — iOS Safari verlinkt sonst Zahlenkolonnen im
  Dashboard-Mockup eigenmächtig als Telefonnummern und färbt sie blau.
- Canonical-URLs auf beiden öffentlichen Seiten.
- **Impressum und Datenschutz:** `index: false` bleibt, aber **`follow: true`** statt
  vorher `false`. Mit `follow: false` folgt keine Suchmaschine ihren Rücklinks zur
  Startseite, und die Verknüpfung der Seiten untereinander bleibt unvollständig.
- **`/interesse` steht jetzt auf `index`.** Die alte Begründung fürs Verstecken (Impressum
  und Datenschutz sind Entwürfe) trug nicht mehr: die Startseite ist längst indexierbar,
  die Domain also ohnehin auffindbar. Diese eine Unterseite zusätzlich zu verstecken
  schützt vor nichts und kostet die einzige Seite mit eigenem, indexierbarem Inhalt.
  Der Entwurfs-Status bleibt ein Problem — siehe Abschnitt 5.

### Strukturierte Daten (JSON-LD)

Auf `/` als `@graph`, damit sich die drei Objekte über `@id` aufeinander beziehen, statt
dieselbe Person dreimal zu beschreiben:

- **`WebSite`** — Name, URL, Sprache, Herausgeber
- **`Person`** — Eric Schuck als Urheber
- **`SoftwareApplication`** — `applicationCategory: FinanceApplication`,
  `operatingSystem: Web`, plus `featureList`:
  Konten und Kontostände · Depot und Krypto-Portfolio mit Verlauf · Verträge, Fixkosten
  und Sparziele · Ausgaben-Analyse (Heatmap, Geldfluss, Cashflow-Kalender) ·
  Steuerberechnung nach § 32a EStG

Auf `/interesse`: **`BreadcrumbList`** → im Suchtreffer steht `athena-finance.de ›
Warteliste` statt der nackten URL.

---

## 4. Bewusst weggelassen

| Nicht gemacht | Warum |
|---|---|
| `aggregateRating` | Es gibt keine Bewertungen. |
| `offers` / Preis | Es gibt keinen Verkauf. |
| `FAQPage` | Es gibt keinen FAQ-Bereich auf der Seite. |
| Meta-Keywords | Google ignoriert sie seit 2009. |

Die ersten drei erzeugen kurzfristig auffälligere Suchtreffer und sind der schnellste Weg
zu einer manuellen Maßnahme wegen „strukturierter Daten, die nicht dem Inhalt der Seite
entsprechen".

---

## 5. Offen — kann ich nicht erledigen

### ⚠️ Das Impressum ist rechtlich unvollständig

In `src/app/impressum/page.tsx` steht im Code-Kommentar:

> *Entwurf — die Anschrift fehlt noch. Ohne sie erfüllt diese Seite § 5 DDG nicht; das MUSS
> ergänzt werden, bevor die Domain aktiv beworben oder für die Öffentlichkeit freigegeben
> wird.*

Die Startseite ist bereits indexierbar, die Domain also auffindbar. Das ist kein SEO-,
sondern ein Abmahnrisiko — und für Googles E-E-A-T-Bewertung zählt eine vollständige
Anbieterkennzeichnung ebenfalls. **Vor allem anderen nachtragen.**

Dasselbe gilt für die Datenschutzerklärung: sie beschreibt aktuell nur die Interesse-Liste
und muss vor echtem Betrieb mit Zugang für Dritte erweitert und fachanwaltlich geprüft
werden (siehe Kommentar in `src/app/datenschutz/page.tsx`).

### Google Search Console

Geht nur über deinen Account:

1. Domain verifizieren (DNS-TXT oder HTML-Tag)
2. Sitemap einreichen: `https://athena-finance.de/sitemap.xml`
3. Indexierung für `/` und `/interesse` anfordern
4. Nach ein paar Tagen: Abdeckungsbericht auf Fehler prüfen

Falls du den HTML-Weg wählst — sag mir den Token, dann trage ich
`verification: { google: '…' }` ins Root-Layout ein.

### Was danach den größten Unterschied macht

SEO-Technik ist ab hier ausgereizt. Was fehlt, ist nichts, was sich im Code lösen lässt:

- **Verweise von anderen Domains.** Eine neue Domain ohne einen einzigen Rücklink wird
  langsam und zurückhaltend indexiert. Ein Link von `ericschuck.dev` und von
  `schuck-webdesign.de` wäre der naheliegendste Anfang.
- **Inhalt, der eine Frage beantwortet.** Die Seite beschreibt aktuell ein Produkt. Für
  Suchanfragen wie „Konten und Depot in einer Übersicht" oder „Vermögensübersicht selbst
  bauen" gibt es keinen Text, der darauf antwortet. Ein oder zwei ehrliche Beiträge über
  den Bau (etwa: warum Bankdaten per FinTS und nicht über einen Aggregator) wären
  wirksamer als jede weitere Meta-Angabe.

---

## 6. Checkliste

- [ ] Anschrift im Impressum ergänzen (**blockiert alles andere**)
- [ ] Datenschutzerklärung prüfen lassen
- [ ] Google Search Console: Domain verifizieren
- [ ] Sitemap einreichen
- [ ] Indexierung anfordern
- [ ] Entscheiden: `h1` umformulieren, ja oder nein
- [ ] Rücklinke von den eigenen anderen Domains setzen
- [ ] Optional: Verifizierungs-Token an mich, dann trage ich ihn ein
