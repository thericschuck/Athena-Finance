-- Ein Objekt im Bucket gehoert zu genau einer Zeile. Ohne das konnte ein Doppelklick oder Retry beim
-- Senden zwei Zeilen fuer dieselbe Datei anlegen (die Route prueft vorher nur per SELECT).
create unique index if not exists ai_files_user_pfad_uq on ai_files (user_id, pfad);
