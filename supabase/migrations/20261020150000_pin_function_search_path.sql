-- Haertung (Supabase-Advisor 0011 function_search_path_mutable): ohne festen search_path
-- loest eine Funktion unqualifizierte Namen ueber den search_path des Aufrufers auf; wer ein
-- Schema mit Vorrang anlegen kann, koennte so Objekte unterschieben.
--
-- Beide Funktionen greifen nur auf Tabellen in public (accounts, account_balances) und
-- eingebaute Funktionen zu - pg_catalog ist immer implizit zuerst im Pfad. Verhalten
-- unveraendert. pg_temp zuletzt, damit temporaere Objekte nichts ueberdecken.
--
-- Rueckgaengig: alter function public.<name>(<args>) reset search_path;

alter function public.fn_ensure_linked_account(uuid, text, text, numeric, text)
  set search_path = public, pg_temp;
alter function public.fn_link_bank_account()
  set search_path = public, pg_temp;
