-- L'Atelier MELEC : devis de matériel électrique réalisés par les élèves.
--
-- L'élève crée, enregistre, rouvre et modifie ses propres devis à tout moment,
-- tant que l'enseignant ne les a pas verrouillés. Il ne peut ni les supprimer ni
-- les verrouiller/déverrouiller.
-- L'enseignant voit tous les devis dès leur enregistrement, peut les verrouiller,
-- les déverrouiller et les supprimer définitivement.

create table if not exists public.student_quotes (
  id uuid primary key default gen_random_uuid(),
  student_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  number text not null default '' check (char_length(number) <= 40),
  project text not null default '' check (char_length(project) <= 200),
  supplier text not null default '' check (char_length(supplier) <= 80),
  quote_date date not null default current_date,
  lines jsonb not null default '[]'::jsonb
    check (jsonb_typeof(lines) = 'array' and jsonb_array_length(lines) <= 200 and pg_column_size(lines) <= 200000),
  total_ht numeric(12,2) not null default 0 check (total_ht >= 0),
  total_ttc numeric(12,2) not null default 0 check (total_ttc >= 0),
  locked_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists student_quotes_student_idx on public.student_quotes (student_id, updated_at desc);

-- Date de modification tenue par la base.
create or replace function public.student_quotes_touch()
returns trigger language plpgsql set search_path = '' as $$
begin
  new.updated_at := now();
  return new;
end $$;
drop trigger if exists student_quotes_touch on public.student_quotes;
create trigger student_quotes_touch before update on public.student_quotes
  for each row execute function public.student_quotes_touch();

alter table public.student_quotes enable row level security;
revoke all on public.student_quotes from anon;
grant select, insert, update, delete on public.student_quotes to authenticated;

-- Élève : ses devis uniquement ; création réservée aux comptes validés et non bloqués.
create policy student_quotes_student_read on public.student_quotes
  for select to authenticated
  using (student_id = (select auth.uid()));

create policy student_quotes_student_insert on public.student_quotes
  for insert to authenticated
  with check (
    student_id = (select auth.uid()) and locked_at is null
    and exists (select 1 from public.student_profiles s
                where s.user_id = (select auth.uid()) and s.approved_at is not null and s.blocked_at is null)
  );

-- Modification possible tant que le devis n'est pas verrouillé ; l'élève ne peut pas le verrouiller lui-même.
create policy student_quotes_student_update on public.student_quotes
  for update to authenticated
  using (student_id = (select auth.uid()) and locked_at is null)
  with check (
    student_id = (select auth.uid()) and locked_at is null
    and exists (select 1 from public.student_profiles s
                where s.user_id = (select auth.uid()) and s.approved_at is not null and s.blocked_at is null)
  );

-- Enseignant : lecture, verrouillage (mise à jour) et suppression définitive.
create policy student_quotes_teacher_read on public.student_quotes
  for select to authenticated
  using (exists (select 1 from public.teacher_accounts t where t.user_id = (select auth.uid())));

create policy student_quotes_teacher_update on public.student_quotes
  for update to authenticated
  using (exists (select 1 from public.teacher_accounts t where t.user_id = (select auth.uid())))
  with check (exists (select 1 from public.teacher_accounts t where t.user_id = (select auth.uid())));

create policy student_quotes_teacher_delete on public.student_quotes
  for delete to authenticated
  using (exists (select 1 from public.teacher_accounts t where t.user_id = (select auth.uid())));

-- Même exigence Authenticator (aal2) que les autres tables.
create policy melec_aal2_obligatoire on public.student_quotes
  as restrictive for all to authenticated
  using ((select melec_security.session_suffisante()))
  with check ((select melec_security.session_suffisante()));

-- Retour arrière (si besoin) :
-- drop table if exists public.student_quotes;
-- drop function if exists public.student_quotes_touch();
