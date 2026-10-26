-- Athena-Projekte: Chats mit gemeinsamen Anweisungen und Dateien bündeln (wie Projekte in Claude).
--
-- Ein Chat gehört zu hoechstens einem Projekt. Wird das Projekt geloescht, bleiben seine Chats
-- erhalten und werden zu allgemeinen Chats (on delete set null) -- ein Gespraech soll nie an
-- einem aufgeraeumten Projekt haengen und mitverschwinden.
create table if not exists ai_projects (
  id           uuid primary key default gen_random_uuid(),
  user_id      uuid not null references auth.users(id) on delete cascade,
  name         text not null,
  instructions text not null default '',
  pinned       boolean not null default false,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now(),
  constraint ai_projects_name_check check (char_length(btrim(name)) between 1 and 80),
  constraint ai_projects_instructions_check check (char_length(instructions) <= 6000)
);

create index if not exists ai_projects_user_idx on ai_projects (user_id, pinned desc, updated_at desc);

alter table ai_projects enable row level security;

create policy "Users can read own ai projects"   on ai_projects for select using ((select auth.uid()) = user_id);
create policy "Users can insert own ai projects" on ai_projects for insert with check ((select auth.uid()) = user_id);
create policy "Users can update own ai projects" on ai_projects for update using ((select auth.uid()) = user_id);
create policy "Users can delete own ai projects" on ai_projects for delete using ((select auth.uid()) = user_id);

alter table ai_conversations
  add column if not exists project_id uuid references ai_projects(id) on delete set null;

create index if not exists ai_conversations_project_idx on ai_conversations (project_id) where project_id is not null;
