-- Fase C Parte 2: CNPJ alfanumérico (12 posições [0-9A-Z] + 2 DV numéricos; valor = ASCII - 48).
CREATE OR REPLACE FUNCTION public.normalize_cnpj(value text)
 RETURNS text LANGUAGE sql IMMUTABLE PARALLEL SAFE SET search_path TO ''
AS $$ SELECT upper(regexp_replace(coalesce(value,''),'[^0-9A-Za-z]','','g')) $$;
REVOKE EXECUTE ON FUNCTION public.normalize_cnpj(text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.normalize_cnpj(text) TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public.is_valid_cnpj(value text)
 RETURNS boolean LANGUAGE plpgsql IMMUTABLE SET search_path TO 'public'
AS $function$
declare i integer; total integer; digit integer; w1 integer[]:=array[5,4,3,2,9,8,7,6,5,4,3,2]; w2 integer[]:=array[6,5,4,3,2,9,8,7,6,5,4,3,2];
begin
  if value is null or value !~ '^[0-9A-Z]{12}[0-9]{2}$' or value=repeat(substr(value,1,1),14) then return false; end if;
  total:=0; for i in 1..12 loop total:=total+(ascii(substr(value,i,1))-48)*w1[i]; end loop;
  digit:=11-(total%11); if digit>=10 then digit:=0; end if;
  if digit<>substr(value,13,1)::integer then return false; end if;
  total:=0; for i in 1..13 loop total:=total+(ascii(substr(value,i,1))-48)*w2[i]; end loop;
  digit:=11-(total%11); if digit>=10 then digit:=0; end if;
  return digit=substr(value,14,1)::integer;
end $function$;

-- Formats (TSIdDPS / TSIdNFSe structure of the NT 009 release 1: CNPJ at positions 10-23 of the key).
ALTER TABLE public.adn_sync_cursors DROP CONSTRAINT adn_sync_cursors_cnpj_check,
  ADD CONSTRAINT adn_sync_cursors_cnpj_check CHECK (cnpj ~ '^[0-9A-Z]{12}[0-9]{2}$');
ALTER TABLE public.invoices DROP CONSTRAINT invoices_dps_id_check,
  ADD CONSTRAINT invoices_dps_id_check CHECK (dps_id ~ '^DPS[0-9]{7}(1[0-9]{14}|2[0-9A-Z]{14})[0-9]{20}$');
ALTER TABLE public.invoices DROP CONSTRAINT invoices_access_key_check,
  ADD CONSTRAINT invoices_access_key_check CHECK (access_key IS NULL OR access_key ~ '^[0-9]{9}[0-9A-Z]{14}[0-9]{27}$');
ALTER TABLE public.nfse_documents DROP CONSTRAINT nfse_documents_access_key_check,
  ADD CONSTRAINT nfse_documents_access_key_check CHECK (access_key ~ '^[0-9]{9}[0-9A-Z]{14}[0-9]{27}$');
ALTER TABLE public.nfse_document_events DROP CONSTRAINT nfse_document_events_access_key_check,
  ADD CONSTRAINT nfse_document_events_access_key_check CHECK (access_key ~ '^[0-9]{9}[0-9A-Z]{14}[0-9]{27}$');

CREATE OR REPLACE FUNCTION public.org_proven_cnpj(_org uuid, _cnpj text)
 RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public'
AS $function$
  select _cnpj is not null and exists(select 1 from public.companies c join public.company_certificates cc on cc.company_id=c.id and cc.organization_id=c.organization_id
    where c.organization_id=_org and public.normalize_cnpj(c.cnpj)=_cnpj and public.normalize_cnpj(cc.cnpj)=_cnpj) $function$;

CREATE OR REPLACE FUNCTION public.list_org_notes(_org uuid, _env environment, _company uuid DEFAULT NULL::uuid, _origin text DEFAULT NULL::text, _status text DEFAULT NULL::text, _from timestamp with time zone DEFAULT NULL::timestamp with time zone, _to timestamp with time zone DEFAULT NULL::timestamp with time zone, _external_id text DEFAULT NULL::text, _taker text DEFAULT NULL::text, _limit integer DEFAULT 50, _offset integer DEFAULT 0)
 RETURNS TABLE(origin text, id uuid, company_id uuid, issued_at timestamp with time zone)
 LANGUAGE sql STABLE SET search_path TO ''
AS $function$
  SELECT x.origin, x.id, x.company_id, x.issued_at FROM (
    SELECT 'notem'::text AS origin, i.id, i.company_id, i.emitted_at AS issued_at FROM public.invoices i
     WHERE i.organization_id=_org AND i.environment=_env AND (_origin IS NULL OR _origin='notem') AND (_company IS NULL OR i.company_id=_company)
       AND (_status IS NULL OR i.status=_status) AND (_from IS NULL OR i.emitted_at>=_from) AND (_to IS NULL OR i.emitted_at<=_to)
       AND (_external_id IS NULL OR i.external_id=_external_id) AND (_taker IS NULL OR i.customer_snapshot->>'documento'=_taker)
    UNION ALL
    SELECT 'externa', d.id, c.id, coalesce(d.issued_at,d.authorized_at,d.created_at) FROM public.nfse_documents d
     JOIN LATERAL (SELECT c.id FROM public.companies c WHERE c.organization_id=_org AND public.normalize_cnpj(c.cnpj)=d.provider_cnpj ORDER BY c.created_at, c.id LIMIT 1) c ON true
     WHERE d.environment=_env AND d.invoice_id IS NULL
       -- Proof of possession evaluated inline under the caller's own row rules (companies and certificates of _org).
       AND EXISTS (SELECT 1 FROM public.companies c2 JOIN public.company_certificates cc ON cc.company_id=c2.id AND cc.organization_id=c2.organization_id
                    WHERE c2.organization_id=_org AND public.normalize_cnpj(c2.cnpj)=d.provider_cnpj AND public.normalize_cnpj(cc.cnpj)=d.provider_cnpj)
       AND (_origin IS NULL OR _origin='externa') AND _external_id IS NULL AND (_company IS NULL OR c.id=_company)
       AND (_status IS NULL OR d.status=_status) AND (_from IS NULL OR coalesce(d.issued_at,d.authorized_at)>=_from) AND (_to IS NULL OR coalesce(d.issued_at,d.authorized_at)<=_to)
       AND (_taker IS NULL OR d.taker_document=_taker)
  ) x ORDER BY x.issued_at DESC, x.id LIMIT least(greatest(_limit,1),101) OFFSET greatest(_offset,0) $function$;

CREATE OR REPLACE FUNCTION public.request_adn_sync(_cnpj text, _env environment, _mode text, _months integer, _actor uuid, _org uuid)
 RETURNS jsonb LANGUAGE plpgsql SET search_path TO ''
AS $function$
DECLARE k public.adn_sync_cursors; req jsonb; target timestamptz; lo bigint; hi bigint; BEGIN
  IF _cnpj !~ '^[0-9A-Z]{12}[0-9]{2}$' OR _mode NOT IN ('news','period') OR (_mode='period' AND (_months IS NULL OR _months NOT IN (1,3,6,12,24))) THEN RAISE EXCEPTION 'ADN_PEDIDO_INVALIDO'; END IF;
  IF NOT public.can_request_adn_sync(_org,_actor) THEN RAISE EXCEPTION 'SEM_PERMISSAO'; END IF;
  IF NOT EXISTS (SELECT 1 FROM public.companies WHERE organization_id=_org AND public.normalize_cnpj(cnpj)=_cnpj) THEN RAISE EXCEPTION 'SEM_PERMISSAO'; END IF;
  INSERT INTO public.adn_sync_cursors(cnpj,environment,status) VALUES(_cnpj,_env,'pending') ON CONFLICT DO NOTHING;
  SELECT * INTO k FROM public.adn_sync_cursors WHERE cnpj=_cnpj AND environment=_env FOR UPDATE;
  IF k.request IS NOT NULL THEN RAISE EXCEPTION 'ADN_EM_ANDAMENTO'; END IF;
  IF k.next_query_at > now() THEN RAISE EXCEPTION 'ADN_AGUARDE:%', to_char(k.next_query_at AT TIME ZONE 'UTC','YYYY-MM-DD"T"HH24:MI:SS"Z"'); END IF;
  IF _mode='news' AND k.first_completed_at IS NULL THEN RAISE EXCEPTION 'ADN_NOVIDADES_INDISPONIVEL'; END IF;
  IF _mode='news' THEN
    req := jsonb_build_object('phase','download','position',k.next_nsu);
  ELSE
    target := now() - make_interval(months => _months);
    -- Dates grow with the NSU: NSUs already received narrow the search for the first NSU of the period.
    SELECT max(nsu)+1 INTO lo FROM public.adn_distributions WHERE cnpj=_cnpj AND environment=_env AND generated_at < target;
    SELECT min(nsu) INTO hi FROM public.adn_distributions WHERE cnpj=_cnpj AND environment=_env AND generated_at >= target;
    lo := coalesce(lo, 0);
    IF hi IS NULL AND k.next_nsu > 0 THEN hi := greatest(k.next_nsu, lo); END IF;
    IF hi IS NOT NULL AND lo >= hi THEN req := jsonb_build_object('phase','download','position',hi,'start_nsu',hi);
    ELSE req := jsonb_build_object('phase','search','lo',lo,'hi',hi,'step',50); END IF;
    req := req || jsonb_build_object('target',target);
  END IF;
  req := req || jsonb_build_object('mode',_mode,'months',_months,'requested_at',now(),'requested_by',_actor,'organization_id',_org,'imported',0,'steps',0);
  UPDATE public.adn_sync_cursors SET request=req, status='syncing', last_error=NULL, last_error_code=NULL, updated_at=now() WHERE cnpj=_cnpj AND environment=_env;
  RETURN req;
END $function$;

ALTER POLICY adn_cursor_read ON public.adn_sync_cursors USING (public.is_platform_admin() OR EXISTS (
  SELECT 1 FROM public.organization_members m
    JOIN public.companies c ON c.organization_id = m.organization_id
    JOIN public.company_certificates cc ON cc.company_id = c.id AND cc.organization_id = c.organization_id
  WHERE m.user_id = auth.uid() AND public.normalize_cnpj(c.cnpj) = adn_sync_cursors.cnpj AND public.normalize_cnpj(cc.cnpj) = adn_sync_cursors.cnpj));

ALTER POLICY nfse_documents_read ON public.nfse_documents USING (public.is_platform_admin() OR EXISTS (
  SELECT 1 FROM public.organization_members m
    JOIN public.companies c ON c.organization_id = m.organization_id
    JOIN public.company_certificates cc ON cc.company_id = c.id AND cc.organization_id = c.organization_id
  WHERE m.user_id = auth.uid() AND public.normalize_cnpj(cc.cnpj) = public.normalize_cnpj(c.cnpj)
    AND ((nfse_documents.invoice_id IS NULL AND public.normalize_cnpj(c.cnpj) = nfse_documents.provider_cnpj)
      OR public.normalize_cnpj(c.cnpj) = nfse_documents.taker_document
      OR public.normalize_cnpj(c.cnpj) = nfse_documents.intermediary_document)));