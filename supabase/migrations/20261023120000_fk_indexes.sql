/**
 * Indizes auf Fremdschluesseln der Hot-Paths (Supabase-Advisor "unindexed_foreign_keys": 34 Meldungen).
 *
 * Ohne Index auf der referenzierenden Spalte braucht jedes Loeschen oder Aendern der Zielzeile (z. B. eine Kategorie loeschen, ein
 * Konto loeschen) einen Seq Scan der referenzierenden Tabelle, und Joins ueber die Spalte (category_tree: categories.parent_id)
 * koennen den Index nicht nutzen. Bei den heutigen Datenmengen ist der Effekt klein; die Indizes sind billig.
 *
 * Bewusst NUR die Spalten, die in Abfragen oder rekursiven Views vorkommen. Die uebrigen Meldungen betreffen user_id-Spalten kleiner
 * Tabellen (RLS filtert dort ohnehin ueber den Primaerschluessel/kleine Scans) und bleiben offen.
 *
 * Rollback: supabase/rollbacks/20261023120000_fk_indexes.down.sql
 */
create index if not exists categories_parent_id_idx on public.categories (parent_id);
create index if not exists transactions_contract_id_idx on public.transactions (contract_id) where contract_id is not null;
create index if not exists transactions_transfer_to_idx on public.transactions (transfer_to) where transfer_to is not null;
create index if not exists contracts_category_id_idx on public.contracts (category_id) where category_id is not null;
create index if not exists contracts_account_id_idx on public.contracts (account_id) where account_id is not null;
create index if not exists contracts_to_account_id_idx on public.contracts (to_account_id) where to_account_id is not null;
create index if not exists assets_account_id_idx on public.assets (account_id) where account_id is not null;
create index if not exists portfolio_snapshots_asset_id_idx on public.portfolio_snapshots (asset_id);
create index if not exists bank_transactions_ai_category_id_idx on public.bank_transactions (ai_category_id) where ai_category_id is not null;
