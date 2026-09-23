-- Table des livres de la page /livres du site.
-- A coller une fois dans Supabase : SQL Editor > New query > Run.
--
-- Choix de Sacha : tout le monde peut ajouter, modifier et supprimer un livre
-- (pas de compte). Les bornes de longueur limitent seulement le remplissage.

create table if not exists public.livres (
  id             uuid primary key default gen_random_uuid(),
  titre          text not null check (char_length(titre) between 1 and 300),
  auteur         text check (char_length(auteur) <= 300),
  statut         text not null default 'à lire' check (statut in ('à lire', 'en cours', 'lu')),
  genre          text check (char_length(genre) <= 120),
  note           smallint check (note between 1 and 5),
  debut          date,
  fin            date,
  recommande_par text check (char_length(recommande_par) <= 200),
  couverture     text check (char_length(couverture) <= 1000),
  phrase         text check (char_length(phrase) <= 2000),
  appris         text[] not null default '{}',
  appliquer      jsonb not null default '[]',
  citations      text[] not null default '{}',
  notes          text check (char_length(notes) <= 50000),
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now()
);

create or replace function public.livres_touch() returns trigger
language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end $$;

drop trigger if exists livres_touch on public.livres;
create trigger livres_touch before update on public.livres
  for each row execute function public.livres_touch();

alter table public.livres enable row level security;

drop policy if exists "livres lecture" on public.livres;
drop policy if exists "livres ajout" on public.livres;
drop policy if exists "livres modif" on public.livres;
drop policy if exists "livres suppression" on public.livres;
create policy "livres lecture"     on public.livres for select using (true);
create policy "livres ajout"       on public.livres for insert with check (true);
create policy "livres modif"       on public.livres for update using (true) with check (true);
create policy "livres suppression" on public.livres for delete using (true);

grant select, insert, update, delete on public.livres to anon, authenticated;
