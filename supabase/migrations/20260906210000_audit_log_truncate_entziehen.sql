-- Nachtrag zu 20260906200000: `revoke insert, update, delete` liess TRUNCATE
-- stehen. Damit haette sich das gesamte Aenderungsprotokoll in einem Rutsch
-- leeren lassen -- der Rest der Absicherung waere Kosmetik gewesen.
revoke truncate on public.audit_log from authenticated, anon;

-- Dasselbe fuers Belegarchiv: keine DELETE-Policy zu vergeben, aber TRUNCATE
-- offen zu lassen, waere derselbe Fehler.
revoke truncate on public.belege from authenticated, anon;
