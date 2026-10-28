-- HAUSHALT PHASE 1a: Tabellen households + household_members und die beiden Hilfsfunktionen.
-- Plan: docs/haushalt-multiuser.md (Abschnitt 4, Phase 1). Diese Migration aendert KEINE Policies der Fachtabellen
-- (das ist Phase 2) und legt keine Daten an (Backfill: 20261027120000).
--
-- Warum: Haushaltsdaten sollen spaeter fuer alle Mitglieder les-/schreibbar sein. Dafuer braucht RLS eine
-- Mitgliedschaft, die ohne Rekursion pruefbar ist.
--
-- Wie:
--   - households(id, name, created_at, created_by), household_members(household_id, user_id, role, joined_at).
--   - unique(user_id): vorerst ein Nutzer in genau einem Haushalt. Das Modell kennt N Mitglieder; fuer mehrere
--     Haushalte pro Nutzer genuegt es, den Unique-Constraint zu entfernen.
--   - RLS an. Lesen: Mitglieder sehen ihre Haushalte und deren Mitglieder. Schreiben: KEINE Policy fuer
--     authenticated (zusaetzlich Schreibrechte entzogen) -> nur service_role (Einladung/Beitritt in Phase 4).
--   - Funktionen sind SECURITY DEFINER (umgehen RLS der Mitgliedertabelle, vermeiden Policy-Rekursion),
--     stable, search_path = '' (alle Objekte schema-qualifiziert). EXECUTE: nur authenticated + service_role,
--     nicht anon/PUBLIC (Konvention aus 20261020140000_revoke_definer_execute.sql). authenticated muss sie
--     aufrufen duerfen, weil RLS-Policies mit den Rechten des Aufrufers laufen. Sie liefern nur Informationen
--     ueber den eigenen auth.uid().
--   - In Policies spaeter als (select public.is_household_member(household_id)) verwenden (Initplan).
-- Rueckgaengig: supabase/rollbacks/20261027100000_households_members.down.sql

create table if not exists public.households (
  id         uuid primary key default gen_random_uuid(),
  name       text not null,
  created_at timestamptz not null default now(),
  created_by uuid references auth.users (id) on delete set null
);

create table if not exists public.household_members (
  household_id uuid not null references public.households (id) on delete cascade,
  user_id      uuid not null references auth.users (id) on delete cascade,
  role         text not null default 'member',
  joined_at    timestamptz not null default now(),
  primary key (household_id, user_id)
);

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'household_members_role_check'
                 and conrelid = 'public.household_members'::regclass) then
    alter table public.household_members
      add constraint household_members_role_check check (role in ('owner', 'member'));
  end if;
  if not exists (select 1 from pg_constraint where conname = 'household_members_user_id_key'
                 and conrelid = 'public.household_members'::regclass) then
    alter table public.household_members
      add constraint household_members_user_id_key unique (user_id);
  end if;
end $$;

create index if not exists households_created_by_idx on public.households (created_by);

alter table public.households enable row level security;
alter table public.household_members enable row level security;

-- Funktionen vor den Policies, damit die Policies sie nutzen koennen.
create or replace function public.is_household_member(p_household uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.household_members m
    where m.household_id = p_household
      and m.user_id = (select auth.uid())
  );
$$;

create or replace function public.household_peer_ids()
returns setof uuid
language sql
stable
security definer
set search_path = ''
as $$
  select (select auth.uid())
  where (select auth.uid()) is not null
  union
  select m2.user_id
  from public.household_members m1
  join public.household_members m2 on m2.household_id = m1.household_id
  where m1.user_id = (select auth.uid());
$$;

revoke all on function public.is_household_member(uuid) from public, anon;
revoke all on function public.household_peer_ids()      from public, anon;
grant execute on function public.is_household_member(uuid) to authenticated, service_role;
grant execute on function public.household_peer_ids()      to authenticated, service_role;

-- Policies (Rolle authenticated, Initplan-Schreibweise). Nur SELECT.
drop policy if exists households_select_members on public.households;
create policy households_select_members on public.households
  for select to authenticated
  using ((select public.is_household_member(id)));

drop policy if exists household_members_select_same_household on public.household_members;
create policy household_members_select_same_household on public.household_members
  for select to authenticated
  using ((select public.is_household_member(household_id)));

-- Schreiben nur ueber service_role (umgeht RLS). Direktes Schreiben fuer Clients zusaetzlich sperren.
revoke insert, update, delete, truncate on public.households        from anon, authenticated;
revoke insert, update, delete, truncate on public.household_members from anon, authenticated;
revoke all on public.households        from anon;
revoke all on public.household_members from anon;
