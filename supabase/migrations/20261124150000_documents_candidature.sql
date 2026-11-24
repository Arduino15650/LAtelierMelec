-- L'Atelier MELEC : « Mes outils » — CV et lettres de motivation des élèves.
--
-- L'élève crée, modifie et supprime ses propres documents (contenu complet dans « data » :
-- textes, choix de thème et d'organisation, photo d'identité et signature compressées).
-- Il peut les envoyer à son enseignant pour relecture (review_status = 'submitted').
-- L'enseignant lit tous les documents et répond par un commentaire en indiquant
-- « à corriger » ('changes') ou « validé » ('approved'). Il ne modifie jamais le contenu.

create table if not exists public.student_career_docs (
  id uuid primary key default gen_random_uuid(),
  student_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  kind text not null check (kind in ('cv', 'lm')),
  title text not null default '' check (char_length(title) <= 120),
  data jsonb not null default '{}'::jsonb
    check (jsonb_typeof(data) = 'object' and pg_column_size(data) <= 600000),
  review_status text not null default 'draft' check (review_status in ('draft', 'submitted', 'changes', 'approved')),
  submitted_at timestamptz,
  teacher_comment text not null default '' check (char_length(teacher_comment) <= 4000),
  reviewed_at timestamptz,
  reviewed_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists student_career_docs_student_idx on public.student_career_docs (student_id, updated_at desc);
create index if not exists student_career_docs_review_idx on public.student_career_docs (review_status, submitted_at desc);

-- Qui peut changer quoi : imposé par la base, quel que soit le code du site.
create or replace function public.student_career_docs_guard()
returns trigger language plpgsql security definer set search_path = '' as $$
declare
  teacher boolean := exists (select 1 from public.teacher_accounts t where t.user_id = auth.uid());
begin
  if tg_op = 'INSERT' then
    if teacher then raise exception 'Les documents sont créés par les élèves.'; end if;
    if (select count(*) from public.student_career_docs d where d.student_id = new.student_id) >= 40 then
      raise exception 'Limite atteinte : 40 documents par élève. Supprimez un ancien document.';
    end if;
    new.review_status := case when new.review_status = 'submitted' then 'submitted' else 'draft' end;
    new.submitted_at := case when new.review_status = 'submitted' then now() end;
    new.teacher_comment := ''; new.reviewed_at := null; new.reviewed_by := null;
    new.created_at := now(); new.updated_at := now();
    return new;
  end if;
  new.id := old.id; new.student_id := old.student_id; new.kind := old.kind; new.created_at := old.created_at;
  if teacher then
    -- L'enseignant répond seulement : le contenu de l'élève reste intact.
    new.data := old.data; new.title := old.title; new.updated_at := old.updated_at; new.submitted_at := old.submitted_at;
    if new.review_status not in ('changes', 'approved') then new.review_status := old.review_status; end if;
    if new.review_status is distinct from old.review_status or new.teacher_comment is distinct from old.teacher_comment then
      new.reviewed_at := now(); new.reviewed_by := auth.uid();
    else
      new.reviewed_at := old.reviewed_at; new.reviewed_by := old.reviewed_by;
    end if;
  else
    -- L'élève modifie son document et peut l'envoyer (ou le reprendre) ; l'avis de l'enseignant reste affiché.
    new.teacher_comment := old.teacher_comment; new.reviewed_at := old.reviewed_at; new.reviewed_by := old.reviewed_by;
    if new.review_status = 'submitted' and old.review_status is distinct from 'submitted' then
      new.submitted_at := now();
    elsif new.review_status in ('changes', 'approved') then
      new.review_status := old.review_status; new.submitted_at := old.submitted_at;
    elsif new.review_status = 'draft' then
      new.submitted_at := old.submitted_at;
    else
      new.submitted_at := old.submitted_at;
    end if;
    new.updated_at := now();
  end if;
  return new;
end $$;
revoke all on function public.student_career_docs_guard() from public, anon, authenticated;
drop trigger if exists student_career_docs_guard on public.student_career_docs;
create trigger student_career_docs_guard before insert or update on public.student_career_docs
  for each row execute function public.student_career_docs_guard();

alter table public.student_career_docs enable row level security;
revoke all on public.student_career_docs from anon;
grant select, insert, update, delete on public.student_career_docs to authenticated;

-- Élève validé et non bloqué : ses documents uniquement.
create policy student_career_docs_student_read on public.student_career_docs
  for select to authenticated
  using (student_id = (select auth.uid()));

create policy student_career_docs_student_insert on public.student_career_docs
  for insert to authenticated
  with check (
    student_id = (select auth.uid())
    and exists (select 1 from public.student_profiles s
                where s.user_id = (select auth.uid()) and s.approved_at is not null and s.blocked_at is null)
  );

create policy student_career_docs_student_update on public.student_career_docs
  for update to authenticated
  using (student_id = (select auth.uid()))
  with check (
    student_id = (select auth.uid())
    and exists (select 1 from public.student_profiles s
                where s.user_id = (select auth.uid()) and s.approved_at is not null and s.blocked_at is null)
  );

create policy student_career_docs_student_delete on public.student_career_docs
  for delete to authenticated
  using (student_id = (select auth.uid()));

-- Enseignant : lecture de tous les documents et réponse (commentaire, état).
create policy student_career_docs_teacher_read on public.student_career_docs
  for select to authenticated
  using (exists (select 1 from public.teacher_accounts t where t.user_id = (select auth.uid())));

create policy student_career_docs_teacher_update on public.student_career_docs
  for update to authenticated
  using (exists (select 1 from public.teacher_accounts t where t.user_id = (select auth.uid())))
  with check (exists (select 1 from public.teacher_accounts t where t.user_id = (select auth.uid())));

-- Même exigence Authenticator (aal2) que les autres tables.
create policy melec_aal2_obligatoire on public.student_career_docs
  as restrictive for all to authenticated
  using ((select melec_security.session_suffisante()))
  with check ((select melec_security.session_suffisante()));

-- Retour arrière (si besoin) :
-- drop table if exists public.student_career_docs;
-- drop function if exists public.student_career_docs_guard();
