-- Inventar: Wertgegenstaende (Uhren, Feuerzeuge, Schmuck, ...).
--
-- Warum eine eigene Tabelle und nicht `assets`: dort steht Fungibles. Eine Zeile bedeutet
-- „x Stueck zu Kurs y" (quantity, avg_buy_price, symbol, exchange) und lebt davon, dass es
-- einen Marktpreis je Einheit gibt. Eine Uhr ist ein Einzelstueck mit Provenienz --
-- Seriennummer, Box, Papiere, Lagerort, Versicherung. Das in `assets` zu quetschen hiesse,
-- die Haelfte der Spalten leer zu lassen und die andere Haelfte umzudeuten.
--
-- Der Zweck ist zuerst das Register (Versicherung, Diebstahl, Wiederverkauf), erst danach
-- die Wertuebersicht.


-- == valuables ================================================================
create table if not exists valuables (
  id                  uuid primary key default gen_random_uuid(),
  user_id             uuid not null references auth.users(id) on delete cascade,

  name                text not null,
  kategorie           text not null default 'sonstiges',
  marke               text,
  modell              text,
  referenz            text,
  seriennummer        text,

  gekauft_am          date,
  kaufpreis           numeric,
  kaufquelle          text,
  waehrung            varchar(3) not null default 'EUR',

  -- neu | neuwertig | gut | gebraucht | defekt
  zustand             text,
  box_vorhanden       boolean not null default false,
  papiere_vorhanden   boolean not null default false,

  lagerort            text,
  versichert          boolean not null default false,
  versicherungsnummer text,

  -- Pfad im Storage-Bucket `valuables`, oder null -> die Karte zeigt das Kategorie-Icon.
  bild_url            text,
  notizen             text,

  -- Zaehlt dieses Stueck in die ausgewiesene Sammlungssumme? Default an, abwaehlbar fuer
  -- alles, dessen Wert man nicht ernsthaft beziffern kann (Erbstueck ohne Schaetzung,
  -- Geschenk, Bastelprojekt).
  im_vermoegen        boolean not null default true,

  -- Verkauft heisst nicht geloescht: das Stueck verschwindet aus der Vitrine und aus der
  -- Summe, bleibt aber als Historie erhalten -- fuer einen Stichtag VOR dem Verkauf zaehlt
  -- es weiterhin mit (siehe fn_valuables_total).
  verkauft_am         date,
  verkaufspreis       numeric,

  is_active           boolean not null default true,
  sort_order          integer not null default 0,
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now()
);

create index if not exists valuables_user_idx on valuables (user_id, is_active);


-- == valuable_valuations ======================================================
--
-- Eigene Tabelle statt eines Feldes `aktueller_wert` am Objekt: sonst gaebe es pro Stueck
-- genau einen Wert, und eine Korrektur wuerde die Vergangenheit mit umschreiben. Eine Uhr,
-- die man heute von 4.000 auf 6.000 EUR hochsetzt, waere dann auch 2024 schon 6.000 EUR
-- wert gewesen -- und der Wertverlauf der Sammlung waere eine gerade Linie.
--
-- Mit Historie gilt fuer einen Stichtag: die juengste Bewertung <= Stichtag.
create table if not exists valuable_valuations (
  id          uuid primary key default gen_random_uuid(),
  valuable_id uuid not null references valuables(id) on delete cascade,
  user_id     uuid not null references auth.users(id) on delete cascade,
  bewertet_am date not null default current_date,
  wert        numeric not null,
  -- kauf | manuell | schaetzung
  quelle      text not null default 'manuell',
  notiz       text,
  created_at  timestamptz not null default now(),
  unique (valuable_id, bewertet_am)
);

create index if not exists valuable_valuations_lookup_idx
  on valuable_valuations (valuable_id, bewertet_am desc);


-- == RLS ======================================================================
alter table valuables            enable row level security;
alter table valuable_valuations  enable row level security;

create policy "Users can read own valuables"
  on valuables for select using (auth.uid() = user_id);
create policy "Users can insert own valuables"
  on valuables for insert with check (auth.uid() = user_id);
create policy "Users can update own valuables"
  on valuables for update using (auth.uid() = user_id);
create policy "Users can delete own valuables"
  on valuables for delete using (auth.uid() = user_id);

create policy "Users can read own valuations"
  on valuable_valuations for select using (auth.uid() = user_id);
create policy "Users can insert own valuations"
  on valuable_valuations for insert with check (auth.uid() = user_id);
create policy "Users can update own valuations"
  on valuable_valuations for update using (auth.uid() = user_id);
create policy "Users can delete own valuations"
  on valuable_valuations for delete using (auth.uid() = user_id);


-- == View: Objekt + aktueller Wert ============================================
--
-- Spart jeder Seite den Lateral-Join. `security_invoker` wie bei unified_transactions,
-- damit die RLS des Aufrufers greift und nicht die des View-Besitzers.
create or replace view valuables_current with (security_invoker = on) as
select
  v.*,
  lv.wert        as aktueller_wert,
  lv.bewertet_am as wert_stand,
  lv.quelle      as wert_quelle,
  -- Wertentwicklung gegenueber dem Kaufpreis. Null, wenn eins von beidem fehlt --
  -- 0 waere hier gelogen ("keine Veraenderung" statt "unbekannt").
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


-- == Summe fuer einen Stichtag ================================================
--
-- Zaehlt nur, was an diesem Tag tatsaechlich im Besitz war: gekauft (oder ohne Kaufdatum,
-- dann von Anfang an) und noch nicht verkauft. Bewertet mit dem Wert, der DAMALS galt.
create or replace function fn_valuables_total(p_uid uuid, p_date date)
returns numeric
language sql
stable
security definer
set search_path = public
as $fn$
  select round(coalesce(sum(lv.wert), 0), 2)
  from valuables v
  join lateral (
    select wert
    from valuable_valuations vv
    where vv.valuable_id = v.id and vv.bewertet_am <= p_date
    order by vv.bewertet_am desc
    limit 1
  ) lv on true
  where v.user_id = p_uid
    and v.is_active = true
    and v.im_vermoegen = true
    and (v.gekauft_am  is null or v.gekauft_am  <= p_date)
    and (v.verkauft_am is null or v.verkauft_am  > p_date);
$fn$;

grant execute on function fn_valuables_total(uuid, date) to authenticated, service_role;


-- == Bewusst KEIN Net-Worth-Bucket =============================================
--
-- Sachwerte fliessen NICHT in net_worth_snapshots ein. Der Wert einer Uhr ist eine
-- Schaetzung; in den Vermoegensverlauf gemischt macht er aus einer harten Zahl eine
-- weiche. Das Inventar zeigt seine Summe deshalb auf der eigenen Seite und als getrennte
-- Kachel im Dashboard.
--
-- `fn_valuables_total(uid, datum)` oben existiert trotzdem: sie beantwortet „was war die
-- Sammlung an Tag X wert" fuer die Inventarseite selbst -- und waere der Einstiegspunkt,
-- falls die Sachwerte doch einmal in den Net Worth sollen. Dann braeuchte es zusaetzlich
-- eine Spalte `total_valuables` und ein Neuanlegen der generated columns `total_assets`
-- und `net_worth`, die heute genau sieben Toepfe summieren.
