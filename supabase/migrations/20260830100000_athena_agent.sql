-- ─────────────────────────────────────────────────────────────────────────────
-- Athena (vormals "Assistent") — Ausbau zum agentischen System.
--
-- Baut auf 20260820020000_ai_assistant.sql auf (ai_conversations / ai_messages /
-- ai_tool_calls / insights bleiben unverändert bestehen) und ergänzt die vier
-- Bausteine, die dem bisherigen Chat fehlten:
--
--   ai_memories        Kontext-Speicher: Fakten über die Nutzerin/den Nutzer,
--                      die über eine einzelne Session hinaus gelten.
--   ai_knowledge       Wissensbasis: kuratierte Dokumente/Notizen, die Athena
--                      per Volltextsuche durchsuchen kann.
--   ai_logs            System-Log: ein Eintrag pro nennenswertem Ereignis
--                      (Lauf gestartet, Schritt beendet, Fehler, Kosten).
--   ai_pending_actions Schreibende Aktionen, die Athena VORSCHLÄGT — ausgeführt
--                      wird erst nach ausdrücklicher Bestätigung im UI.
--
-- Jede Tabelle trägt user_id direkt und bekommt von der ersten Zeile an eine
-- owner-scoped RLS-Policy — gleiche Linie wie 20260811130001.
-- ─────────────────────────────────────────────────────────────────────────────


-- ── ai_conversations: Sessions wiederauffindbar machen ───────────────────────
-- Bisher wurde jede Konversation zwar angelegt, aber nie wieder geladen: es gab
-- weder Titel noch "zuletzt benutzt". Beides kommt hier dazu.
alter table ai_conversations add column if not exists updated_at  timestamptz not null default now();
alter table ai_conversations add column if not exists archived_at timestamptz;
alter table ai_conversations add column if not exists pinned      boolean     not null default false;

create index if not exists ai_conversations_user_updated_idx
  on ai_conversations (user_id, updated_at desc)
  where archived_at is null;

-- Jede neue Nachricht hebt updated_at der Konversation an — dadurch sortiert
-- die Session-Liste im UI nach echter Aktivität statt nach Anlagedatum.
create or replace function touch_ai_conversation()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  update ai_conversations
     set updated_at = now()
   where id = new.conversation_id;
  return new;
end;
$$;

drop trigger if exists ai_messages_touch_conversation on ai_messages;
create trigger ai_messages_touch_conversation
  after insert on ai_messages
  for each row execute function touch_ai_conversation();


-- ── ai_messages: Modell- und Kostentransparenz ───────────────────────────────
-- Ohne diese Spalten lässt sich im System-Log nicht beantworten, welches Modell
-- geantwortet hat und was der Lauf gekostet hat.
alter table ai_messages add column if not exists model         text;
alter table ai_messages add column if not exists usage         jsonb;
alter table ai_messages add column if not exists finish_reason text;
alter table ai_messages add column if not exists duration_ms   integer;


-- ── ai_memories ──────────────────────────────────────────────────────────────
-- Kontext-Speicher. `key` ist ein kurzer, stabiler Slug ("sparziel-umzug"),
-- damit Athena einen bestehenden Fakt aktualisieren statt duplizieren kann —
-- das unique-Constraint auf (user_id, key) macht ein Upsert möglich.
-- `source` unterscheidet, ob der Eintrag von Athena selbst stammt oder von der
-- Nutzerin/dem Nutzer im UI angelegt wurde; von Hand angelegte oder editierte
-- Einträge sind damit im UI als "meine Vorgabe" erkennbar.
create table if not exists ai_memories (
  id           uuid        primary key default gen_random_uuid(),
  user_id      uuid        not null references auth.users(id) on delete cascade,
  key          text        not null,
  content      text        not null,
  category     text        not null default 'general'
                 check (category in ('general', 'preference', 'goal', 'fact', 'constraint')),
  source       text        not null default 'agent' check (source in ('agent', 'user')),
  confidence   real        not null default 1.0 check (confidence >= 0 and confidence <= 1),
  last_used_at timestamptz,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now(),
  content_tsv  tsvector    generated always as (
                 to_tsvector('german', coalesce(key, '') || ' ' || coalesce(content, ''))
               ) stored,
  unique (user_id, key)
);

create index if not exists ai_memories_user_idx     on ai_memories (user_id, updated_at desc);
create index if not exists ai_memories_tsv_idx      on ai_memories using gin (content_tsv);

alter table ai_memories enable row level security;

create policy "Users can read own memories"   on ai_memories for select using (auth.uid() = user_id);
create policy "Users can insert own memories" on ai_memories for insert with check (auth.uid() = user_id);
create policy "Users can update own memories" on ai_memories for update using (auth.uid() = user_id);
create policy "Users can delete own memories" on ai_memories for delete using (auth.uid() = user_id);


-- ── ai_knowledge ─────────────────────────────────────────────────────────────
-- Wissensbasis: längere, kuratierte Texte (eigene Anlageregeln, Notizen aus
-- 02-Wissen/Investing, recherchierte Zusammenfassungen). Bewusst Postgres-
-- Volltextsuche statt pgvector: bei der hier realistischen Größenordnung
-- (Dutzende bis wenige hundert Dokumente) liefert `german`-FTS gute Treffer
-- ohne Embedding-Pipeline, Kosten und Re-Index-Job. Ein Umstieg auf pgvector
-- bliebe später möglich, ohne die Tool-Schnittstelle (searchKnowledge) zu ändern.
create table if not exists ai_knowledge (
  id          uuid        primary key default gen_random_uuid(),
  user_id     uuid        not null references auth.users(id) on delete cascade,
  title       text        not null,
  content     text        not null,
  tags        text[]      not null default '{}',
  source_url  text,
  -- 'user'    = selbst angelegt
  -- 'agent'   = von Athena aus einer Recherche gespeichert
  -- 'import'  = aus einer Datei/externen Quelle übernommen
  source      text        not null default 'user' check (source in ('user', 'agent', 'import')),
  pinned      boolean     not null default false,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  content_tsv tsvector    generated always as (
                to_tsvector('german', coalesce(title, '') || ' ' || coalesce(content, ''))
              ) stored
);

create index if not exists ai_knowledge_user_idx on ai_knowledge (user_id, updated_at desc);
create index if not exists ai_knowledge_tsv_idx  on ai_knowledge using gin (content_tsv);
create index if not exists ai_knowledge_tags_idx on ai_knowledge using gin (tags);

alter table ai_knowledge enable row level security;

create policy "Users can read own knowledge"   on ai_knowledge for select using (auth.uid() = user_id);
create policy "Users can insert own knowledge" on ai_knowledge for insert with check (auth.uid() = user_id);
create policy "Users can update own knowledge" on ai_knowledge for update using (auth.uid() = user_id);
create policy "Users can delete own knowledge" on ai_knowledge for delete using (auth.uid() = user_id);


-- ── ai_logs ──────────────────────────────────────────────────────────────────
-- System-Log. Absichtlich getrennt von ai_tool_calls: dort steht, WAS ein
-- Werkzeug getan hat, hier steht, wie der Lauf als Ganzes verlief (Start, Ende,
-- Abbruch, Limit erreicht, Modellfehler) — inklusive der Fälle, in denen gar
-- kein Werkzeug lief. conversation_id ist bewusst nullable: Hintergrundläufe
-- (Cron/Insights) gehören zu keiner Konversation.
create table if not exists ai_logs (
  id              uuid        primary key default gen_random_uuid(),
  user_id         uuid        not null references auth.users(id) on delete cascade,
  conversation_id uuid        references ai_conversations(id) on delete set null,
  level           text        not null default 'info' check (level in ('debug', 'info', 'warn', 'error')),
  event           text        not null,
  message         text,
  meta            jsonb,
  duration_ms     integer,
  created_at      timestamptz not null default now()
);

create index if not exists ai_logs_user_created_idx on ai_logs (user_id, created_at desc);
create index if not exists ai_logs_level_idx        on ai_logs (user_id, level, created_at desc);
create index if not exists ai_logs_conversation_idx on ai_logs (conversation_id, created_at);

alter table ai_logs enable row level security;

create policy "Users can read own logs"   on ai_logs for select using (auth.uid() = user_id);
create policy "Users can insert own logs" on ai_logs for insert with check (auth.uid() = user_id);
create policy "Users can delete own logs" on ai_logs for delete using (auth.uid() = user_id);


-- ── ai_pending_actions ───────────────────────────────────────────────────────
-- Schreibende Aktionen laufen NIE direkt aus dem Modellaufruf heraus. Athenas
-- Werkzeug legt hier nur eine Zeile mit status='pending' an; ausgeführt wird
-- sie ausschließlich durch eine Bestätigung im UI (siehe
-- src/app/(dashboard)/assistant/actions.ts). Damit kann weder ein Modellfehler
-- noch ein per Prompt-Injection eingeschleuster Text unbemerkt echte
-- Finanzdaten verändern.
--
-- `input` ist der rohe Werkzeug-Input, `summary` die für Menschen lesbare
-- Fassung, die im Bestätigungs-Dialog steht.
create table if not exists ai_pending_actions (
  id              uuid        primary key default gen_random_uuid(),
  user_id         uuid        not null references auth.users(id) on delete cascade,
  conversation_id uuid        references ai_conversations(id) on delete cascade,
  message_id      uuid        references ai_messages(id) on delete set null,
  action          text        not null,
  input           jsonb       not null,
  summary         text        not null,
  status          text        not null default 'pending'
                    check (status in ('pending', 'executed', 'rejected', 'failed', 'expired')),
  result          jsonb,
  error           text,
  created_at      timestamptz not null default now(),
  resolved_at     timestamptz
);

create index if not exists ai_pending_actions_user_status_idx
  on ai_pending_actions (user_id, status, created_at desc);
create index if not exists ai_pending_actions_conversation_idx
  on ai_pending_actions (conversation_id, created_at);

alter table ai_pending_actions enable row level security;

create policy "Users can read own pending actions"   on ai_pending_actions for select using (auth.uid() = user_id);
create policy "Users can insert own pending actions" on ai_pending_actions for insert with check (auth.uid() = user_id);
create policy "Users can update own pending actions" on ai_pending_actions for update using (auth.uid() = user_id);
create policy "Users can delete own pending actions" on ai_pending_actions for delete using (auth.uid() = user_id);


-- ── ai_settings ──────────────────────────────────────────────────────────────
-- Eine Zeile pro Nutzer. Modell/Effort/Web-Recherche sind bewusst konfigurierbar
-- statt hart im Code: ein Lauf mit Web-Recherche und hohem Effort kostet ein
-- Vielfaches eines einfachen Kontostands-Abrufs, und diese Abwägung gehört der
-- Nutzerin/dem Nutzer, nicht dem Code.
create table if not exists ai_settings (
  user_id            uuid        primary key references auth.users(id) on delete cascade,
  model              text        not null default 'claude-opus-5',
  effort             text        not null default 'high' check (effort in ('low', 'medium', 'high', 'xhigh', 'max')),
  web_research       boolean     not null default true,
  memory_enabled     boolean     not null default true,
  auto_memory        boolean     not null default true,
  daily_message_cap  integer     not null default 200 check (daily_message_cap > 0),
  max_steps          integer     not null default 24 check (max_steps between 1 and 60),
  custom_instructions text,
  updated_at         timestamptz not null default now()
);

alter table ai_settings enable row level security;

create policy "Users can read own ai settings"   on ai_settings for select using (auth.uid() = user_id);
create policy "Users can insert own ai settings" on ai_settings for insert with check (auth.uid() = user_id);
create policy "Users can update own ai settings" on ai_settings for update using (auth.uid() = user_id);


-- ── Volltextsuche für Wissensbasis und Speicher ──────────────────────────────
-- Als SQL-Funktionen statt clientseitiger `.textSearch()`-Aufrufe, weil hier
-- Ranking (ts_rank) und ein Fallback auf ILIKE zusammengehören: `websearch_to_
-- tsquery` findet nichts bei Teilwörtern ("Rebalanc"), die im Chat aber
-- ständig vorkommen. Beide Funktionen filtern selbst auf auth.uid() und sind
-- deshalb auch ohne RLS-Umweg sicher aufrufbar.
create or replace function search_ai_knowledge(q text, max_results int default 5)
returns table (id uuid, title text, content text, tags text[], source_url text, rank real)
language sql
stable
security invoker
set search_path = public
as $$
  select k.id, k.title, k.content, k.tags, k.source_url,
         ts_rank(k.content_tsv, websearch_to_tsquery('german', q)) as rank
    from ai_knowledge k
   where k.user_id = auth.uid()
     and (k.content_tsv @@ websearch_to_tsquery('german', q)
          or k.title ilike '%' || q || '%')
   order by k.pinned desc, rank desc, k.updated_at desc
   limit least(max_results, 20);
$$;

create or replace function search_ai_memories(q text, max_results int default 10)
returns table (id uuid, key text, content text, category text, source text, rank real)
language sql
stable
security invoker
set search_path = public
as $$
  select m.id, m.key, m.content, m.category, m.source,
         ts_rank(m.content_tsv, websearch_to_tsquery('german', q)) as rank
    from ai_memories m
   where m.user_id = auth.uid()
     and (m.content_tsv @@ websearch_to_tsquery('german', q)
          or m.key ilike '%' || q || '%'
          or m.content ilike '%' || q || '%')
   order by rank desc, m.updated_at desc
   limit least(max_results, 30);
$$;
