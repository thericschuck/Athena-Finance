-- Mehrere Bilder pro Gegenstand.
--
-- Vorher zwei Textspalten am Objekt: `foto_url` und `bild_url` (Migration 20260831000004).
-- Das reicht fuer genau ein Foto und genau ein Artwork. Gebraucht wird mehr: eine Uhr hat
-- Vorder- und Rueckseite, Zifferblatt, Box und Papiere -- und beim Generieren will man
-- auswaehlen, WELCHES dieser Bilder die Vorlage ist. Bei einer Uhr entscheidet genau das
-- ueber das Ergebnis: Zifferblatt oder Gehaeuseboden sind zwei voellig verschiedene Bilder.
--
--   art = 'foto'     hochgeladen. Beleg fuers Register UND Vorlage fuer die Generierung.
--   art = 'artwork'  erzeugt, rein zur Anzeige.
--
-- `ist_hauptbild` bestimmt, was die Vitrine zeigt. Nur eins pro Gegenstand -- das haelt der
-- partielle Unique-Index durch, statt sich auf die Anwendung zu verlassen. Wer es setzt,
-- muss deshalb erst alle zuruecksetzen und dann eins setzen; andersherum gibt es fuer einen
-- Moment zwei und der Index schlaegt zu (siehe setHauptbild in inventar/actions.ts).
create table if not exists valuable_images (
  id            uuid primary key default gen_random_uuid(),
  valuable_id   uuid not null references valuables(id) on delete cascade,
  user_id       uuid not null references auth.users(id) on delete cascade,
  pfad          text not null,
  art           text not null default 'foto',
  ist_hauptbild boolean not null default false,
  sort_order    integer not null default 0,
  created_at    timestamptz not null default now(),
  constraint valuable_images_art_check check (art in ('foto', 'artwork'))
);

create index if not exists valuable_images_lookup_idx
  on valuable_images (valuable_id, sort_order, created_at);

create unique index if not exists valuable_images_ein_hauptbild_idx
  on valuable_images (valuable_id) where ist_hauptbild;

alter table valuable_images enable row level security;

create policy "Users can read own images"   on valuable_images for select using (auth.uid() = user_id);
create policy "Users can insert own images" on valuable_images for insert with check (auth.uid() = user_id);
create policy "Users can update own images" on valuable_images for update using (auth.uid() = user_id);
create policy "Users can delete own images" on valuable_images for delete using (auth.uid() = user_id);

-- Die alten Einzelspalten fallen weg. Zwei parallele Wahrheiten fuer dasselbe waeren die
-- schlechtere Variante; zu migrieren gab es nichts, weil noch keine Bilder erfasst waren.
drop view if exists valuables_current;

alter table valuables drop column if exists bild_url;
alter table valuables drop column if exists foto_url;

-- Das Hauptbild kommt jetzt aus der Bildtabelle: ausdruecklich gesetztes Hauptbild zuerst,
-- sonst das juengste Artwork, sonst das juengste Foto. Die Zaehler sparen der Seite eine
-- zweite Abfrage nur fuer „hat das Objekt ueberhaupt Fotos".
create view valuables_current with (security_invoker = on) as
select
  v.*,
  lv.wert        as aktueller_wert,
  lv.bewertet_am as wert_stand,
  lv.quelle      as wert_quelle,
  case
    when v.kaufpreis is not null and v.kaufpreis > 0 and lv.wert is not null
      then round(((lv.wert - v.kaufpreis) / v.kaufpreis) * 100, 1)
  end as rendite_prozent,
  hb.pfad as hauptbild_pfad,
  coalesce(anz.gesamt, 0)::integer as bild_anzahl,
  coalesce(anz.fotos, 0)::integer  as foto_anzahl
from valuables v
left join lateral (
  select wert, bewertet_am, quelle
  from valuable_valuations vv
  where vv.valuable_id = v.id and vv.bewertet_am <= current_date
  order by vv.bewertet_am desc
  limit 1
) lv on true
left join lateral (
  select pfad
  from valuable_images vi
  where vi.valuable_id = v.id
  order by vi.ist_hauptbild desc,
           (vi.art = 'artwork') desc,
           vi.created_at desc
  limit 1
) hb on true
left join lateral (
  select count(*) as gesamt, count(*) filter (where vi.art = 'foto') as fotos
  from valuable_images vi
  where vi.valuable_id = v.id
) anz on true;

grant select on valuables_current to authenticated;

-- HEIC/HEIF ergaenzt: iPhones liefern das standardmaessig, und der Bucket hat solche
-- Uploads bisher STUMM abgelehnt -- einer der beiden Gruende, warum der Foto-Upload nicht
-- funktionierte. Limit auf 10 MB, weil 5 MB fuer ein modernes Handyfoto knapp sind.
update storage.buckets
set allowed_mime_types = array[
      'image/webp','image/png','image/jpeg','image/avif','image/gif',
      'image/heic','image/heif'
    ],
    file_size_limit = 10485760
where id = 'valuables';
