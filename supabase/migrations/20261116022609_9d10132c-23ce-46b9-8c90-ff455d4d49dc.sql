-- Início (Fase 8 revisão): notes summary only counts (no amount); integration counts of the last 24 hours.
DROP FUNCTION IF EXISTS public.org_notes_summary(uuid, public.environment, timestamptz, timestamptz);
CREATE FUNCTION public.org_notes_summary(_org uuid, _env public.environment, _from timestamptz, _to timestamptz)
RETURNS TABLE(origin text, emitted bigint, cancelled bigint, rejected bigint)
LANGUAGE sql STABLE SET search_path TO ''
AS $f$
  WITH n AS (
    SELECT 'notem'::text AS origin, i.status FROM public.invoices i
     WHERE i.organization_id = _org AND i.environment = _env AND i.emitted_at >= _from AND i.emitted_at < _to
    UNION ALL
    SELECT 'externa', d.status FROM public.nfse_documents d
     WHERE d.environment = _env AND d.invoice_id IS NULL AND coalesce(d.issued_at, d.authorized_at) >= _from AND coalesce(d.issued_at, d.authorized_at) < _to
       AND EXISTS (SELECT 1 FROM public.companies c2 JOIN public.company_certificates cc ON cc.company_id = c2.id AND cc.organization_id = c2.organization_id
                    WHERE c2.organization_id = _org AND public.normalize_cnpj(c2.cnpj) = d.provider_cnpj AND public.normalize_cnpj(cc.cnpj) = d.provider_cnpj)
  )
  SELECT o.origin,
    count(n.status) FILTER (WHERE n.status IN ('authorized', 'cancellation_pending', 'cancelled', 'cancelled_by_authority', 'substituted')),
    count(n.status) FILTER (WHERE n.status IN ('cancelled', 'cancelled_by_authority')),
    count(n.status) FILTER (WHERE n.status = 'rejected')
  FROM (VALUES ('notem'::text), ('externa'::text)) o(origin) LEFT JOIN n ON n.origin = o.origin
  GROUP BY o.origin ORDER BY o.origin DESC
$f$;
REVOKE ALL ON FUNCTION public.org_notes_summary(uuid, public.environment, timestamptz, timestamptz) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.org_notes_summary(uuid, public.environment, timestamptz, timestamptz) TO authenticated, service_role;

-- Authenticated calls only: a key was found and the request was not refused with 401 (unknown, revoked,
-- wrong-environment key or inactive integration). Index-only scan by organization, environment and time.
CREATE INDEX IF NOT EXISTS api_logs_org_env_auth_date ON public.api_request_logs(organization_id, environment, created_at) INCLUDE (status_code)
  WHERE key_id IS NOT NULL AND status_code <> 401;

CREATE OR REPLACE FUNCTION public.org_integration_summary(_org uuid, _env public.environment, _from timestamptz, _to timestamptz)
RETURNS TABLE(calls bigint, client_errors bigint, server_errors bigint)
LANGUAGE sql STABLE SET search_path TO ''
AS $f$
  SELECT count(*),
    count(*) FILTER (WHERE l.status_code BETWEEN 400 AND 499),
    count(*) FILTER (WHERE l.status_code >= 500)
  FROM public.api_request_logs l
  WHERE l.organization_id = _org AND l.environment = _env AND l.key_id IS NOT NULL AND l.status_code <> 401
    AND l.created_at >= _from AND l.created_at < _to
$f$;
REVOKE ALL ON FUNCTION public.org_integration_summary(uuid, public.environment, timestamptz, timestamptz) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.org_integration_summary(uuid, public.environment, timestamptz, timestamptz) TO authenticated, service_role;