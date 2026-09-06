-- Die Bruecke zwischen Kategorie und Formular: die Zeilen der Anlage EUER.
--
-- Warum als Tabelle und nicht im Code -- dieselbe Begruendung wie bei
-- tax_tariffs, und hier sogar zwingender: die Zeilennummern verschieben sich
-- jaehrlich. Die Anlage EUER 2025 ist inhaltlich fast identisch mit 2024, aber
-- eine neu eingefuegte Zeile in der Anlage AVEUER hat alle nachfolgenden
-- Nummern verschoben. Koeffizienten im Code waeren nach einem Jahr still falsch.

create table if not exists public.euer_zeilen (
  jahr        integer not null,
  zeile       integer not null,
  bezeichnung text    not null,

  -- einnahme | ausgabe: eine Zeile, in die Buchungen fliessen.
  -- summe | ergebnis: eine Zeile, die gerechnet und nicht befuellt wird.
  art         text    not null check (art in ('einnahme', 'ausgabe', 'summe', 'ergebnis')),

  -- Die Auffangzeile ihrer Art. Was keiner Zeile zugeordnet ist, landet hier --
  -- sichtbar markiert, nie stillschweigend. Genau eine je Art und Jahr.
  sammelzeile boolean not null default false,

  quelle      text    not null,
  geprueft_am date    not null,

  primary key (jahr, zeile)
);

comment on table public.euer_zeilen is
  'Zeilen der Anlage EUER je Veranlagungszeitraum. Referenzdaten fuer alle Nutzer, kein user_id.';

create unique index if not exists euer_zeilen_eine_sammelzeile_je_art
  on public.euer_zeilen (jahr, art)
  where sammelzeile;

alter table public.euer_zeilen enable row level security;

drop policy if exists "euer_zeilen_read" on public.euer_zeilen;
create policy "euer_zeilen_read"
  on public.euer_zeilen for select to authenticated using (true);

-- Anlage EUER 2025. Zeile 12, 75 und 76 sind gegen zwei unabhaengige Quellen
-- geprueft; die uebrigen stammen aus der amtlichen Anleitung.
--
-- Bewusst NICHT vollstaendig: die Anlage hat Zeilen 12 bis 76, hier stehen nur
-- die, die fuer einen Dienstleister ohne Waren, Personal und Fahrzeug in Frage
-- kommen. Was fehlt, faellt nicht durch -- es landet in der Sammelzeile 60 und
-- wird dort ausgewiesen.
insert into public.euer_zeilen (jahr, zeile, bezeichnung, art, sammelzeile, quelle, geprueft_am) values
  (2025, 12, 'Betriebseinnahmen als umsatzsteuerlicher Kleinunternehmer (§ 19 Abs. 1 UStG)', 'einnahme', true,
   'Anleitung zur Anlage EUER 2025 (elster.de), bestaetigt durch Haufe', '2026-09-06'),
  (2025, 23, 'Summe der Betriebseinnahmen', 'summe', false,
   'Anleitung zur Anlage EUER 2025 (elster.de)', '2026-09-06'),
  (2025, 29, 'Bezogene Leistungen (Fremdleistungen, freie Mitarbeiter, Provisionen)', 'ausgabe', false,
   'Anleitung zur Anlage EUER 2025 (elster.de)', '2026-09-06'),
  (2025, 33, 'Absetzung fuer Abnutzung auf abnutzbare Wirtschaftsgueter', 'ausgabe', false,
   'Anleitung zur Anlage EUER 2025 (elster.de)', '2026-09-06'),
  (2025, 36, 'Aufwendungen fuer geringwertige Wirtschaftsgueter (§ 6 Abs. 2 EStG)', 'ausgabe', false,
   'Anleitung zur Anlage EUER 2025 (elster.de)', '2026-09-06'),
  (2025, 39, 'Miete und Pacht fuer Raeume und Grundstuecke', 'ausgabe', false,
   'Anleitung zur Anlage EUER 2025 (elster.de)', '2026-09-06'),
  (2025, 50, 'Aufwendungen fuer Telekommunikation', 'ausgabe', false,
   'Anleitung zur Anlage EUER 2025 (elster.de)', '2026-09-06'),
  (2025, 51, 'Fortbildungskosten', 'ausgabe', false,
   'Anleitung zur Anlage EUER 2025 (elster.de)', '2026-09-06'),
  (2025, 52, 'Werbekosten', 'ausgabe', false,
   'Anleitung zur Anlage EUER 2025 (elster.de)', '2026-09-06'),
  (2025, 60, 'Uebrige unbeschraenkt abziehbare Betriebsausgaben', 'ausgabe', true,
   'Anleitung zur Anlage EUER 2025 (elster.de)', '2026-09-06'),
  (2025, 64, 'Verpflegungsmehraufwendungen bei Geschaeftsreisen', 'ausgabe', false,
   'Anleitung zur Anlage EUER 2025 (elster.de)', '2026-09-06'),
  (2025, 75, 'Summe der Betriebsausgaben', 'summe', false,
   'Anleitung zur Anlage EUER 2025 (elster.de), bestaetigt durch Haufe', '2026-09-06'),
  (2025, 76, 'Gewinn oder Verlust', 'ergebnis', false,
   'Anleitung zur Anlage EUER 2025 (elster.de), bestaetigt durch Haufe', '2026-09-06')
on conflict (jahr, zeile) do nothing;

-- Welche EUER-Zeile eine Kategorie trifft.
--
-- tax_role allein reicht nicht: alle Betriebsausgaben tragen dieselbe Rolle,
-- verteilen sich im Formular aber auf die Zeilen 29 bis 64. Kein
-- Fremdschluessel, weil die Zeile nur zusammen mit dem Jahr eindeutig ist --
-- geprueft wird beim Rechnen, und eine unbekannte Nummer landet in der
-- Sammelzeile statt zu verschwinden.
--
-- Vererbt sich wie tax_role von der Oberkategorie.
alter table public.categories
  add column if not exists euer_zeile integer;

alter table public.categories
  drop constraint if exists categories_euer_zeile_check;

alter table public.categories
  add constraint categories_euer_zeile_check
  check (euer_zeile is null or (euer_zeile > 0 and euer_zeile < 200));

comment on column public.categories.euer_zeile is
  'Zeile der Anlage EUER, in die Buchungen dieser Kategorie fliessen. NULL = Sammelzeile, vererbt von der Oberkategorie.';
