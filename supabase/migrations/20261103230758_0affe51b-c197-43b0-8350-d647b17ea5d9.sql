REVOKE ALL ON public.integrations,public.integration_companies,public.integration_keys,public.api_request_logs FROM PUBLIC,anon,authenticated;
GRANT SELECT ON public.integrations,public.integration_companies,public.api_request_logs TO authenticated;
GRANT SELECT(id,integration_id,organization_id,environment,key_prefix,created_by,created_at,last_used_at,revoked_at,revoked_by) ON public.integration_keys TO authenticated;
GRANT ALL ON public.integrations,public.integration_companies,public.integration_keys,public.api_request_logs TO service_role;