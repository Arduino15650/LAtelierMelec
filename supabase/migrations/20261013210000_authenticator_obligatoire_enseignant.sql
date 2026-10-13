-- L'Atelier MELEC : Authenticator obligatoire pour l'enseignant, vérifié par la base.
--
-- Sans cette règle, le code à 6 chiffres n'est exigé que par la page : un mot de passe seul
-- suffirait pour lire ou modifier les données en appelant directement l'API.
--
-- Règle : un compte enseignant, ou tout compte ayant activé un Authenticator, doit présenter
-- une session « aal2 » (mot de passe + code) pour toute table publique et tout fichier.
-- Les élèves sans Authenticator ne sont pas concernés.
-- Politiques « restrictive » : elles s'ajoutent aux règles existantes sans les remplacer.
-- Seule exception : la ligne de l'enseignant dans teacher_accounts, que la page lit pour
-- reconnaître un enseignant et lui proposer l'activation de l'Authenticator. Elle ne contient
-- que son identifiant.

create schema if not exists melec_security;
revoke all on schema melec_security from public;
grant usage on schema melec_security to authenticated;

-- Fonction en « security definer » : lit auth.mfa_factors et teacher_accounts sans dépendre
-- des règles de ces tables (évite toute récursion). Schéma non exposé par l'API.
create or replace function melec_security.session_suffisante()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(auth.jwt()->>'aal', 'aal1') = 'aal2'
      or not (
        exists (select 1 from auth.mfa_factors f where f.user_id = auth.uid() and f.status = 'verified')
        or exists (select 1 from public.teacher_accounts t where t.user_id = auth.uid())
      );
$$;
revoke all on function melec_security.session_suffisante() from public, anon;
grant execute on function melec_security.session_suffisante() to authenticated;

-- Remplace l'ancienne règle facultative (securite-mfa-enseignant.sql) si elle avait été appliquée.
do $$
declare t record;
begin
  for t in select tablename from pg_tables where schemaname = 'public' loop
    execute format('drop policy if exists melec_mfa_si_active on public.%I', t.tablename);
    execute format('drop policy if exists melec_aal2_obligatoire on public.%I', t.tablename);
    if t.tablename <> 'teacher_accounts' then
      execute format($p$
        create policy melec_aal2_obligatoire on public.%I
          as restrictive for all to authenticated
          using ((select melec_security.session_suffisante()))
          with check ((select melec_security.session_suffisante()))
      $p$, t.tablename);
    end if;
  end loop;
end $$;

drop policy if exists melec_mfa_si_active on storage.objects;
drop policy if exists melec_aal2_obligatoire on storage.objects;
create policy melec_aal2_obligatoire on storage.objects
  as restrictive for all to authenticated
  using ((select melec_security.session_suffisante()))
  with check ((select melec_security.session_suffisante()));

-- Retour arrière (si besoin) :
-- do $$ declare t record; begin for t in select tablename from pg_tables where schemaname='public' loop
--   execute format('drop policy if exists melec_aal2_obligatoire on public.%I', t.tablename); end loop; end $$;
-- drop policy if exists melec_aal2_obligatoire on storage.objects;
-- drop function if exists melec_security.session_suffisante();
