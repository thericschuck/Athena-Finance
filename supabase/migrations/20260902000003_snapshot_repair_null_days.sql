/**
 * Altlasten in der Nettovermögen-Historie schließen.
 *
 * Zehn Tage, an denen ein ganzer Vermögensblock auf 0 € stand, obwohl er da war:
 *   • total_crypto, 2026-03-15 bis 2026-03-22 (8 Tage) — Folge des Preis-Caches,
 *     der ohne Auth-Header lief (behoben in 20260831120000). Die Kurve brach um
 *     ~4.500 € ein und kam eine Woche später zurück.
 *   • total_depot, 2026-03-09 — fund_price_cache war leer, und der alte Code hat
 *     daraus `coalesce(price, 0)` gemacht (behoben in 20260902000001).
 *   • total_bausparer, 2026-03-08 — der Anfangsbestand der drei Verträge ist auf
 *     den 09.03. gebucht, der Snapshot vom 08.03. sah deshalb 0 €.
 *
 * Echte Kurse von damals gibt es nicht mehr: asset_valuations beginnt erst am
 * 2026-08-21, fund_price_history am 2026-09-02. Deshalb linear zwischen den
 * Nachbartagen interpoliert (bzw. rückwärts fortgeschrieben, wo kein Vortag
 * existiert) und source='repair' gesetzt — die Zeilen bleiben als Schätzung
 * erkennbar und fn_take_snapshot rechnet sie nicht wieder kaputt.
 *
 * Bewusst nur für Erics user_id: der zweite auth.users-Eintrag hat 179 Zeilen
 * aus reinen Nullen (kein Konto, kein Asset), da ist nichts zu reparieren.
 */
do $$
declare
  v_uid uuid := '6e8ff680-f844-45b9-81a6-3f8cefc2aff3';
  v_spalte text;
begin
  foreach v_spalte in array array['total_crypto', 'total_depot', 'total_bausparer'] loop
    execute format($sql$
      with luecke as (
        select nws.snapshot_date,
          (select n.snapshot_date from net_worth_snapshots n
            where n.user_id = $1 and n.snapshot_date < nws.snapshot_date and n.%1$I > 0
            order by n.snapshot_date desc limit 1) as vor_tag,
          (select n.%1$I from net_worth_snapshots n
            where n.user_id = $1 and n.snapshot_date < nws.snapshot_date and n.%1$I > 0
            order by n.snapshot_date desc limit 1) as vor_wert,
          (select n.snapshot_date from net_worth_snapshots n
            where n.user_id = $1 and n.snapshot_date > nws.snapshot_date and n.%1$I > 0
            order by n.snapshot_date limit 1) as nach_tag,
          (select n.%1$I from net_worth_snapshots n
            where n.user_id = $1 and n.snapshot_date > nws.snapshot_date and n.%1$I > 0
            order by n.snapshot_date limit 1) as nach_wert
        from net_worth_snapshots nws
        where nws.user_id = $1 and nws.%1$I = 0
      )
      update net_worth_snapshots t
      set %1$I = round(case
            when l.vor_wert  is null then l.nach_wert
            when l.nach_wert is null then l.vor_wert
            else l.vor_wert + (l.nach_wert - l.vor_wert)
                 * (t.snapshot_date - l.vor_tag)::numeric / (l.nach_tag - l.vor_tag)::numeric
          end, 2),
          source = 'repair'
      from luecke l
      where t.user_id = $1
        and t.snapshot_date = l.snapshot_date
        and coalesce(l.vor_wert, l.nach_wert) is not null
    $sql$, v_spalte) using v_uid;
  end loop;
end $$;
