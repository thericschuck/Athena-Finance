# CLAUDE.md – athena-finance

> Lies zuerst: `C:\Users\eschu\Desktop\Unternehmensstruktur\CLAUDE.md` für globalen Kontext.

---

## Projekt-Überblick

**athena-finance** ist eine private Finanz-/Investing-Webapp von Eric Schuck.
Domain: athena-finance.de | E-Mail: eric@athena-finance.de

---

## Tech Stack

- **Framework:** Next.js (App Router)
- **Sprache:** TypeScript
- **Styling:** Tailwind CSS
- **Komponenten:** shadcn/ui (`components.json` vorhanden)
- **Datenbank/Auth:** Supabase
- **Deployment:** Vercel (`vercel.json`)
- **Package Manager:** npm

---

## Projektstruktur

```
athena-finance/
├── src/           → Quellcode (App Router: src/app/)
├── supabase/      → Supabase-Konfiguration, Migrations
├── public/        → Statische Assets
├── components.json → shadcn/ui Konfiguration
└── next.config.ts
```

---

## Relevantes Masterclass-Wissen

Für Kontext zu Investing-Konzepten, die in dieser App umgesetzt werden:
- `Masterclass/05_Investing/` → Vollständiges Investing-Framework
  - `15_42Macro_GRID.md` → GRID-System
  - `16_OnChain.md` → On-Chain Daten
  - `19_Systemisierung.md` → Entscheidungs-Framework
  - `20_Algo_Strategien.md` → Algo-Strategien

---

## Arbeitsregeln

- TypeScript strict – keine `any` Types ohne Begründung
- Supabase Row Level Security (RLS) beachten
- shadcn/ui Komponenten bevorzugen (nicht neu erfinden)
- Vercel Deployment: `vercel.json` nicht ohne Rückfrage ändern
- `athena-finance(old)` im Nachbarordner = veraltete Version, nicht anfassen

## graphify – Knowledge Graph (Token-Effizienz)

Dieses Projekt hat einen Graphify Knowledge Graph unter `graphify-out/`.

### PFLICHT: Zu Beginn jeder Konversation

**Lies immer zuerst `graphify-out/GRAPH_REPORT.md`** bevor du einzelne Dateien öffnest.
Der Graph gibt dir Architektur, God Nodes und Community-Struktur auf einen Blick — das spart 100–200x Tokens gegenüber blindem File-Lesen.

Workflow:
1. `graphify-out/GRAPH_REPORT.md` lesen → God Nodes und Communities verstehen
2. Erst dann gezielt einzelne Dateien öffnen, die für die Aufgabe relevant sind
3. Niemals das gesamte `src/` blind durchsuchen — Graph zuerst!

### Weitere Regeln
- Für gezielte Fragen: `python -m graphify query "deine Frage"` in `graphify-out/graph.json`
- Nach Code-Änderungen Graph aktualisieren: `python -m graphify . --update`
- Graph neu aufbauen bei großen Änderungen: `/graphify .`

<!-- code-review-graph MCP tools -->
## MCP Tools: code-review-graph

**IMPORTANT: This project has a knowledge graph. ALWAYS use the
code-review-graph MCP tools BEFORE using Grep/Glob/Read to explore
the codebase.** The graph is faster, cheaper (fewer tokens), and gives
you structural context (callers, dependents, test coverage) that file
scanning cannot.

### When to use graph tools FIRST

- **Exploring code**: `semantic_search_nodes` or `query_graph` instead of Grep
- **Understanding impact**: `get_impact_radius` instead of manually tracing imports
- **Code review**: `detect_changes` + `get_review_context` instead of reading entire files
- **Finding relationships**: `query_graph` with callers_of/callees_of/imports_of/tests_for
- **Architecture questions**: `get_architecture_overview` + `list_communities`

Fall back to Grep/Glob/Read **only** when the graph doesn't cover what you need.

### Key Tools

| Tool | Use when |
|------|----------|
| `detect_changes` | Reviewing code changes — gives risk-scored analysis |
| `get_review_context` | Need source snippets for review — token-efficient |
| `get_impact_radius` | Understanding blast radius of a change |
| `get_affected_flows` | Finding which execution paths are impacted |
| `query_graph` | Tracing callers, callees, imports, tests, dependencies |
| `semantic_search_nodes` | Finding functions/classes by name or keyword |
| `get_architecture_overview` | Understanding high-level codebase structure |
| `refactor_tool` | Planning renames, finding dead code |

### Workflow

1. The graph auto-updates on file changes (via hooks).
2. Use `detect_changes` for code review.
3. Use `get_affected_flows` to understand impact.
4. Use `query_graph` pattern="tests_for" to check coverage.
