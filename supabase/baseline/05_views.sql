-- Baseline 2026-10-26, Teil 05: Views (12), Abhaengigkeitsreihenfolge, security_invoker wie live. UNGETESTET.
-- Abhaengigkeiten: category_tree -> unified_transactions -> monthly_flows -> monthly_flow_totals;
--                  unified_transactions -> account_balance_sums_unified.
-- Grants/RLS: Views erben bei security_invoker die RLS der Basistabellen.

CREATE VIEW public.category_tree WITH (security_invoker = on) AS
 WITH RECURSIVE tree AS (
         SELECT c.id,
            c.user_id,
            c.name,
            c.parent_id,
            c.type,
            c.id AS root_id,
            c.name AS root_name,
            0 AS depth,
            c.name AS path,
            c.tax_role AS tax_role_effective,
            c.euer_zeile AS euer_zeile_effective,
            ARRAY[c.id] AS seen
           FROM categories c
          WHERE c.parent_id IS NULL OR NOT (EXISTS ( SELECT 1
                   FROM categories p
                  WHERE p.id = c.parent_id))
        UNION ALL
         SELECT c.id,
            c.user_id,
            c.name,
            c.parent_id,
            c.type,
            t.root_id,
            t.root_name,
            t.depth + 1,
            (t.path || ' > '::text) || c.name,
            COALESCE(c.tax_role, t.tax_role_effective) AS "coalesce",
            COALESCE(c.euer_zeile, t.euer_zeile_effective) AS "coalesce",
            t.seen || c.id
           FROM categories c
             JOIN tree t ON c.parent_id = t.id
          WHERE NOT (c.id = ANY (t.seen))
        )
 SELECT tree.id,
    tree.user_id,
    tree.name,
    tree.parent_id,
    tree.type,
    tree.root_id,
    tree.root_name,
    tree.depth,
    tree.path,
    tree.tax_role_effective,
    tree.euer_zeile_effective
   FROM tree
UNION ALL
 SELECT c.id,
    c.user_id,
    c.name,
    c.parent_id,
    c.type,
    c.id AS root_id,
    c.name AS root_name,
    0 AS depth,
    c.name AS path,
    c.tax_role AS tax_role_effective,
    c.euer_zeile AS euer_zeile_effective
   FROM categories c
  WHERE NOT (EXISTS ( SELECT 1
           FROM tree t
          WHERE t.id = c.id));

CREATE VIEW public.unified_transactions WITH (security_invoker = on) AS
 WITH ct AS MATERIALIZED (
         SELECT category_tree.id,
            category_tree.root_id,
            category_tree.root_name,
            category_tree.path,
            category_tree.tax_role_effective,
            category_tree.euer_zeile_effective
           FROM category_tree
        )
 SELECT id,
    user_id,
    account_id,
    account_name,
    account_color,
    category_id,
    category_name,
    category_color,
    date,
    type,
    amount,
    amount_base,
    fx_rate,
    currency,
    description,
    merchant,
    transfer_to,
    contract_id,
    tags,
    source,
    category_type,
    signed_amount,
    booked_date,
    description_raw,
    flow_kind,
    amount_eur,
    root_category_id,
    root_category_name,
    category_path,
    tax_role_effective,
    euer_zeile_effective,
    flow_kind = ANY (ARRAY['echt'::text, 'anlage'::text, 'forderung'::text]) AS counts_in_flow,
    category_source,
    ai_category_id
   FROM ( SELECT t.id,
            t.user_id,
            t.account_id,
            a.name AS account_name,
            a.color AS account_color,
            t.category_id,
            c.name AS category_name,
            c.color AS category_color,
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
            'manual'::text AS source,
            c.type AS category_type,
                CASE
                    WHEN t.type = 'income'::text THEN COALESCE(t.amount_base, t.amount * COALESCE(t.fx_rate, 1::numeric))
                    WHEN t.type = 'expense'::text THEN - COALESCE(t.amount_base, t.amount * COALESCE(t.fx_rate, 1::numeric))
                    WHEN t.type = 'transfer'::text THEN - COALESCE(t.amount_base, t.amount * COALESCE(t.fx_rate, 1::numeric))
                    ELSE 0::numeric
                END AS signed_amount,
            t.date AS booked_date,
            t.description AS description_raw,
                CASE
                    WHEN t.type = 'transfer'::text THEN 'umbuchung'::text
                    WHEN t.description ~~* 'alter kontostand%'::text THEN 'anfangsbestand'::text
                    WHEN c.type = 'neutral'::text AND COALESCE(pc.name, c.name) = 'Schulden'::text THEN 'forderung'::text
                    WHEN c.type = 'neutral'::text AND COALESCE(pc.name, c.name) <> 'Transfers'::text THEN 'anlage'::text
                    ELSE 'echt'::text
                END AS flow_kind,
            abs(COALESCE(t.amount_base, t.amount * COALESCE(t.fx_rate, 1::numeric))) AS amount_eur,
            ct.root_id AS root_category_id,
            ct.root_name AS root_category_name,
            ct.path AS category_path,
            ct.tax_role_effective,
            ct.euer_zeile_effective,
            NULL::text AS category_source,
            NULL::uuid AS ai_category_id
           FROM transactions t
             LEFT JOIN accounts a ON a.id = t.account_id
             LEFT JOIN categories c ON c.id = t.category_id
             LEFT JOIN categories pc ON pc.id = c.parent_id
             LEFT JOIN ct ON ct.id = t.category_id
        UNION ALL
         SELECT bt.id,
            bt.user_id,
            a.id AS account_id,
            a.name AS account_name,
            a.color AS account_color,
            bt.category_id,
            c.name AS category_name,
            c.color AS category_color,
            bt.value_date AS date,
                CASE
                    WHEN own.id IS NOT NULL AND COALESCE(c.type, 'neutral'::text) = 'neutral'::text THEN 'transfer'::text
                    WHEN bt.amount >= 0::numeric THEN 'income'::text
                    ELSE 'expense'::text
                END AS type,
            abs(bt.amount) AS amount,
            abs(bt.amount) AS amount_base,
            1::numeric AS fx_rate,
            bt.currency,
            fn_clean_bank_description(COALESCE(bt.description, bt.raw_description), bt.counterpart_name) AS description,
            bt.counterpart_name AS merchant,
                CASE
                    WHEN COALESCE(c.type, 'neutral'::text) = 'neutral'::text THEN own.id
                    ELSE NULL::uuid
                END AS transfer_to,
            NULL::uuid AS contract_id,
            '{}'::text[] AS tags,
            'bank_sync'::text AS source,
            c.type AS category_type,
            bt.amount AS signed_amount,
            COALESCE(bt.entry_date, bt.value_date) AS booked_date,
            COALESCE(bt.description, bt.raw_description) AS description_raw,
                CASE
                    WHEN own.id IS NOT NULL AND COALESCE(c.type, 'neutral'::text) = 'neutral'::text THEN 'umbuchung'::text
                    WHEN c.type = 'neutral'::text AND COALESCE(pc.name, c.name) = 'Schulden'::text THEN 'forderung'::text
                    WHEN c.type = 'neutral'::text AND COALESCE(pc.name, c.name) <> 'Transfers'::text THEN 'anlage'::text
                    ELSE 'echt'::text
                END AS flow_kind,
            abs(bt.amount) AS amount_eur,
            ct.root_id AS root_category_id,
            ct.root_name AS root_category_name,
            ct.path AS category_path,
            ct.tax_role_effective,
            ct.euer_zeile_effective,
            bt.category_source,
            bt.ai_category_id
           FROM bank_transactions bt
             JOIN accounts a ON a.user_id = bt.user_id AND a.bank_iban = bt.account_iban
             LEFT JOIN categories c ON c.id = bt.category_id
             LEFT JOIN categories pc ON pc.id = c.parent_id
             LEFT JOIN accounts own ON own.user_id = bt.user_id AND own.bank_iban = bt.counterpart_iban
             LEFT JOIN ct ON ct.id = bt.category_id) u;

CREATE VIEW public.monthly_flows WITH (security_invoker = on) AS
 SELECT user_id,
    date_trunc('month'::text, date::timestamp with time zone)::date AS month,
    account_id,
    source,
    flow_kind,
    category_id,
    category_name,
    root_category_id,
    root_category_name,
    tax_role_effective,
    COALESCE(sum(amount_eur) FILTER (WHERE type = 'income'::text), 0::numeric) AS income,
    COALESCE(sum(amount_eur) FILTER (WHERE type = 'expense'::text), 0::numeric) AS expense,
    count(*)::integer AS tx_count
   FROM unified_transactions
  WHERE counts_in_flow
  GROUP BY user_id, (date_trunc('month'::text, date::timestamp with time zone)::date), account_id, source, flow_kind, category_id, category_name, root_category_id, root_category_name, tax_role_effective;

CREATE VIEW public.monthly_flow_totals WITH (security_invoker = on) AS
 SELECT user_id,
    month,
    sum(income) AS income,
    sum(expense) AS expense,
    COALESCE(sum(income) FILTER (WHERE flow_kind = 'echt'::text), 0::numeric) AS echt_income,
    COALESCE(sum(expense) FILTER (WHERE flow_kind = 'echt'::text), 0::numeric) AS echt_expense,
    COALESCE(sum(income) FILTER (WHERE flow_kind = 'anlage'::text), 0::numeric) AS anlage_income,
    COALESCE(sum(expense) FILTER (WHERE flow_kind = 'anlage'::text), 0::numeric) AS anlage_expense,
    COALESCE(sum(income) FILTER (WHERE flow_kind = 'forderung'::text), 0::numeric) AS forderung_income,
    COALESCE(sum(expense) FILTER (WHERE flow_kind = 'forderung'::text), 0::numeric) AS forderung_expense,
    sum(tx_count)::integer AS tx_count
   FROM monthly_flows
  GROUP BY user_id, month;

CREATE VIEW public.account_balance_sums_unified WITH (security_invoker = on) AS
 SELECT user_id,
    account_id,
    sum(delta) AS balance,
    count(*) FILTER (WHERE eigen)::integer AS tx_count
   FROM ( SELECT u.user_id,
            u.account_id,
            true AS eigen,
                CASE u.type
                    WHEN 'income'::text THEN u.amount
                    WHEN 'expense'::text THEN - u.amount
                    WHEN 'transfer'::text THEN u.signed_amount
                    ELSE 0::numeric
                END AS delta
           FROM unified_transactions u
          WHERE u.account_id IS NOT NULL
        UNION ALL
         SELECT u.user_id,
            u.transfer_to,
            false,
            u.amount
           FROM unified_transactions u
          WHERE u.source = 'manual'::text AND u.type = 'transfer'::text AND u.transfer_to IS NOT NULL) m
  GROUP BY user_id, account_id;

CREATE VIEW public.account_balance_sums_manual WITH (security_invoker = on) AS
 SELECT user_id,
    account_id,
    sum(delta) AS balance,
    count(*) FILTER (WHERE eigen)::integer AS tx_count
   FROM ( SELECT t.user_id,
            t.account_id,
            true AS eigen,
                CASE t.type
                    WHEN 'income'::text THEN t.amount
                    WHEN 'expense'::text THEN - t.amount
                    WHEN 'transfer'::text THEN - t.amount
                    ELSE 0::numeric
                END AS delta
           FROM transactions t
          WHERE t.account_id IS NOT NULL
        UNION ALL
         SELECT t.user_id,
            t.transfer_to,
            false,
            t.amount
           FROM transactions t
          WHERE t.type = 'transfer'::text AND t.transfer_to IS NOT NULL) m
  GROUP BY user_id, account_id;

CREATE VIEW public.asset_valuations_latest WITH (security_invoker = on) AS
 SELECT DISTINCT ON (asset_id) asset_id,
    price_per_unit,
    total_value,
    valuation_date
   FROM asset_valuations
  ORDER BY asset_id, valuation_date DESC, created_at DESC;

CREATE VIEW public.current_net_worth WITH (security_invoker = on) AS
 SELECT DISTINCT ON (user_id) user_id,
    snapshot_date,
    net_worth,
    total_assets,
    total_debts,
    total_crypto,
    total_depot
   FROM net_worth_snapshots
  ORDER BY user_id, snapshot_date DESC;

CREATE VIEW public.open_positions WITH (security_invoker = true) AS
 SELECT p.id,
    p.user_id,
    p.strategy_id,
    p.exchange_id,
    p.pair_id,
    p.direction,
    p.status,
    p.entry_price,
    p.exit_price,
    p.quantity,
    p.leverage,
    p.realized_pnl,
    p.fees_paid,
    p.opened_at,
    p.closed_at,
    p.source,
    p.notes,
    p.created_at,
    p.updated_at,
    tp.symbol,
    tp.base_asset,
    s.name AS strategy_name
   FROM positions p
     JOIN trading_pairs tp ON tp.id = p.pair_id
     LEFT JOIN strategies s ON s.id = p.strategy_id
  WHERE p.status = 'open'::text;

CREATE VIEW public.robustness_status WITH (security_invoker = true) AS
 SELECT s.id AS strategy_id,
    s.name,
    max(
        CASE
            WHEN rt.test_type = 'parameter'::text THEN rt.status
            ELSE NULL::text
        END) AS parameter_test,
    max(
        CASE
            WHEN rt.test_type = 'exchange'::text THEN rt.status
            ELSE NULL::text
        END) AS exchange_test,
    max(
        CASE
            WHEN rt.test_type = 'timeframe'::text THEN rt.status
            ELSE NULL::text
        END) AS timeframe_test,
        CASE
            WHEN max(
            CASE
                WHEN rt.test_type = 'parameter'::text THEN rt.status
                ELSE NULL::text
            END) = 'pass'::text AND max(
            CASE
                WHEN rt.test_type = 'exchange'::text THEN rt.status
                ELSE NULL::text
            END) = 'pass'::text AND max(
            CASE
                WHEN rt.test_type = 'timeframe'::text THEN rt.status
                ELSE NULL::text
            END) = 'pass'::text THEN true
            ELSE false
        END AS all_tests_pass
   FROM strategies s
     LEFT JOIN robustness_tests rt ON rt.strategy_id = s.id
  GROUP BY s.id, s.name;

CREATE VIEW public.submission_ready WITH (security_invoker = true) AS
 SELECT s.id,
    s.name,
    s.asset,
    s.timeframe,
    s.status
   FROM strategies s
     JOIN submission_checklist sc ON sc.strategy_id = s.id
  WHERE sc.tv_script_url = true AND sc.indicator_desc = true AND sc.stats_screenshot = true AND sc.equity_screenshot = true AND sc.inputs_screenshot = true AND sc.robustness_sheet = true AND sc.repaint_tested = true;

CREATE VIEW public.valuables_current WITH (security_invoker = on) AS
 SELECT v.id,
    v.user_id,
    v.name,
    v.kategorie,
    v.marke,
    v.modell,
    v.referenz,
    v.seriennummer,
    v.gekauft_am,
    v.kaufpreis,
    v.kaufquelle,
    v.waehrung,
    v.zustand,
    v.box_vorhanden,
    v.papiere_vorhanden,
    v.lagerort,
    v.versichert,
    v.versicherungsnummer,
    v.notizen,
    v.im_vermoegen,
    v.verkauft_am,
    v.verkaufspreis,
    v.is_active,
    v.sort_order,
    v.created_at,
    v.updated_at,
    v.nutzung,
    v.wertmodus,
    lv.wert AS aktueller_wert,
    lv.bewertet_am AS wert_stand,
    lv.quelle AS wert_quelle,
        CASE
            WHEN v.kaufpreis IS NOT NULL AND v.kaufpreis > 0::numeric AND lv.wert IS NOT NULL THEN round((lv.wert - v.kaufpreis) / v.kaufpreis * 100::numeric, 1)
            ELSE NULL::numeric
        END AS rendite_prozent,
    hb.pfad AS hauptbild_pfad,
    COALESCE(anz.gesamt, 0::bigint)::integer AS bild_anzahl,
    COALESCE(anz.fotos, 0::bigint)::integer AS foto_anzahl
   FROM valuables v
     LEFT JOIN LATERAL ( SELECT vv.wert,
            vv.bewertet_am,
            vv.quelle
           FROM valuable_valuations vv
          WHERE vv.valuable_id = v.id
          ORDER BY (vv.bewertet_am <= CURRENT_DATE) DESC, (
                CASE
                    WHEN vv.bewertet_am <= CURRENT_DATE THEN vv.bewertet_am
                    ELSE NULL::date
                END) DESC NULLS LAST, vv.bewertet_am
         LIMIT 1) lv ON true
     LEFT JOIN LATERAL ( SELECT vi.pfad
           FROM valuable_images vi
          WHERE vi.valuable_id = v.id
          ORDER BY vi.ist_hauptbild DESC, (vi.art = 'artwork'::text) DESC, vi.created_at DESC
         LIMIT 1) hb ON true
     LEFT JOIN LATERAL ( SELECT count(*) AS gesamt,
            count(*) FILTER (WHERE vi.art = 'foto'::text) AS fotos
           FROM valuable_images vi
          WHERE vi.valuable_id = v.id) anz ON true;
