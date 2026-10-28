-- Test Migration 20261102100000_valuables_current_shared: Regressionsbeweis fuer die View valuables_current.
--
-- ACHTUNG: Dieses Skript SCHREIBT (Fixtures @example.invalid, Migration, Rollback) und ist nur sicher, weil es in EINEM einzigen
-- DO-Block laeuft, der am Ende IMMER mit `raise exception` endet: die gesamte Transaktion wird zurueckgerollt, nichts wird
-- persistiert. Der Bericht steht in der Fehlermeldung ("VCS-BERICHT"). Keine Nutzerdaten im Bericht, nur Hashes/Zaehlwerte/true/false.
--
-- Ablauf (Live-DB, Sicherheitsprotokoll):
--   1. Lesend vorher: select md5(pg_get_viewdef('public.valuables_current'::regclass)) und count(*) from public.valuables.
--   2. EIN execute_sql-Aufruf mit diesem Block. Marker `-- @@MIGRATION` wird durch
--         execute $m1$ <Inhalt supabase/migrations/20261102100000_valuables_current_shared.sql> $m1$;
--      ersetzt, Marker `-- @@ROLLBACK` durch
--         execute $r1$ <Inhalt supabase/rollbacks/20261102100000_valuables_current_shared.down.sql> $r1$;
--   3. Lesend nachher: Werte aus 1 muessen identisch sein (Fehlermeldung = Rollback).
--
-- Geprueft: md5 ueber alle BISHERIGEN Spalten (to_jsonb(c) - 'shared') vorher/nachher gleich, je Eigentuemer und Mitglied
-- (set local role authenticated); Spaltenreihenfolge der bisherigen Spalten gleich, `shared` ans Ende; shared = valuables.shared;
-- security_invoker und Grants unveraendert; Fixture (zwei Peers + Outsider): Sichtbarkeit je Rolle vorher/nachher gleich;
-- Rollback stellt die alte View (ohne shared) her.

do $outer$
declare
  v_owner uuid; v_mem uuid; v_x uuid := gen_random_uuid();
  v_rep text := '';
  uid uuid;
  h_vor jsonb := '{}'; h_nach jsonb := '{}'; vis_vor jsonb := '{}'; vis_nach jsonb := '{}';
  cols_vor text; cols_nach text; opt_vor text; opt_nach text; gr_vor text; gr_nach text;
  n_total int; n_mismatch int; n_fx int;
  v_def_vor text;
begin
  create function pg_temp.act(p uuid) returns void language plpgsql as
  $f$ begin
    reset role;
    if p is null then perform set_config('request.jwt.claims', '', true);
    else
      perform set_config('request.jwt.claims', json_build_object('sub', p, 'role', 'authenticated')::text, true);
      set local role authenticated;
    end if;
  end $f$;
  -- Hash ueber alle bisherigen Spalten (shared ausgenommen), als Rolle p.
  create function pg_temp.hash_cols(p uuid) returns text language plpgsql as
  $f$ declare h text; begin
    perform pg_temp.act(p);
    select md5(coalesce(string_agg((to_jsonb(c) - 'shared')::text, '|' order by c.id), '')) into h from public.valuables_current c;
    reset role; return h;
  end $f$;
  -- Hash ueber die sichtbaren Fixture-Namen, als Rolle p.
  create function pg_temp.hash_vis(p uuid) returns text language plpgsql as
  $f$ declare h text; begin
    perform pg_temp.act(p);
    select md5(coalesce(string_agg(c.name, '|' order by c.name), '')) into h from public.valuables_current c where c.name like 'fx-vcs-%';
    reset role; return h;
  end $f$;

  select user_id into v_owner from public.household_members where role = 'owner' limit 1;
  select user_id into v_mem from public.household_members where role = 'member' limit 1;
  if v_owner is null or v_mem is null then raise exception 'VCS-BERICHT: Fixture-Voraussetzung fehlt (owner/member)'; end if;

  -- Fixtures: geteiltes und privates Stueck je Peer, ein Stueck des Outsiders
  insert into auth.users (id, email, aud, role, instance_id, created_at, updated_at)
    values (v_x, 'fx-vcs-outsider-' || v_x || '@example.invalid', 'authenticated', 'authenticated', '00000000-0000-0000-0000-000000000000', now(), now());
  insert into public.valuables (user_id, name, shared) values (v_owner, 'fx-vcs-owner-geteilt', true);
  insert into public.valuables (user_id, name, shared) values (v_owner, 'fx-vcs-owner-privat', false);
  insert into public.valuables (user_id, name, shared) values (v_mem, 'fx-vcs-member-geteilt', true);
  insert into public.valuables (user_id, name, shared) values (v_mem, 'fx-vcs-member-privat', false);
  insert into public.valuables (user_id, name, shared) values (v_x, 'fx-vcs-outsider', true);

  -- Vorher
  select string_agg(attname, ',' order by attnum) into cols_vor from pg_attribute where attrelid = 'public.valuables_current'::regclass and attnum > 0 and not attisdropped;
  select reloptions::text into opt_vor from pg_class where oid = 'public.valuables_current'::regclass;
  select string_agg(grantee || ':' || privilege_type, ',' order by grantee, privilege_type) into gr_vor from information_schema.role_table_grants where table_schema = 'public' and table_name = 'valuables_current';
  v_def_vor := pg_get_viewdef('public.valuables_current'::regclass);
  foreach uid in array array[v_owner, v_mem, v_x] loop
    h_vor := h_vor || jsonb_build_object(uid::text, pg_temp.hash_cols(uid));
    vis_vor := vis_vor || jsonb_build_object(uid::text, pg_temp.hash_vis(uid));
  end loop;

  -- @@MIGRATION

  -- Nachher
  select string_agg(attname, ',' order by attnum) into cols_nach from pg_attribute where attrelid = 'public.valuables_current'::regclass and attnum > 0 and not attisdropped;
  select reloptions::text into opt_nach from pg_class where oid = 'public.valuables_current'::regclass;
  select string_agg(grantee || ':' || privilege_type, ',' order by grantee, privilege_type) into gr_nach from information_schema.role_table_grants where table_schema = 'public' and table_name = 'valuables_current';
  foreach uid in array array[v_owner, v_mem, v_x] loop
    h_nach := h_nach || jsonb_build_object(uid::text, pg_temp.hash_cols(uid));
    vis_nach := vis_nach || jsonb_build_object(uid::text, pg_temp.hash_vis(uid));
  end loop;

  v_rep := v_rep || format('Hash Spalten Eigentuemer vorher=%s nachher=%s gleich=%s | ', left(h_vor ->> v_owner::text, 8), left(h_nach ->> v_owner::text, 8), (h_vor ->> v_owner::text) = (h_nach ->> v_owner::text));
  v_rep := v_rep || format('Hash Spalten Mitglied vorher=%s nachher=%s gleich=%s | ', left(h_vor ->> v_mem::text, 8), left(h_nach ->> v_mem::text, 8), (h_vor ->> v_mem::text) = (h_nach ->> v_mem::text));
  v_rep := v_rep || format('Hash Spalten Outsider gleich=%s | ', (h_vor ->> v_x::text) = (h_nach ->> v_x::text));
  v_rep := v_rep || format('Sichtbarkeit Fixture gleich (Eigentuemer/Mitglied/Outsider)=%s/%s/%s | ',
    (vis_vor ->> v_owner::text) = (vis_nach ->> v_owner::text), (vis_vor ->> v_mem::text) = (vis_nach ->> v_mem::text), (vis_vor ->> v_x::text) = (vis_nach ->> v_x::text));
  v_rep := v_rep || format('Spaltenreihenfolge: bisherige Spalten Praefix gleich=%s, shared am Ende=%s | ',
    left(cols_nach, length(cols_vor)) = cols_vor, cols_nach = cols_vor || ',shared');
  v_rep := v_rep || format('security_invoker vorher=%s nachher=%s | Grants gleich=%s | ', opt_vor, opt_nach, gr_vor = gr_nach);

  -- shared stimmt mit valuables.shared ueberein (als Eigentuemer, RLS: eigene + Peers)
  perform pg_temp.act(v_owner);
  select count(*), count(*) filter (where c.shared is distinct from v.shared) into n_total, n_mismatch
    from public.valuables_current c join public.valuables v on v.id = c.id;
  reset role;
  v_rep := v_rep || format('shared-Abgleich Zeilen=%s Abweichungen=%s | ', n_total, n_mismatch);

  -- Fixture-Sichtbarkeit je Rolle (Anzahl sichtbarer fx-Stuecke, davon geteilt)
  foreach uid in array array[v_owner, v_mem, v_x] loop
    perform pg_temp.act(uid);
    select count(*) into n_fx from public.valuables_current where name like 'fx-vcs-%';
    v_rep := v_rep || format('Rolle %s sieht fx=%s geteilt=%s | ', case uid when v_owner then 'owner' when v_mem then 'member' else 'outsider' end,
      n_fx, (select count(*) from public.valuables_current where name like 'fx-vcs-%' and shared));
    reset role;
  end loop;

  -- @@ROLLBACK

  select string_agg(attname, ',' order by attnum) into cols_nach from pg_attribute where attrelid = 'public.valuables_current'::regclass and attnum > 0 and not attisdropped;
  select reloptions::text into opt_nach from pg_class where oid = 'public.valuables_current'::regclass;
  select string_agg(grantee || ':' || privilege_type, ',' order by grantee, privilege_type) into gr_nach from information_schema.role_table_grants where table_schema = 'public' and table_name = 'valuables_current';
  v_rep := v_rep || format('Rollback: Spalten wie vorher=%s, Optionen wie vorher=%s, Grants wie vorher=%s, Definition md5 wie vorher=%s | ',
    cols_nach = cols_vor, opt_nach = opt_vor, gr_nach = gr_vor, md5(pg_get_viewdef('public.valuables_current'::regclass)) = md5(v_def_vor));

  raise exception 'VCS-BERICHT: %', v_rep;
end
$outer$;
