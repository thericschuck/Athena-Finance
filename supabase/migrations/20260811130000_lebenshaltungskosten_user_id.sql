-- ─────────────────────────────────────────────────────────────────────────────
-- Security fix: budget_categories/budget_items/income_targets hatten keine
-- user_id (siehe 20260427000000_lebenshaltungskosten.sql, Kommentar dort:
-- "no user_id — single-user, allow all authenticated"). Die dazugehörige
-- RLS-Policy (20260427000001_lebenshaltungskosten_rls.sql) erlaubte dadurch
-- JEDEM authentifizierten Nutzer vollen Lese-/Schreibzugriff auf ALLE Zeilen,
-- nicht nur auf die eigenen — sicher nur, solange garantiert nie ein zweiter
-- Nutzer existiert. Diese Migration rüstet echte Besitzer-Zuordnung nach.
--
-- Backfill: es lagen zum Zeitpunkt dieser Migration DREI Accounts in
-- auth.users (die App war fälschlich als "single-user" angenommen worden,
-- siehe RLS-Fix). Owner der bestehenden Daten ist explizit per E-Mail
-- bestimmt statt per "ältester Account" (das war beim ersten Anwenden
-- dieser Migration eine falsche Annahme und wurde per Hand korrigiert) —
-- thericschuck@gmail.com ist Erics tatsächlicher Account, nicht eschuck58@gmail.com.
-- ─────────────────────────────────────────────────────────────────────────────

alter table budget_categories add column if not exists user_id uuid references auth.users(id) on delete cascade;
alter table budget_items      add column if not exists user_id uuid references auth.users(id) on delete cascade;
alter table income_targets    add column if not exists user_id uuid references auth.users(id) on delete cascade;

update budget_categories
   set user_id = (select id from auth.users where email = 'thericschuck@gmail.com')
 where user_id is null;

update income_targets
   set user_id = (select id from auth.users where email = 'thericschuck@gmail.com')
 where user_id is null;

-- budget_items übernimmt den Owner von der eigenen Kategorie statt erneut vom
-- ältesten Nutzer — bleibt so auch korrekt, sobald es mehrere Nutzer gibt.
update budget_items bi
   set user_id = bc.user_id
  from budget_categories bc
 where bi.category_id = bc.id
   and bi.user_id is null;

alter table budget_categories alter column user_id set not null;
alter table budget_items      alter column user_id set not null;
alter table income_targets    alter column user_id set not null;

create index if not exists budget_categories_user_idx on budget_categories (user_id);
create index if not exists budget_items_user_idx      on budget_items (user_id);
create index if not exists income_targets_user_idx    on income_targets (user_id);
