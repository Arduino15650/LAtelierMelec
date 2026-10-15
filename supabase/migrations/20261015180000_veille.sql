-- Maintien en éveil du projet Supabase (offre gratuite : mise en pause après une période d'inactivité).
-- La tâche planifiée GitHub « Maintien en éveil Supabase » appelle melec_veille() deux fois par jour :
-- une vraie écriture en base (horodatage), limitée à une par 10 minutes, sans aucune donnée du site.
create table if not exists public.melec_veille (
  id smallint primary key default 1 check (id = 1),
  derniere_visite timestamptz not null default now(),
  visites bigint not null default 0
);
alter table public.melec_veille enable row level security;
revoke all on public.melec_veille from anon, authenticated;
insert into public.melec_veille (id) values (1) on conflict (id) do nothing;

create or replace function public.melec_veille()
returns jsonb language plpgsql volatile security definer set search_path = '' as $$
declare v public.melec_veille;
begin
  update public.melec_veille set derniere_visite = now(), visites = visites + 1
   where id = 1 and derniere_visite < now() - interval '10 minutes'
  returning * into v;
  if v.id is null then select * into v from public.melec_veille where id = 1; end if;
  return jsonb_build_object('etat', 'ok', 'derniere_visite', v.derniere_visite, 'visites', v.visites);
end $$;
revoke all on function public.melec_veille() from public;
grant execute on function public.melec_veille() to anon, authenticated;
