-- XML of notes and events: gzip files in the private bucket "fiscal-xml" (server only); tables keep only the file reference.
CREATE TABLE public.fiscal_xml_files(
  owner_table text NOT NULL CHECK (owner_table IN ('invoices','invoice_dps_attempts','invoice_fiscal_events','nfse_documents','nfse_document_events')),
  owner_id uuid NOT NULL,
  kind text NOT NULL CHECK (kind ~ '^[a-z_]{2,30}$'),
  path text NOT NULL CHECK (path ~ '^[a-z0-9/_.-]{10,300}$'),
  size integer NOT NULL CHECK (size >= 0),
  stored_size integer NOT NULL CHECK (stored_size >= 0),
  sha256 text NOT NULL CHECK (sha256 ~ '^[0-9a-f]{64}$'),
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (owner_table, owner_id, kind));
REVOKE ALL ON public.fiscal_xml_files FROM anon, authenticated;
GRANT ALL ON public.fiscal_xml_files TO service_role;
ALTER TABLE public.fiscal_xml_files ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.invoices ALTER COLUMN unsigned_dps_xml DROP NOT NULL;
ALTER TABLE public.invoice_dps_attempts ALTER COLUMN unsigned_xml DROP NOT NULL;
ALTER TABLE public.invoice_fiscal_events ALTER COLUMN unsigned_xml DROP NOT NULL;
ALTER TABLE public.nfse_documents ALTER COLUMN xml DROP NOT NULL;
ALTER TABLE public.nfse_document_events ALTER COLUMN xml DROP NOT NULL;

-- Moving XML text to a file must not look like a business change (updated_at stays).
CREATE OR REPLACE FUNCTION public.touch_record() RETURNS trigger LANGUAGE plpgsql SET search_path TO 'public' AS $function$ begin
 if TG_OP='UPDATE' and coalesce(current_setting('notem.xml_offload', true),'')='on' then new.updated_at:=old.updated_at; return new; end if;
 new.updated_at:=now();if TG_TABLE_NAME='organizations' then if new.slug<>old.slug then raise exception 'Slug is immutable';end if;new.created_by:=old.created_by;new.created_at:=old.created_at;end if;return new;end $function$;

CREATE OR REPLACE FUNCTION public.xml_column(_table text, _kind text) RETURNS text LANGUAGE sql IMMUTABLE SET search_path='' AS $$
  SELECT CASE _table||':'||_kind
    WHEN 'invoices:unsigned_dps' THEN 'unsigned_dps_xml' WHEN 'invoices:signed_dps' THEN 'signed_dps_xml' WHEN 'invoices:authorized_nfse' THEN 'authorized_nfse_xml'
    WHEN 'invoice_dps_attempts:unsigned' THEN 'unsigned_xml' WHEN 'invoice_dps_attempts:signed' THEN 'signed_xml'
    WHEN 'invoice_fiscal_events:unsigned' THEN 'unsigned_xml' WHEN 'invoice_fiscal_events:signed' THEN 'signed_xml' WHEN 'invoice_fiscal_events:event' THEN 'event_xml'
    WHEN 'nfse_documents:xml' THEN 'xml' WHEN 'nfse_document_events:xml' THEN 'xml' ELSE NULL END $$;

-- Registers the file of a stored XML text after checking the SHA-256 of the text; optionally clears the text.
CREATE OR REPLACE FUNCTION public.attach_xml_file(_table text, _id uuid, _kind text, _file jsonb, _clear boolean) RETURNS text LANGUAGE plpgsql SET search_path='' AS $$
DECLARE col text := public.xml_column(_table,_kind); txt text; cur text; BEGIN
  IF col IS NULL THEN RAISE EXCEPTION 'XML_TIPO_INVALIDO'; END IF;
  EXECUTE format('SELECT %I FROM public.%I WHERE id=$1 FOR UPDATE', col, _table) INTO txt USING _id;
  IF txt IS NULL THEN RETURN 'sem_texto'; END IF;
  IF encode(extensions.digest(convert_to(txt,'UTF8'),'sha256'),'hex') <> _file->>'sha256' THEN RAISE EXCEPTION 'XML_HASH_DIVERGENTE'; END IF;
  INSERT INTO public.fiscal_xml_files(owner_table,owner_id,kind,path,size,stored_size,sha256)
    VALUES(_table,_id,_kind,_file->>'path',(_file->>'size')::int,(_file->>'stored_size')::int,_file->>'sha256') ON CONFLICT DO NOTHING;
  SELECT sha256 INTO cur FROM public.fiscal_xml_files WHERE owner_table=_table AND owner_id=_id AND kind=_kind;
  IF cur <> _file->>'sha256' THEN RAISE EXCEPTION 'XML_HASH_DIVERGENTE'; END IF;
  IF _clear THEN
    PERFORM set_config('notem.xml_offload','on',true);
    EXECUTE format('UPDATE public.%I SET %I=NULL WHERE id=$1', _table, col) USING _id;
    PERFORM set_config('notem.xml_offload','',true);
    RETURN 'movido';
  END IF;
  RETURN 'copiado';
END $$;

-- XML text still in tables without a file. Invoice/event texts are working copies until the operation ends (needed for atomic numbering and never re-sending).
CREATE OR REPLACE FUNCTION public.xml_offload_candidates(_limit integer) RETURNS TABLE(owner_table text, owner_id uuid, kind text, environment public.environment, xml text) LANGUAGE sql STABLE SET search_path='' AS $$
  SELECT * FROM (
    SELECT 'invoices'::text, i.id, k.kind, i.environment, k.xml FROM public.invoices i
      CROSS JOIN LATERAL (VALUES ('unsigned_dps',i.unsigned_dps_xml),('signed_dps',i.signed_dps_xml),('authorized_nfse',i.authorized_nfse_xml)) k(kind,xml)
      WHERE k.xml IS NOT NULL AND i.status NOT IN ('processing','verifying')
    UNION ALL
    SELECT 'invoice_dps_attempts', a.id, k.kind, i.environment, k.xml FROM public.invoice_dps_attempts a JOIN public.invoices i ON i.id=a.invoice_id
      CROSS JOIN LATERAL (VALUES ('unsigned',a.unsigned_xml),('signed',a.signed_xml)) k(kind,xml) WHERE k.xml IS NOT NULL
    UNION ALL
    SELECT 'invoice_fiscal_events', e.id, k.kind, e.environment, k.xml FROM public.invoice_fiscal_events e
      CROSS JOIN LATERAL (VALUES ('unsigned',e.unsigned_xml),('signed',e.signed_xml),('event',e.event_xml)) k(kind,xml)
      WHERE k.xml IS NOT NULL AND e.status IN ('registered','rejected','not_registered')
    UNION ALL
    SELECT 'nfse_documents', d.id, 'xml', d.environment, d.xml FROM public.nfse_documents d WHERE d.xml IS NOT NULL
    UNION ALL
    SELECT 'nfse_document_events', e.id, 'xml', e.environment, e.xml FROM public.nfse_document_events e WHERE e.xml IS NOT NULL
  ) x(owner_table, owner_id, kind, environment, xml)
  WHERE NOT EXISTS (SELECT 1 FROM public.fiscal_xml_files f WHERE f.owner_table=x.owner_table AND f.owner_id=x.owner_id AND f.kind=x.kind)
  LIMIT _limit $$;

-- Official documents/events from the ADN arrive with the file already stored (xml_file); no XML text is written.
CREATE OR REPLACE FUNCTION public.store_nfse_document(_env public.environment, _d jsonb, _nsu bigint) RETURNS uuid LANGUAGE plpgsql SET search_path TO '' AS $function$
DECLARE inv public.invoices; doc uuid; ev uuid; BEGIN
  SELECT * INTO inv FROM public.invoices i WHERE i.environment=_env AND (i.access_key=_d->>'access_key' OR (_d->>'dps_id' IS NOT NULL AND i.dps_id=_d->>'dps_id'))
    ORDER BY (i.access_key IS NOT DISTINCT FROM _d->>'access_key') DESC LIMIT 1;
  INSERT INTO public.nfse_documents(environment,access_key,invoice_id,nfse_number,dps_id,dps_series,dps_number,competence,issued_at,authorized_at,provider_cnpj,provider_name,taker_document,taker_name,intermediary_document,intermediary_name,substitutes_key,summary,xml,first_nsu)
  VALUES(_env,_d->>'access_key',inv.id,_d->>'nfse_number',_d->>'dps_id',_d->>'dps_series',_d->>'dps_number',(_d->>'competence')::date,(_d->>'issued_at')::timestamptz,(_d->>'authorized_at')::timestamptz,
    _d->>'provider_cnpj',_d->>'provider_name',_d->>'taker_document',_d->>'taker_name',_d->>'intermediary_document',_d->>'intermediary_name',_d->>'substitutes_key',coalesce(_d->'summary','{}'::jsonb),_d->>'xml',_nsu)
  ON CONFLICT (environment,access_key) DO UPDATE SET invoice_id=coalesce(public.nfse_documents.invoice_id, EXCLUDED.invoice_id), updated_at=now()
  RETURNING id INTO doc;
  IF _d ? 'xml_file' AND NOT EXISTS (SELECT 1 FROM public.nfse_documents x WHERE x.id=doc AND x.xml IS NOT NULL) THEN
    INSERT INTO public.fiscal_xml_files(owner_table,owner_id,kind,path,size,stored_size,sha256)
      VALUES('nfse_documents',doc,'xml',_d->'xml_file'->>'path',(_d->'xml_file'->>'size')::int,(_d->'xml_file'->>'stored_size')::int,_d->'xml_file'->>'sha256') ON CONFLICT DO NOTHING;
  END IF;
  IF inv.id IS NOT NULL AND inv.status IN ('authorized','cancellation_pending','cancelled','substituted','cancelled_by_authority') THEN
    UPDATE public.nfse_documents SET status=inv.status, restrictions=coalesce(inv.restrictions,'[]'::jsonb), manifestation=inv.manifestation, cancellation=inv.cancellation, updated_at=now() WHERE id=doc;
  END IF;
  FOR ev IN SELECT id FROM public.nfse_document_events WHERE environment=_env AND access_key=_d->>'access_key' AND applied_at IS NULL ORDER BY processed_at NULLS LAST, created_at LOOP
    PERFORM public.apply_nfse_event(ev);
  END LOOP;
  RETURN doc;
END $function$;

CREATE OR REPLACE FUNCTION public.store_nfse_event(_env public.environment, _e jsonb, _source text) RETURNS text LANGUAGE plpgsql SET search_path TO '' AS $function$
DECLARE nid uuid; BEGIN
  INSERT INTO public.nfse_document_events(environment,access_key,code,sequence,adn_type,processed_at,event_at,author_document,reason_code,reason_text,substitute_key,xml,source)
  VALUES(_env,_e->>'access_key',_e->>'code',coalesce((_e->>'sequence')::int,1),_e->>'adn_type',(_e->>'processed_at')::timestamptz,(_e->>'event_at')::timestamptz,_e->>'author_document',_e->>'reason_code',_e->>'reason_text',_e->>'substitute_key',_e->>'xml',_source)
  ON CONFLICT (environment,access_key,code,sequence) DO NOTHING RETURNING id INTO nid;
  IF nid IS NOT NULL AND _e ? 'xml_file' THEN
    INSERT INTO public.fiscal_xml_files(owner_table,owner_id,kind,path,size,stored_size,sha256)
      VALUES('nfse_document_events',nid,'xml',_e->'xml_file'->>'path',(_e->'xml_file'->>'size')::int,(_e->'xml_file'->>'stored_size')::int,_e->'xml_file'->>'sha256') ON CONFLICT DO NOTHING;
  END IF;
  IF nid IS NULL THEN
    SELECT id INTO nid FROM public.nfse_document_events WHERE environment=_env AND access_key=_e->>'access_key' AND code=_e->>'code' AND sequence=coalesce((_e->>'sequence')::int,1) AND applied_at IS NULL;
    IF nid IS NULL THEN RETURN 'duplicate'; END IF;
  END IF;
  RETURN public.apply_nfse_event(nid);
END $function$;

-- Manual synchronization: the cursor carries the open request; nothing is consulted without one.
ALTER TABLE public.adn_sync_cursors ADD COLUMN request jsonb, ADD COLUMN last_request jsonb, ADD COLUMN first_completed_at timestamptz;
GRANT SELECT (last_request, first_completed_at) ON public.adn_sync_cursors TO authenticated;
UPDATE public.adn_sync_cursors SET first_completed_at=last_success_at WHERE status='up_to_date' AND last_success_at IS NOT NULL AND first_completed_at IS NULL;

CREATE OR REPLACE FUNCTION public.request_adn_sync(_cnpj text, _env public.environment, _mode text, _months integer, _actor uuid, _org uuid) RETURNS jsonb LANGUAGE plpgsql SET search_path='' AS $$
DECLARE k public.adn_sync_cursors; req jsonb; target timestamptz; lo bigint; hi bigint; BEGIN
  IF _cnpj !~ '^[0-9]{14}$' OR _mode NOT IN ('news','period') OR (_mode='period' AND (_months IS NULL OR _months NOT IN (1,3,6,12,24))) THEN RAISE EXCEPTION 'ADN_PEDIDO_INVALIDO'; END IF;
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
END $$;

CREATE OR REPLACE FUNCTION public.adn_next_missing_nsu(_cnpj text, _env public.environment, _from bigint) RETURNS bigint LANGUAGE sql STABLE SET search_path='' AS $$
  SELECT CASE WHEN NOT EXISTS (SELECT 1 FROM public.adn_distributions WHERE cnpj=_cnpj AND environment=_env AND nsu=_from) THEN _from
  ELSE (SELECT min(d.nsu)+1 FROM public.adn_distributions d WHERE d.cnpj=_cnpj AND d.environment=_env AND d.nsu>=_from
        AND NOT EXISTS (SELECT 1 FROM public.adn_distributions x WHERE x.cnpj=_cnpj AND x.environment=_env AND x.nsu=d.nsu+1)) END $$;

DROP FUNCTION public.claim_adn_cursors(integer, text);
CREATE FUNCTION public.claim_adn_cursors(_limit integer, _cnpj text DEFAULT NULL, _env public.environment DEFAULT NULL)
 RETURNS TABLE(cnpj text, environment public.environment, next_nsu bigint, failures integer, claim_token uuid, company_id uuid, organization_id uuid, actor uuid, request jsonb)
 LANGUAGE plpgsql SET search_path TO '' AS $function$
#variable_conflict use_column
DECLARE r record; tok uuid; c_id uuid; c_org uuid; c_actor uuid; BEGIN
  FOR r IN SELECT k.cnpj AS kc, k.environment AS ke FROM public.adn_sync_cursors k
    WHERE k.request IS NOT NULL AND (_cnpj IS NULL OR k.cnpj=_cnpj) AND (_env IS NULL OR k.environment=_env)
      AND k.next_query_at<=now() AND (k.lease_until IS NULL OR k.lease_until<now())
    ORDER BY k.next_query_at LIMIT _limit FOR UPDATE SKIP LOCKED LOOP
    c_id := NULL;
    SELECT c.id, c.organization_id, cc.uploaded_by INTO c_id, c_org, c_actor FROM public.companies c
      JOIN public.company_certificates cc ON cc.company_id=c.id AND cc.organization_id=c.organization_id AND cc.status='active' AND cc.valid_until>now()
      WHERE c.cnpj=r.kc AND c.active AND EXISTS (SELECT 1 FROM public.company_certificate_material m WHERE m.company_id=c.id AND m.organization_id=c.organization_id)
      ORDER BY cc.valid_until DESC, cc.created_at DESC LIMIT 1;
    IF c_id IS NULL THEN
      UPDATE public.adn_sync_cursors k SET status='error', last_error='Nenhuma empresa ativa com certificado válido para este CNPJ.', last_error_code='SEM_CERTIFICADO',
        last_request=k.request||jsonb_build_object('finished_at',now(),'outcome','error','message','Nenhuma empresa ativa com certificado válido para este CNPJ.'), request=NULL, updated_at=now()
        WHERE k.cnpj=r.kc AND k.environment=r.ke;
      CONTINUE;
    END IF;
    tok := gen_random_uuid();
    UPDATE public.adn_sync_cursors k SET claim_token=tok, lease_until=now()+interval '3 minutes', updated_at=now() WHERE k.cnpj=r.kc AND k.environment=r.ke;
    RETURN QUERY SELECT k.cnpj, k.environment, k.next_nsu, k.failures, tok, c_id, c_org, c_actor, k.request FROM public.adn_sync_cursors k WHERE k.cnpj=r.kc AND k.environment=r.ke;
  END LOOP;
END $function$;

CREATE OR REPLACE FUNCTION public.finish_adn_batch(_cnpj text, _env public.environment, _token uuid, _items jsonb, _patch jsonb) RETURNS jsonb LANGUAGE plpgsql SET search_path TO '' AS $function$
DECLARE k public.adn_sync_cursors; it jsonb; n integer := 0; keep boolean := coalesce((_patch->>'continue')::boolean,false); BEGIN
  SELECT * INTO k FROM public.adn_sync_cursors WHERE cnpj=_cnpj AND environment=_env AND claim_token=_token AND lease_until>now() FOR UPDATE;
  IF k.cnpj IS NULL THEN RAISE EXCEPTION 'ADN_LEASE_LOST'; END IF;
  FOR it IN SELECT x FROM jsonb_array_elements(coalesce(_items,'[]'::jsonb)) x LOOP
    INSERT INTO public.adn_distributions(environment,cnpj,nsu,document_type,event_type,access_key,generated_at)
      VALUES(_env,_cnpj,(it->>'nsu')::bigint,it->>'document_type',it->>'event_type',it->>'access_key',(it->>'generated_at')::timestamptz)
      ON CONFLICT DO NOTHING;
    IF NOT FOUND THEN CONTINUE; END IF;
    n := n + 1;
    IF it ? 'nfse' THEN PERFORM public.store_nfse_document(_env, it->'nfse', (it->>'nsu')::bigint);
    ELSIF it ? 'event' THEN PERFORM public.store_nfse_event(_env, it->'event', 'adn_dfe'); END IF;
  END LOOP;
  UPDATE public.adn_sync_cursors SET
    next_nsu=greatest(next_nsu, coalesce((_patch->>'next_nsu')::bigint, next_nsu)),
    status=coalesce(_patch->>'status', status), last_query_at=now(),
    next_query_at=coalesce((_patch->>'next_query_at')::timestamptz, now()),
    last_success_at=CASE WHEN _patch->>'status' IS DISTINCT FROM 'error' THEN now() ELSE last_success_at END,
    last_error=CASE WHEN _patch->>'status'='error' THEN _patch->>'last_error' ELSE NULL END,
    last_error_code=CASE WHEN _patch->>'status'='error' THEN _patch->>'last_error_code' ELSE NULL END,
    failures=coalesce((_patch->>'failures')::int, 0), documents_imported=documents_imported+n,
    request=CASE WHEN NOT (_patch ? 'request') THEN request WHEN jsonb_typeof(_patch->'request')='null' THEN NULL ELSE (_patch->'request')||jsonb_build_object('imported',coalesce((_patch->'request'->>'imported')::int,0)+n) END,
    last_request=CASE WHEN _patch ? 'last_request' THEN (_patch->'last_request')||jsonb_build_object('imported',coalesce((_patch->'last_request'->>'imported')::int,0)+n) ELSE last_request END,
    first_completed_at=CASE WHEN coalesce((_patch->>'completed')::boolean,false) THEN coalesce(first_completed_at, now()) ELSE first_completed_at END,
    claim_token=CASE WHEN keep THEN claim_token ELSE NULL END, lease_until=CASE WHEN keep THEN now()+interval '3 minutes' ELSE NULL END, updated_at=now()
  WHERE cnpj=_cnpj AND environment=_env;
  RETURN jsonb_build_object('inserted', n);
END $function$;

-- Daily verification of notem invoices with a pending cancellation.
CREATE TABLE public.nfse_daily_checks(
  run_date date NOT NULL,
  company_id uuid NOT NULL REFERENCES public.companies(id),
  organization_id uuid NOT NULL,
  environment public.environment NOT NULL,
  checked integer NOT NULL DEFAULT 0, updated integer NOT NULL DEFAULT 0, failed integer NOT NULL DEFAULT 0,
  last_checked_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (run_date, company_id, environment));
REVOKE ALL ON public.nfse_daily_checks FROM anon, authenticated;
GRANT SELECT ON public.nfse_daily_checks TO authenticated;
GRANT ALL ON public.nfse_daily_checks TO service_role;
ALTER TABLE public.nfse_daily_checks ENABLE ROW LEVEL SECURITY;
CREATE POLICY nfse_daily_checks_read ON public.nfse_daily_checks FOR SELECT TO authenticated USING (public.is_org_member(organization_id) OR public.is_platform_admin());

CREATE OR REPLACE FUNCTION public.daily_check_candidates(_limit integer) RETURNS SETOF public.invoices LANGUAGE sql STABLE SET search_path='' AS $$
  SELECT i.* FROM public.invoices i
  WHERE i.access_key IS NOT NULL AND (i.status='cancellation_pending' OR i.pending_operation->>'tipo' IN ('cancelamento','analise_cancelamento'))
    AND NOT EXISTS (SELECT 1 FROM public.nfse_key_refreshes r WHERE r.environment=i.environment AND r.access_key=i.access_key AND r.purpose='verificacao_diaria' AND r.last_requested_at > now()-interval '20 hours')
  ORDER BY i.updated_at LIMIT _limit $$;

CREATE OR REPLACE FUNCTION public.record_daily_check(_date date, _company uuid, _org uuid, _env public.environment, _updated boolean, _failed boolean) RETURNS void LANGUAGE sql SET search_path='' AS $$
  INSERT INTO public.nfse_daily_checks(run_date,company_id,organization_id,environment,checked,updated,failed,last_checked_at)
  VALUES(_date,_company,_org,_env,1,CASE WHEN _updated THEN 1 ELSE 0 END,CASE WHEN _failed THEN 1 ELSE 0 END,now())
  ON CONFLICT (run_date,company_id,environment) DO UPDATE SET checked=public.nfse_daily_checks.checked+1,
    updated=public.nfse_daily_checks.updated+EXCLUDED.updated, failed=public.nfse_daily_checks.failed+EXCLUDED.failed, last_checked_at=now() $$;

-- One list for notem and external invoices of an organization (external: proven CNPJ of one of its companies).
CREATE OR REPLACE FUNCTION public.list_org_notes(_org uuid, _env public.environment, _company uuid DEFAULT NULL, _origin text DEFAULT NULL, _status text DEFAULT NULL,
  _from timestamptz DEFAULT NULL, _to timestamptz DEFAULT NULL, _external_id text DEFAULT NULL, _taker text DEFAULT NULL, _limit integer DEFAULT 50, _offset integer DEFAULT 0)
 RETURNS TABLE(origin text, id uuid, company_id uuid, issued_at timestamptz) LANGUAGE sql STABLE SET search_path='' AS $$
  SELECT x.origin, x.id, x.company_id, x.issued_at FROM (
    SELECT 'notem'::text AS origin, i.id, i.company_id, i.emitted_at AS issued_at FROM public.invoices i
     WHERE i.organization_id=_org AND i.environment=_env AND (_origin IS NULL OR _origin='notem') AND (_company IS NULL OR i.company_id=_company)
       AND (_status IS NULL OR i.status=_status) AND (_from IS NULL OR i.emitted_at>=_from) AND (_to IS NULL OR i.emitted_at<=_to)
       AND (_external_id IS NULL OR i.external_id=_external_id) AND (_taker IS NULL OR i.customer_snapshot->>'documento'=_taker)
    UNION ALL
    SELECT 'externa', d.id, c.id, coalesce(d.issued_at,d.authorized_at,d.created_at) FROM public.nfse_documents d
     JOIN LATERAL (SELECT c.id FROM public.companies c WHERE c.organization_id=_org AND regexp_replace(c.cnpj,'\D','','g')=d.provider_cnpj ORDER BY c.created_at, c.id LIMIT 1) c ON true
     WHERE d.environment=_env AND d.invoice_id IS NULL AND public.org_proven_cnpj(_org,d.provider_cnpj)
       AND (_origin IS NULL OR _origin='externa') AND _external_id IS NULL AND (_company IS NULL OR c.id=_company)
       AND (_status IS NULL OR d.status=_status) AND (_from IS NULL OR coalesce(d.issued_at,d.authorized_at)>=_from) AND (_to IS NULL OR coalesce(d.issued_at,d.authorized_at)<=_to)
       AND (_taker IS NULL OR d.taker_document=_taker)
  ) x ORDER BY x.issued_at DESC, x.id LIMIT least(greatest(_limit,1),101) OFFSET greatest(_offset,0) $$;

REVOKE ALL ON FUNCTION public.xml_column(text,text) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.attach_xml_file(text,uuid,text,jsonb,boolean) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.xml_offload_candidates(integer) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.store_nfse_document(public.environment,jsonb,bigint) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.store_nfse_event(public.environment,jsonb,text) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.request_adn_sync(text,public.environment,text,integer,uuid,uuid) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.adn_next_missing_nsu(text,public.environment,bigint) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.claim_adn_cursors(integer,text,public.environment) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.finish_adn_batch(text,public.environment,uuid,jsonb,jsonb) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.daily_check_candidates(integer) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.record_daily_check(date,uuid,uuid,public.environment,boolean,boolean) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.list_org_notes(uuid,public.environment,uuid,text,text,timestamptz,timestamptz,text,text,integer,integer) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.xml_column(text,text), public.attach_xml_file(text,uuid,text,jsonb,boolean), public.xml_offload_candidates(integer),
  public.store_nfse_document(public.environment,jsonb,bigint), public.store_nfse_event(public.environment,jsonb,text),
  public.request_adn_sync(text,public.environment,text,integer,uuid,uuid), public.adn_next_missing_nsu(text,public.environment,bigint),
  public.claim_adn_cursors(integer,text,public.environment), public.finish_adn_batch(text,public.environment,uuid,jsonb,jsonb),
  public.daily_check_candidates(integer), public.record_daily_check(date,uuid,uuid,public.environment,boolean,boolean) TO service_role;
GRANT EXECUTE ON FUNCTION public.list_org_notes(uuid,public.environment,uuid,text,text,timestamptz,timestamptz,text,text,integer,integer) TO authenticated, service_role;