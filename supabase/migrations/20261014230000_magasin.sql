-- L'Atelier MELEC : magasin électrique (reprise de MELECGEST) et inventaire par les élèves.
--
-- Rôles :
--   • administrateur : adresse inscrite « admin » dans store_members, avec Authenticator (aal2) ;
--     règle l'établissement, les accès et charge la base complète ;
--   • équipe : tout enseignant de L'Atelier MELEC (Authenticator déjà obligatoire), ou adresse
--     inscrite « team » avec Authenticator ; consulte le magasin, ajoute des articles,
--     enregistre les entrées et sorties, archive, importe des listes Excel ;
--   • élève validé : voit le catalogue SANS les quantités (comptage à l'aveugle) et
--     enregistre son inventaire, qu'il transmet à l'enseignant.
-- Le stock ne change que par un mouvement : chaque modification reste traçable.

create table if not exists public.store_members (
  email text primary key check (email = lower(email) and email ~ '^[^[:space:]@]+@[^[:space:]@]+[.][^[:space:]@]+$'),
  role text not null check (role in ('admin', 'team')),
  active boolean not null default true,
  created_at timestamptz not null default now()
);
insert into public.store_members (email, role) values ('marvelangers15@gmail.com', 'admin'), ('aitelhadjmustapha@yahoo.fr', 'admin') on conflict do nothing;

create table if not exists public.store_items (
  id uuid primary key default gen_random_uuid(),
  legacy_id uuid unique,
  ref text not null unique check (char_length(ref) between 1 and 160),
  name text not null check (char_length(name) between 1 and 160),
  type text not null check (char_length(type) between 1 and 160),
  category text not null check (char_length(category) between 1 and 160),
  supplier text not null check (char_length(supplier) between 1 and 160),
  unit text not null check (char_length(unit) between 1 and 30),
  location text not null default '' check (char_length(location) <= 160),
  threshold integer not null default 5 check (threshold between 0 and 10000000),
  stock integer not null default 0 check (stock between 0 and 10000000),
  incoming bigint not null default 0 check (incoming >= 0),
  outgoing bigint not null default 0 check (outgoing >= 0),
  archived_at timestamptz,
  updated_at timestamptz not null default now(),
  constraint store_archived_stock_empty check (archived_at is null or stock = 0)
);
create table if not exists public.store_movements (
  id uuid primary key default gen_random_uuid(),
  legacy_id uuid unique,
  item_id uuid not null references public.store_items(id),
  kind text not null check (kind in ('in', 'out')),
  quantity integer not null check (quantity between 1 and 10000000),
  note text not null default '' check (char_length(note) <= 400),
  created timestamptz not null default now(),
  author uuid default auth.uid(),
  author_email text
);
create index if not exists store_movements_item on public.store_movements(item_id);
create index if not exists store_movements_created on public.store_movements(created desc);
create table if not exists public.store_settings (
  id integer primary key check (id = 1),
  name text not null default '' check (char_length(name) <= 160),
  address text not null default '' check (char_length(address) <= 800),
  logo text not null default '' check (char_length(logo) <= 400000 and (logo = '' or logo ~ '^data:image/jpeg;base64,[A-Za-z0-9+/=]+$')),
  updated_at timestamptz not null default now()
);
insert into public.store_settings (id) values (1) on conflict do nothing;
-- Reprise de MELECGEST (14/10/2026) : l'établissement et les accès ; le magasin y était encore vide.
update public.store_settings set name = 'Lycée Professionnel Auguste Bartholdi',
  address = E'142 Rue Denis Papin, 76360 Barentin\nTél: 02 32 94 96 96' where id = 1 and name = '';
-- Inventaire d'un élève : un brouillon modifiable, puis envoyé à l'enseignant.
create table if not exists public.store_counts (
  id uuid primary key default gen_random_uuid(),
  student_id uuid not null references auth.users(id) on delete cascade,
  class_id uuid,
  lines jsonb not null default '[]'::jsonb check (jsonb_typeof(lines) = 'array' and pg_column_size(lines) <= 400000),
  submitted_at timestamptz,
  loaded_at timestamptz,
  updated_at timestamptz not null default now()
);
create unique index if not exists store_counts_one_draft on public.store_counts(student_id) where submitted_at is null;
create index if not exists store_counts_submitted on public.store_counts(submitted_at desc);

-- ───────── Rôle magasin, lu sans dépendre des règles des tables ─────────
create or replace function melec_security.role_magasin()
returns text language sql stable security definer set search_path = '' as $$
  with me as (
    select lower(u.email) email, u.email_confirmed_at is not null confirmed from auth.users u where u.id = auth.uid()
  ), m as (
    select s.role from public.store_members s, me where s.email = me.email and me.confirmed and s.active
  )
  select case
    when coalesce(auth.jwt()->>'aal', 'aal1') <> 'aal2' then null
    when exists (select 1 from m where role = 'admin') then 'admin'
    when exists (select 1 from public.teacher_accounts t where t.user_id = auth.uid()) then 'team'
    when exists (select 1 from m where role = 'team') then 'team'
  end;
$$;
revoke all on function melec_security.role_magasin() from public, anon;
grant execute on function melec_security.role_magasin() to authenticated;

-- ───────── Règles d'accès ─────────
alter table public.store_members enable row level security;
alter table public.store_items enable row level security;
alter table public.store_movements enable row level security;
alter table public.store_settings enable row level security;
alter table public.store_counts enable row level security;
do $$
declare t text;
begin
  foreach t in array array['store_members','store_items','store_movements','store_settings','store_counts'] loop
    execute format('drop policy if exists melec_aal2_obligatoire on public.%I', t);
    execute format($p$create policy melec_aal2_obligatoire on public.%I as restrictive for all to authenticated
      using ((select melec_security.session_suffisante())) with check ((select melec_security.session_suffisante()))$p$, t);
  end loop;
end $$;
drop policy if exists store_members_read on public.store_members;
create policy store_members_read on public.store_members for select to authenticated using ((select melec_security.role_magasin()) = 'admin');
drop policy if exists store_items_read on public.store_items;
create policy store_items_read on public.store_items for select to authenticated using ((select melec_security.role_magasin()) is not null);
drop policy if exists store_movements_read on public.store_movements;
create policy store_movements_read on public.store_movements for select to authenticated using ((select melec_security.role_magasin()) is not null);
drop policy if exists store_settings_read on public.store_settings;
create policy store_settings_read on public.store_settings for select to authenticated using ((select melec_security.role_magasin()) is not null);
drop policy if exists store_counts_read on public.store_counts;
create policy store_counts_read on public.store_counts for select to authenticated
  using (student_id = auth.uid() or (select melec_security.role_magasin()) is not null);
revoke all on public.store_members, public.store_items, public.store_movements, public.store_settings, public.store_counts from anon, authenticated;
grant select on public.store_members, public.store_items, public.store_movements, public.store_settings, public.store_counts to authenticated;

-- ───────── Mouvements : seule façon de changer le stock ─────────
create or replace function melec_security.store_movement() returns trigger
language plpgsql security definer set search_path = '' as $$
declare i public.store_items;
begin
  if melec_security.role_magasin() is null then raise exception 'Accès au magasin réservé à l’équipe (Authenticator requis).' using errcode = '42501'; end if;
  new.author := auth.uid();
  select lower(email) into new.author_email from auth.users where id = auth.uid();
  select * into i from public.store_items where id = new.item_id for update;
  if not found then raise exception 'Article introuvable.'; end if;
  if i.archived_at is not null then raise exception 'Référence archivée : restaurez-la avant un mouvement.'; end if;
  if (i.stock + case when new.kind = 'in' then new.quantity else -new.quantity end) not between 0 and 10000000 then
    raise exception 'Stock insuffisant ou quantité trop élevée.';
  end if;
  update public.store_items set
    stock = stock + case when new.kind = 'in' then new.quantity else -new.quantity end,
    incoming = incoming + case when new.kind = 'in' then new.quantity else 0 end,
    outgoing = outgoing + case when new.kind = 'out' then new.quantity else 0 end,
    updated_at = now()
  where id = new.item_id;
  return new;
end $$;
revoke all on function melec_security.store_movement() from public, anon, authenticated;
drop trigger if exists store_movement on public.store_movements;
create trigger store_movement before insert on public.store_movements for each row execute function melec_security.store_movement();

create or replace function melec_security.store_settings_version() returns trigger
language plpgsql set search_path = '' as $$
begin
  if (new.name, new.address, new.logo) is distinct from (old.name, old.address, old.logo) then new.updated_at := clock_timestamp(); end if;
  return new;
end $$;
revoke all on function melec_security.store_settings_version() from public, anon, authenticated;
drop trigger if exists store_settings_version on public.store_settings;
create trigger store_settings_version before update on public.store_settings for each row execute function melec_security.store_settings_version();

-- ───────── Lecture du magasin (équipe) ─────────
create or replace function public.store_inventory()
returns jsonb language plpgsql stable security invoker set search_path = '' as $$
declare r text := melec_security.role_magasin();
begin
  if r is null then raise exception 'Accès au magasin réservé à l’équipe (Authenticator requis).' using errcode = '42501'; end if;
  return jsonb_build_object(
    'items', coalesce((select jsonb_agg(i order by i.name) from public.store_items i), '[]'::jsonb),
    'movements', coalesce((select jsonb_agg(m order by m.created desc, m.id) from (
      select m.id, m.item_id, m.kind, m.quantity, m.note, m.created, m.author_email, i.name, i.ref, i.unit
      from public.store_movements m join public.store_items i on i.id = m.item_id
      order by m.created desc, m.id limit 200) m), '[]'::jsonb),
    'settings_version', (select updated_at from public.store_settings where id = 1),
    'admin', r = 'admin');
end $$;

-- Catalogue pour l'inventaire des élèves : références actives, sans les quantités.
create or replace function public.store_catalog()
returns jsonb language plpgsql stable security definer set search_path = '' as $$
begin
  if not (melec_security.eleve_actif() or melec_security.role_magasin() is not null) then
    raise exception 'Inventaire réservé aux élèves validés et à l’équipe.' using errcode = '42501';
  end if;
  return coalesce((select jsonb_agg(jsonb_build_object('id', id, 'ref', ref, 'name', name, 'type', type, 'category', category,
    'supplier', supplier, 'unit', unit, 'location', location) order by name) from public.store_items where archived_at is null), '[]'::jsonb);
end $$;

-- ───────── Écritures de l'équipe (même contrat que MELECGEST) ─────────
create or replace function public.store_mutate(b jsonb)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare item uuid; r text := melec_security.role_magasin(); a text := b->>'action'; q integer; address text;
begin
  if r is null then raise exception 'Accès au magasin réservé à l’équipe (Authenticator requis).' using errcode = '42501'; end if;
  if a = 'item' then
    q := coalesce((b->>'stock')::integer, 0);
    if q not between 0 and 10000000 then raise exception 'Quantité invalide.'; end if;
    if exists (select 1 from public.store_items where ref = trim(b->>'ref')) then raise exception 'Cette référence existe déjà.'; end if;
    insert into public.store_items(ref, name, type, category, supplier, unit, location, threshold)
    values (trim(b->>'ref'), trim(b->>'name'), trim(b->>'type'), trim(b->>'category'), trim(b->>'supplier'), trim(b->>'unit'),
            coalesce(trim(b->>'location'), ''), coalesce((b->>'threshold')::integer, 5))
    returning id into item;
    if q > 0 then insert into public.store_movements(item_id, kind, quantity, note) values (item, 'in', q, 'Stock initial'); end if;
  elsif a = 'edit' then
    if exists (select 1 from public.store_items where ref = trim(b->>'ref') and id <> (b->>'id')::uuid) then raise exception 'Cette référence existe déjà.'; end if;
    update public.store_items set ref = trim(b->>'ref'), name = trim(b->>'name'), type = trim(b->>'type'), category = trim(b->>'category'),
      supplier = trim(b->>'supplier'), unit = trim(b->>'unit'), location = coalesce(trim(b->>'location'), ''),
      threshold = coalesce((b->>'threshold')::integer, 5), updated_at = now()
    where id = (b->>'id')::uuid;
    if not found then raise exception 'Article introuvable.'; end if;
  elsif a = 'movement' then
    insert into public.store_movements(item_id, kind, quantity, note)
    values ((b->>'id')::uuid, b->>'kind', (b->>'quantity')::integer, coalesce(b->>'note', ''));
  elsif a in ('archive', 'restore') then
    select stock into q from public.store_items where id = (b->>'id')::uuid for update;
    if not found then raise exception 'Article introuvable.'; end if;
    if a = 'archive' and q <> 0 then raise exception 'Le stock doit être à zéro avant l’archivage.'; end if;
    update public.store_items set archived_at = case when a = 'archive' then now() end, updated_at = now() where id = (b->>'id')::uuid;
  elsif a = 'settings' and r = 'admin' then
    update public.store_settings set name = coalesce(b->>'name', ''), address = coalesce(b->>'address', ''), logo = coalesce(b->>'logo', '') where id = 1;
  elsif a in ('member', 'remove_member') and r = 'admin' then
    address := lower(trim(b->>'email'));
    if address = (select lower(email) from auth.users where id = auth.uid()) then raise exception 'Vous ne pouvez pas modifier votre propre accès.'; end if;
    if a = 'member' then
      if address is null or address !~ '^[^[:space:]@]+@[^[:space:]@]+[.][^[:space:]@]+$' then raise exception 'Adresse e-mail invalide.'; end if;
      if coalesce(b->>'role', '') not in ('admin', 'team') then raise exception 'Rôle invalide.'; end if;
      insert into public.store_members(email, role, active) values (address, b->>'role', true)
      on conflict (email) do update set role = excluded.role, active = true;
    else
      update public.store_members set active = false where email = address;
      if not found then raise exception 'Adresse introuvable.'; end if;
    end if;
  else raise exception 'Action non autorisée.' using errcode = '42501';
  end if;
  return jsonb_build_object('ok', true);
end $$;

create or replace function public.store_admin_members()
returns jsonb language plpgsql stable security invoker set search_path = '' as $$
begin
  if melec_security.role_magasin() is distinct from 'admin' then raise exception 'Réservé à l’administrateur.' using errcode = '42501'; end if;
  return coalesce((select jsonb_agg(m order by m.email) from public.store_members m), '[]'::jsonb);
end $$;

-- ───────── Import d'une liste (Excel) : complète le magasin sans saisie une par une ─────────
-- Chaque ligne : ref (ou désignation seule : une référence « INV-… » est créée), name, type,
-- category, supplier, unit, location, threshold, quantity.
-- Article inconnu → créé (quantité = stock initial). Article connu → description complétée.
-- p_align : la quantité de la liste devient le stock (entrée ou sortie « Inventaire » de l'écart).
create or replace function public.store_import(p_rows jsonb, p_align boolean default false, p_note text default 'Inventaire')
returns jsonb language plpgsql security definer set search_path = '' as $$
declare v jsonb; it public.store_items; q integer; diff integer; reference text; added int := 0; updated int := 0; moved int := 0; skipped int := 0; n int := 0;
  note text := left(coalesce(nullif(trim(p_note), ''), 'Inventaire'), 300);
begin
  if melec_security.role_magasin() is null then raise exception 'Accès au magasin réservé à l’équipe (Authenticator requis).' using errcode = '42501'; end if;
  if jsonb_typeof(p_rows) <> 'array' or jsonb_array_length(p_rows) > 5000 then raise exception 'Liste non valide (5 000 lignes au plus).'; end if;
  for v in select value from jsonb_array_elements(p_rows) loop
    n := n + 1;
    reference := left(nullif(trim(coalesce(v->>'ref', '')), ''), 160);
    if reference is null and coalesce(trim(v->>'name'), '') = '' then skipped := skipped + 1; continue; end if;
    q := case when coalesce(v->>'quantity', '') ~ '^\s*\d+\s*$' then least((v->>'quantity')::integer, 10000000) end;
    if reference is null then
      select * into it from public.store_items where lower(name) = lower(trim(v->>'name')) limit 1;
      if not found then reference := 'INV-' || to_char(now(), 'YYMMDD') || '-' || lpad(n::text, 4, '0') || '-' || substr(md5(random()::text), 1, 4); end if;
    else
      select * into it from public.store_items where ref = reference;
    end if;
    if it.id is null or (reference is not null and it.ref is distinct from reference) then
      insert into public.store_items(ref, name, type, category, supplier, unit, location, threshold)
      values (reference, left(coalesce(nullif(trim(v->>'name'), ''), reference), 160),
              left(coalesce(nullif(trim(v->>'type'), ''), 'À classer'), 160), left(coalesce(nullif(trim(v->>'category'), ''), 'À classer'), 160),
              left(coalesce(nullif(trim(v->>'supplier'), ''), 'Non renseigné'), 160), left(coalesce(nullif(trim(v->>'unit'), ''), 'pièce'), 30),
              left(coalesce(trim(v->>'location'), ''), 160),
              case when coalesce(v->>'threshold', '') ~ '^\s*\d+\s*$' then least((v->>'threshold')::integer, 10000000) else 5 end)
      returning * into it;
      added := added + 1;
      if coalesce(q, 0) > 0 then insert into public.store_movements(item_id, kind, quantity, note) values (it.id, 'in', q, 'Stock initial (import)'); moved := moved + 1; end if;
    else
      update public.store_items set
        name = left(coalesce(nullif(trim(v->>'name'), ''), name), 160), type = left(coalesce(nullif(trim(v->>'type'), ''), type), 160),
        category = left(coalesce(nullif(trim(v->>'category'), ''), category), 160), supplier = left(coalesce(nullif(trim(v->>'supplier'), ''), supplier), 160),
        unit = left(coalesce(nullif(trim(v->>'unit'), ''), unit), 30), location = left(coalesce(nullif(trim(v->>'location'), ''), location), 160),
        threshold = case when coalesce(v->>'threshold', '') ~ '^\s*\d+\s*$' then least((v->>'threshold')::integer, 10000000) else threshold end,
        archived_at = case when p_align and coalesce(q, 0) > 0 then null else archived_at end,
        updated_at = now()
      where id = it.id returning * into it;
      updated := updated + 1;
      if p_align and q is not null and q <> it.stock then
        diff := q - it.stock;
        insert into public.store_movements(item_id, kind, quantity, note)
        values (it.id, case when diff > 0 then 'in' else 'out' end, abs(diff), note);
        moved := moved + 1;
      end if;
    end if;
    it := null;
  end loop;
  return jsonb_build_object('added', added, 'updated', updated, 'moved', moved, 'skipped', skipped);
end $$;

-- ───────── Inventaire des élèves ─────────
create or replace function public.store_count_save(p_lines jsonb, p_submit boolean default false)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare me uuid := auth.uid(); klass uuid; row_id uuid;
begin
  if not melec_security.eleve_actif() then raise exception 'Inventaire réservé aux élèves validés.' using errcode = '42501'; end if;
  if jsonb_typeof(p_lines) <> 'array' or jsonb_array_length(p_lines) > 3000 then raise exception 'Inventaire non valide.'; end if;
  if p_submit and jsonb_array_length(p_lines) = 0 then raise exception 'Comptez au moins un article avant d’envoyer.'; end if;
  select class_id into klass from public.student_profiles where user_id = me;
  select id into row_id from public.store_counts where student_id = me and submitted_at is null for update;
  if row_id is null then
    insert into public.store_counts(student_id, class_id, lines) values (me, klass, p_lines) returning id into row_id;
  else
    update public.store_counts set lines = p_lines, class_id = klass, updated_at = now() where id = row_id;
  end if;
  if p_submit then update public.store_counts set submitted_at = now(), updated_at = now() where id = row_id; end if;
  return jsonb_build_object('id', row_id, 'submitted', p_submit);
end $$;

-- L'équipe marque un inventaire comme chargé dans le magasin, ou le supprime.
create or replace function public.store_count_mark(p_id uuid, p_action text)
returns boolean language plpgsql security definer set search_path = '' as $$
begin
  if melec_security.role_magasin() is null then raise exception 'Réservé à l’équipe.' using errcode = '42501'; end if;
  if p_action = 'loaded' then update public.store_counts set loaded_at = now() where id = p_id and submitted_at is not null;
  elsif p_action = 'delete' then delete from public.store_counts where id = p_id;
  else raise exception 'Action non autorisée.';
  end if;
  return found;
end $$;

revoke all on function public.store_inventory(), public.store_catalog(), public.store_mutate(jsonb), public.store_admin_members(),
  public.store_import(jsonb, boolean, text), public.store_count_save(jsonb, boolean), public.store_count_mark(uuid, text) from public, anon;
grant execute on function public.store_inventory(), public.store_catalog(), public.store_mutate(jsonb), public.store_admin_members(),
  public.store_import(jsonb, boolean, text), public.store_count_save(jsonb, boolean), public.store_count_mark(uuid, text) to authenticated;
