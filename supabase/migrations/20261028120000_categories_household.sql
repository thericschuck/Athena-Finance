-- HAUSHALT PHASE 2: Kategorienbaum pro Haushalt (Struktur + Backfill), Steuer-Override-Tabelle, Haushalts-RLS
-- auf categories.
-- Plan: docs/haushalt-multiuser.md (Entscheidung 3, Abschnitt 5 "Kategorien-Migration", Phase 2).
-- Voraussetzung: 20261027100000 (households, household_members, is_household_member, household_peer_ids),
-- 20261027120000 (Haushalt 'Haushalt Schuck' mit Eric als owner).
--
-- Entscheidung (Eric: "ja zusammenfuehren"): EIN Kategorienbaum pro Haushalt. Persoenliche Steuerattribute
-- (tax_role, euer_zeile, business_share) gehoeren pro PERSON in category_tax_overrides.
-- Malik hat noch keinen Account und keine Kategorien; das Zusammenfuehren der Baeume passiert erst beim Beitritt
-- in Phase 4 (Entwurf: supabase/data/haushalt_kategorien_merge_entwurf.sql, KEINE Migration).
--
-- Was diese Migration tut:
--   1. categories.household_id (uuid, nullable, fk households on delete set null) + Index. Backfill: Haushalt des
--      Besitzers (user_id) ueber household_members. user_id bleibt = Ersteller.
--      Trigger trg_categories_set_household (before insert, security definer, search_path = ''): setzt household_id
--      aus der Mitgliedschaft von user_id, wenn der Insert keine mitbringt. Der App-Code bleibt unveraendert.
--   2. category_tax_overrides(category_id, user_id, tax_role, euer_zeile, business_share), pk (category_id, user_id),
--      gleiche Typen und Checks wie in categories. RLS owner-only (Initplan, Rolle authenticated).
--      Backfill: je Kategorie des Besitzers eine Zeile mit den heutigen Werten, aber nur wenn mindestens ein
--      Steuerwert nicht NULL ist (Live: 16 von 48 Kategorien).
--   3. RLS categories: Policy own_data (ALL, public, user_id = auth.uid()) wird ersetzt durch
--      categories_household_all (ALL, authenticated): household_id in Haushalten des Aufrufers ODER user_id = auth.uid()
--      (Fallback fuer Zeilen ohne household_id). Lesen und Schreiben fuer alle Mitglieder (Entscheidung 2).
--   (user_profiles-Peer-Sicht: siehe 20261028100000_household_rls.sql.)
--
-- WICHTIG - NICHT in dieser Migration (Phase 3):
--   Die Overrides sind hier nur VORBEREITET UND BEFUELLT, niemand liest sie. Die Spalten categories.tax_role /
--   euer_zeile / business_share sowie die Views category_tree, unified_transactions, monthly_flows bleiben
--   UNVERAENDERT; die App liest und schreibt weiter die Spalten. Solange nur Eric existiert, sind beide
--   Quellen identisch. ACHTUNG Drift: Schreibt die App Steuerwerte (categories/actions.ts), aendert sie nur die
--   Spalten, nicht die Overrides. Vor Phase 3 deshalb die Schreibpfade zuerst umstellen und die Overrides
--   neu aus categories abgleichen (der Backfill unten ueberschreibt vorhandene Zeilen bewusst NICHT; fuer den
--   Abgleich dann explizit truncate + Insert oder ON CONFLICT DO UPDATE in einem Phase-3-Skript).
--   Phase-3-Aufgabe "Steuerlogik auf Overrides umstellen" - Lesestellen (grep tax_role|euer_zeile|business_share|
--   tax_role_effective, ohne Tests/Typen):
--     Code (lesen):
--       src/lib/tax/laden.ts:132            categories select tax_role, business_share (eq user_id)
--       src/lib/tax/rollen.ts, euer.ts      Vererbung/EUeR (arbeiten auf den geladenen Zeilen)
--       src/lib/data/finance-transactions.ts:251  Kategorien-Select inkl. Steuerspalten (Formular/Liste)
--       src/lib/kategorien/berechnen.ts     Typ mit Steuerfeldern (Baumberechnung)
--       src/lib/assistant/mention-daten.ts:95     categories select tax_role
--       src/lib/assistant/tools/data-quality.ts:196  category_tree.tax_role_effective
--       src/lib/data/flows.ts:62,136        monthly_flows / unified_transactions.tax_role_effective
--       src/lib/forecast/laden.ts:81        unified_transactions eq tax_role_effective = 'lohn'
--       src/lib/forecast/{einmalig,historie}.ts  nutzen tax_role aus den geladenen Buchungen
--       src/app/(dashboard)/finance/(transaktionen)/transactions/detail-actions.ts:88,142  tax_role_effective
--       src/app/api/export/analyse/route.ts:129, src/components/analyse/AnalyseBuchungDetail.tsx:74  Anzeige
--       src/components/kategorien/{KategorienAnsicht,KategorieZeile}.tsx, src/components/finance/category-form.tsx  UI
--     Code (schreiben):
--       src/app/(dashboard)/finance/(transaktionen)/categories/actions.ts:112-114,159-161  insert/update der Spalten
--     SQL (Views, vererben die Werte): category_tree (20261021100000, 20261021180000), unified_transactions
--       (20261021110000, 20261022120000, 20261022140000: tax_role_effective, euer_zeile_effective), monthly_flows
--       (20261021120000), Test supabase/tests/flows_invariants.sql, Hilfsskript supabase/data/20261021_kategorie_triage.sql.
--     Die Views haben kein Personenkonzept; fuer Haushalt muss die View per Override des AUFRUFERS joinen
--     (left join category_tax_overrides o on o.category_id = c.id and o.user_id = auth.uid()) und die
--     Vererbung (coalesce entlang des Baums) darauf rechnen.
--
-- Bekannte Daten-/Strukturhinweise:
--   - Kein Unique auf categories.name eingefuehrt (bekannte Duplikate-Problematik). Live-Pruefung vom 2026-10-26:
--     select name, parent_id, count(*) ... group by having count(*) > 1 liefert KEINE Duplikate (48 Kategorien,
--     1 Nutzer). Maliks Baum wird in Phase 4 gemerged, dabei koennen Duplikate entstehen -> Merge-Entwurf.
--   - flow_kind in unified_transactions haengt an den Namen der Wurzeln 'Schulden' und 'Transfers'; diese
--     Wurzeln duerfen pro Haushalt nur EINMAL existieren (siehe Merge-Entwurf).
--   - parent_id wird nicht auf gleichen Haushalt geprueft (Kind/Eltern aus verschiedenen Haushalten waeren per
--     API moeglich, solange es nur einen Haushalt gibt irrelevant; bei Bedarf Trigger in Phase 4 ergaenzen).
--   - category_tax_overrides.category_id wird nicht per RLS auf Sichtbarkeit der Kategorie geprueft (FK prueft ohne RLS);
--     die Zeile ist ohnehin owner-only und gibt nichts preis.
--
-- Idempotent: if not exists / drop if exists / on conflict do nothing.
-- Rueckgaengig: supabase/rollbacks/20261028120000_categories_household.down.sql

-- 1. categories.household_id ------------------------------------------------------------------------------------
alter table public.categories
  add column if not exists household_id uuid references public.households (id) on delete set null;

create index if not exists categories_household_id_idx on public.categories (household_id);

create or replace function public.categories_set_household()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.household_id is null and new.user_id is not null then
    select m.household_id into new.household_id
    from public.household_members m
    where m.user_id = new.user_id
    limit 1;
  end if;
  return new;
end;
$$;

-- Trigger-Funktion wird nur vom Trigger aufgerufen, nicht per RPC.
revoke all on function public.categories_set_household() from public, anon, authenticated;

drop trigger if exists trg_categories_set_household on public.categories;
create trigger trg_categories_set_household
  before insert on public.categories
  for each row execute function public.categories_set_household();

-- Backfill: Haushalt des Besitzers (unique(user_id) in household_members -> eindeutig).
-- Audit-Trigger waehrenddessen aus (sonst je Kategorie eine Schein-Zeile 'system/UPDATE' im Aenderungslog).
alter table public.categories disable trigger user;
update public.categories c
set household_id = m.household_id
from public.household_members m
where m.user_id = c.user_id
  and c.household_id is null;
alter table public.categories enable trigger user;

-- 2. category_tax_overrides --------------------------------------------------------------------------------------
create table if not exists public.category_tax_overrides (
  category_id    uuid not null references public.categories (id) on delete cascade,
  user_id        uuid not null references auth.users (id) on delete cascade,
  tax_role       text,
  euer_zeile     integer,
  business_share numeric,
  primary key (category_id, user_id),
  constraint category_tax_overrides_tax_role_check
    check (tax_role is null or tax_role in ('betriebseinnahme', 'betriebsausgabe', 'lohn', 'privat')),
  constraint category_tax_overrides_euer_zeile_check
    check (euer_zeile is null or (euer_zeile > 0 and euer_zeile < 200)),
  constraint category_tax_overrides_business_share_range
    check (business_share is null or (business_share >= 0 and business_share <= 100))
);

comment on table public.category_tax_overrides is
  'Persoenliche Steuerattribute je Kategorie und Person (Haushalt: ein gemeinsamer Baum, Steuer pro Person). '
  'Phase 2: befuellt, aber noch nicht gelesen; die App nutzt weiter categories.tax_role/euer_zeile/business_share.';

create index if not exists category_tax_overrides_user_id_idx on public.category_tax_overrides (user_id);

alter table public.category_tax_overrides enable row level security;

drop policy if exists category_tax_overrides_owner on public.category_tax_overrides;
create policy category_tax_overrides_owner on public.category_tax_overrides
  for all to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);

revoke all on public.category_tax_overrides from anon;
grant select, insert, update, delete on public.category_tax_overrides to authenticated;
grant all on public.category_tax_overrides to service_role;

-- Backfill: heutige Werte des Besitzers. Nur Zeilen mit mindestens einem Steuerwert. Bereits vorhandene
-- Overrides werden NICHT ueberschrieben (do nothing), damit ein Wiederholungslauf spaetere Eingaben nicht zerstoert.
insert into public.category_tax_overrides (category_id, user_id, tax_role, euer_zeile, business_share)
select c.id, c.user_id, c.tax_role, c.euer_zeile, c.business_share
from public.categories c
where c.user_id is not null
  and (c.tax_role is not null or c.euer_zeile is not null or c.business_share is not null)
on conflict (category_id, user_id) do nothing;

-- 3. RLS categories ------------------------------------------------------------------------------------------------
-- Alt (live): own_data, ALL, Rolle public, using ((select auth.uid()) = user_id), kein with check.
drop policy if exists own_data on public.categories;
drop policy if exists categories_household_all on public.categories;
create policy categories_household_all on public.categories
  for all to authenticated
  using (
    (
      household_id in (
        select m.household_id from public.household_members m
        where m.user_id = (select auth.uid())
      )
      and user_id in (select public.household_peer_ids())
    )
    or (household_id is null and user_id = (select auth.uid()))
  )
  with check (
    (
      household_id in (
        select m.household_id from public.household_members m
        where m.user_id = (select auth.uid())
      )
      and user_id in (select public.household_peer_ids())
    )
    or (household_id is null and user_id = (select auth.uid()))
  );
-- Review-Fix: household_id UND user_id muessen zusammenpassen (Haushalt des Aufrufers, Ersteller = Peer); der
-- Fallback ohne household_id gilt nur fuer eigene Zeilen. So kann niemand Kategorien in einen fremden Baum
-- einschleusen oder per user_id einem Fremden unterschieben.

-- user_profiles: Peer-SELECT-Policy liegt in 20261028100000_household_rls.sql (household_user_profiles_select),
-- hier bewusst nicht doppelt angelegt.
