-- valuables_current um die Spalte `shared` erweitern (ans ENDE, bisherige Spalten und Reihenfolge unveraendert).
-- Grund: Die View wurde mit v.* vor dem shared-Flag angelegt; Haushaltssichten brauchten einen ID-Umweg.
-- CREATE OR REPLACE VIEW darf Spalten nur anhaengen. Grants bleiben erhalten; security_invoker wird nachgezogen.
create or replace view public.valuables_current as
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
            WHEN ((v.kaufpreis IS NOT NULL) AND (v.kaufpreis > (0)::numeric) AND (lv.wert IS NOT NULL)) THEN round((((lv.wert - v.kaufpreis) / v.kaufpreis) * (100)::numeric), 1)
            ELSE NULL::numeric
        END AS rendite_prozent,
    hb.pfad AS hauptbild_pfad,
    (COALESCE(anz.gesamt, (0)::bigint))::integer AS bild_anzahl,
    (COALESCE(anz.fotos, (0)::bigint))::integer AS foto_anzahl,
    v.shared
   FROM (((public.valuables v
     LEFT JOIN LATERAL ( SELECT vv.wert,
            vv.bewertet_am,
            vv.quelle
           FROM public.valuable_valuations vv
          WHERE (vv.valuable_id = v.id)
          ORDER BY (vv.bewertet_am <= CURRENT_DATE) DESC,
                CASE
                    WHEN (vv.bewertet_am <= CURRENT_DATE) THEN vv.bewertet_am
                    ELSE NULL::date
                END DESC NULLS LAST, vv.bewertet_am
         LIMIT 1) lv ON (true))
     LEFT JOIN LATERAL ( SELECT vi.pfad
           FROM public.valuable_images vi
          WHERE (vi.valuable_id = v.id)
          ORDER BY vi.ist_hauptbild DESC, (vi.art = 'artwork'::text) DESC, vi.created_at DESC
         LIMIT 1) hb ON (true))
     LEFT JOIN LATERAL ( SELECT count(*) AS gesamt,
            count(*) FILTER (WHERE (vi.art = 'foto'::text)) AS fotos
           FROM public.valuable_images vi
          WHERE (vi.valuable_id = v.id)) anz ON (true));

alter view public.valuables_current set (security_invoker = on);
