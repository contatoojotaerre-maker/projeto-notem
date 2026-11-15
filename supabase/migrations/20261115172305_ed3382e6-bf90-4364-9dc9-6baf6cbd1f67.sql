CREATE OR REPLACE FUNCTION public.list_org_notes(_org uuid, _env environment, _company uuid DEFAULT NULL::uuid, _origin text DEFAULT NULL::text, _status text DEFAULT NULL::text, _from timestamp with time zone DEFAULT NULL::timestamp with time zone, _to timestamp with time zone DEFAULT NULL::timestamp with time zone, _external_id text DEFAULT NULL::text, _taker text DEFAULT NULL::text, _limit integer DEFAULT 50, _offset integer DEFAULT 0)
 RETURNS TABLE(origin text, id uuid, company_id uuid, issued_at timestamp with time zone)
 LANGUAGE sql
 STABLE
 SET search_path TO ''
AS $function$
  SELECT x.origin, x.id, x.company_id, x.issued_at FROM (
    SELECT 'notem'::text AS origin, i.id, i.company_id, i.emitted_at AS issued_at FROM public.invoices i
     WHERE i.organization_id=_org AND i.environment=_env AND (_origin IS NULL OR _origin='notem') AND (_company IS NULL OR i.company_id=_company)
       AND (_status IS NULL OR i.status=_status) AND (_from IS NULL OR i.emitted_at>=_from) AND (_to IS NULL OR i.emitted_at<=_to)
       AND (_external_id IS NULL OR i.external_id=_external_id) AND (_taker IS NULL OR i.customer_snapshot->>'documento'=_taker)
    UNION ALL
    SELECT 'externa', d.id, c.id, coalesce(d.issued_at,d.authorized_at,d.created_at) FROM public.nfse_documents d
     JOIN LATERAL (SELECT c.id FROM public.companies c WHERE c.organization_id=_org AND regexp_replace(c.cnpj,'\D','','g')=d.provider_cnpj ORDER BY c.created_at, c.id LIMIT 1) c ON true
     WHERE d.environment=_env AND d.invoice_id IS NULL
       -- Proof of possession evaluated inline under the caller's own row rules (companies and certificates of _org).
       AND EXISTS (SELECT 1 FROM public.companies c2 JOIN public.company_certificates cc ON cc.company_id=c2.id AND cc.organization_id=c2.organization_id
                    WHERE c2.organization_id=_org AND regexp_replace(c2.cnpj,'\D','','g')=d.provider_cnpj AND regexp_replace(cc.cnpj,'\D','','g')=d.provider_cnpj)
       AND (_origin IS NULL OR _origin='externa') AND _external_id IS NULL AND (_company IS NULL OR c.id=_company)
       AND (_status IS NULL OR d.status=_status) AND (_from IS NULL OR coalesce(d.issued_at,d.authorized_at)>=_from) AND (_to IS NULL OR coalesce(d.issued_at,d.authorized_at)<=_to)
       AND (_taker IS NULL OR d.taker_document=_taker)
  ) x ORDER BY x.issued_at DESC, x.id LIMIT least(greatest(_limit,1),101) OFFSET greatest(_offset,0) $function$;