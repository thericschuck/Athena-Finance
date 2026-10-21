-- Datenänderung (kein Schema), 2026-10-21: erste Triage der Steuerrollen und eine Umbenennung.
-- Auf die Kategorien des Nutzers beschränkt, dem „Schwarzgeld" gehört (Einzelnutzer-App).
--
-- 1) „Schwarzgeld" -> „Bar-Einnahmen Bau", Rolle privat -> betriebseinnahme.
--    Vorher galt die Kategorie für die Steuer-Engine als nicht steuerrelevant (17 Buchungen,
--    7.740,59 € in 2026). Bar-Einnahmen aus Bauprojekten sind Betriebseinnahmen und zählen zum
--    Umsatz (Kleinunternehmer-Grenze).
-- 2) Wurzel „Business" -> betriebsausgabe (vererbt auf Tools, Weiterbildung). Vorher fielen
--    ~8.700 € (2026) ohne Rolle aus der EÜR. Ob Weiterbildung vollständig betrieblich ist, ist
--    eine Einzelfrage und steht im Bericht als offen.
-- 3) Eindeutig private Wurzeln -> privat: Lebenserhaltung, Essen auswärts (Geschäftsessen behält
--    seine eigene Rolle), Reisen, Taschengeld (Zuwendung der Eltern, nicht steuerbar).
--
-- Bewusst NICHT angefasst (braucht eine Entscheidung): Abo > Amazon Prime / marbis / Sonstige
-- Abos, Gesundheit (Krankenversicherung ist Vorsorgeaufwand), Transfers und die neutralen
-- Anlagekategorien.
--
-- RÜCKGÄNGIG:
--   update categories set name='Schwarzgeld', tax_role='privat' where name='Bar-Einnahmen Bau';
--   update categories set tax_role=null where name='Business' and parent_id is null;
--   update categories set tax_role=null where parent_id is null and name in ('Lebenserhaltung','Essen auswärts','Reisen','Taschengeld');

with owner as (
  select user_id from categories where name in ('Schwarzgeld', 'Bar-Einnahmen Bau') limit 1
)
update categories c
set name = 'Bar-Einnahmen Bau', tax_role = 'betriebseinnahme'
from owner
where c.user_id = owner.user_id and c.name = 'Schwarzgeld';

with owner as (
  select user_id from categories where name = 'Bar-Einnahmen Bau' limit 1
)
update categories c
set tax_role = case
  when c.name = 'Business' then 'betriebsausgabe'
  else 'privat'
end
from owner
where c.user_id = owner.user_id
  and c.parent_id is null
  and c.name in ('Business', 'Lebenserhaltung', 'Essen auswärts', 'Reisen', 'Taschengeld');
