-- HAUSHALT PHASE 1c: Backfill. Legt den Haushalt 'Haushalt Schuck' an, traegt den Besitzer der Konten als owner
-- ein und markiert das geteilte Konto mit shared = true.
-- Voraussetzung: 20261027100000 und 20261027110000.
--
-- Wie (ohne feste UUIDs/E-Mails):
--   - Owner: Parameter app.household_owner (uuid, per set local app.household_owner = '...'), sonst der
--     Nutzer mit den meisten Konten in public.accounts. Bei Gleichstand oder ohne Konten: WARNUNG, kein Haushalt
--     (nichts raten). Normalfall: nur ein Nutzer hat Konten (Live-Pruefung: alle Konten gehoeren einem Nutzer,
--     auth.users hat 2 Eintraege; Malik hat noch keinen Account, Beitritt in Phase 4 per Einladung).
--   - Geteiltes Konto: Name ilike 'Geteiltes Konto (Malik)'. Nur bei GENAU 1 Treffer wird shared = true gesetzt,
--     sonst WARNUNG und keine Aenderung (Live-Pruefung: 1 Treffer).
--   - Idempotent: Haushalt wird ueber den Namen gefunden, Mitglied per on conflict do nothing.
-- Rueckgaengig: supabase/rollbacks/20261027120000_household_backfill.down.sql

do $$
declare
  v_owner     uuid;
  v_household uuid;
  v_cnt       int;
  v_acc       uuid;
  v_param     text := nullif(current_setting('app.household_owner', true), '');
begin
  if v_param is not null then
    v_owner := v_param::uuid;
    if not exists (select 1 from auth.users where id = v_owner) then
      raise warning 'app.household_owner existiert nicht in auth.users - Haushalt-Backfill uebersprungen';
      v_owner := null;
    end if;
  else
    select count(*) into v_cnt from (
      select user_id, rank() over (order by count(*) desc) r
      from public.accounts where user_id is not null group by user_id
    ) x where r = 1;
    if v_cnt = 1 then
      select user_id into v_owner from public.accounts where user_id is not null
      group by user_id order by count(*) desc limit 1;
    else
      raise warning 'Owner nicht eindeutig bestimmbar (% Kandidaten) - app.household_owner setzen; Haushalt-Backfill uebersprungen', v_cnt;
    end if;
  end if;

  if v_owner is not null then
    select id into v_household from public.households where name = 'Haushalt Schuck' order by created_at limit 1;
    if v_household is null then
      insert into public.households (name, created_by) values ('Haushalt Schuck', v_owner) returning id into v_household;
    end if;
    insert into public.household_members (household_id, user_id, role)
    values (v_household, v_owner, 'owner')
    on conflict do nothing;
    if not exists (select 1 from public.household_members where household_id = v_household and user_id = v_owner) then
      raise warning 'Owner ist bereits Mitglied eines anderen Haushalts (unique user_id) - bitte pruefen';
    end if;
  end if;

  select count(*), (array_agg(id))[1] into v_cnt, v_acc
  from public.accounts where name ilike 'Geteiltes Konto (Malik)';
  if v_cnt = 1 then
    update public.accounts set shared = true where id = v_acc and not shared;
  else
    raise warning 'Geteiltes Konto: % Treffer statt 1 - shared nicht gesetzt', v_cnt;
  end if;
end $$;
