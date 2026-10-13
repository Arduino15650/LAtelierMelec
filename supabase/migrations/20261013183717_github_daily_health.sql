-- Daily GitHub Actions availability check; reads no application or user table.
create function public.github_daily_health()
returns text
language sql
stable
security invoker
set search_path = ''
as $$ select 'ok'::text; $$;

revoke all on function public.github_daily_health() from public, anon, authenticated;
grant execute on function public.github_daily_health() to anon;

comment on function public.github_daily_health() is
  'Read-only availability check for GitHub Actions; returns ok without accessing user data.';
