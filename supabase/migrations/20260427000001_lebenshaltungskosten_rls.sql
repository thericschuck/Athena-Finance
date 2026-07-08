-- RLS for lebenshaltungskosten tables (no user_id — single-user, allow all authenticated)

alter table budget_categories enable row level security;
alter table budget_items      enable row level security;
alter table income_targets    enable row level security;

create policy "authenticated_full_access" on budget_categories
  for all to authenticated using (true) with check (true);

create policy "authenticated_full_access" on budget_items
  for all to authenticated using (true) with check (true);

create policy "authenticated_full_access" on income_targets
  for all to authenticated using (true) with check (true);
