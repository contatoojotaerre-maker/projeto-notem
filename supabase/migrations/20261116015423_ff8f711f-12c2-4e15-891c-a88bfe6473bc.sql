-- Fase 8. pg_trgm/unaccent already live in schema extensions (created there in 20261103012500).
CREATE EXTENSION IF NOT EXISTS pg_trgm WITH SCHEMA extensions;

CREATE OR REPLACE FUNCTION public.normalize_search_text(value text) RETURNS text
LANGUAGE sql IMMUTABLE PARALLEL SAFE SET search_path TO ''
AS $$ SELECT lower(extensions.unaccent('extensions.unaccent'::regdictionary, coalesce(value, ''))) $$;

-- Taker document of a notem invoice snapshot (CPF/CNPJ, or NIF for foreign takers), normalized like normalize_cnpj.
CREATE OR REPLACE FUNCTION public.note_taker_document(snapshot jsonb) RETURNS text
LANGUAGE sql IMMUTABLE PARALLEL SAFE SET search_path TO ''
AS $$ SELECT nullif(public.normalize_cnpj(coalesce(snapshot->>'documento', snapshot->>'nif')), '') $$;

-- Decimal strings only (never float): '249.90' -> 249.90; anything else -> NULL.
CREATE OR REPLACE FUNCTION public.note_amount(value text) RETURNS numeric
LANGUAGE sql IMMUTABLE PARALLEL SAFE SET search_path TO ''
AS $$ SELECT CASE WHEN btrim(value) ~ '^-?[0-9]{1,15}(\.[0-9]{1,10})?$' THEN btrim(value)::numeric END $$;

REVOKE ALL ON FUNCTION public.normalize_search_text(text) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.note_taker_document(jsonb) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.note_amount(text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.normalize_search_text(text), public.note_taker_document(jsonb), public.note_amount(text) TO authenticated, service_role;

CREATE INDEX IF NOT EXISTS invoices_taker_document_idx ON public.invoices (organization_id, environment, public.note_taker_document(customer_snapshot));
CREATE INDEX IF NOT EXISTS invoices_taker_name_trgm_idx ON public.invoices USING gin (public.normalize_search_text(customer_snapshot->>'nome') extensions.gin_trgm_ops);
CREATE INDEX IF NOT EXISTS invoices_number_idx ON public.invoices (organization_id, environment, nfse_number);
CREATE INDEX IF NOT EXISTS invoices_access_key_idx ON public.invoices (environment, access_key) WHERE access_key IS NOT NULL;
CREATE INDEX IF NOT EXISTS invoices_competence_idx ON public.invoices (organization_id, environment, competence);
CREATE INDEX IF NOT EXISTS nfse_documents_taker_norm_idx ON public.nfse_documents (environment, public.normalize_cnpj(taker_document));
CREATE INDEX IF NOT EXISTS nfse_documents_taker_name_trgm_idx ON public.nfse_documents USING gin (public.normalize_search_text(taker_name) extensions.gin_trgm_ops);
CREATE INDEX IF NOT EXISTS nfse_documents_number_idx ON public.nfse_documents (environment, provider_cnpj, nfse_number);
CREATE INDEX IF NOT EXISTS nfse_documents_competence_idx ON public.nfse_documents (environment, provider_cnpj, competence);

-- Search terms: [1] raw text, [2] normalized document/key, [3] LIKE pattern of the normalized name.
CREATE OR REPLACE FUNCTION public.org_notes_search_terms(_search text) RETURNS text[]
LANGUAGE sql IMMUTABLE SET search_path TO ''
AS $$ SELECT ARRAY[nullif(btrim(coalesce(_search, '')), ''), nullif(public.normalize_cnpj(_search), ''),
  '%' || replace(replace(replace(public.normalize_search_text(btrim(coalesce(_search, ''))), '\', '\\'), '%', '\%'), '_', '\_') || '%'] $$;

-- Builds the filtered note union (notem + external with proof of possession). Parameters in the text:
-- $1 org $2 env $3 company $4 status $5 from $6 to $7 external_id $8 taker $9 search $10 search key $11 name pattern.
-- Only the active filters enter the text, so each call is planned with the indexes of its own filters.
CREATE OR REPLACE FUNCTION public.org_notes_query(_company uuid, _origin text, _status text, _from timestamptz, _to timestamptz, _date_field text, _search text, _external_id text, _taker text)
RETURNS text LANGUAGE plpgsql IMMUTABLE SET search_path TO ''
AS $f$
DECLARE t text[] := public.org_notes_search_terms(_search); comp boolean := coalesce(_date_field, 'emissao') = 'competencia';
  pi text[] := '{}'; pe text[] := '{}'; qi text; qe text; nm text;
BEGIN
  IF coalesce(_date_field, 'emissao') NOT IN ('emissao', 'competencia') OR (_origin IS NOT NULL AND _origin NOT IN ('notem', 'externa')) OR length(coalesce(_search, '')) > 100 THEN RAISE EXCEPTION 'FILTRO_INVALIDO'; END IF;
  IF t[1] IS NOT NULL THEN
    nm := public.normalize_search_text(t[1]);
    IF t[2] ~ '^[0-9]{9}[0-9A-Z]{14}[0-9]{27}$' THEN pi := ARRAY['i.access_key = $10']; pe := ARRAY['d.access_key = $10'];
    ELSE
      IF t[1] ~ '^[0-9]{1,15}$' THEN pi := pi || 'i.nfse_number = $9'::text; pe := pe || 'd.nfse_number = $9'::text; END IF;
      IF t[2] ~ '[0-9]' AND length(t[2]) BETWEEN 5 AND 40 THEN pi := pi || 'public.note_taker_document(i.customer_snapshot) = $10'::text; pe := pe || 'public.normalize_cnpj(d.taker_document) = $10'::text; END IF;
      IF t[1] ~ '[[:alpha:]]' AND length(btrim(nm)) >= 2 THEN pi := pi || 'public.normalize_search_text(i.customer_snapshot->>''nome'') LIKE $11'::text; pe := pe || 'public.normalize_search_text(d.taker_name) LIKE $11'::text; END IF;
      IF cardinality(pi) = 0 THEN pi := ARRAY['false']; pe := ARRAY['false']; END IF;
    END IF;
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
      -- Proof of possession evaluated inline under the caller's own row rules (companies and certificates of $1).
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

DROP FUNCTION IF EXISTS public.list_org_notes(uuid, public.environment, uuid, text, text, timestamptz, timestamptz, text, text, integer, integer);
CREATE FUNCTION public.list_org_notes(_org uuid, _env public.environment, _company uuid DEFAULT NULL, _origin text DEFAULT NULL, _status text DEFAULT NULL, _from timestamptz DEFAULT NULL, _to timestamptz DEFAULT NULL, _external_id text DEFAULT NULL, _taker text DEFAULT NULL, _limit integer DEFAULT 50, _offset integer DEFAULT 0, _date_field text DEFAULT 'emissao', _search text DEFAULT NULL)
RETURNS TABLE(origin text, id uuid, company_id uuid, issued_at timestamptz)
LANGUAGE plpgsql STABLE SET search_path TO ''
AS $f$
DECLARE t text[] := public.org_notes_search_terms(_search); BEGIN
  RETURN QUERY EXECUTE 'SELECT x.origin, x.id, x.company_id, x.issued_at FROM (' || public.org_notes_query(_company, _origin, _status, _from, _to, _date_field, _search, _external_id, _taker) || ') x ORDER BY x.issued_at DESC, x.id LIMIT $12 OFFSET $13'
    USING _org, _env, _company, _status, _from, _to, _external_id, nullif(public.normalize_cnpj(_taker), ''), t[1], t[2], t[3], least(greatest(coalesce(_limit, 50), 1), 10001), greatest(coalesce(_offset, 0), 0);
END $f$;

CREATE OR REPLACE FUNCTION public.org_notes_count(_org uuid, _env public.environment, _company uuid DEFAULT NULL, _origin text DEFAULT NULL, _status text DEFAULT NULL, _from timestamptz DEFAULT NULL, _to timestamptz DEFAULT NULL, _date_field text DEFAULT 'emissao', _search text DEFAULT NULL)
RETURNS bigint LANGUAGE plpgsql STABLE SET search_path TO ''
AS $f$
DECLARE t text[] := public.org_notes_search_terms(_search); n bigint; BEGIN
  EXECUTE 'SELECT count(*) FROM (' || public.org_notes_query(_company, _origin, _status, _from, _to, _date_field, _search, NULL, NULL) || ') x'
    INTO n USING _org, _env, _company, _status, _from, _to, NULL::text, NULL::text, t[1], t[2], t[3];
  RETURN n;
END $f$;

-- Início: counts and exact sums (numeric, returned as text) of notes issued in [_from, _to), per origin.
CREATE OR REPLACE FUNCTION public.org_notes_summary(_org uuid, _env public.environment, _from timestamptz, _to timestamptz)
RETURNS TABLE(origin text, emitted bigint, amount text, cancelled bigint, rejected bigint)
LANGUAGE sql STABLE SET search_path TO ''
AS $f$
  WITH n AS (
    SELECT 'notem'::text AS origin, i.status, public.note_amount(i.sent_values->>'servico') AS v FROM public.invoices i
     WHERE i.organization_id = _org AND i.environment = _env AND i.emitted_at >= _from AND i.emitted_at < _to
    UNION ALL
    SELECT 'externa', d.status, public.note_amount(d.summary->'valores'->>'valor_servico') FROM public.nfse_documents d
     WHERE d.environment = _env AND d.invoice_id IS NULL AND coalesce(d.issued_at, d.authorized_at) >= _from AND coalesce(d.issued_at, d.authorized_at) < _to
       AND EXISTS (SELECT 1 FROM public.companies c2 JOIN public.company_certificates cc ON cc.company_id = c2.id AND cc.organization_id = c2.organization_id
                    WHERE c2.organization_id = _org AND public.normalize_cnpj(c2.cnpj) = d.provider_cnpj AND public.normalize_cnpj(cc.cnpj) = d.provider_cnpj)
  )
  SELECT o.origin,
    count(n.status) FILTER (WHERE n.status IN ('authorized', 'cancellation_pending', 'cancelled', 'cancelled_by_authority', 'substituted')),
    (coalesce(sum(n.v) FILTER (WHERE n.status IN ('authorized', 'cancellation_pending')), 0))::numeric(18,2)::text,
    count(n.status) FILTER (WHERE n.status IN ('cancelled', 'cancelled_by_authority')),
    count(n.status) FILTER (WHERE n.status = 'rejected')
  FROM (VALUES ('notem'::text), ('externa'::text)) o(origin) LEFT JOIN n ON n.origin = o.origin
  GROUP BY o.origin ORDER BY o.origin DESC
$f$;

REVOKE ALL ON FUNCTION public.org_notes_search_terms(text) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.org_notes_query(uuid, text, text, timestamptz, timestamptz, text, text, text, text) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.list_org_notes(uuid, public.environment, uuid, text, text, timestamptz, timestamptz, text, text, integer, integer, text, text) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.org_notes_count(uuid, public.environment, uuid, text, text, timestamptz, timestamptz, text, text) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.org_notes_summary(uuid, public.environment, timestamptz, timestamptz) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.org_notes_search_terms(text), public.org_notes_query(uuid, text, text, timestamptz, timestamptz, text, text, text, text),
  public.list_org_notes(uuid, public.environment, uuid, text, text, timestamptz, timestamptz, text, text, integer, integer, text, text),
  public.org_notes_count(uuid, public.environment, uuid, text, text, timestamptz, timestamptz, text, text),
  public.org_notes_summary(uuid, public.environment, timestamptz, timestamptz) TO authenticated, service_role;

-- Support contact (Ajuda). platform_settings keeps no user read access; only these two fields are exposed.
ALTER TABLE public.platform_settings ADD COLUMN IF NOT EXISTS support_email text, ADD COLUMN IF NOT EXISTS support_whatsapp text;
ALTER TABLE public.platform_settings DROP CONSTRAINT IF EXISTS platform_settings_support_email_check,
  ADD CONSTRAINT platform_settings_support_email_check CHECK (support_email IS NULL OR (length(support_email) <= 254 AND support_email ~ '^[^@[:space:]]+@[^@[:space:]]+\.[^@[:space:]]+$'));
ALTER TABLE public.platform_settings DROP CONSTRAINT IF EXISTS platform_settings_support_whatsapp_check,
  ADD CONSTRAINT platform_settings_support_whatsapp_check CHECK (support_whatsapp IS NULL OR support_whatsapp ~ '^55[0-9]{10,11}$');

CREATE OR REPLACE FUNCTION public.platform_support_contact() RETURNS TABLE(support_email text, support_whatsapp text)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO ''
AS $$ SELECT s.support_email, s.support_whatsapp FROM public.platform_settings s WHERE s.id AND auth.uid() IS NOT NULL $$;
REVOKE ALL ON FUNCTION public.platform_support_contact() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.platform_support_contact() TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public.set_platform_support(_email text, _whatsapp text, _actor uuid) RETURNS TABLE(support_email text, support_whatsapp text)
LANGUAGE plpgsql SET search_path TO ''
AS $$
DECLARE cur public.platform_settings; e text := nullif(lower(btrim(coalesce(_email, ''))), ''); w text := nullif(btrim(coalesce(_whatsapp, '')), ''); BEGIN
  IF _actor IS NULL OR NOT EXISTS (SELECT 1 FROM public.platform_admins WHERE user_id = _actor) THEN RAISE EXCEPTION 'SEM_PERMISSAO'; END IF;
  IF e IS NOT NULL AND (length(e) > 254 OR e !~ '^[^@[:space:]]+@[^@[:space:]]+\.[^@[:space:]]+$') THEN RAISE EXCEPTION 'EMAIL_INVALIDO'; END IF;
  IF w IS NOT NULL AND w !~ '^55[0-9]{10,11}$' THEN RAISE EXCEPTION 'WHATSAPP_INVALIDO'; END IF;
  INSERT INTO public.platform_settings(id) VALUES (true) ON CONFLICT DO NOTHING;
  SELECT * INTO cur FROM public.platform_settings WHERE id FOR UPDATE;
  UPDATE public.platform_settings SET support_email = e, support_whatsapp = w, updated_at = now(), updated_by = _actor WHERE id;
  INSERT INTO public.admin_audit_events(actor_id, actor_is_platform_admin, action, organization_id, target_type, target_id, details)
  VALUES (_actor, true, 'plataforma.suporte_alterado', NULL, 'platform_settings', NULL,
    jsonb_build_object('email_anterior', cur.support_email, 'email_novo', e, 'whatsapp_anterior', cur.support_whatsapp, 'whatsapp_novo', w));
  RETURN QUERY SELECT e, w;
END $$;
REVOKE ALL ON FUNCTION public.set_platform_support(text, text, uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.set_platform_support(text, text, uuid) TO service_role;