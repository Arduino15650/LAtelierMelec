-- L'Atelier MELEC : SUIVI&PFMP — reprise de l'application « Évaluation ponctuelle » (melec-evaluation).
--
-- Rôles (Authenticator obligatoire, session aal2) :
--   • administrateur : tout enseignant de L'Atelier MELEC. Il gère classes, élèves, professeurs,
--     tuteurs, activités, PFMP, affectations, en-tête PDF et accès des collègues ; il évalue,
--     verrouille, déverrouille et signe les attestations.
--   • évaluateur : collègue autorisé dans « Accès des enseignants » (suivi_members), avec ou sans
--     compte enseignant. Il ne voit que les élèves dont il est l'enseignant référent sur une PFMP,
--     ne note que les épreuves qui lui sont affectées et signe leurs attestations.
-- Toutes les lectures et écritures passent par les fonctions ci-dessous, qui vérifient le rôle :
-- aucune table n'est lisible directement.

create table if not exists public.suivi_state (
  id integer primary key check (id = 1),
  data jsonb not null default '{}'::jsonb check (jsonb_typeof(data) = 'object' and pg_column_size(data) <= 3000000),
  updated_at timestamptz not null default now()
);
insert into public.suivi_state (id) values (1) on conflict do nothing;

-- Une évaluation par élève et par « emplacement » : épreuve seule (e2), activité (activity:<id>:e2)
-- ou PFMP (pfmp:<id>:e2).
create table if not exists public.suivi_evaluations (
  student_id text not null check (char_length(student_id) between 1 and 80),
  slot text not null check (slot ~ '^((activity|pfmp):[A-Za-z0-9_-]{1,80}:)?e(2|31|32)$'),
  evaluation jsonb not null check (jsonb_typeof(evaluation) = 'object' and pg_column_size(evaluation) <= 60000),
  teacher_email text not null default '',
  updated_at timestamptz not null default now(),
  primary key (student_id, slot)
);

create table if not exists public.suivi_attestations (
  id text primary key check (char_length(id) between 1 and 200),
  pfmp_id text not null,
  student_id text not null,
  teacher_email text not null default '',
  fields jsonb not null default '{}'::jsonb check (jsonb_typeof(fields) = 'object' and pg_column_size(fields) <= 20000),
  admin_locked boolean not null default false,
  manual_unlocked boolean not null default false,
  signed_at timestamptz,
  signed_by text not null default '',
  signature_hash text not null default '',
  updated_at timestamptz not null default now(),
  unique (pfmp_id, student_id)
);

create table if not exists public.suivi_members (
  email text primary key check (email = lower(email) and email ~ '^[^[:space:]@]+@[^[:space:]@]+[.][^[:space:]@]+$'),
  name text not null default '' check (char_length(name) <= 160),
  active boolean not null default true,
  created_at timestamptz not null default now()
);

alter table public.suivi_state enable row level security;
alter table public.suivi_evaluations enable row level security;
alter table public.suivi_attestations enable row level security;
alter table public.suivi_members enable row level security;
revoke all on public.suivi_state, public.suivi_evaluations, public.suivi_attestations, public.suivi_members from anon, authenticated;

-- ───────── Rôle ─────────
create or replace function melec_security.suivi_email() returns text
language sql stable security definer set search_path = '' as $$
  select lower(u.email) from auth.users u where u.id = auth.uid() and u.email_confirmed_at is not null;
$$;
create or replace function melec_security.role_suivi() returns text
language sql stable security definer set search_path = '' as $$
  select case
    when coalesce(auth.jwt()->>'aal', 'aal1') <> 'aal2' then null
    when exists (select 1 from public.teacher_accounts t where t.user_id = auth.uid()) then 'admin'
    when exists (select 1 from public.suivi_members m where m.email = melec_security.suivi_email() and m.active) then 'evaluateur'
  end;
$$;
revoke all on function melec_security.suivi_email(), melec_security.role_suivi() from public, anon;
grant execute on function melec_security.suivi_email(), melec_security.role_suivi() to authenticated;

-- Affectations d'un évaluateur, lues dans le document : une ligne par élève et par PFMP.
create or replace function melec_security.suivi_assignments(p_email text)
returns table (pfmp_id text, student_id text, exam_keys jsonb)
language sql stable security definer set search_path = '' as $$
  select p->>'id', a.key, coalesce(a.value->'examKeys', '[]'::jsonb)
  from public.suivi_state s,
       jsonb_array_elements(coalesce(s.data->'pfmps', '[]'::jsonb)) p,
       jsonb_each(coalesce(p->'assignments', '{}'::jsonb)) a,
       jsonb_array_elements(coalesce(s.data->'teachers', '[]'::jsonb)) t
  where s.id = 1 and t->>'id' = a.value->>'teacherId' and lower(coalesce(t->>'email', '')) = p_email and p_email <> '';
$$;
revoke all on function melec_security.suivi_assignments(text) from public, anon, authenticated;

create or replace function melec_security.suivi_require(p_admin boolean default false) returns text
language plpgsql stable security definer set search_path = '' as $$
declare r text := melec_security.role_suivi();
begin
  if r is null then raise exception 'SUIVI&PFMP : accès réservé aux enseignants autorisés (Authenticator requis).' using errcode = '42501'; end if;
  if p_admin and r <> 'admin' then raise exception 'Réservé au responsable du suivi.' using errcode = '42501'; end if;
  return r;
end $$;
revoke all on function melec_security.suivi_require(boolean) from public, anon, authenticated;

create or replace function melec_security.suivi_attestation_json(a public.suivi_attestations) returns jsonb
language sql immutable set search_path = '' as $$
  select jsonb_build_object('id', a.id, 'pfmpId', a.pfmp_id, 'studentId', a.student_id, 'teacherEmail', a.teacher_email,
    'fields', a.fields, 'adminLocked', a.admin_locked, 'manualUnlocked', a.manual_unlocked,
    'signedAt', coalesce(to_char(a.signed_at at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'), ''),
    'signedBy', a.signed_by, 'signatureHash', a.signature_hash,
    'updatedAt', to_char(a.updated_at at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'));
$$;
revoke all on function melec_security.suivi_attestation_json(public.suivi_attestations) from public, anon, authenticated;

-- ───────── Lecture ─────────
-- Version : change à chaque modification (l'interface ne recharge que si besoin).
create or replace function public.suivi_version() returns text
language plpgsql stable security definer set search_path = '' as $$
begin
  perform melec_security.suivi_require();
  return concat_ws('|', (select updated_at::text from public.suivi_state where id = 1),
    (select count(*) || ':' || coalesce(max(updated_at)::text, '') from public.suivi_evaluations),
    (select count(*) || ':' || coalesce(max(updated_at)::text, '') from public.suivi_attestations),
    (select count(*) || ':' || coalesce(max(created_at)::text, '') || ':' || count(*) filter (where active) from public.suivi_members));
end $$;

create or replace function public.suivi_load() returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare r text := melec_security.suivi_require(); me text := melec_security.suivi_email(); d jsonb; mine jsonb;
begin
  select data into d from public.suivi_state where id = 1;
  if r = 'admin' then
    return jsonb_build_object('role', r, 'email', me, 'version', public.suivi_version(), 'state', d,
      'updatedAt', (select to_char(updated_at at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.US"Z"') from public.suivi_state where id = 1),
      'evaluations', coalesce((select jsonb_agg(jsonb_build_object('studentId', e.student_id, 'slot', e.slot, 'evaluation', e.evaluation)) from public.suivi_evaluations e), '[]'::jsonb),
      'attestations', coalesce((select jsonb_agg(melec_security.suivi_attestation_json(a)) from public.suivi_attestations a), '[]'::jsonb));
  end if;
  -- Évaluateur : seulement ses PFMP, ses élèves (sans les autres affectations) et leurs évaluations.
  select coalesce(jsonb_agg(jsonb_build_object('pfmpId', x.pfmp_id, 'studentId', x.student_id, 'examKeys', x.exam_keys)), '[]'::jsonb)
    into mine from melec_security.suivi_assignments(me) x;
  return jsonb_build_object('role', r, 'email', me, 'version', public.suivi_version(), 'state', jsonb_build_object(
      'schoolYear', d->'schoolYear', 'pdfHeader', d->'pdfHeader',
      'classes', coalesce((select jsonb_agg(distinct p->'className') from jsonb_array_elements(coalesce(d->'pfmps', '[]'::jsonb)) p
                           where exists (select 1 from jsonb_array_elements(mine) m where m->>'pfmpId' = p->>'id')), '[]'::jsonb),
      'teachers', coalesce(d->'teachers', '[]'::jsonb),
      'students', coalesce((select jsonb_agg(st) from jsonb_array_elements(coalesce(d->'students', '[]'::jsonb)) st
                            where exists (select 1 from jsonb_array_elements(mine) m where m->>'studentId' = st->>'id')), '[]'::jsonb),
      'tutors', coalesce((select jsonb_agg(tu) from jsonb_array_elements(coalesce(d->'tutors', '[]'::jsonb)) tu
                          where exists (select 1 from jsonb_array_elements(mine) m where m->>'pfmpId' = tu->>'pfmpId'
                                        and coalesce(tu->'studentIds', '[]'::jsonb) ? (m->>'studentId'))), '[]'::jsonb),
      'pfmps', coalesce((select jsonb_agg(jsonb_set(p, '{assignments}', coalesce((select jsonb_object_agg(a.key, a.value) from jsonb_each(coalesce(p->'assignments', '{}'::jsonb)) a
                            where exists (select 1 from jsonb_array_elements(mine) m where m->>'pfmpId' = p->>'id' and m->>'studentId' = a.key)), '{}'::jsonb)))
                         from jsonb_array_elements(coalesce(d->'pfmps', '[]'::jsonb)) p
                         where exists (select 1 from jsonb_array_elements(mine) m where m->>'pfmpId' = p->>'id')), '[]'::jsonb),
      'periods', '[]'::jsonb, 'activities', '[]'::jsonb),
    'evaluations', coalesce((select jsonb_agg(jsonb_build_object('studentId', e.student_id, 'slot', e.slot, 'evaluation', e.evaluation))
                             from public.suivi_evaluations e join jsonb_array_elements(mine) m
                               on m->>'studentId' = e.student_id and e.slot like 'pfmp:' || (m->>'pfmpId') || ':%'), '[]'::jsonb),
    'attestations', coalesce((select jsonb_agg(melec_security.suivi_attestation_json(a)) from public.suivi_attestations a
                              where exists (select 1 from jsonb_array_elements(mine) m where m->>'pfmpId' = a.pfmp_id and m->>'studentId' = a.student_id)), '[]'::jsonb));
end $$;

-- ───────── Écriture du document (responsable) ─────────
-- p_base : version lue au chargement. Si un autre poste a enregistré entre-temps, l'enregistrement
-- est refusé (l'interface recharge puis réapplique), pour ne jamais écraser le travail d'un collègue.
create or replace function public.suivi_save_state(p_data jsonb, p_base timestamptz) returns timestamptz
language plpgsql security definer set search_path = '' as $$
declare t timestamptz;
begin
  perform melec_security.suivi_require(true);
  if jsonb_typeof(p_data) <> 'object' then raise exception 'Document invalide.'; end if;
  update public.suivi_state set data = p_data - 'evaluations' - 'attestations' - 'selected' - 'selectedActivity' - 'selectedPfmp',
         updated_at = clock_timestamp()
   where id = 1 and (p_base is null or updated_at = p_base)
  returning updated_at into t;
  if t is null then raise exception 'Le suivi a été modifié sur un autre poste. Rechargement…' using errcode = '40001'; end if;
  return t;
end $$;

-- Suppression d'une PFMP ou d'une activité : ses évaluations et attestations non signées partent avec elle.
create or replace function public.suivi_purge(p_kind text, p_id text) returns void
language plpgsql security definer set search_path = '' as $$
begin
  perform melec_security.suivi_require(true);
  if p_kind not in ('pfmp', 'activity') or coalesce(p_id, '') = '' then raise exception 'Suppression invalide.'; end if;
  delete from public.suivi_evaluations where slot like p_kind || ':' || p_id || ':%';
  if p_kind = 'pfmp' then delete from public.suivi_attestations where pfmp_id = p_id; end if;
end $$;
create or replace function public.suivi_purge_students(p_ids text[]) returns void
language plpgsql security definer set search_path = '' as $$
begin
  perform melec_security.suivi_require(true);
  delete from public.suivi_evaluations where student_id = any(p_ids);
  delete from public.suivi_attestations where student_id = any(p_ids);
end $$;

-- ───────── Évaluations ─────────
create or replace function public.suivi_save_evaluation(p_student text, p_slot text, p_evaluation jsonb) returns void
language plpgsql security definer set search_path = '' as $$
declare r text := melec_security.suivi_require(); me text := melec_security.suivi_email(); v_pfmp text; v_exam text;
begin
  if p_slot !~ '^((activity|pfmp):[A-Za-z0-9_-]{1,80}:)?e(2|31|32)$' then raise exception 'Épreuve inconnue.'; end if;
  if p_slot like 'pfmp:%' then
    v_pfmp := split_part(p_slot, ':', 2); v_exam := split_part(p_slot, ':', 3);
    if exists (select 1 from public.suivi_attestations a where a.pfmp_id = v_pfmp and a.student_id = p_student and (a.signed_at is not null or a.admin_locked)) then
      raise exception 'Évaluation verrouillée : l’attestation est signée ou verrouillée. Le responsable doit d’abord la déverrouiller.';
    end if;
  end if;
  if r <> 'admin' then
    if v_pfmp is null or not exists (select 1 from melec_security.suivi_assignments(me) x
        where x.pfmp_id = v_pfmp and x.student_id = p_student and x.exam_keys ? v_exam) then
      raise exception 'Cette épreuve ne vous est pas affectée pour cet élève.' using errcode = '42501';
    end if;
  end if;
  if p_evaluation is null or p_evaluation = '{}'::jsonb then
    delete from public.suivi_evaluations where student_id = p_student and slot = p_slot;
  else
    insert into public.suivi_evaluations (student_id, slot, evaluation, teacher_email, updated_at)
    values (p_student, p_slot, p_evaluation, coalesce(me, ''), clock_timestamp())
    on conflict (student_id, slot) do update set evaluation = excluded.evaluation, teacher_email = excluded.teacher_email, updated_at = excluded.updated_at;
  end if;
end $$;

-- ───────── Attestations ─────────
-- Enregistrement d'une attestation non signée. Le responsable peut tout modifier et verrouiller ou
-- déverrouiller (déverrouiller annule la signature) ; l'évaluateur ne modifie que les absences,
-- « Fait à » et le signataire, tant que l'attestation n'est ni verrouillée ni signée.
create or replace function public.suivi_save_attestation(p jsonb) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare r text := melec_security.suivi_require(); me text := melec_security.suivi_email();
        cur public.suivi_attestations; v_id text := p->>'id'; v_pfmp text := p->>'pfmpId'; v_student text := p->>'studentId';
        f jsonb := coalesce(p->'fields', '{}'::jsonb); res public.suivi_attestations;
begin
  if coalesce(v_id, '') = '' or coalesce(v_pfmp, '') = '' or coalesce(v_student, '') = '' then raise exception 'Attestation incomplète.'; end if;
  select * into cur from public.suivi_attestations where id = v_id or (pfmp_id = v_pfmp and student_id = v_student) limit 1;
  if r <> 'admin' then
    if not exists (select 1 from melec_security.suivi_assignments(me) x where x.pfmp_id = v_pfmp and x.student_id = v_student) then
      raise exception 'Cet élève ne vous est pas confié pour cette PFMP.' using errcode = '42501';
    end if;
    if cur.id is not null and (cur.admin_locked or cur.signed_at is not null) then
      raise exception 'Attestation verrouillée ou déjà signée.' using errcode = '42501';
    end if;
    -- Champs réservés au responsable : repris de la version enregistrée (ou de la préparation automatique).
    if cur.id is not null then
      f := cur.fields || jsonb_build_object('absenceDays', f->'absenceDays', 'absenceDetails', f->'absenceDetails',
             'signedAtCity', f->'signedAtCity', 'signerName', f->'signerName');
    end if;
    insert into public.suivi_attestations (id, pfmp_id, student_id, teacher_email, fields, updated_at)
    values (coalesce(cur.id, v_id), v_pfmp, v_student, me, f, clock_timestamp())
    on conflict (id) do update set fields = excluded.fields, teacher_email = excluded.teacher_email, updated_at = excluded.updated_at
    returning * into res;
    return melec_security.suivi_attestation_json(res);
  end if;
  -- Responsable
  if cur.id is not null and cur.signed_at is not null and coalesce((p->>'adminLocked')::boolean, true) and not coalesce((p->>'manualUnlocked')::boolean, false) then
    raise exception 'Attestation signée : déverrouillez-la avant toute modification.';
  end if;
  insert into public.suivi_attestations (id, pfmp_id, student_id, teacher_email, fields, admin_locked, manual_unlocked, signed_at, signed_by, signature_hash, updated_at)
  values (coalesce(cur.id, v_id), v_pfmp, v_student, lower(coalesce(p->>'teacherEmail', '')), f,
          coalesce((p->>'adminLocked')::boolean, false), coalesce((p->>'manualUnlocked')::boolean, false), null, '', '', clock_timestamp())
  on conflict (id) do update set teacher_email = excluded.teacher_email, fields = excluded.fields,
    admin_locked = excluded.admin_locked, manual_unlocked = excluded.manual_unlocked,
    -- Déverrouiller annule la signature ; verrouiller conserve une signature existante.
    signed_at = case when excluded.admin_locked then public.suivi_attestations.signed_at end,
    signed_by = case when excluded.admin_locked then public.suivi_attestations.signed_by else '' end,
    signature_hash = case when excluded.admin_locked then public.suivi_attestations.signature_hash else '' end,
    updated_at = excluded.updated_at
  returning * into res;
  return melec_security.suivi_attestation_json(res);
end $$;

-- Signature électronique : le code Authenticator doit avoir été validé dans les 5 dernières minutes
-- (contrôlé par le serveur dans le jeton de session). L'empreinte est calculée par le serveur.
create or replace function public.suivi_sign_attestation(p jsonb) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare r text := melec_security.suivi_require(); me text := melec_security.suivi_email();
        res public.suivi_attestations; v_at timestamptz := clock_timestamp(); v_name text; k text; recent boolean;
begin
  select exists (select 1 from jsonb_array_elements(coalesce(auth.jwt()->'amr', '[]'::jsonb)) a
                 where a->>'method' = 'totp' and (a->>'timestamp')::bigint >= extract(epoch from now())::bigint - 300) into recent;
  if not recent then raise exception 'Saisissez à nouveau le code Authenticator pour signer.' using errcode = '42501'; end if;
  foreach k in array array['hostStructure','companyName','companyAddress','companyPhone','totalWeeks','absenceDays','signedAtCity','signedAtDate','signerName'] loop
    if coalesce(btrim(p->'fields'->>k), '') = '' then raise exception 'Complétez tous les champs obligatoires avant de signer.'; end if;
  end loop;
  perform public.suivi_save_attestation(p);
  select * into res from public.suivi_attestations where pfmp_id = p->>'pfmpId' and student_id = p->>'studentId';
  if res.admin_locked or res.signed_at is not null then raise exception 'Attestation verrouillée ou déjà signée.'; end if;
  -- Signataire : nom de la fiche « Professeurs » correspondant au compte, sinon son adresse.
  select coalesce((select nullif(btrim(coalesce(t->>'firstName', '') || ' ' || coalesce(t->>'lastName', '')), '')
                   from public.suivi_state st, jsonb_array_elements(coalesce(st.data->'teachers', '[]'::jsonb)) t
                   where st.id = 1 and lower(coalesce(t->>'email', '')) = me limit 1), me, 'Enseignant') into v_name;
  update public.suivi_attestations set signed_at = v_at, signed_by = v_name, admin_locked = true, manual_unlocked = false,
    signature_hash = encode(sha256(convert_to(jsonb_build_object('id', id, 'fields', fields, 'studentId', student_id, 'pfmpId', pfmp_id,
                     'signedAt', to_char(v_at at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'), 'signedBy', v_name)::text, 'UTF8')), 'hex'),
    updated_at = v_at
   where id = res.id returning * into res;
  return melec_security.suivi_attestation_json(res);
end $$;

-- ───────── Accès des collègues ─────────
create or replace function public.suivi_members_list() returns jsonb
language plpgsql stable security definer set search_path = '' as $$
begin
  perform melec_security.suivi_require(true);
  return coalesce((select jsonb_agg(jsonb_build_object('email', m.email, 'name', m.name, 'active', m.active,
      'teacher', exists (select 1 from public.teacher_accounts t where t.user_id = u.id),
      'account', u.id is not null, 'confirmed', u.email_confirmed_at is not null,
      'authenticator', exists (select 1 from auth.mfa_factors f where f.user_id = u.id and f.status = 'verified'))
    order by m.email) from public.suivi_members m left join auth.users u on lower(u.email) = m.email), '[]'::jsonb);
end $$;
create or replace function public.suivi_member_set(p_email text, p_name text, p_active boolean) returns void
language plpgsql security definer set search_path = '' as $$
declare e text := lower(btrim(coalesce(p_email, '')));
begin
  perform melec_security.suivi_require(true);
  if e !~ '^[^[:space:]@]+@[^[:space:]@]+[.][^[:space:]@]+$' then raise exception 'Adresse e-mail invalide.'; end if;
  if p_active is null then delete from public.suivi_members where email = e; return; end if;
  insert into public.suivi_members (email, name, active) values (e, left(coalesce(p_name, ''), 160), p_active)
  on conflict (email) do update set name = coalesce(nullif(excluded.name, ''), public.suivi_members.name), active = excluded.active;
end $$;

-- ───────── Comptes des collègues (sans compte enseignant) ─────────
-- Avant l'Authenticator, la page sait seulement si l'adresse est autorisée (magasin ou suivi).
create or replace function public.store_member_check()
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (select 1 from auth.users u where u.id = auth.uid() and u.email_confirmed_at is not null
                 and (exists (select 1 from public.store_members m where m.email = lower(u.email) and m.active)
                      or exists (select 1 from public.suivi_members s where s.email = lower(u.email) and s.active)));
$$;
create or replace function private.create_student_profile()
returns trigger language plpgsql security definer set search_path to '' as $function$
begin
  if new.email is null then return new; end if;
  if coalesce(new.raw_user_meta_data->>'account_type', '') = 'team'
     or exists (select 1 from public.store_members m where m.email = lower(new.email) and m.active)
     or exists (select 1 from public.suivi_members s where s.email = lower(new.email) and s.active) then
    return new;
  end if;
  insert into public.student_profiles(user_id,last_name,first_name,email,requested_class)
  values (
    new.id,
    left(coalesce(nullif(btrim(new.raw_user_meta_data->>'last_name'),''),'À compléter'),80),
    left(coalesce(nullif(btrim(new.raw_user_meta_data->>'first_name'),''),'À compléter'),80),
    left(new.email,254),
    left(coalesce(nullif(btrim(new.raw_user_meta_data->>'requested_class'),''),'À préciser'),80)
  ) on conflict (user_id) do nothing;
  return new;
end $function$;

revoke all on function public.suivi_version(), public.suivi_load(), public.suivi_save_state(jsonb, timestamptz),
  public.suivi_purge(text, text), public.suivi_purge_students(text[]), public.suivi_save_evaluation(text, text, jsonb),
  public.suivi_save_attestation(jsonb), public.suivi_sign_attestation(jsonb), public.suivi_members_list(),
  public.suivi_member_set(text, text, boolean), public.store_member_check() from public, anon;
grant execute on function public.suivi_version(), public.suivi_load(), public.suivi_save_state(jsonb, timestamptz),
  public.suivi_purge(text, text), public.suivi_purge_students(text[]), public.suivi_save_evaluation(text, text, jsonb),
  public.suivi_save_attestation(jsonb), public.suivi_sign_attestation(jsonb), public.suivi_members_list(),
  public.suivi_member_set(text, text, boolean), public.store_member_check() to authenticated;
