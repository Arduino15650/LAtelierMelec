-- L'Atelier MELEC : exiger le code Authenticator côté serveur.
-- À exécuter une fois dans Supabase (SQL Editor), APRÈS avoir activé et testé
-- la double authentification sur le compte enseignant.
--
-- Règle : un compte qui a activé un Authenticator doit présenter une session
-- « aal2 » (mot de passe + code) pour lire ou modifier les données.
-- Les comptes sans Authenticator (les élèves) ne sont pas concernés.
-- Politique « restrictive » : elle s'ajoute aux règles existantes sans les remplacer.

do $$
declare t record;
begin
  for t in select tablename from pg_tables where schemaname = 'public' and rowsecurity loop
    execute format('drop policy if exists melec_mfa_si_active on public.%I', t.tablename);
    execute format($p$
      create policy melec_mfa_si_active on public.%I
        as restrictive for all to authenticated
        using (array[(select auth.jwt()->>'aal')] <@ (
          select case when count(id) > 0 then array['aal2'] else array['aal1','aal2'] end
          from auth.mfa_factors where user_id = (select auth.uid()) and status = 'verified'))
        with check (array[(select auth.jwt()->>'aal')] <@ (
          select case when count(id) > 0 then array['aal2'] else array['aal1','aal2'] end
          from auth.mfa_factors where user_id = (select auth.uid()) and status = 'verified'))
    $p$, t.tablename);
  end loop;
end $$;

-- Fichiers (TP, cours) : même règle.
drop policy if exists melec_mfa_si_active on storage.objects;
create policy melec_mfa_si_active on storage.objects
  as restrictive for all to authenticated
  using (array[(select auth.jwt()->>'aal')] <@ (
    select case when count(id) > 0 then array['aal2'] else array['aal1','aal2'] end
    from auth.mfa_factors where user_id = (select auth.uid()) and status = 'verified'))
  with check (array[(select auth.jwt()->>'aal')] <@ (
    select case when count(id) > 0 then array['aal2'] else array['aal1','aal2'] end
    from auth.mfa_factors where user_id = (select auth.uid()) and status = 'verified'));

-- Retour arrière (si besoin) :
-- do $$ declare t record; begin for t in select tablename from pg_tables where schemaname='public' loop
--   execute format('drop policy if exists melec_mfa_si_active on public.%I', t.tablename); end loop; end $$;
-- drop policy if exists melec_mfa_si_active on storage.objects;
