-- FinTS-Client-State pro Bank-Login persistieren.
--
-- Warum: python-fints handelt beim ersten Dialog eine Kundensystem-ID aus
-- (HKSYN3 / SynchronizationMode.NEW_SYSTEM_ID). Ohne persistierte System-ID macht
-- JEDER Sync-Lauf diese Erstsynchronisierung erneut — die Bank sieht dann jedes Mal
-- einen neuen, unbekannten Zugang und verlangt zwingend eine starke Kundenauthenti-
-- fizierung (SecureGo-plus-Freigabe in der App). Mit persistierter System-ID greift
-- dagegen die PSD2-Ausnahme nach Art. 10 RTS: Kontoinformationen der letzten 90 Tage
-- sind nach EINER SCA für 90 Tage freigabefrei abrufbar.
--
-- Inhalt von state_blob: das Ergebnis von FinTS3PinTanClient.deconstruct(
-- including_private=True), base64-kodiert. Laut python-fints enthält dieser Blob
-- ausdrücklich WEDER die PIN NOCH Verbindungsdaten — nur System-ID, BPD/UPD (Bank-
-- und Userparameter), das gewählte TAN-Verfahren und TAN-Medium. Die darin ent-
-- haltenen Kontonummern/-namen liegen in bank_transactions ohnehin bereits im
-- Klartext, deshalb wird hier bewusst nicht zusätzlich verschlüsselt; der Schutz
-- ist die RLS unten (kein Zugriff außer service_role).

create table if not exists public.fints_client_state (
  user_id            uuid        not null references auth.users(id) on delete cascade,
  -- sha256("<blz>:<username>")[:32] — stabil pro Bank-Login, unabhängig davon, an
  -- welcher Stelle das Profil in FINTS_BANK{N}_* konfiguriert ist, und ohne den
  -- VR-NetKey im Klartext abzulegen.
  bank_key           text        not null,
  -- Nur zur Diagnose in der UI ("Raiffeisenbank", "Bank 2", ...).
  bank_label         text,
  state_blob         text        not null,
  -- Letzte erfolgreich abgeschlossene starke Kundenauthentifizierung. Die 90-Tage-
  -- Frist läuft ab hier; danach fordert die Bank wieder eine App-Freigabe.
  last_sca_at        timestamptz,
  -- Gesetzt, sobald ein unbeaufsichtigter Lauf (Cron) abgebrochen ist, weil die Bank
  -- eine Freigabe verlangt hat. Die /bank-Seite zeigt daraufhin einen Hinweis, dass
  -- ein manueller Sync nötig ist. Wird beim nächsten erfolgreichen Sync geleert.
  sca_required_since timestamptz,
  updated_at         timestamptz not null default now(),
  primary key (user_id, bank_key)
);

comment on table public.fints_client_state is
  'Persistierter python-fints Client-State (System-ID/BPD/UPD) je Bank-Login. Verhindert, dass jeder Sync eine SCA auslöst.';

alter table public.fints_client_state enable row level security;

-- Bewusst KEINE Policies: der State wird ausschließlich serverseitig gelesen und
-- geschrieben (Service-Role-Client in den API-Routes bzw. der Vercel-Python-Function).
-- Ohne Policy kommt weder anon noch authenticated an die Zeilen heran.
