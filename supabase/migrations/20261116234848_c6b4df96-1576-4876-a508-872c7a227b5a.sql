-- Painel Parte 2: "recebidas" direction of the shared note filter (list, CSV and ZIP use the same function).
CREATE INDEX IF NOT EXISTS nfse_documents_provider_name_trgm_idx ON public.nfse_documents USING gin (public.normalize_search_text(provider_name) extensions.gin_trgm_ops);

DROP FUNCTION IF EXISTS public.list_org_notes(uuid, public.environment, uuid, text, text, timestamptz, timestamptz, text, text, integer, integer, text, text);
DROP FUNCTION IF EXISTS public.org_notes_count(uuid, public.environment, uuid, text, text, timestamptz, timestamptz, text, text);
DROP FUNCTION IF EXISTS public.org_notes_query(uuid, text, text, timestamptz, timestamptz, text, text, text, text);

-- Builds the filtered note query. Parameters in the text:
-- $1 org $2 env $3 company $4 status $5 from $6 to $7 external_id $8 taker $9 search $10 search key $11 name pattern.
-- emitidas: notem + external notes of the organization's companies (proof of possession of the provider CNPJ).
-- recebidas: documents where a company of the organization is taker or intermediary (proof of possession of that CNPJ).
-- Proof of possession is evaluated inline under the caller's own row rules. Only active filters enter the text.
CREATE FUNCTION public.org_notes_query(_company uuid, _origin text, _status text, _from timestamptz, _to timestamptz, _date_field text, _search text, _external_id text, _taker text, _direction text DEFAULT 'emitidas')
RETURNS text LANGUAGE plpgsql IMMUTABLE SET search_path TO ''
AS $f$
DECLARE t text[] := public.org_notes_search_terms(_search); comp boolean := coalesce(_date_field, 'emissao') = 'competencia';
  pi text[] := '{}'; pe text[] := '{}'; pr text[] := '{}'; qi text; qe text; nm text; dir text := coalesce(_direction, 'emitidas'); oc text;
BEGIN
  IF coalesce(_date_field, 'emissao') NOT IN ('emissao', 'competencia') OR (_origin IS NOT NULL AND _origin NOT IN ('notem', 'externa'))
     OR length(coalesce(_search, '')) > 100 OR dir NOT IN ('emitidas', 'recebidas') THEN RAISE EXCEPTION 'FILTRO_INVALIDO'; END IF;
  IF t[1] IS NOT NULL THEN
    nm := public.normalize_search_text(t[1]);
    IF t[2] ~ '^[0-9]{9}[0-9A-Z]{14}[0-9]{27}$' THEN pi := ARRAY['i.access_key = $10']; pe := ARRAY['d.access_key = $10']; pr := ARRAY['d.access_key = $10'];
    ELSE
      IF t[1] ~ '^[0-9]{1,15}$' THEN pi := pi || 'i.nfse_number = $9'::text; pe := pe || 'd.nfse_number = $9'::text; pr := pr || 'd.nfse_number = $9'::text; END IF;
      IF t[2] ~ '[0-9]' AND length(t[2]) BETWEEN 5 AND 40 THEN pi := pi || 'public.note_taker_document(i.customer_snapshot) = $10'::text; pe := pe || 'public.normalize_cnpj(d.taker_document) = $10'::text; pr := pr || 'd.provider_cnpj = $10'::text; END IF;
      IF t[1] ~ '[[:alpha:]]' AND length(btrim(nm)) >= 2 THEN pi := pi || 'public.normalize_search_text(i.customer_snapshot->>''nome'') LIKE $11'::text; pe := pe || 'public.normalize_search_text(d.taker_name) LIKE $11'::text; pr := pr || 'public.normalize_search_text(d.provider_name) LIKE $11'::text; END IF;
      IF cardinality(pi) = 0 THEN pi := ARRAY['false']; pe := ARRAY['false']; pr := ARRAY['false']; END IF;
    END IF;
  END IF;

  IF dir = 'recebidas' THEN
    -- CNPJs of the organization's companies (optionally one company), used to reach the taker/intermediary indexes.
    oc := '(SELECT public.normalize_cnpj(c3.cnpj) FROM public.companies c3 WHERE c3.organization_id = $1' || CASE WHEN _company IS NOT NULL THEN ' AND c3.id = $3' ELSE '' END || ')';
    RETURN 'SELECT ''recebida''::text AS origin, d.id, rc.id AS company_id, coalesce(d.issued_at, d.authorized_at, d.created_at) AS issued_at FROM public.nfse_documents d'
      || ' JOIN LATERAL (SELECT c.id FROM public.companies c WHERE c.organization_id = $1 AND public.normalize_cnpj(c.cnpj) IN (d.taker_document, d.intermediary_document)'
      || CASE WHEN _company IS NOT NULL THEN ' AND c.id = $3' ELSE '' END
      || ' AND EXISTS (SELECT 1 FROM public.companies c2 JOIN public.company_certificates cc ON cc.company_id = c2.id AND cc.organization_id = c2.organization_id'
      || ' WHERE c2.organization_id = $1 AND public.normalize_cnpj(c2.cnpj) = public.normalize_cnpj(c.cnpj) AND public.normalize_cnpj(cc.cnpj) = public.normalize_cnpj(c.cnpj))'
      || ' ORDER BY (public.normalize_cnpj(c.cnpj) = d.taker_document) DESC, c.created_at, c.id LIMIT 1) rc ON true'
      || ' WHERE d.environment = $2 AND (d.taker_document IN ' || oc || ' OR d.intermediary_document IN ' || oc || ')'
      || CASE WHEN _status IS NOT NULL THEN ' AND d.status = $4' ELSE '' END
      || CASE WHEN _from IS NOT NULL THEN CASE WHEN comp THEN ' AND d.competence >= ($5 AT TIME ZONE ''America/Sao_Paulo'')::date' ELSE ' AND coalesce(d.issued_at, d.authorized_at) >= $5' END ELSE '' END
      || CASE WHEN _to IS NOT NULL THEN CASE WHEN comp THEN ' AND d.competence <= ($6 AT TIME ZONE ''America/Sao_Paulo'')::date' ELSE ' AND coalesce(d.issued_at, d.authorized_at) <= $6' END ELSE '' END
      || CASE WHEN cardinality(pr) > 0 THEN ' AND (' || array_to_string(pr, ' OR ') || ')' ELSE '' END;
  END IF;

  IF coalesce(_origin, 'notem') = 'notem' THEN
    qi := 'SELECT ''notem''::text AS origin, i.id, i.company_id, i.emitted_at AS issued_at FROM public.invoices i WHERE i.organization_id = $1 AND i.environment = $2'
      || CASE WHEN _company IS NOT NULL THEN ' AND i.company_id = $3' ELSE '' END
      || CASE WHEN _status IS NOT NULL THEN ' AND i.status = $4' ELSE '' END
      || CASE WHEN _from IS NOT NULL THEN CASE WHEN comp THEN ' AND i.competence >= ($5 AT TIME ZONE ''America/Sao_Paulo'')::date' ELSE ' AND i.emitted_at >= $5' END ELSE '' END
      || CASE WHEN _to IS NOT NULL THEN CASE WHEN comp THEN ' AND i.competence <= ($6 AT TIME ZONE ''America/Sao_Paulo'')::date' ELSE ' AND i.emitted_at <= $6' END ELSE '' END
      || CASE WHEN _external_id IS NOT NULL THEN ' AND i.external_id = $7' ELSE '' END
      || CASE WHEN _taker IS NOT NULL THEN ' AND public.note_taker_document(i.customer_snapshot) = $8' ELSE '' END
      || CASE WHEN cardinality(pi) > 0 THEN ' AND (' || array_to_string(pi, ' OR ') || ')' ELSE '' END;
  END IF;
  IF coalesce(_origin, 'externa') = 'externa' AND _external_id IS NULL THEN
    qe := 'SELECT ''externa''::text AS origin, d.id, c.id AS company_id, coalesce(d.issued_at, d.authorized_at, d.created_at) AS issued_at FROM public.nfse_documents d'
      || ' JOIN LATERAL (SELECT c.id FROM public.companies c WHERE c.organization_id = $1 AND public.normalize_cnpj(c.cnpj) = d.provider_cnpj ORDER BY c.created_at, c.id LIMIT 1) c ON true'
      || ' WHERE d.environment = $2 AND d.invoice_id IS NULL'
      || ' AND EXISTS (SELECT 1 FROM public.companies c2 JOIN public.company_certificates cc ON cc.company_id = c2.id AND cc.organization_id = c2.organization_id'
      || ' WHERE c2.organization_id = $1 AND public.normalize_cnpj(c2.cnpj) = d.provider_cnpj AND public.normalize_cnpj(cc.cnpj) = d.provider_cnpj)'
      || CASE WHEN _company IS NOT NULL THEN ' AND c.id = $3' ELSE '' END
      || CASE WHEN _status IS NOT NULL THEN ' AND d.status = $4' ELSE '' END
      || CASE WHEN _from IS NOT NULL THEN CASE WHEN comp THEN ' AND d.competence >= ($5 AT TIME ZONE ''America/Sao_Paulo'')::date' ELSE ' AND coalesce(d.issued_at, d.authorized_at) >= $5' END ELSE '' END
      || CASE WHEN _to IS NOT NULL THEN CASE WHEN comp THEN ' AND d.competence <= ($6 AT TIME ZONE ''America/Sao_Paulo'')::date' ELSE ' AND coalesce(d.issued_at, d.authorized_at) <= $6' END ELSE '' END
      || CASE WHEN _taker IS NOT NULL THEN ' AND public.normalize_cnpj(d.taker_document) = $8' ELSE '' END
      || CASE WHEN cardinality(pe) > 0 THEN ' AND (' || array_to_string(pe, ' OR ') || ')' ELSE '' END;
  END IF;
  IF qi IS NULL AND qe IS NULL THEN RETURN 'SELECT NULL::text AS origin, NULL::uuid AS id, NULL::uuid AS company_id, NULL::timestamptz AS issued_at WHERE false'; END IF;
  RETURN coalesce(qi, '') || CASE WHEN qi IS NOT NULL AND qe IS NOT NULL THEN ' UNION ALL ' ELSE '' END || coalesce(qe, '');
END $f$;

CREATE FUNCTION public.list_org_notes(_org uuid, _env public.environment, _company uuid DEFAULT NULL, _origin text DEFAULT NULL, _status text DEFAULT NULL, _from timestamptz DEFAULT NULL, _to timestamptz DEFAULT NULL, _external_id text DEFAULT NULL, _taker text DEFAULT NULL, _limit integer DEFAULT 50, _offset integer DEFAULT 0, _date_field text DEFAULT 'emissao', _search text DEFAULT NULL, _direction text DEFAULT 'emitidas')
RETURNS TABLE(origin text, id uuid, company_id uuid, issued_at timestamptz)
LANGUAGE plpgsql STABLE SET search_path TO ''
AS $f$
DECLARE t text[] := public.org_notes_search_terms(_search); BEGIN
  RETURN QUERY EXECUTE 'SELECT x.origin, x.id, x.company_id, x.issued_at FROM (' || public.org_notes_query(_company, _origin, _status, _from, _to, _date_field, _search, _external_id, _taker, _direction) || ') x ORDER BY x.issued_at DESC, x.id LIMIT $12 OFFSET $13'
    USING _org, _env, _company, _status, _from, _to, _external_id, nullif(public.normalize_cnpj(_taker), ''), t[1], t[2], t[3], least(greatest(coalesce(_limit, 50), 1), 10001), greatest(coalesce(_offset, 0), 0);
END $f$;

CREATE FUNCTION public.org_notes_count(_org uuid, _env public.environment, _company uuid DEFAULT NULL, _origin text DEFAULT NULL, _status text DEFAULT NULL, _from timestamptz DEFAULT NULL, _to timestamptz DEFAULT NULL, _date_field text DEFAULT 'emissao', _search text DEFAULT NULL, _direction text DEFAULT 'emitidas')
RETURNS bigint LANGUAGE plpgsql STABLE SET search_path TO ''
AS $f$
DECLARE t text[] := public.org_notes_search_terms(_search); n bigint; BEGIN
  EXECUTE 'SELECT count(*) FROM (' || public.org_notes_query(_company, _origin, _status, _from, _to, _date_field, _search, NULL, NULL, _direction) || ') x'
    INTO n USING _org, _env, _company, _status, _from, _to, NULL::text, NULL::text, t[1], t[2], t[3];
  RETURN n;
END $f$;

REVOKE ALL ON FUNCTION public.org_notes_query(uuid, text, text, timestamptz, timestamptz, text, text, text, text, text) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.list_org_notes(uuid, public.environment, uuid, text, text, timestamptz, timestamptz, text, text, integer, integer, text, text, text) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.org_notes_count(uuid, public.environment, uuid, text, text, timestamptz, timestamptz, text, text, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.org_notes_query(uuid, text, text, timestamptz, timestamptz, text, text, text, text, text),
  public.list_org_notes(uuid, public.environment, uuid, text, text, timestamptz, timestamptz, text, text, integer, integer, text, text, text),
  public.org_notes_count(uuid, public.environment, uuid, text, text, timestamptz, timestamptz, text, text, text) TO authenticated, service_role;