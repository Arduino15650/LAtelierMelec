-- Comptages du Magasin : l'identité de l'élève est lue une seule fois par requête
-- (conseil « auth_rls_initplan » de Supabase), même règle d'accès qu'avant.
drop policy if exists store_counts_read on public.store_counts;
create policy store_counts_read on public.store_counts for select to authenticated
  using (student_id = (select auth.uid()) or (select melec_security.role_magasin()) is not null);
