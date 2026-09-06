/**
 * `flow_kind` — eine Spalte, die entscheidet, ob eine Buchung als Einnahme oder
 * Ausgabe zählt. Vorher stand in jeder Auswertung `type <> 'transfer'`, und damit
 * zählten 143 Buchungen mit, die nur Geld zwischen eigenen Töpfen bewegen:
 * Einnahmen waren um 29.550,58 € zu hoch, Ausgaben um 16.234,55 €.
 *
 *   umbuchung      Gegenkonto ist ein eigenes Konto. Die Erkennung läuft über die
 *                  Gegen-IBAN und steckt schon im bank_sync-Zweig unten
 *                  (`own.bank_iban = bt.counterpart_iban`) — deckt Girokonto,
 *                  geteiltes Konto und Geschäftsanteile ab. Dazu manuelle
 *                  Umbuchungen mit `transfer_to`.
 *   anfangsbestand „Alter Kontostand" — die drei Bauspar-Eröffnungssalden vom
 *                  2026-03-09 (6.585,95 €) waren als `income` gebucht. Ein
 *                  Anfangsbestand hat niemand verdient.
 *   anlage         Neutrale Kategorie außerhalb des Transfers-Baums: Crypto,
 *                  Depot, Bausparverträge, Sparkonto. Depot und Krypto liegen
 *                  außerhalb des Kontensystems, die IBAN-Regel kann sie nicht
 *                  sehen — hier trägt die Kategorie die Aussage. Geld dorthin
 *                  ist ein Tausch in Vermögen, kein Konsum; der Wert erscheint
 *                  in total_crypto bzw. total_depot.
 *   forderung      Neutrale Kategorie im Schulden-Baum. Verliehenes Geld ist
 *                  keine Ausgabe, zurückgezahltes keine Einnahme.
 *   echt           alles andere.
 *
 * Der Transfers-Baum bleibt bewusst `echt`. Dort stecken die Geldautomaten
 * (49 Buchungen, 12.335 €) — Entscheidung vom 2026-09-02: „wenn ausgezahlt, dann
 * ausgezahlt", Bargeld wird nicht als eigenes Konto geführt. Was sonst noch im
 * Baum liegt, sind 15 Buchungen von und an andere Personen; die zählen zu Recht.
 *
 * `signed_amount` bleibt unberührt — Kontostände hängen daran und ein Krypto-Kauf
 * senkt das Girokonto wirklich.
 */

/** Verwendungszweck ohne SEPA-Technik. 301 von 619 Buchungen tragen so einen Rattenschwanz. */
create or replace function public.fn_clean_bank_description(p_text text, p_fallback text)
returns text
language sql
immutable
set search_path to 'public'
as $function$
  select coalesce(
    -- Alles ab dem ersten technischen Marker abschneiden: „China Town SecureGo plus
    -- IBAN: DE02… BIC: FFVB…" wird zu „China Town".
    nullif(btrim(regexp_replace(coalesce(p_text, ''),
      '\s*(SecureGo [Pp]lus|EREF:|MREF:|CRED:|SVWZ:|ABWA:|ABWE:|IBAN:|BIC:).*$', '')), ''),
    -- Bleibt nichts übrig (10 Fälle, reines Rauschen), nimm den Zahlungspartner.
    nullif(btrim(coalesce(p_fallback, '')), ''),
    nullif(btrim(coalesce(p_text, '')), '')
  );
$function$;

create or replace view public.unified_transactions as
  select
    t.id,
    t.user_id,
    t.account_id,
    a.name  as account_name,
    a.color as account_color,
    t.category_id,
    c.name  as category_name,
    c.color as category_color,
    t.date,
    t.type,
    t.amount,
    t.amount_base,
    t.fx_rate,
    t.currency,
    t.description,
    t.merchant,
    t.transfer_to,
    t.contract_id,
    t.tags,
    'manual'::text as source,
    c.type as category_type,
    case
      when t.type = 'income'   then coalesce(t.amount_base, t.amount * coalesce(t.fx_rate, 1::numeric))
      when t.type = 'expense'  then -coalesce(t.amount_base, t.amount * coalesce(t.fx_rate, 1::numeric))
      when t.type = 'transfer' then -coalesce(t.amount_base, t.amount * coalesce(t.fx_rate, 1::numeric))
      else 0::numeric
    end as signed_amount,
    t.date as booked_date,
    t.description as description_raw,
    case
      when t.type = 'transfer'                                             then 'umbuchung'
      when t.description ilike 'alter kontostand%'                         then 'anfangsbestand'
      when c.type = 'neutral' and coalesce(pc.name, c.name) = 'Schulden'   then 'forderung'
      when c.type = 'neutral' and coalesce(pc.name, c.name) <> 'Transfers' then 'anlage'
      else 'echt'
    end as flow_kind
  from transactions t
    left join accounts a   on a.id = t.account_id
    left join categories c on c.id = t.category_id
    left join categories pc on pc.id = c.parent_id

  union all

  select
    bt.id,
    bt.user_id,
    a.id    as account_id,
    a.name  as account_name,
    a.color as account_color,
    bt.category_id,
    c.name  as category_name,
    c.color as category_color,
    bt.value_date as date,
    case
      when own.id is not null      then 'transfer'::text
      when bt.amount >= 0::numeric then 'income'::text
      else 'expense'::text
    end as type,
    abs(bt.amount) as amount,
    abs(bt.amount) as amount_base,
    1::numeric     as fx_rate,
    bt.currency,
    fn_clean_bank_description(
      coalesce(bt.description, bt.raw_description), bt.counterpart_name
    ) as description,
    bt.counterpart_name as merchant,
    own.id              as transfer_to,
    null::uuid          as contract_id,
    '{}'::text[]        as tags,
    'bank_sync'::text   as source,
    c.type              as category_type,
    bt.amount           as signed_amount,
    coalesce(bt.entry_date, bt.value_date) as booked_date,
    coalesce(bt.description, bt.raw_description) as description_raw,
    case
      when own.id is not null                                              then 'umbuchung'
      when c.type = 'neutral' and coalesce(pc.name, c.name) = 'Schulden'   then 'forderung'
      when c.type = 'neutral' and coalesce(pc.name, c.name) <> 'Transfers' then 'anlage'
      else 'echt'
    end as flow_kind
  from bank_transactions bt
    join accounts a on a.user_id = bt.user_id and a.bank_iban = bt.account_iban
    left join categories c  on c.id = bt.category_id
    left join categories pc on pc.id = c.parent_id
    left join accounts own  on own.user_id = bt.user_id and own.bank_iban = bt.counterpart_iban;
