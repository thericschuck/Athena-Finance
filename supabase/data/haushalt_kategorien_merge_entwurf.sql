-- ENTWURF Phase 4 (KEINE Migration, nicht ausfuehren ohne Review und Branch-Test): Maliks Kategorienbaum in den
-- Haushaltsbaum ueberfuehren, sobald Malik per Einladung beigetreten ist.
-- Voraussetzung: 20261028120000_categories_household.sql, Malik ist in household_members, hat ggf. eigene Kategorien
-- (categories.user_id = Malik, household_id = Haushalt dank Trigger bzw. NULL).
--
-- Aufruf (psql / SQL-Editor): vorher setzen
--   set app.household_id = '<uuid>'; set app.malik_id = '<uuid>';
-- Das Skript endet absichtlich mit ROLLBACK; nach Pruefung der Kontrollausgaben ROLLBACK durch COMMIT ersetzen.
--
-- Regeln:
--   - Zuordnung per VOLLSTAENDIGEM PFAD (Wurzel > ... > Name, case-insensitiv, getrimmt) + gleicher Typ
--     (income/expense/neutral). "Gleiche Wurzel + Name" allein waere bei Ebene 3+ mehrdeutig.
--   - Treffer: Maliks Kategorie wird in die Haushaltskategorie GEMERGED (FKs umhaengen, Kategorie loeschen).
--     Ziel = die aelteste/kleinste id der Haushaltskategorien mit diesem Pfad (Eric-Daten haben Vorrang).
--   - Kein Treffer: neuer Ast. Die Kategorie bleibt (user_id = Malik als Ersteller), bekommt household_id; parent_id
--     wird auf die gemergte Eltern-Kategorie umgehaengt, falls der Elternteil gemergt wurde.
--   - 'Schulden' und 'Transfers' (flow_kind in unified_transactions ist namensabhaengig, siehe 20261022120000)
--     duerfen nicht dupliziert werden: Wurzeln dieses Namens werden IMMER auf die Haushaltswurzel gemergt, auch bei
--     abweichendem Typ. Existiert im Haushalt keine, gewinnt Maliks (es gibt dann nur eine). Kontrollabfrage unten.
--   - Steuerattribute: Maliks tax_role/euer_zeile/business_share wandern in category_tax_overrides (user_id = Malik)
--     auf die ZIEL-Kategorie. Eric-Overrides bleiben unangetastet.
--   - budget_monthly, icon, color, sort_order: die Werte der Haushaltskategorie gewinnen; Maliks Budget wird NICHT
--     addiert (Entscheidung offen: Summe vs. Eric-Wert; sonst Kontrollausgabe 1 pruefen).
--   - Offen/Code: gelernte Zuordnungen und Regeln liegen im Code (nicht in Tabellen) und referenzieren Kategorien per
--     Name/ID? Vor Phase 4 pruefen (src/lib/kategorien, Kategorisierung), IDs gemergter Kategorien ggf. mappen.
--   - Weitere Tabellen mit category-aehnlichen Bezuegen OHNE FK (budget_items etc.) vor Ausfuehrung per grep pruefen.
--     FKs auf categories (Live 2026-10-26): categories.parent_id, contracts.category_id, transactions.category_id,
--     bank_transactions.category_id, bank_transactions.ai_category_id.

begin;

create temp table cat_path on commit drop as
with recursive t as (
  select c.id, c.user_id, c.parent_id, c.type, c.name,
         lower(btrim(c.name)) as pfad, c.id as root_id, 0 as depth, array[c.id] as seen
  from public.categories c where c.parent_id is null
  union all
  select c.id, c.user_id, c.parent_id, c.type, c.name,
         t.pfad || ' > ' || lower(btrim(c.name)), t.root_id, t.depth + 1, t.seen || c.id
  from public.categories c join t on c.parent_id = t.id
  where not c.id = any (t.seen)
)
select * from t;

-- Zuordnung Malik -> Haushalt. Ziel: kleinste id unter Haushaltskategorien (nicht Malik) mit gleichem Pfad.
create temp table cat_map on commit drop as
select m.id as malik_id,
       (select min(h.id::text)::uuid
        from cat_path h
        join public.categories hc on hc.id = h.id
        where hc.household_id = current_setting('app.household_id')::uuid
          and h.user_id <> current_setting('app.malik_id')::uuid
          and h.pfad = m.pfad
          and (h.type = m.type or (m.depth = 0 and m.pfad in ('schulden', 'transfers')))) as target_id
from cat_path m
where m.user_id = current_setting('app.malik_id')::uuid;

-- Kontrollausgabe 1: Treffer / neue Aeste
select (target_id is not null) as gemergt, count(*) from cat_map group by 1;

-- Steuer-Overrides von Malik uebernehmen (auf Ziel bzw. eigene Kategorie).
insert into public.category_tax_overrides (category_id, user_id, tax_role, euer_zeile, business_share)
select coalesce(m.target_id, m.malik_id), c.user_id, c.tax_role, c.euer_zeile, c.business_share
from cat_map m join public.categories c on c.id = m.malik_id
where c.tax_role is not null or c.euer_zeile is not null or c.business_share is not null
on conflict (category_id, user_id) do nothing;

-- FKs umhaengen (nur gemergte).
update public.transactions      t set category_id    = m.target_id from cat_map m where t.category_id    = m.malik_id and m.target_id is not null;
update public.bank_transactions t set category_id    = m.target_id from cat_map m where t.category_id    = m.malik_id and m.target_id is not null;
update public.bank_transactions t set ai_category_id = m.target_id from cat_map m where t.ai_category_id = m.malik_id and m.target_id is not null;
update public.contracts         t set category_id    = m.target_id from cat_map m where t.category_id    = m.malik_id and m.target_id is not null;

-- Neue Aeste: Eltern auf gemergte Eltern umhaengen, Haushalt setzen.
update public.categories c
set parent_id = coalesce(pm.target_id, c.parent_id),
    household_id = current_setting('app.household_id')::uuid
from cat_map m
left join cat_map pm on pm.malik_id = (select parent_id from public.categories where id = m.malik_id)
where c.id = m.malik_id and m.target_id is null;

-- Kinder gemergter Kategorien, die selbst NEU sind, haengen jetzt ueber obiges Update an der Haushaltskategorie.
-- Gemergte Malik-Kategorien loeschen (keine Referenzen mehr; parent_id-FK ist ON DELETE SET NULL, daher vorher umhaengen, s.o.).
delete from public.categories c using cat_map m where c.id = m.malik_id and m.target_id is not null;

-- Kontrollausgabe 2 (muss je 0 Zeilen liefern):
-- a) doppelte Pflicht-Wurzeln im Haushalt
select name, count(*) from public.categories
where household_id = current_setting('app.household_id')::uuid and parent_id is null and lower(name) in ('schulden', 'transfers')
group by name having count(*) > 1;
-- b) Referenzen auf geloeschte Kategorien (FK verhindert das, SET NULL waere der stille Fehler) -> NULL-Anstieg pruefen
select count(*) as ohne_kategorie from public.bank_transactions where category_id is null;
-- c) Pfad-Duplikate im Haushaltsbaum
with recursive t as (
  select id, lower(btrim(name)) pfad, type from public.categories
  where household_id = current_setting('app.household_id')::uuid and parent_id is null
  union all
  select c.id, t.pfad || ' > ' || lower(btrim(c.name)), c.type from public.categories c join t on c.parent_id = t.id
) select pfad, type, count(*) from t group by pfad, type having count(*) > 1;

rollback; -- nach Pruefung durch COMMIT ersetzen
