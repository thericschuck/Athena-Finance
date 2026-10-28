-- Baseline 2026-10-26, Teil 04a: Funktionen (19 von 20; fn_take_snapshot in 04b). UNGETESTET.
-- Zeilenenden (CRLF in einigen Live-Quelltexten) auf LF normalisiert; inhaltlich unveraendert.
-- fn_recompute_account_balances referenziert View public.unified_transactions (plpgsql, Late Binding): View in 05 anlegen.

CREATE OR REPLACE FUNCTION public.balance_series(p_account_id uuid DEFAULT NULL::uuid, p_from date DEFAULT NULL::date)
 RETURNS TABLE(account_id uuid, von date, bis date, balance numeric)
 LANGUAGE sql
 STABLE
 SET search_path TO ''
AS $function$
  with s as (
    select b.account_id, b.snapshot_date as d, b.balance,
           lag(b.snapshot_date) over w as vor_d,
           lag(b.balance) over w as vor_b
    from public.account_balances b
    where (p_account_id is null or b.account_id = p_account_id)
      and (p_from is null or b.snapshot_date >= p_from)
    window w as (partition by b.account_id order by b.snapshot_date)
  ),
  marked as (
    select s.account_id, s.d, s.balance,
           sum(case when s.vor_d is null or s.d - s.vor_d <> 1 or s.balance is distinct from s.vor_b then 1 else 0 end)
             over (partition by s.account_id order by s.d) as lauf
    from s
  )
  select m.account_id, min(m.d) as von, max(m.d) as bis, m.balance
  from marked m
  group by m.account_id, m.lauf, m.balance
  order by m.account_id, min(m.d)
$function$;

CREATE OR REPLACE FUNCTION public.check_combo_guard(p_combo_id uuid)
 RETURNS void
 LANGUAGE plpgsql
 SET search_path TO 'public'
AS $function$
DECLARE
  v_failures  text[] := '{}';
  v_authors   text[];
  v_types     text[];
  v_count     integer;
  v_forbidden boolean;
  v_repaints  boolean;
BEGIN
  SELECT COUNT(*) INTO v_count
  FROM combo_indicators WHERE combo_id = p_combo_id;

  SELECT array_agg(author) INTO v_authors
  FROM (
    SELECT i.author, COUNT(*) as cnt
    FROM combo_indicators ci
    JOIN indicators i ON i.id = ci.indicator_id
    WHERE ci.combo_id = p_combo_id
    GROUP BY i.author
    HAVING COUNT(*) > 1
  ) dupes;

  IF v_authors IS NOT NULL THEN
    v_failures := v_failures || ('Doppelter Author: ' || array_to_string(v_authors, ', '))::text;
  END IF;

  SELECT array_agg(type) INTO v_types
  FROM (
    SELECT i.type, COUNT(*) as cnt
    FROM combo_indicators ci
    JOIN indicators i ON i.id = ci.indicator_id
    WHERE ci.combo_id = p_combo_id
    GROUP BY i.type
    HAVING COUNT(*) > 1
  ) dupes;

  IF v_types IS NOT NULL THEN
    v_failures := v_failures || ('Doppelter Typ: ' || array_to_string(v_types, ', '))::text;
  END IF;

  SELECT EXISTS (
    SELECT 1 FROM combo_indicators ci
    JOIN indicators i ON i.id = ci.indicator_id
    WHERE ci.combo_id = p_combo_id AND i.is_forbidden = true
  ) INTO v_forbidden;

  IF v_forbidden THEN
    v_failures := array_append(v_failures, 'Verbotener Indikator enthalten');
  END IF;

  SELECT EXISTS (
    SELECT 1 FROM combo_indicators ci
    JOIN indicators i ON i.id = ci.indicator_id
    WHERE ci.combo_id = p_combo_id AND i.repaints = true
  ) INTO v_repaints;

  IF v_repaints THEN
    v_failures := array_append(v_failures, 'Repainting-Indikator enthalten');
  END IF;

  UPDATE combos SET
    indicator_count = v_count,
    passes_guard    = (array_length(v_failures, 1) IS NULL),
    guard_failures  = CASE WHEN array_length(v_failures, 1) IS NULL THEN NULL ELSE v_failures END,
    updated_at      = now()
  WHERE id = p_combo_id;
END;
$function$;

CREATE OR REPLACE FUNCTION public.fn_asset_price_eur(p_asset_id uuid, p_symbol text, p_type text, p_avg numeric, p_date date)
 RETURNS numeric
 LANGUAGE sql
 STABLE
 SET search_path TO 'public'
AS $function$
  select case
    when p_type = 'fiat' then
      case when upper(coalesce(p_symbol, '')) in ('EUR', 'ZEUR') then 1 else
        coalesce(
          (select av.price_per_unit
             from asset_valuations av
            where av.asset_id = p_asset_id
              and av.valuation_date <= p_date
              and av.price_per_unit > 0
            order by av.valuation_date desc, av.created_at desc
            limit 1),
          0)
      end

    when p_type in ('crypto', 'stable') then
      coalesce(
        -- 1. Was heute schon jemand geschrieben hat (Kraken-Sync alle 6 h).
        (select av.price_per_unit
           from asset_valuations av
          where av.asset_id = p_asset_id
            and av.valuation_date = p_date
            and av.price_per_unit > 0
          order by av.created_at desc
          limit 1),
        -- 2. Frischer CoinGecko-Cache (max. 2 Tage alt).
        (select cpc.price_eur
           from crypto_price_cache cpc
          where cpc.symbol = upper(p_symbol)
            and cpc.price_eur > 0
            and cpc.updated_at > (p_date::timestamptz - interval '2 days')
          limit 1),
        -- 3. Letzter bekannter echter Kurs vor dem Stichtag.
        (select av.price_per_unit
           from asset_valuations av
          where av.asset_id = p_asset_id
            and av.valuation_date < p_date
            and av.price_per_unit > 0
          order by av.valuation_date desc, av.created_at desc
          limit 1),
        nullif(p_avg, 0),
        0)

    else
      coalesce(
        nullif(p_avg, 0),
        (select av.price_per_unit
           from asset_valuations av
          where av.asset_id = p_asset_id
            and av.valuation_date <= p_date
            and av.price_per_unit > 0
          order by av.valuation_date desc, av.created_at desc
          limit 1),
        0)
  end;
$function$;

CREATE OR REPLACE FUNCTION public.fn_audit()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_user uuid;
  v_id   uuid;
begin
  if TG_OP = 'UPDATE' and to_jsonb(old) = to_jsonb(new) then
    return new;
  end if;

  v_user := coalesce(
    auth.uid(),
    case when TG_OP = 'DELETE' then (to_jsonb(old) ->> 'user_id')::uuid
         else (to_jsonb(new) ->> 'user_id')::uuid end
  );
  if v_user is null then
    return case when TG_OP = 'DELETE' then old else new end;
  end if;

  v_id := case when TG_OP = 'DELETE' then (to_jsonb(old) ->> 'id')::uuid
               else (to_jsonb(new) ->> 'id')::uuid end;

  insert into public.audit_log (user_id, table_name, record_id, action, old_values, new_values)
  values (
    v_user, TG_TABLE_NAME, v_id, TG_OP,
    case when TG_OP = 'INSERT' then null else to_jsonb(old) end,
    case when TG_OP = 'DELETE' then null else to_jsonb(new) end
  );

  return case when TG_OP = 'DELETE' then old else new end;
end;
$function$;

CREATE OR REPLACE FUNCTION public.fn_clean_bank_description(p_text text, p_fallback text)
 RETURNS text
 LANGUAGE sql
 IMMUTABLE
 SET search_path TO 'public'
AS $function$
  select coalesce(
    nullif(btrim(regexp_replace(coalesce(p_text, ''),
      '\s*(SecureGo [Pp]lus|EREF:|MREF:|CRED:|SVWZ:|ABWA:|ABWE:|IBAN:|BIC:).*$', '')), ''),
    nullif(btrim(coalesce(p_fallback, '')), ''),
    nullif(btrim(coalesce(p_text, '')), '')
  );
$function$;

CREATE OR REPLACE FUNCTION public.fn_ensure_linked_account(p_user_id uuid, p_iban text, p_account_name text, p_booked_balance numeric, p_currency text)
 RETURNS uuid
 LANGUAGE plpgsql
 SET search_path TO 'public', 'pg_temp'
AS $function$
declare
  v_account_id uuid;
  v_norm_iban  text := upper(replace(p_iban, ' ', ''));
begin
  select id into v_account_id from accounts
    where user_id = p_user_id and bank_iban = p_iban;

  if v_account_id is null then
    -- Match an existing manual account whose free-text iban (Girokonto's full IBAN, or
    -- Geschäftsanteile's bare Genossenschaftsanteil-Nummer) is a substring of the synced IBAN.
    select id into v_account_id from accounts
      where user_id = p_user_id
        and bank_iban is null
        and iban is not null
        and length(regexp_replace(iban, '\s', '', 'g')) > 0
        and v_norm_iban ilike '%' || upper(regexp_replace(iban, '\s', '', 'g')) || '%'
      order by created_at
      limit 1;

    if v_account_id is not null then
      update accounts set bank_iban = p_iban, updated_at = now() where id = v_account_id;
    else
      insert into accounts (user_id, name, type, iban, bank_iban, institution, currency, is_active)
      values (
        p_user_id,
        coalesce(p_account_name, 'Konto …' || right(p_iban, 4)),
        'checking',
        p_iban,
        p_iban,
        'Raiffeisenbank',
        coalesce(p_currency, 'EUR'),
        true
      )
      returning id into v_account_id;
    end if;
  end if;

  -- Keep account_balances current so fn_take_snapshot's net-worth totals pick up synced
  -- accounts automatically, without any change to that function.
  -- account_balances.source is constrained to ('cron','manual','backfill') — this counts as
  -- an automated/cron-style write, not a hand-entered one.
  insert into account_balances (account_id, snapshot_date, balance, currency, source)
  values (v_account_id, current_date, p_booked_balance, coalesce(p_currency, 'EUR'), 'cron')
  on conflict (account_id, snapshot_date) do update
    set balance = excluded.balance, source = excluded.source;

  return v_account_id;
end;
$function$;

CREATE OR REPLACE FUNCTION public.fn_fund_price_eur(p_isin text, p_date date)
 RETURNS numeric
 LANGUAGE sql
 STABLE
 SET search_path TO 'public'
AS $function$
  select coalesce(
    (select fph.price
       from fund_price_history fph
      where fph.isin = p_isin
        and fph.price_date <= p_date
      order by fph.price_date desc
      limit 1),
    (select round(sum(dt.amount_eur) / nullif(sum(dt.shares), 0), 4)
       from depot_transactions dt
      where dt.isin = p_isin
        and dt.shares > 0),
    0);
$function$;

CREATE OR REPLACE FUNCTION public.fn_link_bank_account()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'public', 'pg_temp'
AS $function$
begin
  perform fn_ensure_linked_account(
    new.user_id, new.account_iban, new.account_name, new.booked_balance, new.currency
  );
  return new;
end;
$function$;

CREATE OR REPLACE FUNCTION public.fn_recompute_account_balances(p_uid uuid, p_date date)
 RETURNS integer
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_rows integer;
begin
  with mov as (
    -- Wirkung jeder Zeile auf ihr EIGENES Konto.
    select
      ut.account_id                     as acc,
      coalesce(ut.booked_date, ut.date) as d,
      ut.signed_amount                  as delta
    from unified_transactions ut
    where ut.user_id = p_uid
      and ut.account_id is not null

    union all

    -- Gegenbuchung einer MANUELLEN Umbuchung. Nur dort noetig: `transactions` speichert eine
    -- Umbuchung als eine Zeile (Abgang hier, Zugang auf transfer_to), FinTS dagegen liefert
    -- beide Seiten als eigene Buchung -- die haengen oben schon je an ihrem Konto.
    select
      ut.transfer_to,
      coalesce(ut.booked_date, ut.date),
      coalesce(ut.amount_base, ut.amount * coalesce(ut.fx_rate, 1))
    from unified_transactions ut
    where ut.user_id = p_uid
      and ut.source = 'manual'
      and ut.type = 'transfer'
      and ut.transfer_to is not null
  )
  insert into account_balances (account_id, balance, currency, snapshot_date, source)
  select
    a.id,
    round(case
      when bb.booked_balance is not null then bb.booked_balance - coalesce(seither.s, 0)
      else                                    coalesce(bisher.s, 0)
    end, 2),
    a.currency,
    p_date,
    'cron'
  from accounts a
  left join bank_balance bb
    on  bb.user_id       = a.user_id
    and a.bank_iban     is not null
    and bb.account_iban  = a.bank_iban
  left join lateral (
    select sum(m.delta) as s from mov m
    where m.acc = a.id and m.d <= p_date
  ) bisher on true
  left join lateral (
    -- Nach dem Stichtag, aber bis heute: der Betrag, um den der Anker zu weit vorn liegt.
    select sum(m.delta) as s from mov m
    where m.acc = a.id and m.d > p_date and m.d <= current_date
  ) seither on true
  where a.user_id = p_uid
    and a.is_active = true
  on conflict (account_id, snapshot_date) do update
    set balance = excluded.balance,
        source  = 'cron';

  get diagnostics v_rows = row_count;
  return v_rows;
end;
$function$;

CREATE OR REPLACE FUNCTION public.fn_recompute_monthly_summary(p_uid uuid, p_month date)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
begin
  -- Absichtlich leer: monthly_finance_summary ist Archiv, Summen kommen aus monthly_flows.
  return;
end;
$function$;

CREATE OR REPLACE FUNCTION public.fn_snapshot_after_bank_sync()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
begin
  begin
    perform fn_take_snapshot(current_date);
  exception when others then
    raise warning 'fn_snapshot_after_bank_sync: Snapshot nicht aktualisiert (%)', sqlerrm;
  end;
  return null;
end;
$function$;

CREATE OR REPLACE FUNCTION public.fn_valuables_total(p_uid uuid, p_date date)
 RETURNS numeric
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  select round(coalesce(sum(lv.wert), 0), 2)
  from valuables v
  join lateral (
    select wert from valuable_valuations vv
    where vv.valuable_id = v.id and vv.bewertet_am <= p_date
    order by vv.bewertet_am desc limit 1
  ) lv on true
  where v.user_id = p_uid
    and v.is_active = true
    and v.im_vermoegen = true
    and (v.gekauft_am  is null or v.gekauft_am  <= p_date)
    and (v.verkauft_am is null or v.verkauft_am  > p_date);
$function$;

CREATE OR REPLACE FUNCTION public.handle_new_strategy()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'public'
AS $function$
BEGIN
  INSERT INTO submission_checklist (strategy_id) VALUES (NEW.id);
  RETURN NEW;
END;
$function$;

CREATE OR REPLACE FUNCTION public.handle_new_user()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
  INSERT INTO public.user_profiles (id)
  VALUES (NEW.id);
  RETURN NEW;
END;
$function$;

CREATE OR REPLACE FUNCTION public.search_ai_knowledge(q text, max_results integer DEFAULT 5)
 RETURNS TABLE(id uuid, title text, content text, tags text[], source_url text, rank real)
 LANGUAGE sql
 STABLE
 SET search_path TO 'public'
AS $function$
  select k.id, k.title, k.content, k.tags, k.source_url,
         ts_rank(k.content_tsv, websearch_to_tsquery('german', q)) as rank
    from ai_knowledge k
   where k.user_id = auth.uid()
     and (k.content_tsv @@ websearch_to_tsquery('german', q)
          or k.title ilike '%' || q || '%')
   order by k.pinned desc, rank desc, k.updated_at desc
   limit least(max_results, 20);
$function$;

CREATE OR REPLACE FUNCTION public.search_ai_memories(q text, max_results integer DEFAULT 10)
 RETURNS TABLE(id uuid, key text, content text, category text, source text, rank real)
 LANGUAGE sql
 STABLE
 SET search_path TO 'public'
AS $function$
  select m.id, m.key, m.content, m.category, m.source,
         ts_rank(m.content_tsv, websearch_to_tsquery('german', q)) as rank
    from ai_memories m
   where m.user_id = auth.uid()
     and (m.content_tsv @@ websearch_to_tsquery('german', q)
          or m.key ilike '%' || q || '%'
          or m.content ilike '%' || q || '%')
   order by rank desc, m.updated_at desc
   limit least(max_results, 30);
$function$;

CREATE OR REPLACE FUNCTION public.touch_ai_conversation()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
begin
  update ai_conversations set updated_at = now() where id = new.conversation_id;
  return new;
end;
$function$;

CREATE OR REPLACE FUNCTION public.trg_combo_guard_fn()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'public'
AS $function$
BEGIN
  IF TG_OP = 'DELETE' THEN
    PERFORM check_combo_guard(OLD.combo_id);
  ELSE
    PERFORM check_combo_guard(NEW.combo_id);
  END IF;
  RETURN COALESCE(NEW, OLD);
END;
$function$;

CREATE OR REPLACE FUNCTION public.update_updated_at()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'public'
AS $function$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$function$;
