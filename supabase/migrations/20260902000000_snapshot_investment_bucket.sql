-- ── Eigener Bucket für Geschäftsanteile ───────────────────────────────────────
--
-- `investment`-Konten liefen bisher in `total_checking` mit. Dadurch zeigte das
-- Dashboard 4.828,84 € „Girokonto", von denen 1.500 € Geschäftsanteile waren –
-- also gerade nicht liquide. Eigene Spalte, damit die Kachel wieder das meint,
-- was sie sagt.

alter table net_worth_snapshots
  add column if not exists total_investment numeric not null default 0;

-- total_assets/net_worth sind GENERATED ALWAYS und lassen sich nicht ändern,
-- nur ersetzen. Ihr Inhalt ist vollständig aus den übrigen Spalten ableitbar,
-- es geht also nichts verloren. current_net_worth liest beide und muss deshalb
-- mit weg und danach unverändert wieder her.
drop view current_net_worth;
alter table net_worth_snapshots drop column total_assets;
alter table net_worth_snapshots drop column net_worth;

alter table net_worth_snapshots
  add column total_assets numeric generated always as (
    total_checking + total_investment + total_savings + total_depot
    + total_bausparer + total_crypto + total_business + total_cash
  ) stored,
  add column net_worth numeric generated always as (
    total_checking + total_investment + total_savings + total_depot
    + total_bausparer + total_crypto + total_business + total_cash
    - total_debts
  ) stored;

create view current_net_worth as
  select distinct on (user_id)
    user_id, snapshot_date, net_worth, total_assets, total_debts,
    total_crypto, total_depot
  from net_worth_snapshots
  order by user_id, snapshot_date desc;

-- 'repair' = von Hand nachgezogene Altlast, kein Cron-Ergebnis. Bleibt als
-- Schätzung erkennbar und wird von fn_take_snapshot nicht überschrieben.
alter table net_worth_snapshots drop constraint net_worth_snapshots_source_check;
alter table net_worth_snapshots add constraint net_worth_snapshots_source_check
  check (source in ('cron', 'manual', 'backfill', 'repair'));

-- Historie umsortieren. Bewusst direkt aus account_balances gerechnet und nicht
-- „total_checking minus investment": account_balances ist die Quelle, aus der
-- der Snapshot ohnehin summiert, und reicht bis 2018 zurück.
with je_tag as (
  select
    a.user_id,
    ab.snapshot_date,
    round(coalesce(sum(case when a.type = 'investment' then ab.balance end), 0), 2) as investment,
    round(coalesce(sum(case when a.type = 'checking'   then ab.balance end), 0), 2) as checking
  from account_balances ab
  join accounts a on a.id = ab.account_id
  where a.is_active
  group by a.user_id, ab.snapshot_date
)
update net_worth_snapshots nws
set total_investment = je_tag.investment,
    total_checking   = je_tag.checking
from je_tag
where je_tag.user_id = nws.user_id
  and je_tag.snapshot_date = nws.snapshot_date;
