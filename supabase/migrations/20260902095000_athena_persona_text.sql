-- Eigene Fassung der Haltung als Freitext.
--
-- Nullable mit Absicht: NULL heisst "nutzt die Vorlage aus dem Code
-- unveraendert" und bindet Eric an spaetere Verbesserungen daran. Erst wenn er
-- den Text tatsaechlich aendert, liegt hier eine Kopie — siehe
-- saveAthenaSettings, das eine unveraenderte Kopie bewusst zu NULL macht.
--
-- `persona` bleibt daneben stehen und ist dann nur noch die Herkunftsangabe:
-- welche Vorlage war der Startpunkt. Das Formular braucht sie, um "eigene
-- Fassung" von "Vorlage" unterscheiden und die Vorlage wiederherstellen zu
-- koennen.
--
-- Laengenbegrenzung auf DB-Ebene, nicht nur im Formular: der Text wandert in
-- jeden einzelnen API-Aufruf eines agentischen Laufs. 6.000 Zeichen sind rund
-- 1.700 Tokens; die laengste eingebaute Vorlage liegt bei ~4.500 Zeichen.
-- Gleiche Grenze fuer custom_instructions, aus demselben Grund.
alter table ai_settings
  add column if not exists persona_text text;

alter table ai_settings
  drop constraint if exists ai_settings_persona_text_len;

alter table ai_settings
  add constraint ai_settings_persona_text_len
  check (persona_text is null or char_length(persona_text) <= 6000);

alter table ai_settings
  drop constraint if exists ai_settings_custom_instructions_len;

alter table ai_settings
  add constraint ai_settings_custom_instructions_len
  check (custom_instructions is null or char_length(custom_instructions) <= 6000);

comment on column ai_settings.persona_text is
  'Eigene Fassung der Haltung. NULL = Vorlage aus PERSONA_TEMPLATES (src/lib/assistant/prompts.ts) unveraendert nutzen. Schlaegt die Vorlage, sobald gesetzt.';
