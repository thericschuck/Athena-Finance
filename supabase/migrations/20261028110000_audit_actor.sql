-- HAUSHALT PHASE 2: Urheber-Anzeige und Aenderungslog (audit_log um handelnden Nutzer erweitern).
-- Plan: docs/haushalt-multiuser.md (Abschnitte 4 "Audit", 8.2 "audit_log").
--
-- Warum: Bei zwei Nutzern im Haushalt muss sichtbar sein, WER etwas geaendert hat. Automatik (Regeln, KI, Sync,
-- Cron/Service-Role) soll als "System" ausgewiesen werden. Bisher gilt fuer audit_log.user_id: Taeter, wenn
-- eingeloggt (auth.uid()), sonst Zeilenbesitzer -- ein System-Marker fehlte, Taeter und Besitzer waren nicht
-- trennbar. Die Spalte user_id bleibt UNVERAENDERT (Abwaertskompatibilitaet App-Code, FK auf auth.users) und wird
-- weiter mit derselben Semantik befuellt.
--
-- Wie:
--  1. Neue Spalten: actor_id (handelnder Nutzer, null = System/unbekannt), actor_kind ('user'|'system'|'unknown',
--     Default 'user'), owner_id (Zeilenbesitzer).
--  2. Backfill der Bestandszeilen: owner_id = user_id. actor_kind = 'unknown', actor_id = null -- ehrlich, weil
--     Altzeilen nicht unterscheiden, ob ein Nutzer oder Automatik (user_id = Besitzer-Fallback) geaendert hat.
--     (Spalte wird mit Default 'unknown' angelegt = Metadaten-only, danach Default auf 'user' gesetzt.)
--  3. fn_audit() neu: actor_id = auth.uid(); actor_kind = 'user' wenn auth.uid() gesetzt, sonst 'system'
--     (Service-Role, Cron, Edge Functions, SQL/Migrationen haben auth.uid() = null); owner_id = user_id der Zeile.
--     user_id wie bisher coalesce(auth.uid(), Zeilenbesitzer). Updates ohne echte Aenderung werden uebersprungen;
--     zusaetzlich Updates, die NUR updated_at aendern (reines Rauschen, z. B. Touch-Trigger/Sync). to_jsonb wird je
--     Zeile nur einmal berechnet (bank_transactions-Sync wird dadurch nicht teurer, eher billiger).
--     Zeilen ohne user_id werden wie bisher nicht protokolliert.
--  4. Trigger zusaetzlich auf: accounts, contracts, debts, savings_goals, valuables, assets, depots,
--     depot_transactions, savings_plans, budget_categories, budget_items (alle: uuid id + uuid user_id, vorab live
--     geprueft). AUSGELASSEN: keine -- jede Tabelle der Liste hat beides. Nicht erfasst bleiben depot_holdings
--     (nicht angefragt, Sync-lastig), account_balances/bank_balance (Snapshots, Sync-Rauschen).
--     Hinweis assets (Kraken-Spiegel) und accounts (Salden) koennen bei Sync viele Zeilen erzeugen -> nach Rollout
--     Volumen pruefen (select table_name, count(*) from audit_log group by 1).
--  5. SELECT-Policy: eigene Zeilen (user_id) ODER Zeilen von Haushaltsmitgliedern (owner_id in household_peer_ids()),
--     sofern table_name zu den haushalt-geteilten Tabellen gehoert (Eric: volle Transparenz im Haushalt):
--     transactions, bank_transactions, accounts, contracts, debts, savings_goals, valuables, assets,
--     depots, depot_transactions, savings_plans, budget_categories, budget_items. belege (owner-only, GoBD/Steuer),
--     categories (old_/new_values tragen die persoenlichen Steuerattribute; Review) und alle sonstigen Tabellen
--     bleiben fuer Peers unsichtbar. Das shared-Flag spielt hier keine Rolle.
--     Schreibrechte bleiben entzogen (keine Policy).
--  6. View v_audit_feed (security_invoker) mit Anzeigename des Akteurs (user_profiles.display_name; Peer-Sicht auf
--     user_profiles kommt per eigener Migration, bis dahin Name nur fuer den eigenen Nutzer, sonst "Mitglied").
--
-- Idempotent: add column if not exists, create or replace, drop ... if exists vor create. Nur Metadaten-DDL, Update
-- der ca. 470 Altzeilen ist trivial.
-- Rueckgaengig: supabase/rollbacks/20261028110000_audit_actor.down.sql (stellt fn_audit, alte Trigger-Menge und
-- Policy her; verwirft die neuen Spalten und damit die Urheber-Information).

-- 1. Spalten ---------------------------------------------------------------------------------------------------
alter table public.audit_log add column if not exists actor_id uuid;
alter table public.audit_log add column if not exists owner_id uuid;
-- Default zuerst 'unknown': bestehende Zeilen bekommen ehrlich 'unknown' (kein Rewrite), Default danach 'user'.
alter table public.audit_log add column if not exists actor_kind text not null default 'unknown';

alter table public.audit_log drop constraint if exists audit_log_actor_kind_check;
alter table public.audit_log
  add constraint audit_log_actor_kind_check check (actor_kind in ('user', 'system', 'unknown'));

alter table public.audit_log alter column actor_kind set default 'user';

comment on column public.audit_log.user_id is
  'Legacy: Taeter, wenn eingeloggt (auth.uid()), sonst Zeilenbesitzer. Neu: actor_id/actor_kind/owner_id nutzen.';
comment on column public.audit_log.actor_id is
  'Handelnder Nutzer (auth.uid()); null = System (actor_kind=system) oder nicht ermittelbar (unknown).';
comment on column public.audit_log.actor_kind is
  'user = eingeloggter Nutzer, system = Automatik ohne auth.uid() (Service-Role, Cron, Sync), unknown = Altzeile vor 20261028110000.';
comment on column public.audit_log.owner_id is
  'Besitzer der geaenderten Zeile (user_id der Zeile).';

-- 2. Backfill (nur Zeilen ohne owner_id; actor bleibt bewusst unknown/null) --------------------------------------
update public.audit_log set owner_id = user_id where owner_id is null;

-- 3. Trigger-Funktion ------------------------------------------------------------------------------------------
create or replace function public.fn_audit()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_actor uuid := auth.uid();
  v_owner uuid;
  v_id    uuid;
  v_old   jsonb;
  v_new   jsonb;
begin
  if TG_OP <> 'INSERT' then v_old := to_jsonb(old); end if;
  if TG_OP <> 'DELETE' then v_new := to_jsonb(new); end if;

  if TG_OP = 'UPDATE' and (v_old = v_new or (v_old - 'updated_at') = (v_new - 'updated_at')) then
    return new;
  end if;

  v_owner := (coalesce(v_new, v_old) ->> 'user_id')::uuid;
  if coalesce(v_actor, v_owner) is null then
    return case when TG_OP = 'DELETE' then old else new end;
  end if;

  v_id := (coalesce(v_new, v_old) ->> 'id')::uuid;

  insert into public.audit_log
    (user_id, actor_id, actor_kind, owner_id, table_name, record_id, action, old_values, new_values)
  values (
    coalesce(v_actor, v_owner),
    v_actor,
    case when v_actor is not null then 'user' else 'system' end,
    v_owner,
    TG_TABLE_NAME, v_id, TG_OP, v_old, v_new
  );

  return case when TG_OP = 'DELETE' then old else new end;
end;
$function$;

-- 4. Trigger auf weitere Tabellen --------------------------------------------------------------------------------
do $$
declare
  t text;
begin
  foreach t in array array['accounts','contracts','debts','savings_goals','valuables','assets','depots',
                           'depot_transactions','savings_plans','budget_categories','budget_items']
  loop
    if to_regclass(format('public.%I', t)) is null then
      raise warning 'Tabelle public.% fehlt, Audit-Trigger uebersprungen', t;
    else
      execute format('drop trigger if exists %I on public.%I', 'trg_audit_' || t, t);
      execute format('create trigger %I after insert or update or delete on public.%I for each row execute function public.fn_audit()',
                     'trg_audit_' || t, t);
    end if;
  end loop;
end $$;

-- 5. SELECT-Policy -----------------------------------------------------------------------------------------------
create index if not exists audit_log_owner_created_idx on public.audit_log (owner_id, created_at desc);

drop policy if exists audit_log_select_own on public.audit_log;
drop policy if exists audit_log_select_household on public.audit_log;
create policy audit_log_select_household on public.audit_log
  for select to authenticated
  using (
    user_id = (select auth.uid())
    or (
      owner_id in (select public.household_peer_ids())
      -- categories bewusst NICHT: old_/new_values enthalten die persoenlichen Steuerattribute (Review).
      and table_name in ('transactions','bank_transactions','accounts','contracts','debts',
                         'savings_goals','valuables','assets','depots','depot_transactions','savings_plans',
                         'budget_categories','budget_items')
    )
  );
-- Schreibrechte bleiben entzogen: keine INSERT/UPDATE/DELETE-Policy, Rechte siehe 20260906200000/20260906210000.

-- 6. View fuer die UI ---------------------------------------------------------------------------------------------
create or replace view public.v_audit_feed
with (security_invoker = true) as
select
  a.id,
  a.created_at,
  a.table_name,
  a.record_id,
  a.action,
  a.old_values,
  a.new_values,
  a.owner_id,
  a.actor_id,
  a.actor_kind,
  case a.actor_kind
    when 'system' then 'System'
    when 'unknown' then 'Unbekannt'
    else coalesce(p.display_name, 'Mitglied')
  end as actor_name
from public.audit_log a
left join public.user_profiles p on p.id = a.actor_id;

revoke all on public.v_audit_feed from public, anon;
grant select on public.v_audit_feed to authenticated;
