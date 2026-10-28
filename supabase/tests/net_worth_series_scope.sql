-- Test Migration 20261029110000_net_worth_series_scope: Regressionsbeweis gegen net_worth_snapshots, Additivitaet, Peer-Policy.
--
-- ACHTUNG: Dieses Skript SCHREIBT (Migration, Rollback) und ist nur sicher, weil es in EINEM einzigen DO-Block laeuft, der am Ende
-- IMMER mit `raise exception` endet: die gesamte Transaktion wird zurueckgerollt, nichts wird persistiert. Der Bericht steht in der
-- Fehlermeldung ("NWS-BERICHT"). Keine Nutzerdaten im Bericht, nur Zaehlwerte und true/false.
--
-- Ablauf (Live-DB, Sicherheitsprotokoll):
--   1. Lesend vorher: to_regprocedure('public.net_worth_series(uuid[],uuid[],boolean,date)') und
--      select count(*) from pg_policies where tablename = 'portfolio_snapshots' (beides vor/nach identisch erwartet).
--   2. EIN execute_sql-Aufruf mit diesem Block. Marker `-- @@MIGRATION` wird durch
--         execute $m1$ <Inhalt supabase/migrations/20261029110000_net_worth_series_scope.sql> $m1$;
--      ersetzt, Marker `-- @@ROLLBACK` durch
--         execute $r1$ <Inhalt supabase/rollbacks/20261029110000_net_worth_series_scope.down.sql> $r1$;
--   3. Lesend nachher: Werte aus 1 muessen identisch sein.
--
-- Geprueft:
--   a) Regression: Eric, Scope 'ich' (Konten = eigene + shared, Owner [Eric], include shared) liefert je Tag dieselben Toepfe wie
--      net_worth_snapshots. Abweichungen werden nach Ursache gezaehlt (source=repair, nur Depot, sonstige, Tage fehlen).
--   b) Additivitaet: Haushalt gesamt = Eric privat + Testaccount privat + geteilt (je Tag, alle Toepfe).
--   c) Das geteilte Konto zaehlt in 'gemeinsam' einmal (Folge aus b) und der Testaccount sieht dieselben Zahlen wie Eric (RLS-Peers).
--   d) portfolio_snapshots: vorher fuer den Testaccount unsichtbar (owner-only), nachher sichtbar; Aussenstehender sieht nichts.
--   e) Laufzeit der Funktion (Millisekunden, Zahl).

do $outer$
declare
  v_eric uuid; v_mem uuid;
  v_acc_ich uuid[]; v_acc_all uuid[]; v_acc_eric_priv uuid[]; v_acc_mem_priv uuid[]; v_acc_shared uuid[];
  v_own_all uuid[];
  v_rep text := ''; v_t0 timestamptz; v_ms numeric;
  n_nws int; n_fn int; n_both int; n_nws_only int; n_fn_only int; n_equal int; n_diff int; n_diff_repair int; n_diff_depot_only int; n_diff_other int;
  n_add_bad int; v_h1 text; v_h2 text; v_ps_mem_vor int; v_ps_mem_nach int; v_ps_out int; v_ps_total int;
  v_mig boolean;
begin
  create temp table t_f (like public.net_worth_snapshots);
  create function pg_temp.act(p uuid) returns void language plpgsql as
  $f$ begin
    reset role;
    if p is null then perform set_config('request.jwt.claims', '', true);
    else
      perform set_config('request.jwt.claims', json_build_object('sub', p, 'role', 'authenticated')::text, true);
      set local role authenticated;
    end if;
  end $f$;

  select user_id into v_eric from public.household_members where role = 'owner' limit 1;
  select user_id into v_mem from public.household_members where role = 'member' limit 1;
  v_mig := to_regprocedure('public.net_worth_series(uuid[],uuid[],boolean,date)') is not null;
  v_rep := v_rep || format('Funktion vorher vorhanden: %s | ', v_mig);

  -- d) vorher: Testaccount sieht fremde portfolio_snapshots nicht
  perform pg_temp.act(v_mem);
  select count(*) into v_ps_mem_vor from public.portfolio_snapshots ps join public.assets a on a.id = ps.asset_id where a.user_id = v_eric;
  reset role;

  -- @@MIGRATION

  -- Konto-Mengen (als Postgres, ohne RLS; entspricht ctx.accountIds je Scope)
  select array_agg(id) into v_acc_all from public.accounts
    where user_id in (select user_id from public.household_members) or shared;
  select array_agg(id) into v_acc_ich from public.accounts where user_id = v_eric or shared;
  select array_agg(id) into v_acc_eric_priv from public.accounts where user_id = v_eric and not shared;
  select array_agg(id) into v_acc_mem_priv from public.accounts where user_id = v_mem and not shared;
  select array_agg(id) into v_acc_shared from public.accounts where shared;
  select array_agg(user_id) into v_own_all from public.household_members;

  -- a) Regression Eric / ich
  perform pg_temp.act(v_eric);
  v_t0 := clock_timestamp();
  create temp table t_ich as select * from public.net_worth_series(v_acc_ich, array[v_eric], true, null);
  v_ms := extract(milliseconds from clock_timestamp() - v_t0);
  create temp table t_nws as select * from public.net_worth_snapshots where user_id = v_eric;
  reset role;

  select count(*) into n_nws from t_nws;
  select count(*) into n_fn from t_ich;
  select count(*) into n_both from t_nws n join t_ich f on f.snapshot_date = n.snapshot_date;
  select count(*) into n_nws_only from t_nws n where not exists (select 1 from t_ich f where f.snapshot_date = n.snapshot_date);
  select count(*) into n_fn_only from t_ich f where not exists (select 1 from t_nws n where n.snapshot_date = f.snapshot_date);

  create temp table t_cmp as
  select n.snapshot_date, n.source,
    (abs(n.total_checking - f.total_checking) > 0.005 or abs(n.total_investment - f.total_investment) > 0.005
      or abs(n.total_savings - f.total_savings) > 0.005 or abs(n.total_cash - f.total_cash) > 0.005
      or abs(n.total_bausparer - f.total_bausparer) > 0.005 or abs(n.total_debts - f.total_debts) > 0.005
      or abs(n.total_crypto - f.total_crypto) > 0.005 or abs(n.total_business - f.total_business) > 0.005) as diff_nodepot,
    (abs(n.total_depot - f.total_depot) > 0.005) as diff_depot,
    abs(n.net_worth - f.net_worth) as d_nw
  from t_nws n join t_ich f on f.snapshot_date = n.snapshot_date;

  select count(*) filter (where not diff_nodepot and not diff_depot),
         count(*) filter (where diff_nodepot or diff_depot),
         count(*) filter (where (diff_nodepot or diff_depot) and source = 'repair'),
         count(*) filter (where diff_depot and not diff_nodepot and source <> 'repair'),
         count(*) filter (where diff_nodepot and source <> 'repair')
    into n_equal, n_diff, n_diff_repair, n_diff_depot_only, n_diff_other
  from t_cmp;

  v_rep := v_rep || format(E'\nREGRESSION ich: nws_tage=%s fn_tage=%s gemeinsame_tage=%s nur_nws=%s nur_fn=%s gleich=%s abweichend=%s (davon repair=%s, nur_depot=%s, sonstige=%s) summe_abw_networth>0: %s',
    n_nws, n_fn, n_both, n_nws_only, n_fn_only, n_equal, n_diff, n_diff_repair, n_diff_depot_only, n_diff_other,
    coalesce((select sum(d_nw) > 0.005 from t_cmp), false));
  v_rep := v_rep || format(E'\nAbweichungen nach Jahr (Tage): %s',
    coalesce((select string_agg(extract(year from snapshot_date)::int || '=' || c, ', ' order by extract(year from snapshot_date)) from (
      select snapshot_date, count(*) over (partition by extract(year from snapshot_date)) c from t_cmp where diff_nodepot or diff_depot) z), '-'));
  v_rep := v_rep || format(E'\nLaufzeit ms (ich): %s', round(v_ms));

  -- b) Additivitaet: Haushalt gesamt = Eric privat + Testaccount privat + geteilt
  perform pg_temp.act(v_eric);
  create temp table t_all as select * from public.net_worth_series(v_acc_all, v_own_all, false, null);
  create temp table t_p1 as select * from public.net_worth_series(v_acc_eric_priv, array[v_eric], false, null);
  create temp table t_p2 as select * from public.net_worth_series(v_acc_mem_priv, array[v_mem], false, null);
  create temp table t_sh as select * from public.net_worth_series(v_acc_shared, '{}'::uuid[], true, null);
  reset role;
  -- Positionen: gemeinsam (include false, Owner beide) = Eric(include false) + Mem(include false); die geteilten Positionen stecken im Owner-Anteil.
  -- Deshalb Konten-Toepfe und Positions-Toepfe getrennt pruefen: Konten additiv ueber die drei Kontomengen.
  select count(*) into n_add_bad from t_all a
   left join t_p1 p1 on p1.snapshot_date = a.snapshot_date
   left join t_p2 p2 on p2.snapshot_date = a.snapshot_date
   left join t_sh sh on sh.snapshot_date = a.snapshot_date
  where abs(a.total_checking - (coalesce(p1.total_checking,0) + coalesce(p2.total_checking,0) + coalesce(sh.total_checking,0))) > 0.005
     or abs(a.total_savings - (coalesce(p1.total_savings,0) + coalesce(p2.total_savings,0) + coalesce(sh.total_savings,0))) > 0.005
     or abs(a.total_debts - (coalesce(p1.total_debts,0) + coalesce(p2.total_debts,0) + coalesce(sh.total_debts,0))) > 0.005
     or abs(a.total_bausparer - (coalesce(p1.total_bausparer,0) + coalesce(p2.total_bausparer,0) + coalesce(sh.total_bausparer,0))) > 0.005;
  v_rep := v_rep || format(E'\nADDITIVITAET Konten-Toepfe: tage_gesamt=%s abweichende_tage=%s (0 erwartet)', (select count(*) from t_all), n_add_bad);

  -- c) Testaccount sieht dieselben Zahlen wie Eric (gemeinsam)
  perform pg_temp.act(v_mem);
  create temp table t_all_m as select * from public.net_worth_series(v_acc_all, v_own_all, false, null);
  reset role;
  select md5(coalesce(string_agg(x::text, '|' order by snapshot_date), '')) into v_h1 from t_all x;
  select md5(coalesce(string_agg(x::text, '|' order by snapshot_date), '')) into v_h2 from t_all_m x;
  v_rep := v_rep || format(E'\nPEER gleiche Reihe Eric = Testaccount (gemeinsam): %s', v_h1 = v_h2);

  -- d) nachher: Testaccount sieht portfolio_snapshots des Haushalts, Aussenstehender nicht
  select count(*) into v_ps_total from public.portfolio_snapshots ps join public.assets a on a.id = ps.asset_id where a.user_id = v_eric;
  perform pg_temp.act(v_mem);
  select count(*) into v_ps_mem_nach from public.portfolio_snapshots ps join public.assets a on a.id = ps.asset_id where a.user_id = v_eric;
  reset role;
  perform pg_temp.act(gen_random_uuid());
  select count(*) into v_ps_out from public.portfolio_snapshots;
  reset role;
  v_rep := v_rep || format(E'\nPOLICY portfolio_snapshots: Testaccount vorher sieht Eric-Zeilen=%s, nachher alle=%s (gesamt=%s), Aussenstehender=%s (0 erwartet)',
    v_ps_mem_vor > 0, v_ps_mem_nach = v_ps_total and v_ps_total > 0, v_ps_total > 0, v_ps_out);

  -- Rollback-Pruefung der Migration
  -- @@ROLLBACK
  v_rep := v_rep || format(E'\nNach Rollback: Funktion vorhanden=%s, Policy vorhanden=%s',
    to_regprocedure('public.net_worth_series(uuid[],uuid[],boolean,date)') is not null,
    exists (select 1 from pg_policies where tablename = 'portfolio_snapshots' and policyname = 'household_portfolio_snapshots_select'));

  raise exception 'NWS-BERICHT: %', v_rep;
end
$outer$;
