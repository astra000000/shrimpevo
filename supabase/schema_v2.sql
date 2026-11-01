-- ShrimpEvo v2 : pseudos, bacs à visiter, cadeaux, concours hebdomadaire.
-- À coller dans Supabase → SQL Editor → New query → Run (après schema.sql). Peut être relancé sans risque.

-- Le marché accepte les nouvelles espèces
alter table public.listings drop constraint if exists listings_genus_check;
alter table public.listings add constraint listings_genus_check check (genus in ('neo', 'car', 'amano', 'halo', 'macro', 'atya', 'rhino'));

-- ---------- Profils : un pseudo unique par joueur ----------
create table if not exists public.profiles (
  id uuid primary key default auth.uid() references auth.users(id) on delete cascade,
  name text not null check (char_length(name) between 2 and 24),
  updated timestamptz not null default now()
);
create unique index if not exists profiles_name_ci on public.profiles (lower(name));
alter table public.profiles enable row level security;
drop policy if exists "profils visibles" on public.profiles;
create policy "profils visibles" on public.profiles for select using (true);
drop policy if exists "mon profil" on public.profiles;
create policy "mon profil" on public.profiles for insert with check (id = auth.uid());
drop policy if exists "modifier mon profil" on public.profiles;
create policy "modifier mon profil" on public.profiles for update using (id = auth.uid()) with check (id = auth.uid());

-- ---------- Bacs partagés (visite en lecture seule) ----------
create table if not exists public.showcases (
  owner uuid not null default auth.uid() references auth.users(id) on delete cascade,
  slot smallint not null default 0 check (slot between 0 and 2),
  owner_name text not null check (char_length(owner_name) between 2 and 24),
  name text not null check (char_length(name) between 1 and 30),
  info jsonb not null default '{}'::jsonb,
  data jsonb not null check (octet_length(data::text) < 400000),
  updated timestamptz not null default now(),
  primary key (owner, slot)
);
create index if not exists showcases_updated on public.showcases (updated desc);
alter table public.showcases enable row level security;
drop policy if exists "bacs visibles" on public.showcases;
create policy "bacs visibles" on public.showcases for select using (true);
drop policy if exists "partager mes bacs" on public.showcases;
create policy "partager mes bacs" on public.showcases for insert with check (owner = auth.uid());
drop policy if exists "maj mes bacs" on public.showcases;
create policy "maj mes bacs" on public.showcases for update using (owner = auth.uid()) with check (owner = auth.uid());
drop policy if exists "retirer mes bacs" on public.showcases;
create policy "retirer mes bacs" on public.showcases for delete using (owner = auth.uid());

-- ---------- Cadeaux entre amis ----------
create table if not exists public.gifts (
  id bigint generated always as identity primary key,
  sender uuid not null default auth.uid(),
  sender_name text not null,
  recipient uuid not null references auth.users(id) on delete cascade,
  kind text not null check (kind in ('shrimp', 'sc', 'decor')),
  payload jsonb not null check (octet_length(payload::text) < 60000),
  message text check (char_length(message) <= 80),
  claimed boolean not null default false,
  created timestamptz not null default now()
);
create index if not exists gifts_to on public.gifts (recipient) where not claimed;
alter table public.gifts enable row level security;
drop policy if exists "mes cadeaux" on public.gifts;
create policy "mes cadeaux" on public.gifts for select using (recipient = auth.uid() or sender = auth.uid());

create or replace function public.send_gift(p_to text, p_kind text, p_payload jsonb, p_message text)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  me profiles; dest profiles; n int;
begin
  select * into me from profiles where id = auth.uid();
  if not found then raise exception 'choisis d''abord un pseudo'; end if;
  select * into dest from profiles where lower(name) = lower(trim(p_to));
  if not found then raise exception 'joueur « % » introuvable', p_to; end if;
  if dest.id = me.id then raise exception 'tu ne peux pas t''offrir un cadeau'; end if;
  select count(*) into n from gifts where sender = me.id and created > now() - interval '1 day';
  if n >= 20 then raise exception 'maximum 20 cadeaux par jour'; end if;
  if p_kind = 'sc' and ((p_payload->>'amount')::numeric is null or (p_payload->>'amount')::numeric not between 1 and 5000) then raise exception 'montant invalide'; end if;
  if p_kind = 'shrimp' and (jsonb_typeof(p_payload->'stock') <> 'array' or jsonb_array_length(p_payload->'stock') not between 1 and 20) then raise exception '1 à 20 crevettes par cadeau'; end if;
  insert into gifts (sender, sender_name, recipient, kind, payload, message)
    values (me.id, me.name, dest.id, p_kind, p_payload, left(p_message, 80));
  return jsonb_build_object('to', dest.name);
end $$;

create or replace function public.claim_gifts()
returns jsonb language plpgsql security definer set search_path = public as $$
declare r jsonb;
begin
  with g as (
    update gifts set claimed = true where recipient = auth.uid() and not claimed
    returning id, sender_name, kind, payload, message
  )
  select coalesce(jsonb_agg(to_jsonb(g)), '[]'::jsonb) into r from g;
  return r;
end $$;

-- ---------- Concours hebdomadaire ----------
-- Semaine ISO à l'heure de Paris : du lundi 0 h au dimanche 23 h 59
create or replace function public.contest_week(ts timestamptz default now())
returns text language sql stable as $$ select to_char(ts at time zone 'Europe/Paris', 'IYYY-IW') $$;

create table if not exists public.contest_entries (
  id bigint generated always as identity primary key,
  week text not null default public.contest_week(),
  owner uuid not null default auth.uid() references auth.users(id) on delete cascade,
  owner_name text not null,
  genus text not null,
  shrimp jsonb not null check (octet_length(shrimp::text) < 8000),
  title text check (char_length(title) <= 30),
  created timestamptz not null default now(),
  unique (week, owner)
);
create table if not exists public.contest_votes (
  week text not null,
  entry_id bigint not null references public.contest_entries(id) on delete cascade,
  voter uuid not null default auth.uid(),
  primary key (week, voter, entry_id)
);
create table if not exists public.contest_claims (
  week text not null,
  owner uuid not null,
  rank int not null,
  primary key (week, owner)
);
alter table public.contest_entries enable row level security;
alter table public.contest_votes enable row level security;
alter table public.contest_claims enable row level security;
drop policy if exists "inscrits visibles" on public.contest_entries;
create policy "inscrits visibles" on public.contest_entries for select using (true);
drop policy if exists "mes votes" on public.contest_votes;
create policy "mes votes" on public.contest_votes for select using (voter = auth.uid());

-- Inscription (ou remplacement de sa crevette) pour la semaine en cours
create or replace function public.contest_enter(p_genus text, p_shrimp jsonb, p_title text)
returns jsonb language plpgsql security definer set search_path = public as $$
declare me profiles; wk text := contest_week();
begin
  select * into me from profiles where id = auth.uid();
  if not found then raise exception 'choisis d''abord un pseudo'; end if;
  delete from contest_entries where week = wk and owner = me.id;
  insert into contest_entries (week, owner, owner_name, genus, shrimp, title) values (wk, me.id, me.name, p_genus, p_shrimp, left(p_title, 30));
  return jsonb_build_object('week', wk);
end $$;

-- Vote : 3 votes par semaine, pas pour soi-même, retirable
create or replace function public.contest_vote(p_entry bigint)
returns jsonb language plpgsql security definer set search_path = public as $$
declare e contest_entries; wk text := contest_week(); n int;
begin
  if auth.uid() is null then raise exception 'non connecté'; end if;
  select * into e from contest_entries where id = p_entry;
  if not found or e.week <> wk then raise exception 'inscription introuvable ou concours terminé'; end if;
  if e.owner = auth.uid() then raise exception 'tu ne peux pas voter pour toi'; end if;
  if exists (select 1 from contest_votes where week = wk and voter = auth.uid() and entry_id = p_entry) then
    delete from contest_votes where week = wk and voter = auth.uid() and entry_id = p_entry;
    return jsonb_build_object('voted', false);
  end if;
  select count(*) into n from contest_votes where week = wk and voter = auth.uid();
  if n >= 3 then raise exception 'tu as déjà utilisé tes 3 votes cette semaine'; end if;
  insert into contest_votes (week, entry_id, voter) values (wk, p_entry, auth.uid());
  return jsonb_build_object('voted', true);
end $$;

-- Classement d'une semaine (votes comptés côté serveur)
create or replace function public.contest_board(p_week text default null)
returns jsonb language sql security definer set search_path = public as $$
  select coalesce(jsonb_agg(x order by x.votes desc, x.created asc), '[]'::jsonb) from (
    select e.id, e.owner_name, e.genus, e.shrimp, e.title, e.created, (e.owner = auth.uid()) as mine,
      (select count(*) from contest_votes v where v.entry_id = e.id) as votes,
      exists (select 1 from contest_votes v where v.entry_id = e.id and v.voter = auth.uid()) as voted
    from contest_entries e where e.week = coalesce(p_week, contest_week())
  ) x
$$;

-- Récompenses : top 3 des semaines terminées (au moins 1 vote), réclamées une seule fois
create or replace function public.contest_claim()
returns jsonb language plpgsql security definer set search_path = public as $$
declare r jsonb := '[]'::jsonb; w record; rk int;
begin
  if auth.uid() is null then raise exception 'non connecté'; end if;
  for w in select distinct week from contest_entries where owner = auth.uid() and week < contest_week() loop
    if exists (select 1 from contest_claims where week = w.week and owner = auth.uid()) then continue; end if;
    rk := null;
    select pos into rk from (
      select e.owner, row_number() over (order by (select count(*) from contest_votes v where v.entry_id = e.id) desc, e.created asc) as pos,
        (select count(*) from contest_votes v where v.entry_id = e.id) as votes
      from contest_entries e where e.week = w.week
    ) t where t.owner = auth.uid() and t.votes > 0;
    if rk is not null and rk <= 3 then
      insert into contest_claims (week, owner, rank) values (w.week, auth.uid(), rk);
      r := r || jsonb_build_object('week', w.week, 'rank', rk);
    end if;
  end loop;
  return r;
end $$;

revoke all on function public.send_gift(text, text, jsonb, text) from public, anon;
revoke all on function public.claim_gifts() from public, anon;
revoke all on function public.contest_enter(text, jsonb, text) from public, anon;
revoke all on function public.contest_vote(bigint) from public, anon;
revoke all on function public.contest_board(text) from public, anon;
revoke all on function public.contest_claim() from public, anon;
grant execute on function public.send_gift(text, text, jsonb, text) to authenticated;
grant execute on function public.claim_gifts() to authenticated;
grant execute on function public.contest_enter(text, jsonb, text) to authenticated;
grant execute on function public.contest_vote(bigint) to authenticated;
grant execute on function public.contest_board(text) to authenticated;
grant execute on function public.contest_claim() to authenticated;
