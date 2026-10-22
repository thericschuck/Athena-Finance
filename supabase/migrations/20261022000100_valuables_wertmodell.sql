-- Nutzung und Wertmodus je Gegenstand, Grundlage fuer die Wertverlauf-Schaetzung
-- (src/lib/inventar/wertmodell.ts).
--
-- `nutzung` steuert, wie viel vom Verschleissanteil der Kurve anfaellt: ein nie getragenes
-- Stueck verliert nur den Zeitanteil, ein taeglich getragenes deutlich mehr.
-- `wertmodus = 'stabil'` nimmt ein Stueck ganz aus dem Modell -- fuer Sammlerpreise (Kunst,
-- limitierte Uhren), wo Verschleiss die falsche Erklaerung waere.
alter table valuables
  add column if not exists nutzung text not null default 'regelmaessig',
  add column if not exists wertmodus text not null default 'nutzung';

alter table valuables
  add constraint valuables_nutzung_check
    check (nutzung in ('nie', 'selten', 'regelmaessig', 'taeglich')),
  add constraint valuables_wertmodus_check
    check (wertmodus in ('nutzung', 'stabil'));

-- `v.*` liefert die neuen Spalten mit, ihre Position in der View aendert sich dadurch --
-- `create or replace view` darf das nicht, also neu anlegen (Definition wie in
-- 20260831000006_valuables_zukunftsdatum.sql).
drop view if exists valuables_current;

create view valuables_current with (security_invoker = on) as
select
  v.*,
  lv.wert        as aktueller_wert,
  lv.bewertet_am as wert_stand,
  lv.quelle      as wert_quelle,
  case
    when v.kaufpreis is not null and v.kaufpreis > 0 and lv.wert is not null
      then round(((lv.wert - v.kaufpreis) / v.kaufpreis) * 100, 1)
  end as rendite_prozent,
  hb.pfad as hauptbild_pfad,
  coalesce(anz.gesamt, 0)::integer as bild_anzahl,
  coalesce(anz.fotos, 0)::integer  as foto_anzahl
from valuables v
left join lateral (
  select wert, bewertet_am, quelle
  from valuable_valuations vv
  where vv.valuable_id = v.id
  order by
    (vv.bewertet_am <= current_date) desc,
    case when vv.bewertet_am <= current_date then vv.bewertet_am end desc nulls last,
    vv.bewertet_am asc
  limit 1
) lv on true
left join lateral (
  select pfad
  from valuable_images vi
  where vi.valuable_id = v.id
  order by vi.ist_hauptbild desc, (vi.art = 'artwork') desc, vi.created_at desc
  limit 1
) hb on true
left join lateral (
  select count(*) as gesamt, count(*) filter (where vi.art = 'foto') as fotos
  from valuable_images vi
  where vi.valuable_id = v.id
) anz on true;

grant select on valuables_current to authenticated;
