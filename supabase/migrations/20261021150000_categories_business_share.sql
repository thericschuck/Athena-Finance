/**
 * `categories.business_share` — betrieblicher Anteil in Prozent (0 bis 100).
 *
 * Privat und Business laufen über dieselben Konten, und manche Ausgaben sind gemischt genutzt
 * (Internet, Handy, Software, ein Abo für beides). Steuerlich zählt nur der betriebliche Anteil.
 *
 *   NULL  = 100 % (Standard, bisheriges Verhalten)
 *   0..100 gilt für Kategorien mit Steuerrolle `betriebsausgabe`; wie die Rolle wird er an
 *         Unterkategorien vererbt, solange diese keinen eigenen Wert haben.
 *
 * Wirkt nur in der Steuerberechnung (EÜR und Steuerposition, src/lib/tax/laden.ts). Dashboard,
 * Analyse und Kontostände rechnen weiter mit dem vollen Betrag: das Geld ist tatsächlich
 * abgeflossen.
 *
 * Rollback: supabase/rollbacks/20261021150000_categories_business_share.down.sql
 */

alter table public.categories
  add column if not exists business_share numeric(5,2);

alter table public.categories
  drop constraint if exists categories_business_share_range;
alter table public.categories
  add constraint categories_business_share_range
  check (business_share is null or (business_share >= 0 and business_share <= 100));

comment on column public.categories.business_share is
  'Betrieblicher Anteil in Prozent (0-100) für Betriebsausgaben mit gemischter Nutzung. NULL = 100 %. Wirkt nur in der Steuerberechnung.';
