-- Steuer-Engine, Phase 1: Tarifdaten und die Zuordnung von Kategorien.
--
-- Warum der Tarif in einer TABELLE steht und nicht im Code: § 32a EStG wird
-- jaehrlich geaendert, und fuer 2027 ist zum Zeitpunkt dieser Migration noch
-- keine Fassung veroeffentlicht. Koeffizienten im Code wuerden bedeuten, dass
-- ein Deploy noetig ist, um eine Gesetzesaenderung nachzuziehen -- und dass
-- niemand mehr sieht, aus welcher Quelle eine Zahl stammt.

create table if not exists public.tax_tariffs (
  jahr                     integer primary key,

  -- Zone 1: bis zum Grundfreibetrag faellt keine Steuer an.
  grundfreibetrag          numeric(12,2) not null,

  -- Zone 2: (zone2_faktor * y + zone2_konstante) * y
  --         y = (zvE - grundfreibetrag) / 10000
  zone2_bis                numeric(12,2) not null,
  zone2_faktor             numeric(12,2) not null,
  zone2_konstante          numeric(12,2) not null,

  -- Zone 3: (zone3_faktor * z + zone3_konstante) * z + zone3_sockel
  --         z = (zvE - zone2_bis) / 10000
  zone3_bis                numeric(12,2) not null,
  zone3_faktor             numeric(12,2) not null,
  zone3_konstante          numeric(12,2) not null,
  zone3_sockel             numeric(12,2) not null,

  -- Zone 4 und 5: linear, zone4_satz * zvE - zone4_abzug
  zone4_bis                numeric(12,2) not null,
  zone4_satz               numeric(6,4)  not null,
  zone4_abzug              numeric(12,2) not null,
  zone5_satz               numeric(6,4)  not null,
  zone5_abzug              numeric(12,2) not null,

  -- Pauschalen, die in die Schaetzung des zu versteuernden Einkommens eingehen.
  werbungskostenpauschale  numeric(12,2) not null,
  sonderausgabenpauschale  numeric(12,2) not null,

  -- Freigrenze der tariflichen Einkommensteuer, ab der Solidaritaetszuschlag
  -- anfaellt. NULL heisst ausdruecklich "nicht geprueft" -- die Engine rechnet
  -- dann mit 0 und sagt das, statt eine Zahl zu erfinden.
  soli_freigrenze          numeric(12,2),

  -- Kleinunternehmergrenzen nach § 19 UStG. Seit 2025: 25.000 Vorjahr,
  -- 100.000 laufendes Jahr (vorher 22.000 / 50.000).
  kleinunternehmer_vorjahr numeric(12,2) not null,
  kleinunternehmer_laufend numeric(12,2) not null,

  quelle                   text not null,
  geprueft_am              date not null
);

comment on table public.tax_tariffs is
  'Steuerrechtliche Parameter je Veranlagungszeitraum. Referenzdaten fuer alle Nutzer, kein user_id.';

-- Referenzdaten: lesen darf jeder eingeloggte Nutzer, schreiben niemand ueber
-- die API. Aenderungen laufen bewusst nur ueber eine Migration, damit die
-- Quelle nachvollziehbar bleibt.
alter table public.tax_tariffs enable row level security;

drop policy if exists "tax_tariffs_read" on public.tax_tariffs;
create policy "tax_tariffs_read"
  on public.tax_tariffs for select to authenticated using (true);

-- Nur 2026. Die Zonen und Koeffizienten sind gegen zwei unabhaengige Quellen
-- geprueft (gesetze-im-internet.de und buzer.de, identisch).
--
-- 2025 ist ABSICHTLICH nicht dabei: die Koeffizienten der Zonen 2 und 3 waren
-- belegbar (932,30 / 176,64 / 1.015,13 bei einem Grundfreibetrag von 12.096),
-- die Abzugsbetraege der Proportionalzonen liessen sich aber nicht aus einer
-- Quelle bestaetigen. Eine unbelegte Zahl in einer Steuerrechnung ist
-- schlimmer als ein fehlendes Jahr -- die Engine rechnet fuer nicht
-- hinterlegte Jahre mit dem naechstgelegenen Tarif und kennzeichnet das.
insert into public.tax_tariffs (
  jahr,
  grundfreibetrag,
  zone2_bis, zone2_faktor, zone2_konstante,
  zone3_bis, zone3_faktor, zone3_konstante, zone3_sockel,
  zone4_bis, zone4_satz, zone4_abzug,
  zone5_satz, zone5_abzug,
  werbungskostenpauschale, sonderausgabenpauschale,
  soli_freigrenze,
  kleinunternehmer_vorjahr, kleinunternehmer_laufend,
  quelle, geprueft_am
) values (
  2026,
  12348.00,
  17799.00, 914.51, 1400.00,
  69878.00, 173.10, 2397.00, 1034.87,
  277825.00, 0.4200, 11135.63,
  0.4500, 19470.38,
  1230.00, 36.00,
  null,
  25000.00, 100000.00,
  'https://www.gesetze-im-internet.de/estg/__32a.html (Fassung ab 01.01.2026), gegengeprueft gegen https://www.buzer.de/32a_EStG.htm',
  '2026-09-06'
)
on conflict (jahr) do nothing;

-- Zuordnung: welche Kategorie zaehlt steuerlich wie.
--
-- Standard ist NULL = nicht zugeordnet, und das bleibt auch so: nichts wird
-- vorbelegt. Die Engine meldet stattdessen jede Einnahme, die in einer
-- Kategorie ohne Rolle liegt -- so faellt nichts still aus der Rechnung.
--
-- Die Rolle wirkt vererbend: hat eine Kategorie keine eigene, gilt die der
-- naechsten Oberkategorie. Damit reicht ein Klick auf "Business" fuer den
-- ganzen Teilbaum. Die Vererbung passiert in der Anwendung, nicht hier --
-- als SQL-Constraint waere sie nicht abbildbar.
alter table public.categories
  add column if not exists tax_role text;

alter table public.categories
  drop constraint if exists categories_tax_role_check;

alter table public.categories
  add constraint categories_tax_role_check
  check (tax_role is null or tax_role in ('betriebseinnahme', 'betriebsausgabe', 'lohn', 'privat'));

comment on column public.categories.tax_role is
  'Steuerliche Rolle: betriebseinnahme | betriebsausgabe | lohn | privat. NULL = nicht zugeordnet, vererbt von der Oberkategorie.';
