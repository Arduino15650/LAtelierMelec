-- L'Atelier MELEC : version propre à l'annuaire des entreprises.
-- Le numéro « revision » change aussi à chaque réservation d'élève ; s'en servir pour l'annuaire
-- obligeait chaque poste à retélécharger les 8 000 entreprises (≈ 5 Mo) dès qu'un élève réservait.
-- « companies_revision » ne change que si l'annuaire lui-même change : les postes gardent alors
-- l'annuaire en mémoire locale et ne le retéléchargent qu'après une vraie modification.
alter table public.pfmp_meta add column if not exists companies_revision bigint not null default 0;

create or replace function public.pfmp_touch_companies()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  update public.pfmp_meta set revision = revision + 1, companies_revision = companies_revision + 1 where id;
  return null;
end $$;
revoke all on function public.pfmp_touch_companies() from public, anon, authenticated;

drop trigger if exists pfmp_companies_changed on public.pfmp_companies;
create trigger pfmp_companies_changed after insert or update or delete on public.pfmp_companies
  for each statement execute function public.pfmp_touch_companies();
