-- Bug- en ideeën-meldingen vanuit de hulp-assistent (rechtsonder in de app). De winkelier
-- meldt een bug of een wens; wij lezen ze uit en pakken ze op. Bewust een echte tabel:
-- meldingen mogen nooit verloren gaan in de blob.
create table if not exists public.meldingen (
  id uuid primary key default gen_random_uuid(),
  team_id uuid not null,
  account_id uuid default auth.uid(),
  soort text not null default 'bug',            -- 'bug' | 'idee'
  tekst text not null,
  pagina text,                                   -- waar de winkelier was toen hij het meldde
  status text not null default 'nieuw',          -- 'nieuw' | 'bezig' | 'klaar'
  aangemaakt_op timestamptz not null default now()
);
alter table public.meldingen enable row level security;
-- Iedereen in het team ziet en maakt zijn eigen team-meldingen; bijwerken/afhandelen doen
-- wij als beheerders via het admin-paneel (service_role), niet de winkelier.
drop policy if exists "team ziet meldingen" on public.meldingen;
create policy "team ziet meldingen" on public.meldingen
  for select to public using (team_id = public.my_team_id());
drop policy if exists "team meldt" on public.meldingen;
create policy "team meldt" on public.meldingen
  for insert to public with check (team_id = public.my_team_id());
create index if not exists idx_meldingen_team on public.meldingen (team_id, aangemaakt_op desc);
