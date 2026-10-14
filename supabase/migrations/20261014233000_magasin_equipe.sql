-- L'Atelier MELEC : magasin — collègues de l'équipe sans compte enseignant, et synchronisation.
--
-- 1. Une adresse autorisée dans « Accès au magasin » peut créer son compte depuis l'espace
--    enseignant : elle n'est pas inscrite comme élève, active son Authenticator à la première
--    connexion, puis n'accède qu'au magasin (et à l'administration si elle est administrateur).
-- 2. Version du magasin : l'administrateur et l'équipe ne retéléchargent le magasin que s'il a
--    changé (un petit appel toutes les 15 s au lieu de tout l'inventaire).
-- 3. L'administrateur voit si chaque adresse autorisée a créé son compte et son Authenticator.

-- Inscription : pas de fiche élève pour un compte de l'équipe magasin.
create or replace function private.create_student_profile()
returns trigger language plpgsql security definer set search_path to '' as $function$
begin
  if new.email is null then return new; end if;
  if coalesce(new.raw_user_meta_data->>'account_type', '') = 'team'
     or exists (select 1 from public.store_members m where m.email = lower(new.email) and m.active) then
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

-- Avant le code Authenticator : la page sait seulement si l'adresse est autorisée (pour proposer
-- l'activation). Aucune donnée du magasin n'est lisible sans session aal2.
create or replace function public.store_member_check()
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.store_members m join auth.users u on lower(u.email) = m.email
                 where u.id = auth.uid() and u.email_confirmed_at is not null and m.active);
$$;

-- Version du magasin : change à chaque article, mouvement ou réglage.
create or replace function public.store_version()
returns text language plpgsql stable security definer set search_path = '' as $$
begin
  if melec_security.role_magasin() is null then raise exception 'Accès au magasin réservé à l’équipe (Authenticator requis).' using errcode = '42501'; end if;
  return concat_ws('|',
    (select count(*) || ':' || coalesce(max(updated_at)::text, '') from public.store_items),
    (select count(*) || ':' || coalesce(max(created)::text, '') from public.store_movements),
    (select updated_at::text from public.store_settings where id = 1),
    (select count(*) || ':' || coalesce(max(updated_at)::text, '') from public.store_counts where submitted_at is not null),
    (select count(*) from public.store_counts where loaded_at is not null));
end $$;

-- Liste des accès, avec l'état du compte de chaque adresse (administrateur seulement).
create or replace function public.store_admin_members()
returns jsonb language plpgsql stable security definer set search_path = '' as $$
begin
  if melec_security.role_magasin() is distinct from 'admin' then raise exception 'Réservé à l’administrateur.' using errcode = '42501'; end if;
  return coalesce((select jsonb_agg(jsonb_build_object(
      'email', m.email, 'role', m.role, 'active', m.active,
      'teacher', exists (select 1 from public.teacher_accounts t where t.user_id = u.id),
      'account', u.id is not null, 'confirmed', u.email_confirmed_at is not null,
      'authenticator', exists (select 1 from auth.mfa_factors f where f.user_id = u.id and f.status = 'verified'))
    order by m.email)
    from public.store_members m left join auth.users u on lower(u.email) = m.email), '[]'::jsonb);
end $$;

revoke all on function public.store_member_check(), public.store_version(), public.store_admin_members() from public, anon;
grant execute on function public.store_member_check(), public.store_version(), public.store_admin_members() to authenticated;
