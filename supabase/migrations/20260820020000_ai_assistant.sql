-- ─────────────────────────────────────────────────────────────────────────────
-- AI-Assistent: Konversationen, Nachrichten, Tool-Aufruf-Log und proaktive
-- Hinweise. Jede Tabelle trägt user_id direkt (nicht nur über einen Join zur
-- Elterntabelle) und bekommt von der ersten Zeile an eine echte RLS-Policy —
-- siehe 20260811130000_lebenshaltungskosten_user_id.sql /
-- 20260811130001_lebenshaltungskosten_rls_owner_scoped.sql für den Fehler
-- (fehlendes user_id, offene Policy), der hier nicht wiederholt werden soll.
-- ─────────────────────────────────────────────────────────────────────────────

-- ── ai_conversations ─────────────────────────────────────────────────────────
create table if not exists ai_conversations (
  id         uuid        primary key default gen_random_uuid(),
  user_id    uuid        not null references auth.users(id) on delete cascade,
  title      text,
  created_at timestamptz not null default now()
);

create index if not exists ai_conversations_user_created_idx
  on ai_conversations (user_id, created_at desc);

alter table ai_conversations enable row level security;

create policy "Users can read own conversations"
  on ai_conversations for select
  using (auth.uid() = user_id);

create policy "Users can insert own conversations"
  on ai_conversations for insert
  with check (auth.uid() = user_id);

create policy "Users can update own conversations"
  on ai_conversations for update
  using (auth.uid() = user_id);

create policy "Users can delete own conversations"
  on ai_conversations for delete
  using (auth.uid() = user_id);


-- ── ai_messages ──────────────────────────────────────────────────────────────
-- content bleibt jsonb (Anthropic Content-Block-Format, mehrteilig: Text- und
-- Tool-Use-Blöcke). content_text ist die von der Anwendung beim Schreiben
-- separat mitgegebene reine Textfassung (nur die Text-Blöcke), content_tsv
-- + der GIN-Index sind jetzt schon da, auch wenn noch keine Freitextsuche
-- darüber existiert — eine tsvector-Spalte nachträglich auf eine bereits
-- befüllte Tabelle zu ziehen bedeutet einen vollen Table-Rewrite, das jetzt
-- mitzunehmen kostet nichts.
create table if not exists ai_messages (
  id              uuid        primary key default gen_random_uuid(),
  user_id         uuid        not null references auth.users(id) on delete cascade,
  conversation_id uuid        not null references ai_conversations(id) on delete cascade,
  role            text        not null check (role in ('user', 'assistant', 'tool')),
  content         jsonb       not null,
  content_text    text,
  content_tsv     tsvector    generated always as (to_tsvector('german', coalesce(content_text, ''))) stored,
  tool_calls      jsonb,
  created_at      timestamptz not null default now()
);

create index if not exists ai_messages_conversation_created_idx
  on ai_messages (conversation_id, created_at);

create index if not exists ai_messages_content_tsv_idx
  on ai_messages using gin (content_tsv);

alter table ai_messages enable row level security;

create policy "Users can read own messages"
  on ai_messages for select
  using (auth.uid() = user_id);

create policy "Users can insert own messages"
  on ai_messages for insert
  with check (auth.uid() = user_id);

create policy "Users can update own messages"
  on ai_messages for update
  using (auth.uid() = user_id);

create policy "Users can delete own messages"
  on ai_messages for delete
  using (auth.uid() = user_id);


-- ── ai_tool_calls ────────────────────────────────────────────────────────────
-- Ein Log-Eintrag pro Werkzeugaufruf des Agenten — Grundlage für Audit
-- ("was hat der Agent gesehen/getan") und die Tool-Trace-Anzeige im Chat
-- (siehe .claude/plans/glimmering-wobbling-hejlsberg.md, Phase 1).
create table if not exists ai_tool_calls (
  id              uuid        primary key default gen_random_uuid(),
  user_id         uuid        not null references auth.users(id) on delete cascade,
  conversation_id uuid        not null references ai_conversations(id) on delete cascade,
  message_id      uuid        not null references ai_messages(id) on delete cascade,
  tool_name       text        not null,
  input           jsonb,
  output_summary  text,
  is_error        boolean     not null default false,
  duration_ms     integer,
  created_at      timestamptz not null default now()
);

create index if not exists ai_tool_calls_message_idx
  on ai_tool_calls (message_id);

create index if not exists ai_tool_calls_conversation_idx
  on ai_tool_calls (conversation_id, created_at);

alter table ai_tool_calls enable row level security;

create policy "Users can read own tool calls"
  on ai_tool_calls for select
  using (auth.uid() = user_id);

create policy "Users can insert own tool calls"
  on ai_tool_calls for insert
  with check (auth.uid() = user_id);

create policy "Users can update own tool calls"
  on ai_tool_calls for update
  using (auth.uid() = user_id);

create policy "Users can delete own tool calls"
  on ai_tool_calls for delete
  using (auth.uid() = user_id);


-- ── insights ─────────────────────────────────────────────────────────────────
-- Proaktive Hinweise (Phase 3) — vom Cron-Job generiert. WICHTIG: Cron-Routen
-- laufen typischerweise mit dem Service-Role-Key, der RLS umgeht. Die Policy
-- hier schützt Nutzer beim Lesen im UI, ersetzt aber NICHT die Pflicht, im
-- Generierungs-Code selbst strikt pro user_id zu iterieren und einzufügen —
-- siehe Plan-Dokument, Phase 3, "Kritischer Sicherheitspunkt".
create table if not exists insights (
  id           uuid        primary key default gen_random_uuid(),
  user_id      uuid        not null references auth.users(id) on delete cascade,
  type         text        not null,
  severity     text        not null default 'info' check (severity in ('info', 'warning', 'critical')),
  title        text        not null,
  body         text,
  payload      jsonb,
  dismissed_at timestamptz,
  created_at   timestamptz not null default now()
);

create index if not exists insights_user_active_idx
  on insights (user_id, created_at desc)
  where dismissed_at is null;

alter table insights enable row level security;

create policy "Users can read own insights"
  on insights for select
  using (auth.uid() = user_id);

create policy "Users can insert own insights"
  on insights for insert
  with check (auth.uid() = user_id);

create policy "Users can update own insights"
  on insights for update
  using (auth.uid() = user_id);

create policy "Users can delete own insights"
  on insights for delete
  using (auth.uid() = user_id);
