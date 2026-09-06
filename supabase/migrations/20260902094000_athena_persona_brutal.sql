-- Vierte Grundhaltung `brutal` (siehe PERSONA_BLOCKS in
-- src/lib/assistant/prompts.ts). Die CHECK-Liste muss mit AthenaPersona in
-- src/lib/assistant/settings.ts synchron bleiben — deshalb ueberhaupt eine
-- eigene Migration statt eines stillen Code-Only-Anbaus.
alter table ai_settings
  drop constraint if exists ai_settings_persona_check;

alter table ai_settings
  add constraint ai_settings_persona_check
  check (persona in ('offensiv', 'schonungslos', 'brutal', 'sachlich'));

comment on column ai_settings.persona is
  'Athenas Grundhaltung: offensiv (Standard) | schonungslos | brutal | sachlich. Steuert den ersten Block des System-Prompts (PERSONA_BLOCKS in src/lib/assistant/prompts.ts), nicht ihre Rechte.';
