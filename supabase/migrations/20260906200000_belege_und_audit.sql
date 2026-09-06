-- Belegarchiv und Aenderungsprotokoll.
--
-- Die GoBD verlangen zweierlei: Belege muessen ueber die Aufbewahrungsfrist
-- unveraendert und lesbar bleiben, und Aufzeichnungen duerfen nicht so
-- geaendert werden, dass der urspruengliche Inhalt nicht mehr feststellbar ist.
-- Beides war bisher nicht erfuellt -- es gab gar keine Belegablage, und die
-- Tabelle audit_log stand seit Monaten leer da, weil kein einziger Trigger
-- hineinschrieb.

-- ─────────────────────────────────────────────────────────────────────────────
-- 1) Der Speicherort
--
-- Privat, wie `valuables`. Der Pfad beginnt mit der Nutzer-ID, darauf setzen
-- die Policies auf.
insert into storage.buckets (id, name, public)
values ('belege', 'belege', false)
on conflict (id) do nothing;

-- Lesen und Anlegen -- mehr nicht. KEIN update, KEIN delete: ein hochgeladener
-- Beleg wird nie ueberschrieben und nie geloescht. Wer einen falschen Beleg
-- erwischt hat, laedt den richtigen hoch; der alte Eintrag wird als ersetzt
-- markiert und bleibt. Das ist der Unterschied zwischen einem Archiv und einem
-- Ordner.
drop policy if exists "belege insert own" on storage.objects;
create policy "belege insert own"
  on storage.objects for insert to authenticated
  with check (bucket_id = 'belege' and (storage.foldername(name))[1] = (select auth.uid())::text);

drop policy if exists "belege read own" on storage.objects;
create policy "belege read own"
  on storage.objects for select to authenticated
  using (bucket_id = 'belege' and (storage.foldername(name))[1] = (select auth.uid())::text);

-- ─────────────────────────────────────────────────────────────────────────────
-- 2) Die Belege selbst
create table if not exists public.belege (
  id             uuid primary key default gen_random_uuid(),
  user_id        uuid not null references auth.users(id) on delete cascade,

  -- Die Buchung aus unified_transactions. Bewusst OHNE Fremdschluessel: die
  -- Sicht liegt ueber zwei Tabellen (transactions und bank_transactions), auf
  -- eine Sicht kann man nicht referenzieren. Ein Beleg ohne Buchung ist
  -- erlaubt -- man hat die Rechnung oft vor der Abbuchung.
  transaction_id uuid,

  pfad           text not null unique,
  dateiname      text not null,
  mime           text,
  groesse_bytes  bigint,

  -- Integritaetsnachweis: aendert sich die Datei, aendert sich der Hash. Beim
  -- Zusammenstellen der Unterlagen laesst sich damit zeigen, dass der Beleg
  -- derselbe ist wie beim Hochladen.
  sha256         text,

  beleg_datum    date,
  betrag         numeric(12,2),
  aussteller     text,
  notiz          text,

  -- Versionierung statt Ueberschreiben. Zeigt auf den Beleg, der diesen
  -- abgeloest hat; der alte bleibt lesbar.
  ersetzt_durch  uuid references public.belege(id),

  hochgeladen_am timestamptz not null default now()
);

create index if not exists belege_user_transaction_idx
  on public.belege (user_id, transaction_id);
create index if not exists belege_user_datum_idx
  on public.belege (user_id, beleg_datum desc);

comment on table public.belege is
  'Belegarchiv. Eintraege werden nie geloescht; ein ersetzter Beleg zeigt ueber ersetzt_durch auf seinen Nachfolger.';

alter table public.belege enable row level security;

drop policy if exists "belege_select_own" on public.belege;
create policy "belege_select_own" on public.belege
  for select to authenticated using (user_id = (select auth.uid()));

drop policy if exists "belege_insert_own" on public.belege;
create policy "belege_insert_own" on public.belege
  for insert to authenticated with check (user_id = (select auth.uid()));

-- Aendern ist erlaubt -- eine falsche Zuordnung muss korrigierbar sein -- aber
-- jede Aenderung landet im Protokoll (Trigger unten). Loeschen ist nicht
-- vorgesehen: es gibt keine DELETE-Policy.
drop policy if exists "belege_update_own" on public.belege;
create policy "belege_update_own" on public.belege
  for update to authenticated
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()));

-- ─────────────────────────────────────────────────────────────────────────────
-- 3) Das Aenderungsprotokoll
--
-- audit_log gibt es seit Monaten mit passenden Spalten und war leer, weil kein
-- Trigger hineinschrieb. Das wird hier nachgeholt.
create or replace function public.fn_audit()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_user uuid;
  v_id   uuid;
begin
  -- Bei UPDATE ohne echte Aenderung nichts protokollieren. Der Bank-Sync
  -- schreibt jede Buchung bei jedem Lauf per upsert zurueck; ohne diese Zeile
  -- waere das Protokoll nach einer Woche voller Eintraege, in denen sich nichts
  -- geaendert hat -- und damit unbrauchbar fuer den Zweck, fuer den es da ist.
  if TG_OP = 'UPDATE' and to_jsonb(old) = to_jsonb(new) then
    return new;
  end if;

  -- auth.uid() ist null, wenn der Cron oder ein Sidecar mit dem Service-Role
  -- schreibt. Dann zaehlt die Zeile selbst als Zuordnung.
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
    v_user,
    TG_TABLE_NAME,
    v_id,
    TG_OP,
    case when TG_OP = 'INSERT' then null else to_jsonb(old) end,
    case when TG_OP = 'DELETE' then null else to_jsonb(new) end
  );

  return case when TG_OP = 'DELETE' then old else new end;
end;
$function$;

comment on function public.fn_audit() is
  'Schreibt jede Aenderung an steuerlich relevanten Tabellen nach audit_log. GoBD: Aenderungen muessen nachvollziehbar bleiben.';

drop trigger if exists trg_audit_transactions on public.transactions;
create trigger trg_audit_transactions
  after insert or update or delete on public.transactions
  for each row execute function public.fn_audit();

drop trigger if exists trg_audit_bank_transactions on public.bank_transactions;
create trigger trg_audit_bank_transactions
  after insert or update or delete on public.bank_transactions
  for each row execute function public.fn_audit();

drop trigger if exists trg_audit_categories on public.categories;
create trigger trg_audit_categories
  after insert or update or delete on public.categories
  for each row execute function public.fn_audit();

drop trigger if exists trg_audit_belege on public.belege;
create trigger trg_audit_belege
  after insert or update or delete on public.belege
  for each row execute function public.fn_audit();

-- ─────────────────────────────────────────────────────────────────────────────
-- 4) Das Protokoll selbst muss unveraenderbar sein
--
-- Bisher galt auf audit_log eine einzige Policy "own_data" FOR ALL. Damit
-- haette der Nutzer seine eigenen Protokollzeilen aendern und loeschen koennen
-- -- ein Aenderungsprotokoll, das der Aendernde bereinigen kann, ist keins.
--
-- Lesen ja, alles andere nein. Geschrieben wird ausschliesslich durch
-- fn_audit(), und die laeuft als SECURITY DEFINER an der RLS vorbei.
drop policy if exists "own_data" on public.audit_log;
drop policy if exists "audit_log_select_own" on public.audit_log;

create policy "audit_log_select_own" on public.audit_log
  for select to authenticated using (user_id = (select auth.uid()));

revoke insert, update, delete on public.audit_log from authenticated, anon;

comment on table public.audit_log is
  'Aenderungsprotokoll. Nur lesbar; geschrieben ausschliesslich durch fn_audit(). Nicht aenderbar und nicht loeschbar -- das ist der Zweck.';
