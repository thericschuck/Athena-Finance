-- Trennt das echte Foto vom angezeigten Bild.
--
-- Vorher gab es nur `bild_url`. Sobald das generierte Artwork dort hineingeschrieben wird,
-- ist das hochgeladene Foto weg -- und damit die Vorlage, aus der man es erzeugt hat. Ein
-- zweiter Anlauf mit anderem Prompt waere dann nicht mehr moeglich, und fuer die
-- Versicherung stuende statt der echten Uhr eine Illustration im Register.
--
--   foto_url  das hochgeladene Foto. Bleibt unberuehrt, egal wie oft generiert wird.
--             Das ist der Beleg, der im Schadensfall zaehlt.
--   bild_url  was die Vitrine zeigt: das generierte Artwork. Fehlt es, faellt die Anzeige
--             auf `foto_url` zurueck (siehe inventar/page.tsx).
alter table valuables add column if not exists foto_url text;

-- Die View muss neu gebaut werden statt `create or replace`: sie selektiert `v.*`, und das
-- wurde beim Anlegen zu einer festen Spaltenliste expandiert. Eine neue Tabellenspalte
-- landet darin zwischen `updated_at` und `aktueller_wert` -- `create or replace view` darf
-- Spalten aber nur ANHAENGEN, nicht einschieben, und schlaegt deshalb fehl.
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
  end as rendite_prozent
from valuables v
left join lateral (
  select wert, bewertet_am, quelle
  from valuable_valuations vv
  where vv.valuable_id = v.id
    and vv.bewertet_am <= current_date
  order by vv.bewertet_am desc
  limit 1
) lv on true;

grant select on valuables_current to authenticated;
