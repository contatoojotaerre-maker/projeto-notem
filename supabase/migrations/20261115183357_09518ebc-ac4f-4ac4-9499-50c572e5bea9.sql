-- Internal API state tables: no access for browser roles at all (explicit deny), service role only.
REVOKE ALL ON public.api_rate_counters, public.api_concurrency_slots, public.api_rate_limit_overrides, public.admin_audit_events, public.sandbox_change_audit FROM anon, authenticated, PUBLIC;
GRANT ALL ON public.api_rate_counters, public.api_concurrency_slots, public.api_rate_limit_overrides, public.admin_audit_events, public.sandbox_change_audit TO service_role;

-- Read-only for signed-in users; rows still filtered by the existing policies (platform admin / organization).
GRANT SELECT ON public.api_rate_limit_overrides, public.admin_audit_events TO authenticated;
-- Sandbox change alerts: read by members; owners/admins may only mark them as read.
GRANT SELECT ON public.sandbox_change_audit TO authenticated;
GRANT UPDATE (acknowledged_at, acknowledged_by) ON public.sandbox_change_audit TO authenticated;

DROP POLICY IF EXISTS api_rate_counters_no_client_access ON public.api_rate_counters;
CREATE POLICY api_rate_counters_no_client_access ON public.api_rate_counters AS RESTRICTIVE FOR ALL TO anon, authenticated USING (false) WITH CHECK (false);
DROP POLICY IF EXISTS api_concurrency_slots_no_client_access ON public.api_concurrency_slots;
CREATE POLICY api_concurrency_slots_no_client_access ON public.api_concurrency_slots AS RESTRICTIVE FOR ALL TO anon, authenticated USING (false) WITH CHECK (false);