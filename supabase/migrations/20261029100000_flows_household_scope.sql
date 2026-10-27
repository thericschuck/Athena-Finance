-- Haushalt Phase 3 (DB-Teil): unified_transactions haushaltsbasiert + Grundlage fuer scope-abhaengige Umbuchungen.
--
-- Problem: unified_transactions joint Konten per `a.user_id = bt.user_id` und erkennt Eigen-IBAN-Umbuchungen per
-- `own.user_id = bt.user_id`. Mit Haushalt (Konten/Buchungen mehrerer Peers) fallen Buchungen aus der View bzw. werden
-- Umbuchungen zwischen Peer-Konten nicht erkannt.
--
-- Loesung:
--  1. Konto-Join (`a`) und Gegenkonto-Join (`own`) laufen ueber den HAUSHALT der Buchung (household_members), nicht ueber
--     user_id-Gleichheit. Bevorzugt wird immer das Konto des Buchungs-Besitzers (Reihenfolge `a.user_id = bt.user_id desc`),
--     dann je ein Treffer (LATERAL ... LIMIT 1): auch bei kuenftigen IBAN-Dubletten im Haushalt keine Zeilenvervielfachung.
--     Es wird bewusst NICHT household_peer_ids() benutzt (liest auth.uid(); im SECURITY-DEFINER-Pfad
--     fn_recompute_account_balances / Cron ist es NULL). household_members ist fuer Peers lesbar; faellt die Sicht darauf
--     weg, bleibt `a.user_id = bt.user_id` als Rueckfall (= altes Verhalten).
--  2. Neue Spalten (ans ENDE angehaengt, sonst waere CREATE OR REPLACE VIEW nicht erlaubt):
--       counterpart_account_id  uuid : Konto der Gegen-IBAN im Haushalt (bank_sync) bzw. transfer_to (manuelle Umbuchung);
--                                      NULL = externe Gegenseite. Wird auch bei Kategorie-Override (income/expense) gesetzt,
--                                      dann ist flow_kind aber 'echt' und die App stuft nichts herab.
--       flow_kind_extern        text : flow_kind, den die Zeile OHNE Eigen-IBAN-/Umbuchungs-Erkennung haette
--                                      (echt/anlage/forderung/anfangsbestand). Fuer flow_kind <> 'umbuchung' immer = flow_kind.
--                                      Damit kennt die Namenslogik ('Schulden' -> forderung, neutral <> 'Transfers' -> anlage)
--                                      auch die herabgestufte Zeile; die App muss sie nicht nachbauen.
--  3. flow_kind = 'umbuchung' bleibt die HAUSHALTSWEITE Klassifikation (Obermenge). Die App stuft je Scope herab:
--       umbuchung UND counterpart_account_id not in neutralIds  =>  flow_kind := flow_kind_extern (echte Buchung).
--  4. monthly_flows und monthly_flow_totals bleiben UNVERAENDERT (nur Konten-/Haushaltsfilter durch RLS; Umbuchungen sind dort
--     nicht enthalten, deshalb kann die App aus ihnen nichts herabstufen, und eine zusaetzliche Gruppierungsspalte
--     counterpart_account_id wuerde Gruppen von echt-Zeilen mit Kategorie-Override aufspalten). Stattdessen neue View
--     monthly_umbuchungen (gleiche Dimensionen, beide Seiten, Richtung als income/expense, flow_kind_extern,
--     counterpart_account_id). Scope-faehige Summe = monthly_flows (account_id in countIds) +
--     monthly_umbuchungen (account_id in countIds, counterpart_account_id not in neutralIds), je nach flow_kind_extern.
--     monthly_flow_totals ist NICHT scope-faehig (pro user_id, ohne Konto) -> in der App durch diese Summe ersetzen.
--  5. account_balance_sums_* und fn_recompute_account_balances brauchen keine Aenderung: sie nutzen signed_amount/amount,
--     die von der Klassifikation unabhaengig sind (Bank-Zeile: bt.amount, egal ob type income/expense/transfer).
--
-- Annahmen (dokumentiert, Phase 4 erzwingt sie):
--  * bank_transactions.user_id ist der Besitzer des Kontos ODER ein Haushaltsmitglied; das Konto wird ueber die IBAN im
--    Haushalt gefunden. Die View-Spalte user_id bleibt bt.user_id (Gruppierung der Summen-Views unveraendert).
--  * IBAN ist im Haushalt eindeutig (Phase 4: Unique (household_id, bank_iban)). Bis dahin: Konto des Besitzers zuerst.
--  * Nutzer ohne Haushalt: Verhalten wie bisher (nur eigene Konten).
--  * Beim Anwenden fuer Erics heutige Daten bleiben ALLE bisherigen Spalten byte-identisch (Beweis: tests/flows_household_scope.sql).
--
-- Rollback: supabase/rollbacks/20261029100000_flows_household_scope.down.sql

-- (Transaktion stellt apply_migration bzw. der Aufrufer; kein begin/commit hier.)
create or replace view public.unified_transactions as
with ct as materialized (
  select id, root_id, root_name, path, tax_role_effective, euer_zeile_effective from public.category_tree
)
select
  id, user_id, account_id, account_name, account_color, category_id, category_name, category_color, date, type,
  amount, amount_base, fx_rate, currency, description, merchant, transfer_to, contract_id, tags, source, category_type,
  signed_amount, booked_date, description_raw, flow_kind, amount_eur, root_category_id, root_category_name,
  category_path, tax_role_effective, euer_zeile_effective,
  flow_kind = any (array['echt', 'anlage', 'forderung']) as counts_in_flow,
  category_source, ai_category_id,
  counterpart_account_id, flow_kind_extern
from (
  -- manuelle Buchungen
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
    ct.root_id as root_category_id, ct.root_name as root_category_name, ct.path as category_path,
    ct.tax_role_effective, ct.euer_zeile_effective,
    null::text as category_source,
    null::uuid as ai_category_id,
    case when t.type = 'transfer' then t.transfer_to end as counterpart_account_id,
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

  union all

  -- Bankbuchungen (FinTS/Import)
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
    fn_clean_bank_description(coalesce(bt.description, bt.raw_description), bt.counterpart_name) as description,
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
    ct.root_id as root_category_id, ct.root_name as root_category_name, ct.path as category_path,
    ct.tax_role_effective, ct.euer_zeile_effective,
    bt.category_source,
    bt.ai_category_id,
    own.id as counterpart_account_id,
    case
      when c.type = 'neutral' and coalesce(pc.name, c.name) = 'Schulden' then 'forderung'
      when c.type = 'neutral' and coalesce(pc.name, c.name) <> 'Transfers' then 'anlage'
      else 'echt'
    end as flow_kind_extern
  from public.bank_transactions bt
  -- Konto der Buchung: im Haushalt des Buchungs-Besitzers, eigenes Konto bevorzugt, genau ein Treffer
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
  -- Gegenkonto: Konto der Gegen-IBAN im selben Haushalt (nicht nur beim Buchungs-Besitzer)
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
) u;

-- CREATE OR REPLACE kann Optionen zuruecksetzen: security_invoker nachziehen (Test H in flows_invariants.sql).
alter view public.unified_transactions set (security_invoker = on);

-- Grants bleiben bei CREATE OR REPLACE erhalten; zur Sicherheit explizit (nur lesen, kein anon).
revoke all on public.unified_transactions from anon;

-- Scope-faehige Umbuchungen: beide Seiten, Richtung als income/expense, je Konto und Gegenkonto.
-- Bank: jede Seite ist eine eigene Buchung (je Konto) -> eine Zeile je Buchung.
-- Manuell: eine Zeile pro Umbuchung (Abgang auf account_id, Zugang auf transfer_to) -> Spiegelzeile fuer das Zielkonto.
create or replace view public.monthly_umbuchungen as
select
  user_id, month, account_id, counterpart_account_id, source, flow_kind_extern,
  category_id, category_name, root_category_id, root_category_name, tax_role_effective,
  coalesce(sum(inc), 0) as income,
  coalesce(sum(exp), 0) as expense,
  count(*)::integer as tx_count
from (
  select u.user_id, date_trunc('month', u.date::timestamp with time zone)::date as month,
         u.account_id, u.counterpart_account_id, u.source, u.flow_kind_extern,
         u.category_id, u.category_name, u.root_category_id, u.root_category_name, u.tax_role_effective,
         case when u.signed_amount > 0 then u.amount_eur else 0::numeric end as inc,
         case when u.signed_amount < 0 then u.amount_eur else 0::numeric end as exp
  from public.unified_transactions u
  where u.flow_kind = 'umbuchung' and u.account_id is not null
  union all
  select u.user_id, date_trunc('month', u.date::timestamp with time zone)::date,
         u.counterpart_account_id, u.account_id, u.source, u.flow_kind_extern,
         u.category_id, u.category_name, u.root_category_id, u.root_category_name, u.tax_role_effective,
         u.amount_eur, 0::numeric
  from public.unified_transactions u
  where u.flow_kind = 'umbuchung' and u.source = 'manual' and u.counterpart_account_id is not null
) x
group by user_id, month, account_id, counterpart_account_id, source, flow_kind_extern,
         category_id, category_name, root_category_id, root_category_name, tax_role_effective;

alter view public.monthly_umbuchungen set (security_invoker = on);
revoke all on public.monthly_umbuchungen from anon, authenticated, service_role;
grant select on public.monthly_umbuchungen to authenticated, service_role;
