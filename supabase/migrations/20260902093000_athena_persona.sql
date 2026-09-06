-- Athenas Grundhaltung als Einstellung, statt fest im Prompt-Code.
--
-- `not null default 'offensiv'` statt nullable: der Prompt braucht in jedem
-- Fall einen Identitaets-Block, und ein NULL waere ein Zustand, den
-- getAthenaSettings ohnehin sofort auf den Standard abbilden muesste.
--
-- Die CHECK-Beschraenkung haelt die Werte mit AthenaPersona in
-- src/lib/assistant/settings.ts synchron: ein Tippfehler per SQL faellt hier
-- auf und nicht erst als leerer Prompt-Block zur Laufzeit. Wird eine vierte
-- Persona ergaenzt, muss diese Liste mitwachsen.
alter table ai_settings
  add column if not exists persona text not null default 'offensiv';

alter table ai_settings
  drop constraint if exists ai_settings_persona_check;

alter table ai_settings
  add constraint ai_settings_persona_check
  check (persona in ('offensiv', 'schonungslos', 'sachlich'));

comment on column ai_settings.persona is
  'Athenas Grundhaltung: offensiv (Standard) | schonungslos | sachlich. Steuert den ersten Block des System-Prompts (PERSONA_BLOCKS in src/lib/assistant/prompts.ts), nicht ihre Rechte.';
