/**
 * `category_tree` — die Kategorie-Hierarchie als View, damit Hauptkategorie, Pfad und
 * vererbte Steuerrolle an EINER Stelle berechnet werden.
 *
 * Vorher stand jede dieser Ableitungen woanders: die Hauptkategorie gab es gar nicht
 * (Analyse und Banking gruppierten nach der Blattkategorie), die vererbte Steuerrolle
 * wurde in TypeScript berechnet (src/lib/tax/rollen.ts), und die Dashboard-Buckets
 * (food, leisure, …) rieten per Namensmuster.
 *
 * `root_*`   oberste Kategorie des Zweigs (bei einer Wurzelkategorie sie selbst)
 * `path`     „Lebenserhaltung > Lebensmittel"
 * `depth`    Abstand zur Wurzel, 0 = Wurzel
 * `tax_role_effective` / `euer_zeile_effective`
 *            eigener Wert, sonst der der nächsten Oberkategorie (wie effektiveRollen())
 *
 * Zyklen in parent_id (das Datenmodell verhindert sie nicht) beendet `seen`, statt die
 * Abfrage endlos laufen zu lassen. Im Zyklusfall hängt die „Wurzel" vom Startknoten ab und ist
 * nur der letzte Knoten vor der Wiederholung; ein Zyklus ist ein Datenfehler, kein Normalfall.
 *
 * Rollback: supabase/rollbacks/20261021100000_category_tree.down.sql
 */

-- Bewusst nur dieser Index: der Aufstieg im Baum läuft über den Primärschlüssel (id), nicht über parent_id.
create index if not exists categories_user_idx on public.categories (user_id);

create or replace view public.category_tree
with (security_invoker = on) as
with recursive walk as (
  select c.id as category_id, c.id as node_id, c.parent_id, 0 as depth, array[c.id] as seen
  from public.categories c
  union all
  select w.category_id, p.id, p.parent_id, w.depth + 1, w.seen || p.id
  from walk w
  join public.categories p on p.id = w.parent_id
  where not (p.id = any (w.seen))
)
select
  c.id,
  c.user_id,
  c.name,
  c.parent_id,
  c.type,
  r.node_id   as root_id,
  r.name      as root_name,
  r.depth     as depth,
  pth.path    as path,
  tax.tax_role    as tax_role_effective,
  euer.euer_zeile as euer_zeile_effective
from public.categories c
join lateral (
  select w.node_id, cr.name, w.depth
  from walk w join public.categories cr on cr.id = w.node_id
  where w.category_id = c.id
  order by w.depth desc
  limit 1
) r on true
join lateral (
  select string_agg(cr.name, ' > ' order by w.depth desc) as path
  from walk w join public.categories cr on cr.id = w.node_id
  where w.category_id = c.id
) pth on true
left join lateral (
  select cr.tax_role
  from walk w join public.categories cr on cr.id = w.node_id
  where w.category_id = c.id and cr.tax_role is not null
  order by w.depth
  limit 1
) tax on true
left join lateral (
  select cr.euer_zeile
  from walk w join public.categories cr on cr.id = w.node_id
  where w.category_id = c.id and cr.euer_zeile is not null
  order by w.depth
  limit 1
) euer on true;

-- Supabase vergibt auf neue Objekte in public per Default ALL an anon und authenticated.
revoke all on public.category_tree from anon, authenticated;
grant select on public.category_tree to authenticated;
