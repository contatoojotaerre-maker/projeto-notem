revoke execute on function public.rls_auto_enable() from PUBLIC, anon, authenticated;
DO $$
declare enabled boolean;
begin
  CREATE TABLE public.notem_rls_probe_20261101 (id uuid primary key);
  GRANT ALL ON public.notem_rls_probe_20261101 TO service_role;
  select relrowsecurity into enabled from pg_class where oid='public.notem_rls_probe_20261101'::regclass;
  if enabled is distinct from true then raise exception 'Automatic RLS verification failed'; end if;
  DROP TABLE public.notem_rls_probe_20261101;
end $$;
