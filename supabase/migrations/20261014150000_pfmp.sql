-- L'Atelier MELEC : PFMP (recherche d'entreprises, démarches des élèves, suivi pédagogique).
-- Reprend les règles de Gestion PFMP avec les comptes de L'Atelier MELEC :
--   • enseignant (teacher_accounts) : tout voir, gérer l'annuaire, libérer une entreprise,
--     saisir le suivi pédagogique ;
--   • élève validé et non bloqué (student_profiles) : voir les entreprises libres ou la sienne,
--     enregistrer ses propres démarches ; une entreprise qui accepte lui est réservée.
-- Les démarches et réservations ne s'écrivent que par les fonctions ci-dessous, qui
-- verrouillent l'entreprise pendant l'opération (deux élèves ne peuvent pas obtenir la même).

-- Rôles, lus sans dépendre des règles d'accès des tables (pas de récursion).
create or replace function melec_security.est_enseignant()
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.teacher_accounts t where t.user_id = auth.uid());
$$;
create or replace function melec_security.eleve_actif()
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.student_profiles s
                 where s.user_id = auth.uid() and s.approved_at is not null and s.blocked_at is null);
$$;
revoke all on function melec_security.est_enseignant() from public, anon;
revoke all on function melec_security.eleve_actif() from public, anon;
grant execute on function melec_security.est_enseignant() to authenticated;
grant execute on function melec_security.eleve_actif() to authenticated;

create table if not exists public.pfmp_companies (
  id uuid primary key default gen_random_uuid(),
  legacy_id text unique,
  fingerprint text not null unique check (char_length(fingerprint) between 1 and 400),
  data jsonb not null check (jsonb_typeof(data) = 'object' and coalesce(data->>'raisonSociale', '') <> '' and pg_column_size(data) <= 20000),
  updated_at timestamptz not null default now()
);
-- Empreintes des entreprises supprimées : un nouvel import ne les recrée pas.
create table if not exists public.pfmp_deleted_companies (
  fingerprint text primary key,
  deleted_at timestamptz not null default now()
);
create table if not exists public.pfmp_reports (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.pfmp_companies(id) on delete cascade,
  student_id uuid not null references auth.users(id) on delete cascade,
  status text not null check (status in ('À contacter', 'En attente', 'Accepté', 'Refusé', 'À relancer')),
  date date not null default current_date,
  method text not null default '' check (char_length(method) <= 100),
  contact text not null default '' check (char_length(contact) <= 500),
  notes text not null default '' check (char_length(notes) <= 5000),
  start_date date,
  end_date date,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (end_date is null or start_date is null or end_date >= start_date)
);
create index if not exists pfmp_reports_student_idx on public.pfmp_reports (student_id, updated_at desc);
create index if not exists pfmp_reports_company_idx on public.pfmp_reports (company_id);
create table if not exists public.pfmp_reservations (
  company_id uuid primary key references public.pfmp_companies(id) on delete cascade,
  student_id uuid not null references auth.users(id) on delete cascade,
  report_id uuid not null unique references public.pfmp_reports(id) on delete cascade
);
create index if not exists pfmp_reservations_student_idx on public.pfmp_reservations (student_id);
-- Suivi pédagogique : la note de l'enseignant reste privée, l'appréciation est visible par l'élève.
create table if not exists public.pfmp_followups (
  student_id uuid primary key references auth.users(id) on delete cascade,
  visit_date date,
  teacher_note text not null default '' check (char_length(teacher_note) <= 5000),
  appreciation text not null default '' check (char_length(appreciation) <= 3000),
  updated_at timestamptz not null default now()
);
-- Numéro de version de l'annuaire : l'application ne retélécharge les entreprises que s'il change.
create table if not exists public.pfmp_meta (
  id boolean primary key default true check (id),
  revision bigint not null default 0
);
insert into public.pfmp_meta (id) values (true) on conflict do nothing;

create or replace function public.pfmp_touch()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  update public.pfmp_meta set revision = revision + 1 where id;
  return null;
end $$;
drop trigger if exists pfmp_companies_changed on public.pfmp_companies;
create trigger pfmp_companies_changed after insert or update or delete on public.pfmp_companies
  for each statement execute function public.pfmp_touch();
drop trigger if exists pfmp_reservations_changed on public.pfmp_reservations;
create trigger pfmp_reservations_changed after insert or update or delete on public.pfmp_reservations
  for each statement execute function public.pfmp_touch();

do $$ declare t text; begin
  foreach t in array array['pfmp_companies','pfmp_deleted_companies','pfmp_reports','pfmp_reservations','pfmp_followups','pfmp_meta'] loop
    execute format('alter table public.%I enable row level security', t);
    execute format('revoke all on public.%I from anon, authenticated', t);
    execute format('drop policy if exists melec_aal2_obligatoire on public.%I', t);
    execute format($p$create policy melec_aal2_obligatoire on public.%I as restrictive for all to authenticated
      using ((select melec_security.session_suffisante())) with check ((select melec_security.session_suffisante()))$p$, t);
  end loop;
end $$;
grant select on public.pfmp_companies, public.pfmp_reports, public.pfmp_reservations, public.pfmp_followups, public.pfmp_meta to authenticated;
grant update on public.pfmp_companies to authenticated;
grant insert, update on public.pfmp_followups to authenticated;

-- Entreprises : l'enseignant voit tout ; l'élève voit les entreprises libres et celle qui lui est réservée.
-- Entreprises déjà réservées par un autre élève (lu sans les règles d'accès de pfmp_reservations).
create or replace function melec_security.pfmp_prises_par_autres()
returns uuid[] language sql stable security definer set search_path = '' as $$
  select coalesce(array_agg(r.company_id), '{}') from public.pfmp_reservations r where r.student_id <> auth.uid();
$$;
revoke all on function melec_security.pfmp_prises_par_autres() from public, anon;
grant execute on function melec_security.pfmp_prises_par_autres() to authenticated;
create policy pfmp_companies_read on public.pfmp_companies for select to authenticated using (
  (select melec_security.est_enseignant())
  or ((select melec_security.eleve_actif()) and not (id = any ((select melec_security.pfmp_prises_par_autres())::uuid[]))));
create policy pfmp_companies_teacher_update on public.pfmp_companies for update to authenticated
  using ((select melec_security.est_enseignant())) with check ((select melec_security.est_enseignant()));
create policy pfmp_reports_read on public.pfmp_reports for select to authenticated
  using ((select melec_security.est_enseignant()) or student_id = (select auth.uid()));
-- L'élève sait seulement si l'entreprise est prise ; il ne voit que ses propres réservations en détail.
create policy pfmp_reservations_read on public.pfmp_reservations for select to authenticated
  using ((select melec_security.est_enseignant()) or student_id = (select auth.uid()));
create policy pfmp_followups_read on public.pfmp_followups for select to authenticated
  using ((select melec_security.est_enseignant()));
create policy pfmp_followups_teacher_insert on public.pfmp_followups for insert to authenticated
  with check ((select melec_security.est_enseignant()));
create policy pfmp_followups_teacher_update on public.pfmp_followups for update to authenticated
  using ((select melec_security.est_enseignant())) with check ((select melec_security.est_enseignant()));
create policy pfmp_meta_read on public.pfmp_meta for select to authenticated
  using ((select melec_security.est_enseignant()) or (select melec_security.eleve_actif()));

-- Ce que l'élève voit de son suivi : date de visite et appréciation (jamais la note privée).
create or replace function public.pfmp_my_followup()
returns jsonb language sql stable security definer set search_path = '' as $$
  select coalesce((select jsonb_build_object('visit_date', f.visit_date, 'appreciation', f.appreciation, 'updated_at', f.updated_at)
                   from public.pfmp_followups f
                   where f.student_id = auth.uid() and melec_security.session_suffisante()), '{}'::jsonb);
$$;
revoke all on function public.pfmp_my_followup() from public, anon;
grant execute on function public.pfmp_my_followup() to authenticated;

-- Enregistrer une démarche (élève pour lui-même, enseignant pour un élève).
create or replace function public.pfmp_save_report(
  p_id uuid, p_company uuid, p_student uuid, p_status text, p_date date,
  p_method text, p_contact text, p_notes text, p_start date, p_end date)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  teacher boolean := melec_security.est_enseignant();
  pupil uuid;
  existing public.pfmp_reports;
  reserved public.pfmp_reservations;
  item uuid;
begin
  if not melec_security.session_suffisante() then raise exception 'Validez Authenticator.' using errcode = '42501'; end if;
  if teacher then
    pupil := p_student;
    if not exists (select 1 from public.student_profiles s where s.user_id = pupil) then raise exception 'Élève inconnu.'; end if;
  elsif melec_security.eleve_actif() then
    pupil := auth.uid();
    if p_student is not null and p_student <> pupil then raise exception 'Démarche inaccessible.' using errcode = '42501'; end if;
  else
    raise exception 'Accès refusé.' using errcode = '42501';
  end if;
  if p_status not in ('À contacter', 'En attente', 'Accepté', 'Refusé', 'À relancer') then raise exception 'Statut inconnu.'; end if;
  -- Verrou sur l'entreprise : deux demandes simultanées sont traitées l'une après l'autre.
  perform 1 from public.pfmp_companies where id = p_company for update;
  if not found then raise exception 'Entreprise inconnue.'; end if;
  select * into reserved from public.pfmp_reservations where company_id = p_company;
  if not teacher and reserved.company_id is not null and reserved.student_id <> pupil then
    raise exception 'Cette entreprise a déjà accepté un élève.' using errcode = '23505';
  end if;
  if p_id is not null then
    select * into existing from public.pfmp_reports where id = p_id;
    if found and (existing.student_id <> pupil or existing.company_id <> p_company) then
      raise exception 'Démarche inaccessible.' using errcode = '42501';
    end if;
  end if;
  item := coalesce(existing.id, p_id, gen_random_uuid());
  if reserved.company_id is not null and (reserved.student_id <> pupil or (p_status = 'Accepté' and reserved.report_id <> item)) then
    raise exception 'Cette entreprise a déjà accepté un élève.' using errcode = '23505';
  end if;
  insert into public.pfmp_reports (id, company_id, student_id, status, date, method, contact, notes, start_date, end_date)
  values (item, p_company, pupil, p_status, coalesce(p_date, current_date), left(coalesce(p_method, ''), 100),
          left(coalesce(p_contact, ''), 500), left(coalesce(p_notes, ''), 5000), p_start, p_end)
  on conflict (id) do update set status = excluded.status, date = excluded.date, method = excluded.method,
    contact = excluded.contact, notes = excluded.notes, start_date = excluded.start_date, end_date = excluded.end_date, updated_at = now();
  if p_status = 'Accepté' then
    insert into public.pfmp_reservations (company_id, student_id, report_id) values (p_company, pupil, item) on conflict (company_id) do nothing;
  else
    delete from public.pfmp_reservations where company_id = p_company and report_id = item;
  end if;
  return jsonb_build_object('id', item, 'status', p_status);
end $$;

-- Libérer une entreprise (enseignant) : la démarche acceptée repasse « À relancer ».
create or replace function public.pfmp_release(p_company uuid)
returns boolean language plpgsql security definer set search_path = '' as $$
declare reserved public.pfmp_reservations;
begin
  if not (melec_security.est_enseignant() and melec_security.session_suffisante()) then raise exception 'Action réservée à l’enseignant.' using errcode = '42501'; end if;
  perform 1 from public.pfmp_companies where id = p_company for update;
  select * into reserved from public.pfmp_reservations where company_id = p_company;
  if not found then return false; end if;
  update public.pfmp_reports set status = 'À relancer', updated_at = now() where id = reserved.report_id;
  delete from public.pfmp_reservations where company_id = p_company;
  return true;
end $$;

-- Importer ou ajouter des entreprises (enseignant). Les doublons et les entreprises supprimées sont ignorés.
create or replace function public.pfmp_import_companies(p_companies jsonb)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare v jsonb; added int := 0; duplicates int := 0;
begin
  if not (melec_security.est_enseignant() and melec_security.session_suffisante()) then raise exception 'Action réservée à l’enseignant.' using errcode = '42501'; end if;
  if jsonb_typeof(p_companies) <> 'array' or jsonb_array_length(p_companies) > 5000 then raise exception 'Liste d’entreprises non valide.'; end if;
  for v in select value from jsonb_array_elements(p_companies) loop
    if coalesce(v->>'raisonSociale', '') = '' or coalesce(v->>'fingerprint', '') = '' then raise exception 'Entreprise sans nom.'; end if;
    if exists (select 1 from public.pfmp_deleted_companies d where d.fingerprint = v->>'fingerprint')
       or exists (select 1 from public.pfmp_companies c where c.fingerprint = v->>'fingerprint') then
      duplicates := duplicates + 1; continue;
    end if;
    insert into public.pfmp_companies (legacy_id, fingerprint, data)
      values (nullif(v->>'legacyId', ''), v->>'fingerprint', v - 'fingerprint' - 'legacyId' - 'id' - 'reserved');
    added := added + 1;
  end loop;
  return jsonb_build_object('added', added, 'duplicates', duplicates);
end $$;

-- Supprimer des entreprises (enseignant) ; leurs démarches et réservations disparaissent avec elles.
create or replace function public.pfmp_delete_companies(p_ids uuid[])
returns integer language plpgsql security definer set search_path = '' as $$
declare deleted int;
begin
  if not (melec_security.est_enseignant() and melec_security.session_suffisante()) then raise exception 'Action réservée à l’enseignant.' using errcode = '42501'; end if;
  insert into public.pfmp_deleted_companies (fingerprint) select fingerprint from public.pfmp_companies where id = any (p_ids) on conflict do nothing;
  delete from public.pfmp_companies where id = any (p_ids);
  get diagnostics deleted = row_count;
  return deleted;
end $$;

revoke all on function public.pfmp_touch() from public, anon, authenticated;
revoke all on function public.pfmp_save_report(uuid, uuid, uuid, text, date, text, text, text, date, date) from public, anon;
revoke all on function public.pfmp_release(uuid) from public, anon;
revoke all on function public.pfmp_import_companies(jsonb) from public, anon;
revoke all on function public.pfmp_delete_companies(uuid[]) from public, anon;
grant execute on function public.pfmp_save_report(uuid, uuid, uuid, text, date, text, text, text, date, date) to authenticated;
grant execute on function public.pfmp_release(uuid) to authenticated;
grant execute on function public.pfmp_import_companies(jsonb) to authenticated;
grant execute on function public.pfmp_delete_companies(uuid[]) to authenticated;
