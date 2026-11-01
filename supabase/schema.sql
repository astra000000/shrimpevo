-- ShrimpEvo : marché partagé entre joueurs.
-- À coller dans Supabase → SQL Editor → New query → Run.
-- Puis : Authentication → Sign In / Providers → activer « Allow anonymous sign-ins ».

create table if not exists public.listings (
  id bigint generated always as identity primary key,
  seller uuid not null default auth.uid() references auth.users(id) on delete cascade,
  seller_name text not null check (char_length(seller_name) between 2 and 24),
  genus text not null check (genus in ('neo', 'car')),
  entry jsonb not null,
  stock jsonb not null check (jsonb_typeof(stock) = 'array' and jsonb_array_length(stock) <= 50),
  price numeric not null check (price >= 0.5 and price <= 100000),
  note text check (char_length(note) <= 60),
  sold int not null default 0,
  active boolean not null default true,
  created_at timestamptz not null default now()
);
create index if not exists listings_active on public.listings (active, created_at desc);

create table if not exists public.sales (
  id bigint generated always as identity primary key,
  listing_id bigint references public.listings(id) on delete set null,
  seller uuid not null,
  buyer uuid not null,
  buyer_name text,
  strain text,
  n int not null,
  total numeric not null,
  paid boolean not null default false,
  created_at timestamptz not null default now()
);
create index if not exists sales_unpaid on public.sales (seller) where not paid;

alter table public.listings enable row level security;
alter table public.sales enable row level security;

drop policy if exists "annonces visibles" on public.listings;
create policy "annonces visibles" on public.listings for select using (true);
drop policy if exists "publier ses annonces" on public.listings;
create policy "publier ses annonces" on public.listings for insert
  with check (seller = auth.uid() and sold = 0 and active and jsonb_array_length(stock) between 1 and 50);
drop policy if exists "voir ses ventes" on public.sales;
create policy "voir ses ventes" on public.sales for select using (seller = auth.uid() or buyer = auth.uid());
-- Pas de modification directe : achats, retraits et encaissements passent par les fonctions ci-dessous.

-- Achat : prend les n premières crevettes du stock, enregistre la vente (payée au vendeur à sa prochaine connexion)
create or replace function public.buy_listing(p_id bigint, p_n int, p_buyer_name text)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  l listings;
  k int;
  taken jsonb;
  rest jsonb;
begin
  if auth.uid() is null then raise exception 'non connecté'; end if;
  select * into l from listings where id = p_id and active for update;
  if not found then raise exception 'annonce introuvable ou déjà vendue'; end if;
  if l.seller = auth.uid() then raise exception 'c''est ta propre annonce'; end if;
  k := least(greatest(coalesce(p_n, 1), 1), jsonb_array_length(l.stock));
  select coalesce(jsonb_agg(e order by i), '[]'::jsonb) into taken from jsonb_array_elements(l.stock) with ordinality t(e, i) where i <= k;
  select coalesce(jsonb_agg(e order by i), '[]'::jsonb) into rest from jsonb_array_elements(l.stock) with ordinality t(e, i) where i > k;
  update listings set stock = rest, sold = sold + k, active = jsonb_array_length(rest) > 0 where id = p_id;
  insert into sales (listing_id, seller, buyer, buyer_name, strain, n, total)
    values (p_id, l.seller, auth.uid(), left(coalesce(p_buyer_name, '?'), 24), l.entry->>'name', k, k * l.price);
  return jsonb_build_object('dna', taken, 'entry', l.entry, 'genus', l.genus, 'seller_name', l.seller_name, 'price', l.price, 'n', k);
end $$;

-- Retrait d'une annonce : rend le stock invendu au vendeur
create or replace function public.unlist_listing(p_id bigint)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  l listings;
begin
  select * into l from listings where id = p_id and seller = auth.uid() and active for update;
  if not found then raise exception 'annonce introuvable'; end if;
  update listings set active = false, stock = '[]'::jsonb where id = p_id;
  return jsonb_build_object('dna', l.stock, 'entry', l.entry, 'genus', l.genus);
end $$;

-- Encaissement : toutes les ventes pas encore payées au vendeur
create or replace function public.collect_sales()
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  r jsonb;
begin
  with paid as (
    update sales set paid = true where seller = auth.uid() and not paid
    returning n, total, buyer_name, strain
  )
  select coalesce(jsonb_agg(to_jsonb(paid)), '[]'::jsonb) into r from paid;
  return r;
end $$;

revoke all on function public.buy_listing(bigint, int, text) from public, anon;
revoke all on function public.unlist_listing(bigint) from public, anon;
revoke all on function public.collect_sales() from public, anon;
grant execute on function public.buy_listing(bigint, int, text) to authenticated;
grant execute on function public.unlist_listing(bigint) to authenticated;
grant execute on function public.collect_sales() to authenticated;
