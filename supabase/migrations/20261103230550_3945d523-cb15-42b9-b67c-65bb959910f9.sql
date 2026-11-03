CREATE EXTENSION IF NOT EXISTS pg_cron;
SELECT cron.schedule('notem-api-log-retention','0 3 * * *',$$DELETE FROM public.api_request_logs WHERE created_at < now()-interval '90 days'$$);
CREATE FUNCTION public.create_integration(_actor uuid,_org uuid,_payload jsonb) RETURNS uuid LANGUAGE sql SECURITY INVOKER SET search_path=public AS $$ SELECT public.manage_integration(_actor,_org,'save',NULL,_payload) $$;
REVOKE ALL ON FUNCTION public.create_integration(uuid,uuid,jsonb) FROM PUBLIC,anon,authenticated; GRANT EXECUTE ON FUNCTION public.create_integration(uuid,uuid,jsonb) TO service_role;