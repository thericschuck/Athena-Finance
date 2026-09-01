-- Ein Kaufdatum in der Zukunft liess den Wert des Gegenstands verschwinden.
--
-- Beobachtet an „Prada Handschuhe": gekauft_am 2026-11-15 (vertipptes Jahr, gemeint war
-- 2025), Kaufpreis 710. `createValuable` datiert die Kaufbewertung auf das Kaufdatum -- die
-- View nahm aber ausschliesslich Bewertungen bis heute. Ergebnis: `aktueller_wert` blieb
-- leer, die Karte zeigte „-", und der Gegenstand fehlte in der Sammlungssumme.
--
-- Die Grundregel bleibt richtig: fuer einen Stichtag zaehlt die juengste Bewertung BIS zu
-- diesem Tag. Nur wenn es ueberhaupt keine gibt, ist „gar nichts anzeigen" die schlechtere
-- Antwort als „der einzige bekannte Wert". Deshalb faellt die View dann auf die frueheste
-- Bewertung zurueck.
--
-- `fn_valuables_total` bleibt bewusst streng bei `<= p_date`: eine historische Summe darf
-- kein Stueck enthalten, das an dem Stichtag noch gar nicht gekauft war. Ein zukuenftiges
-- Kaufdatum heisst dort also weiterhin „zaehlt noch nicht mit" -- richtig so.
--
-- Zusaetzlich warnt das Formular jetzt sichtbar bei einem Datum in der Zukunft
-- (components/inventar/ValuableForm.tsx), damit der Vertipper gar nicht erst durchgeht.
create or replace view valuables_current with (security_invoker = on) as
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
    -- Zuerst alles, was schon gilt ...
    (vv.bewertet_am <= current_date) desc,
    -- ... davon die juengste ...
    case when vv.bewertet_am <= current_date then vv.bewertet_am end desc nulls last,
    -- ... sonst die frueheste zukuenftige.
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
