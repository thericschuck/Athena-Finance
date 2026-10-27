-- HAUSHALT PHASE 3: Steuerattribute pro PERSON. category_tree / unified_transactions (und damit monthly_flows,
-- monthly_umbuchungen, monthly_flow_totals) berechnen tax_role_effective / euer_zeile_effective aus
-- category_tax_overrides statt aus categories.tax_role / euer_zeile.
-- Plan: docs/haushalt-multiuser.md (Entscheidung 3, Abschnitt 5/8.2). Voraussetzung: 20261028120000_categories_household.sql
-- (Tabelle + Backfill), 20261029100000_flows_household_scope.sql (unified_transactions mit 36 Spalten).
--
-- Entscheidungen
--   1. BUCHUNG -> Besitzer der Buchung. tax_role_effective/euer_zeile_effective einer Zeile kommen aus den Overrides von
--      t.user_id bzw. bt.user_id, NICHT aus auth.uid(). Dadurch sehen Haushaltsmitglieder bei fremden Buchungen die Rolle
--      des Besitzers, und Service-Role-Pfade (Cron-Reports, Reminders; auth.uid() ist null) liefern dieselben Werte.
--   2. Vererbung unveraendert: coalesce(eigener Wert, Wert des Elternknotens) entlang des Baums, Wurzeln und Waisen wie in
--      category_tree (Zyklus-Knoten: nur eigener Wert). Der "eigene Wert" ist jetzt der Override der Person.
--   3. Kein Override auf dem Baumpfad -> NULL (Rolle ungesetzt). KEIN Rueckfall auf die Spalten von categories, sonst wuerde
--      Maliks Steuerlogik Erics Werte erben.
--   4. Zugriff: Overrides sind owner-only (RLS). Eine Haushalts-Sicht braucht aber Erics Werte fuer Maliks Leseweg. Deshalb
--      liest die Hilfsfunktion fn_category_tax_effective() (SECURITY DEFINER, search_path = '') die Overrides am RLS vorbei, gibt
--      aber nur die EFFEKTIVEN Werte (tax_role, euer_zeile; NIE business_share) und nur fuer Personen aus household_peer_ids()
--      zurueck (Aufrufer selbst + Haushaltsmitglieder). auth.uid() null (service_role, Cron) -> alle Personen. EXECUTE nur fuer
--      authenticated und service_role. Die Rohtabelle bleibt owner-only; Schreiben nur der Besitzer.
--      Ausgabe nur fuer Kategorien mit mindestens einem effektiven Wert (leere Zeilen = NULL nach left join, identisch zu vorher).
--   5. category_tree ist NICHT personenbezogen (eine Zeile je Kategorie): Dort gilt der Wert des AUFRUFERS (auth.uid()), das ist
--      die Sicht des Kategorien-Formulars/der Datenqualitaets-Tools. Ohne auth.uid() (service_role) ist er NULL; Service-Role-Pfade
--      lesen unified_transactions/monthly_flows, nicht category_tree.
--   6. Legacy-Spalten categories.tax_role / euer_zeile / business_share BLEIBEN, eingefroren: nicht mehr gelesen (View) und nicht
--      mehr geschrieben (App ab diesem Paket). Entfernung spaeter, wenn die App-Umstellung live und stabil ist (Phase 5), per
--      eigener Migration. business_share wird weiterhin nur in der App vererbt (src/lib/tax/laden.ts), jetzt aus Overrides.
--   7. Neue Nutzer starten OHNE Overrides (Steuerrolle ungesetzt). Bestandsnutzer: Backfill unten ist idempotent
--      (on conflict do nothing) und legt fehlende Zeilen aus den Spalten nach (z. B. Werte, die zwischen Phase 2 und dem
--      Umstellen der Schreibpfade in categories geschrieben wurden). Bereits vorhandene Overrides werden nie ueberschrieben.
--   8. Spaltenreihenfolge/-typen von category_tree (11) und unified_transactions (36) unveraendert -> CREATE OR REPLACE VIEW,
--      keine Kette droppen. monthly_flows / monthly_umbuchungen / monthly_flow_totals / account_balance_sums_unified lesen nur
--      unified_transactions und bleiben unveraendert (nur in der Abfrage neu geplant). security_invoker wird explizit gesetzt.
--   9. Performance: ct (Struktur, ohne Steuerwerte) und tx (effektive Steuerwerte) sind MATERIALIZED-CTEs; Join per
--      (category_id, user_id). Messung siehe supabase/tests/tax_overrides.sql (EXPLAIN ANALYZE, 730 Zeilen).
--
-- Reihenfolge fuers Live-Anwenden: (a) App mit Schalter TAX_OVERRIDES_VIEWS_LIVE=false deployen (liest Overrides, faellt auf
-- Spalten zurueck, schreibt Overrides), (b) Migration anwenden, (c) Schalter auf true / entfernen. Siehe src/lib/tax/overrides.ts.
-- Rueckgaengig: supabase/rollbacks/20261030110000_tax_overrides_views.down.sql

-- 1. Backfill (idempotent) --------------------------------------------------------------------------------------------
insert into public.category_tax_overrides (category_id, user_id, tax_role, euer_zeile, business_share)
select c.id, c.user_id, c.tax_role, c.euer_zeile, c.business_share
from public.categories c
where c.user_id is not null
  and (c.tax_role is not null or c.euer_zeile is not null or c.business_share is not null)
on conflict (category_id, user_id) do nothing;

-- 2. Effektive Steuerwerte je (Kategorie, Person) --------------------------------------------------------------------------
create or replace function public.fn_category_tax_effective()
returns table (category_id uuid, user_id uuid, tax_role_effective text, euer_zeile_effective integer)
language sql
stable
security definer
set search_path = ''
as $$
  with recursive ov as (
    select o.category_id, o.user_id, o.tax_role, o.euer_zeile
    from public.category_tax_overrides o
    where (select auth.uid()) is null
       or o.user_id in (select public.household_peer_ids())
  ),
  users as (select distinct user_id from ov),
  tree as (
    select c.id, u.user_id,
           o.tax_role as tr, o.euer_zeile as ez,
           array[c.id] as seen
    from public.categories c
    cross join users u
    left join ov o on o.category_id = c.id and o.user_id = u.user_id
    where c.parent_id is null
       or not exists (select 1 from public.categories p where p.id = c.parent_id)
    union all
    select c.id, t.user_id,
           coalesce(o.tax_role, t.tr), coalesce(o.euer_zeile, t.ez),
           t.seen || c.id
    from public.categories c
    join tree t on c.parent_id = t.id
    left join ov o on o.category_id = c.id and o.user_id = t.user_id
    where not (c.id = any (t.seen))
  ),
  alle as (
    select t.id, t.user_id, t.tr, t.ez from tree t
    union all
    -- Knoten, die der Baum nicht erreicht (Zyklus ohne Wurzel): nur eigener Wert, wie in category_tree
    select c.id, u.user_id, o.tax_role, o.euer_zeile
    from public.categories c
    cross join users u
    left join ov o on o.category_id = c.id and o.user_id = u.user_id
    where not exists (select 1 from tree t where t.id = c.id)
  )
  select a.id, a.user_id, a.tr, a.ez
  from alle a
  where a.tr is not null or a.ez is not null;
$$;

revoke all on function public.fn_category_tax_effective() from public, anon;
grant execute on function public.fn_category_tax_effective() to authenticated, service_role;

comment on function public.fn_category_tax_effective() is
  'Effektive Steuerrolle/EUeR-Zeile je (Kategorie, Person) aus category_tax_overrides mit Vererbung entlang des Baums. '
  'SECURITY DEFINER: liefert nur Personen aus household_peer_ids() (service_role: alle), nie business_share.';

-- 3. category_tree: Struktur unveraendert, Steuerwerte = Overrides des AUFRUFERS ----------------------------------------------
create or replace view public.category_tree as
with recursive tree as (
  select c.id, c.user_id, c.name, c.parent_id, c.type,
         c.id as root_id, c.name as root_name, 0 as depth, c.name as path,
         array[c.id] as seen
  from public.categories c
  where c.parent_id is null
     or not exists (select 1 from public.categories p where p.id = c.parent_id)
  union all
  select c.id, c.user_id, c.name, c.parent_id, c.type,
         t.root_id, t.root_name, t.depth + 1, t.path || ' > ' || c.name,
         t.seen || c.id
  from public.categories c
  join tree t on c.parent_id = t.id
  where not (c.id = any (t.seen))
),
base as (
  select tree.id, tree.user_id, tree.name, tree.parent_id, tree.type, tree.root_id, tree.root_name, tree.depth, tree.path
  from tree
  union all
  select c.id, c.user_id, c.name, c.parent_id, c.type, c.id, c.name, 0, c.name
  from public.categories c
  where not exists (select 1 from tree t where t.id = c.id)
)
select b.id, b.user_id, b.name, b.parent_id, b.type, b.root_id, b.root_name, b.depth, b.path,
       e.tax_role_effective, e.euer_zeile_effective
from base b
left join public.fn_category_tax_effective() e
  on e.category_id = b.id and e.user_id = (select auth.uid());

alter view public.category_tree set (security_invoker = on);

-- 4. unified_transactions: Steuerwerte aus Overrides des BUCHUNGSBESITZERS (Definition vom 2026-10-30, sonst unveraendert) -----
create or replace view public.unified_transactions as
with ct as materialized (
  select id, root_id, root_name, path from public.category_tree
),
tx as materialized (
  select category_id, user_id, tax_role_effective, euer_zeile_effective from public.fn_category_tax_effective()
)
select
  id, user_id, account_id, account_name, account_color, category_id, category_name, category_color, date, type,
  amount, amount_base, fx_rate, currency, description, merchant, transfer_to, contract_id, tags, source, category_type,
  signed_amount, booked_date, description_raw, flow_kind, amount_eur, root_category_id, root_category_name,
  category_path, tax_role_effective, euer_zeile_effective,
  flow_kind = any (array['echt', 'anlage', 'forderung']) as counts_in_flow,
  category_source, ai_category_id, counterpart_account_id, flow_kind_extern
from (
  select
    t.id, t.user_id, t.account_id, a.name as account_name, a.color as account_color,
    t.category_id, c.name as category_name, c.color as category_color,
    t.date, t.type, t.amount, t.amount_base, t.fx_rate, t.currency, t.description, t.merchant,
    t.transfer_to, t.contract_id, t.tags,
    'manual'::text as source,
    c.type as category_type,
    case
      when t.type = 'income'   then coalesce(t.amount_base, t.amount * coalesce(t.fx_rate, 1))
      when t.type = 'expense'  then -coalesce(t.amount_base, t.amount * coalesce(t.fx_rate, 1))
      when t.type = 'transfer' then -coalesce(t.amount_base, t.amount * coalesce(t.fx_rate, 1))
      else 0::numeric
    end as signed_amount,
    t.date as booked_date,
    t.description as description_raw,
    case
      when t.type = 'transfer' then 'umbuchung'
      when t.description ilike 'alter kontostand%' then 'anfangsbestand'
      when c.type = 'neutral' and coalesce(pc.name, c.name) = 'Schulden' then 'forderung'
      when c.type = 'neutral' and coalesce(pc.name, c.name) <> 'Transfers' then 'anlage'
      else 'echt'
    end as flow_kind,
    abs(coalesce(t.amount_base, t.amount * coalesce(t.fx_rate, 1))) as amount_eur,
    ct.root_id as root_category_id,
    ct.root_name as root_category_name,
    ct.path as category_path,
    tx.tax_role_effective,
    tx.euer_zeile_effective,
    null::text as category_source,
    null::uuid as ai_category_id,
    case when t.type = 'transfer' then t.transfer_to else null::uuid end as counterpart_account_id,
    case
      when t.description ilike 'alter kontostand%' then 'anfangsbestand'
      when c.type = 'neutral' and coalesce(pc.name, c.name) = 'Schulden' then 'forderung'
      when c.type = 'neutral' and coalesce(pc.name, c.name) <> 'Transfers' then 'anlage'
      else 'echt'
    end as flow_kind_extern
  from public.transactions t
  left join public.accounts a on a.id = t.account_id
  left join public.categories c on c.id = t.category_id
  left join public.categories pc on pc.id = c.parent_id
  left join ct on ct.id = t.category_id
  left join tx on tx.category_id = t.category_id and tx.user_id = t.user_id
  union all
  select
    bt.id, bt.user_id, a.id as account_id, a.name as account_name, a.color as account_color,
    bt.category_id, c.name as category_name, c.color as category_color,
    bt.value_date as date,
    case
      when own.id is not null and coalesce(c.type, 'neutral') = 'neutral' then 'transfer'
      when bt.amount >= 0 then 'income'
      else 'expense'
    end as type,
    abs(bt.amount) as amount,
    abs(bt.amount) as amount_base,
    1::numeric as fx_rate,
    bt.currency,
    public.fn_clean_bank_description(coalesce(bt.description, bt.raw_description), bt.counterpart_name) as description,
    bt.counterpart_name as merchant,
    case when coalesce(c.type, 'neutral') = 'neutral' then own.id else null::uuid end as transfer_to,
    null::uuid as contract_id,
    '{}'::text[] as tags,
    'bank_sync'::text as source,
    c.type as category_type,
    bt.amount as signed_amount,
    coalesce(bt.entry_date, bt.value_date) as booked_date,
    coalesce(bt.description, bt.raw_description) as description_raw,
    case
      when own.id is not null and coalesce(c.type, 'neutral') = 'neutral' then 'umbuchung'
      when c.type = 'neutral' and coalesce(pc.name, c.name) = 'Schulden' then 'forderung'
      when c.type = 'neutral' and coalesce(pc.name, c.name) <> 'Transfers' then 'anlage'
      else 'echt'
    end as flow_kind,
    abs(bt.amount) as amount_eur,
    ct.root_id as root_category_id,
    ct.root_name as root_category_name,
    ct.path as category_path,
    tx.tax_role_effective,
    tx.euer_zeile_effective,
    bt.category_source,
    bt.ai_category_id,
    own.id as counterpart_account_id,
    case
      when c.type = 'neutral' and coalesce(pc.name, c.name) = 'Schulden' then 'forderung'
      when c.type = 'neutral' and coalesce(pc.name, c.name) <> 'Transfers' then 'anlage'
      else 'echt'
    end as flow_kind_extern
  from public.bank_transactions bt
  join lateral (
    select a0.id, a0.name, a0.color
    from public.accounts a0
    where a0.bank_iban = bt.account_iban
      and (a0.user_id = bt.user_id
           or exists (select 1 from public.household_members m1
                      join public.household_members m2 on m2.household_id = m1.household_id
                      where m1.user_id = bt.user_id and m2.user_id = a0.user_id))
    order by (a0.user_id = bt.user_id) desc, a0.created_at, a0.id
    limit 1
  ) a on true
  left join public.categories c on c.id = bt.category_id
  left join public.categories pc on pc.id = c.parent_id
  left join lateral (
    select o0.id
    from public.accounts o0
    where o0.bank_iban = bt.counterpart_iban
      and (o0.user_id = bt.user_id
           or exists (select 1 from public.household_members m1
                      join public.household_members m2 on m2.household_id = m1.household_id
                      where m1.user_id = bt.user_id and m2.user_id = o0.user_id))
    order by (o0.user_id = bt.user_id) desc, o0.created_at, o0.id
    limit 1
  ) own on true
  left join ct on ct.id = bt.category_id
  left join tx on tx.category_id = bt.category_id and tx.user_id = bt.user_id
) u;

alter view public.unified_transactions set (security_invoker = on);

-- Grants der Views bleiben durch CREATE OR REPLACE erhalten (authenticated: select; service_role: s. Bestand). Zur Sicherheit:
revoke all on public.category_tree, public.unified_transactions from anon;
grant select on public.category_tree, public.unified_transactions to authenticated;
grant all on public.category_tree, public.unified_transactions to service_role;

comment on column public.categories.tax_role is 'LEGACY, eingefroren seit 20261030110000: nicht mehr gelesen/geschrieben; Quelle ist category_tax_overrides.';
comment on column public.categories.euer_zeile is 'LEGACY, eingefroren seit 20261030110000: nicht mehr gelesen/geschrieben; Quelle ist category_tax_overrides.';
comment on column public.categories.business_share is 'LEGACY, eingefroren seit 20261030110000: nicht mehr gelesen/geschrieben; Quelle ist category_tax_overrides.';
comment on table public.category_tax_overrides is
  'Persoenliche Steuerattribute je Kategorie und Person (ein Kategorienbaum je Haushalt, Steuer pro Person). Seit 20261030110000 '
  'Quelle fuer tax_role_effective/euer_zeile_effective (category_tree, unified_transactions) und fuer die App (Schreibpfad: Upsert des Handelnden).';
