
-- Proof of possession: an organization sees external/received NFS-e of a CNPJ only after one of its companies with that CNPJ had a certificate.
CREATE OR REPLACE FUNCTION public.org_proven_cnpj(_org uuid, _cnpj text) RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public AS $$
  select _cnpj is not null and exists(select 1 from public.companies c join public.company_certificates cc on cc.company_id=c.id and cc.organization_id=c.organization_id
    where c.organization_id=_org and regexp_replace(c.cnpj,'\D','','g')=_cnpj and regexp_replace(cc.cnpj,'\D','','g')=_cnpj) $$;
REVOKE ALL ON FUNCTION public.org_proven_cnpj(uuid,text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.org_proven_cnpj(uuid,text) TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public.can_view_nfse_document(_provider text, _taker text, _intermediary text, _invoice uuid) RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public AS $$
  select public.is_platform_admin() or exists(select 1 from public.organization_members m where m.user_id=auth.uid() and (
    (_invoice is null and public.org_proven_cnpj(m.organization_id,_provider)) or public.org_proven_cnpj(m.organization_id,_taker) or public.org_proven_cnpj(m.organization_id,_intermediary))) $$;
REVOKE ALL ON FUNCTION public.can_view_nfse_document(text,text,text,uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.can_view_nfse_document(text,text,text,uuid) TO authenticated, service_role;

-- Sync cursor per CNPJ and environment.
CREATE TABLE public.adn_sync_cursors(
  cnpj text NOT NULL CHECK (cnpj ~ '^[0-9]{14}$'),
  environment public.environment NOT NULL,
  next_nsu bigint NOT NULL DEFAULT 0 CHECK (next_nsu >= 0),
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','syncing','up_to_date','error')),
  last_query_at timestamptz, next_query_at timestamptz NOT NULL DEFAULT now(), last_success_at timestamptz,
  last_error text, last_error_code text, failures integer NOT NULL DEFAULT 0 CHECK (failures >= 0),
  documents_imported integer NOT NULL DEFAULT 0,
  claim_token uuid, lease_until timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (cnpj, environment));
REVOKE ALL ON public.adn_sync_cursors FROM anon, authenticated;
GRANT SELECT (cnpj, environment, next_nsu, status, last_query_at, next_query_at, last_success_at, last_error, last_error_code, failures, documents_imported, created_at, updated_at) ON public.adn_sync_cursors TO authenticated;
GRANT ALL ON public.adn_sync_cursors TO service_role;
ALTER TABLE public.adn_sync_cursors ENABLE ROW LEVEL SECURITY;
CREATE POLICY adn_cursor_read ON public.adn_sync_cursors FOR SELECT TO authenticated USING (public.is_platform_admin() OR EXISTS (SELECT 1 FROM public.organization_members m WHERE m.user_id = auth.uid() AND public.org_proven_cnpj(m.organization_id, cnpj)));

-- Every NSU received, once.
CREATE TABLE public.adn_distributions(
  environment public.environment NOT NULL, cnpj text NOT NULL, nsu bigint NOT NULL,
  document_type text, event_type text, access_key text, generated_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (environment, cnpj, nsu));
REVOKE ALL ON public.adn_distributions FROM anon, authenticated;
GRANT ALL ON public.adn_distributions TO service_role;
ALTER TABLE public.adn_distributions ENABLE ROW LEVEL SECURITY;

-- Official NFS-e, once per key and environment.
CREATE TABLE public.nfse_documents(
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  environment public.environment NOT NULL,
  access_key text NOT NULL CHECK (access_key ~ '^[0-9]{50}$'),
  invoice_id uuid REFERENCES public.invoices(id),
  nfse_number text, dps_id text, dps_series text, dps_number text,
  competence date, issued_at timestamptz, authorized_at timestamptz,
  provider_cnpj text, provider_name text, taker_document text, taker_name text, intermediary_document text, intermediary_name text,
  substitutes_key text, substituted_by_key text,
  status text NOT NULL DEFAULT 'authorized' CHECK (status IN ('authorized','cancellation_pending','cancelled','substituted','cancelled_by_authority')),
  restrictions jsonb NOT NULL DEFAULT '[]'::jsonb, manifestation jsonb, cancellation jsonb,
  summary jsonb NOT NULL DEFAULT '{}'::jsonb,
  xml text NOT NULL, first_nsu bigint,
  created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (environment, access_key));
CREATE INDEX nfse_documents_provider_idx ON public.nfse_documents(environment, provider_cnpj, issued_at DESC);
CREATE INDEX nfse_documents_taker_idx ON public.nfse_documents(environment, taker_document, issued_at DESC);
CREATE INDEX nfse_documents_intermediary_idx ON public.nfse_documents(environment, intermediary_document) WHERE intermediary_document IS NOT NULL;
CREATE INDEX nfse_documents_dps_idx ON public.nfse_documents(environment, dps_id);
REVOKE ALL ON public.nfse_documents FROM anon, authenticated;
GRANT SELECT ON public.nfse_documents TO authenticated;
GRANT ALL ON public.nfse_documents TO service_role;
ALTER TABLE public.nfse_documents ENABLE ROW LEVEL SECURITY;
CREATE POLICY nfse_documents_read ON public.nfse_documents FOR SELECT TO authenticated USING (public.can_view_nfse_document(provider_cnpj, taker_document, intermediary_document, invoice_id));

-- Official events, once per key/code/sequence.
CREATE TABLE public.nfse_document_events(
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  environment public.environment NOT NULL,
  access_key text NOT NULL CHECK (access_key ~ '^[0-9]{50}$'),
  code text NOT NULL CHECK (code ~ '^([0-9]{6}|[A-Z_]{3,60})$'),
  sequence integer NOT NULL DEFAULT 1,
  adn_type text, processed_at timestamptz, event_at timestamptz,
  author_document text, reason_code text, reason_text text, substitute_key text,
  xml text NOT NULL,
  source text NOT NULL CHECK (source IN ('adn_dfe','adn_eventos','sefin_consulta')),
  applied_at timestamptz, requested_by_notem boolean NOT NULL DEFAULT false, invoice_id uuid REFERENCES public.invoices(id),
  webhook_type text, webhook_emitted_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (environment, access_key, code, sequence));
CREATE INDEX nfse_document_events_pending_idx ON public.nfse_document_events(environment, access_key) WHERE applied_at IS NULL;
CREATE INDEX nfse_document_events_outbox_idx ON public.nfse_document_events(created_at) WHERE webhook_type IS NOT NULL AND webhook_emitted_at IS NULL;
REVOKE ALL ON public.nfse_document_events FROM anon, authenticated;
GRANT SELECT ON public.nfse_document_events TO authenticated;
GRANT ALL ON public.nfse_document_events TO service_role;
ALTER TABLE public.nfse_document_events ENABLE ROW LEVEL SECURITY;
CREATE POLICY nfse_document_events_read ON public.nfse_document_events FOR SELECT TO authenticated USING (
  (invoice_id IS NOT NULL AND EXISTS (SELECT 1 FROM public.invoices i WHERE i.id = invoice_id AND (public.is_org_member(i.organization_id) OR public.is_platform_admin())))
  OR EXISTS (SELECT 1 FROM public.nfse_documents d WHERE d.environment = nfse_document_events.environment AND d.access_key = nfse_document_events.access_key AND public.can_view_nfse_document(d.provider_cnpj, d.taker_document, d.intermediary_document, d.invoice_id)));

-- Minimum interval for key-based government refreshes.
CREATE TABLE public.nfse_key_refreshes(
  environment public.environment NOT NULL, access_key text NOT NULL, purpose text NOT NULL,
  last_requested_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (environment, access_key, purpose));
REVOKE ALL ON public.nfse_key_refreshes FROM anon, authenticated;
GRANT ALL ON public.nfse_key_refreshes TO service_role;
ALTER TABLE public.nfse_key_refreshes ENABLE ROW LEVEL SECURITY;

CREATE OR REPLACE FUNCTION public.touch_nfse_refresh(_env public.environment, _key text, _purpose text, _interval interval) RETURNS timestamptz LANGUAGE plpgsql SET search_path='' AS $$
DECLARE prev timestamptz; BEGIN
  SELECT last_requested_at INTO prev FROM public.nfse_key_refreshes WHERE environment=_env AND access_key=_key AND purpose=_purpose FOR UPDATE;
  IF prev IS NOT NULL AND prev + _interval > now() THEN RETURN prev + _interval; END IF;
  INSERT INTO public.nfse_key_refreshes(environment,access_key,purpose,last_requested_at) VALUES(_env,_key,_purpose,now())
    ON CONFLICT (environment,access_key,purpose) DO UPDATE SET last_requested_at=now();
  RETURN NULL; END $$;

-- Applies one official event to the notem invoice and/or the official document. Never moves a final state back.
CREATE OR REPLACE FUNCTION public.apply_nfse_event(_id uuid) RETURNS text LANGUAGE plpgsql SET search_path='' AS $$
DECLARE e public.nfse_document_events; d public.nfse_documents; i public.invoices; f public.invoice_fiscal_events;
  cur text; nxt text; outside boolean := true; msg text; wh text; reason text; restr jsonb; man jsonb; canc jsonb; changed boolean; timeline text; sub uuid;
  finals text[] := ARRAY['cancelled','substituted','cancelled_by_authority'];
BEGIN
  SELECT * INTO e FROM public.nfse_document_events WHERE id=_id FOR UPDATE;
  IF e.id IS NULL OR e.applied_at IS NOT NULL THEN RETURN 'skip'; END IF;
  SELECT * INTO d FROM public.nfse_documents WHERE environment=e.environment AND access_key=e.access_key FOR UPDATE;
  SELECT * INTO i FROM public.invoices WHERE environment=e.environment AND (access_key=e.access_key OR id=d.invoice_id)
    ORDER BY (access_key IS NOT DISTINCT FROM e.access_key) DESC LIMIT 1 FOR UPDATE;
  IF d.id IS NULL AND i.id IS NULL THEN RETURN 'pending'; END IF;

  IF i.id IS NOT NULL AND e.code IN ('101101','101103') THEN
    SELECT * INTO f FROM public.invoice_fiscal_events WHERE invoice_id=i.id AND code=e.code AND status IN ('registered','verifying') ORDER BY created_at DESC LIMIT 1 FOR UPDATE;
    IF f.id IS NOT NULL AND f.status='registered' THEN
      UPDATE public.nfse_document_events SET applied_at=now(), requested_by_notem=true, invoice_id=i.id WHERE id=e.id;
      RETURN 'already';
    ELSIF f.id IS NOT NULL THEN
      outside := false;
      UPDATE public.invoice_fiscal_events SET status='registered', event_xml=coalesce(event_xml,e.xml), registered_at=coalesce(e.processed_at,now()), claim_token=NULL, lease_until=NULL, next_verification_at=NULL WHERE id=f.id;
    END IF;
  END IF;

  cur := coalesce(i.status, d.status); nxt := cur;
  restr := coalesce(i.restrictions, d.restrictions, '[]'::jsonb); man := coalesce(i.manifestation, d.manifestation); canc := coalesce(i.cancellation, d.cancellation);
  reason := CASE e.reason_code WHEN '1' THEN 'erro_emissao' WHEN '2' THEN 'servico_nao_prestado' WHEN '9' THEN 'outros' ELSE NULL END;

  IF e.code='101101' THEN
    IF cur IN ('authorized','cancellation_pending') THEN nxt:='cancelled'; END IF;
    canc := jsonb_build_object('tipo','cancelamento','motivo',coalesce(f.reason,reason),'justificativa',coalesce(f.justification,e.reason_text),'solicitado_em',coalesce(f.created_at,e.event_at),'registrado_em',e.processed_at,'situacao','cancelado','pode_solicitar_analise',false,'registrado_fora_da_notem',outside,'erros_governo','[]'::jsonb,'evento_id',f.id);
    msg := 'Cancelamento da NFS-e registrado.'; wh := 'nota.cancelada';
  ELSIF e.code='101103' THEN
    IF cur='authorized' THEN nxt:='cancellation_pending'; END IF;
    canc := jsonb_build_object('tipo','analise_cancelamento','motivo',coalesce(f.reason,reason),'justificativa',coalesce(f.justification,e.reason_text),'solicitado_em',coalesce(f.created_at,e.event_at),'registrado_em',e.processed_at,'situacao','em_analise','pode_solicitar_analise',false,'registrado_fora_da_notem',outside,'erros_governo','[]'::jsonb,'evento_id',f.id);
    msg := 'Pedido de análise fiscal do cancelamento registrado; aguardando decisão da prefeitura.'; wh := 'nota.cancelamento_em_analise';
  ELSIF e.code='105104' THEN
    IF cur IN ('authorized','cancellation_pending') THEN nxt:='cancelled'; END IF;
    canc := coalesce(canc,'{}'::jsonb) || jsonb_build_object('situacao','cancelado','registrado_em',e.processed_at,'decisao_prefeitura','deferido');
    msg := 'A prefeitura deferiu o cancelamento.'; wh := 'nota.cancelada';
  ELSIF e.code='105105' THEN
    IF cur='cancellation_pending' THEN nxt:='authorized'; END IF;
    canc := coalesce(canc,'{}'::jsonb) || jsonb_build_object('situacao','indeferido','decisao_prefeitura','indeferido','decidido_em',e.processed_at);
    msg := 'A prefeitura indeferiu o cancelamento; a nota segue autorizada.'; wh := 'nota.cancelamento_indeferido';
  ELSIF e.code='105102' THEN
    IF cur IN ('authorized','cancellation_pending') THEN nxt:='substituted'; END IF;
    msg := 'NFS-e cancelada por substituição.'; wh := 'nota.substituida';
  ELSIF e.code='305101' THEN
    IF NOT (cur = ANY(finals)) THEN nxt:='cancelled_by_authority'; END IF;
    msg := 'A prefeitura cancelou a nota por ofício.'; wh := 'nota.cancelada_prefeitura';
  ELSIF e.code='305102' THEN
    restr := coalesce((SELECT jsonb_agg(x) FROM jsonb_array_elements(restr) x WHERE x->>'tipo' IS DISTINCT FROM 'bloqueio_prefeitura'),'[]'::jsonb)
      || jsonb_build_array(jsonb_build_object('tipo','bloqueio_prefeitura','evento','305102','desde',e.processed_at,'motivo',e.reason_text));
    msg := 'A prefeitura bloqueou a nota por ofício.'; wh := 'nota.bloqueada_prefeitura';
  ELSIF e.code='305103' THEN
    restr := coalesce((SELECT jsonb_agg(x) FROM jsonb_array_elements(restr) x WHERE x->>'tipo' IS DISTINCT FROM 'bloqueio_prefeitura'),'[]'::jsonb);
    msg := 'A prefeitura retirou o bloqueio da nota.'; wh := 'nota.desbloqueada_prefeitura';
  ELSIF e.code IN ('202201','203202','204203','205204','202205','203206','204207','205208') THEN
    man := jsonb_build_object(
      'situacao', CASE WHEN e.code IN ('202201','203202','204203') THEN 'confirmada' WHEN e.code='205204' THEN 'confirmada_tacitamente' WHEN e.code='205208' THEN 'rejeicao_anulada' ELSE 'rejeitada' END,
      'autor', CASE WHEN e.code IN ('202201','202205') THEN 'prestador' WHEN e.code IN ('203202','203206') THEN 'tomador' WHEN e.code IN ('204203','204207') THEN 'intermediario' ELSE NULL END,
      'evento', e.code, 'registrada_em', e.processed_at, 'motivo', e.reason_text);
    msg := CASE e.code WHEN '202201' THEN 'O prestador confirmou a nota.' WHEN '203202' THEN 'O tomador confirmou a nota.' WHEN '204203' THEN 'O intermediário confirmou a nota.' WHEN '205204' THEN 'Confirmação tácita registrada.' WHEN '202205' THEN 'O prestador rejeitou a nota.' WHEN '203206' THEN 'O tomador rejeitou a nota.' WHEN '204207' THEN 'O intermediário rejeitou a nota.' ELSE 'A rejeição da nota foi anulada.' END;
    wh := 'nota.manifestacao';
  ELSE
    msg := CASE e.code WHEN 'INCLUSAO_NFSE_DAN' THEN 'NFS-e incluída no documento de arrecadação (DAN).' WHEN 'TRIBUTOS_NFSE_RECOLHIDOS' THEN 'Tributos da NFS-e recolhidos.' ELSE 'Evento oficial registrado.' END;
  END IF;

  changed := nxt IS DISTINCT FROM cur OR restr IS DISTINCT FROM coalesce(i.restrictions, d.restrictions, '[]'::jsonb) OR man IS DISTINCT FROM coalesce(i.manifestation, d.manifestation)
    OR (e.code IN ('101101','101103','105104','105105') AND nxt IS DISTINCT FROM cur);
  IF wh IS NULL THEN changed := false; END IF;

  IF i.id IS NOT NULL THEN
    IF e.code='105102' AND nxt='substituted' AND e.substitute_key IS NOT NULL THEN
      SELECT s.id INTO sub FROM public.invoices s WHERE s.environment=i.environment AND s.organization_id=i.organization_id AND s.access_key=e.substitute_key LIMIT 1;
    END IF;
    UPDATE public.invoices SET status=nxt, restrictions=restr, manifestation=man,
      cancellation=CASE WHEN e.code IN ('101101','101103','105104','105105') AND (nxt IS DISTINCT FROM cur OR NOT outside) THEN canc ELSE cancellation END,
      pending_operation=CASE WHEN nxt IS DISTINCT FROM cur OR NOT outside THEN NULL ELSE pending_operation END,
      substituted_by_invoice_id=coalesce(substituted_by_invoice_id, sub), updated_at=now()
    WHERE id=i.id;
    IF changed OR wh IS NULL OR NOT outside THEN
      timeline := CASE WHEN NOT outside THEN (CASE WHEN e.code='101101' THEN 'cancellation_registered' ELSE 'analysis_registered' END) ELSE 'government_event' END;
      INSERT INTO public.invoice_events(invoice_id,organization_id,type,details) VALUES(i.id,i.organization_id,timeline,
        jsonb_build_object('mensagem', CASE WHEN outside THEN 'Registrado fora da notem. ' || msg ELSE msg END,'codigo_evento',e.code,'sequencia',e.sequence,'registrado_fora_da_notem',outside,'evento_oficial_id',e.id,'registrado_em',e.processed_at));
    END IF;
  END IF;

  IF d.id IS NOT NULL THEN
    UPDATE public.nfse_documents SET status=nxt, restrictions=restr, manifestation=man,
      cancellation=CASE WHEN e.code IN ('101101','101103','105104','105105') THEN canc ELSE cancellation END,
      substituted_by_key=CASE WHEN e.code='105102' THEN coalesce(e.substitute_key, substituted_by_key) ELSE substituted_by_key END, updated_at=now()
    WHERE id=d.id;
  END IF;

  UPDATE public.nfse_document_events SET applied_at=now(), requested_by_notem=NOT outside, invoice_id=i.id,
    webhook_type=CASE WHEN i.id IS NOT NULL AND changed THEN wh ELSE NULL END WHERE id=e.id;
  RETURN CASE WHEN changed THEN 'changed' ELSE 'recorded' END;
END $$;

CREATE OR REPLACE FUNCTION public.store_nfse_event(_env public.environment, _e jsonb, _source text) RETURNS text LANGUAGE plpgsql SET search_path='' AS $$
DECLARE nid uuid; BEGIN
  INSERT INTO public.nfse_document_events(environment,access_key,code,sequence,adn_type,processed_at,event_at,author_document,reason_code,reason_text,substitute_key,xml,source)
  VALUES(_env,_e->>'access_key',_e->>'code',coalesce((_e->>'sequence')::int,1),_e->>'adn_type',(_e->>'processed_at')::timestamptz,(_e->>'event_at')::timestamptz,_e->>'author_document',_e->>'reason_code',_e->>'reason_text',_e->>'substitute_key',_e->>'xml',_source)
  ON CONFLICT (environment,access_key,code,sequence) DO NOTHING RETURNING id INTO nid;
  IF nid IS NULL THEN
    SELECT id INTO nid FROM public.nfse_document_events WHERE environment=_env AND access_key=_e->>'access_key' AND code=_e->>'code' AND sequence=coalesce((_e->>'sequence')::int,1) AND applied_at IS NULL;
    IF nid IS NULL THEN RETURN 'duplicate'; END IF;
  END IF;
  RETURN public.apply_nfse_event(nid);
END $$;

CREATE OR REPLACE FUNCTION public.store_nfse_document(_env public.environment, _d jsonb, _nsu bigint) RETURNS uuid LANGUAGE plpgsql SET search_path='' AS $$
DECLARE inv uuid; doc uuid; ev uuid; BEGIN
  SELECT i.id INTO inv FROM public.invoices i WHERE i.environment=_env AND (i.access_key=_d->>'access_key' OR (_d->>'dps_id' IS NOT NULL AND i.dps_id=_d->>'dps_id'))
    ORDER BY (i.access_key IS NOT DISTINCT FROM _d->>'access_key') DESC LIMIT 1;
  INSERT INTO public.nfse_documents(environment,access_key,invoice_id,nfse_number,dps_id,dps_series,dps_number,competence,issued_at,authorized_at,provider_cnpj,provider_name,taker_document,taker_name,intermediary_document,intermediary_name,substitutes_key,summary,xml,first_nsu)
  VALUES(_env,_d->>'access_key',inv,_d->>'nfse_number',_d->>'dps_id',_d->>'dps_series',_d->>'dps_number',(_d->>'competence')::date,(_d->>'issued_at')::timestamptz,(_d->>'authorized_at')::timestamptz,
    _d->>'provider_cnpj',_d->>'provider_name',_d->>'taker_document',_d->>'taker_name',_d->>'intermediary_document',_d->>'intermediary_name',_d->>'substitutes_key',coalesce(_d->'summary','{}'::jsonb),_d->>'xml',_nsu)
  ON CONFLICT (environment,access_key) DO UPDATE SET invoice_id=coalesce(public.nfse_documents.invoice_id, EXCLUDED.invoice_id), updated_at=now()
  RETURNING id INTO doc;
  FOR ev IN SELECT id FROM public.nfse_document_events WHERE environment=_env AND access_key=_d->>'access_key' AND applied_at IS NULL ORDER BY processed_at NULLS LAST, created_at LOOP
    PERFORM public.apply_nfse_event(ev);
  END LOOP;
  RETURN doc;
END $$;

-- Reserves due cursors (creating them for eligible CNPJs) with the longest-valid certificate; skips locked rows so runs never overlap.
CREATE OR REPLACE FUNCTION public.claim_adn_cursors(_limit integer, _cnpj text DEFAULT NULL)
RETURNS TABLE(cnpj text, environment public.environment, next_nsu bigint, failures integer, claim_token uuid, company_id uuid, organization_id uuid, actor uuid)
LANGUAGE plpgsql SET search_path='' AS $$
#variable_conflict use_column
DECLARE r record; tok uuid; c_id uuid; c_org uuid; c_actor uuid; BEGIN
  INSERT INTO public.adn_sync_cursors(cnpj,environment)
  SELECT DISTINCT c.cnpj, env.e FROM public.companies c
    JOIN public.company_certificates cc ON cc.company_id=c.id AND cc.organization_id=c.organization_id AND cc.status='active' AND cc.valid_until>now()
    CROSS JOIN LATERAL (SELECT 'production'::public.environment AS e UNION ALL SELECT 'sandbox'::public.environment WHERE EXISTS (SELECT 1 FROM public.invoices i JOIN public.companies c2 ON c2.id=i.company_id WHERE c2.cnpj=c.cnpj AND i.environment='sandbox')) env
  WHERE c.active AND (_cnpj IS NULL OR c.cnpj=_cnpj) AND c.cnpj ~ '^[0-9]{14}$'
  ON CONFLICT DO NOTHING;
  FOR r IN SELECT k.cnpj AS kc, k.environment AS ke FROM public.adn_sync_cursors k
    WHERE (_cnpj IS NULL OR k.cnpj=_cnpj) AND k.next_query_at<=now() AND (k.lease_until IS NULL OR k.lease_until<now())
    ORDER BY k.next_query_at LIMIT _limit FOR UPDATE SKIP LOCKED LOOP
    c_id := NULL;
    SELECT c.id, c.organization_id, cc.uploaded_by INTO c_id, c_org, c_actor FROM public.companies c
      JOIN public.company_certificates cc ON cc.company_id=c.id AND cc.organization_id=c.organization_id AND cc.status='active' AND cc.valid_until>now()
      WHERE c.cnpj=r.kc AND c.active AND EXISTS (SELECT 1 FROM public.company_certificate_material m WHERE m.company_id=c.id AND m.organization_id=c.organization_id)
      ORDER BY cc.valid_until DESC, cc.created_at DESC LIMIT 1;
    IF c_id IS NULL THEN CONTINUE; END IF;
    tok := gen_random_uuid();
    UPDATE public.adn_sync_cursors k SET claim_token=tok, lease_until=now()+interval '3 minutes', status=CASE WHEN k.status='pending' THEN 'syncing' ELSE k.status END, updated_at=now()
      WHERE k.cnpj=r.kc AND k.environment=r.ke;
    RETURN QUERY SELECT k.cnpj, k.environment, k.next_nsu, k.failures, tok, c_id, c_org, c_actor FROM public.adn_sync_cursors k WHERE k.cnpj=r.kc AND k.environment=r.ke;
  END LOOP;
END $$;

-- Stores one ADN batch atomically (each NSU once) and moves the cursor; continue=true keeps the lease for the next batch.
CREATE OR REPLACE FUNCTION public.finish_adn_batch(_cnpj text, _env public.environment, _token uuid, _items jsonb, _patch jsonb) RETURNS jsonb LANGUAGE plpgsql SET search_path='' AS $$
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
    claim_token=CASE WHEN keep THEN claim_token ELSE NULL END, lease_until=CASE WHEN keep THEN now()+interval '3 minutes' ELSE NULL END, updated_at=now()
  WHERE cnpj=_cnpj AND environment=_env;
  RETURN jsonb_build_object('inserted', n);
END $$;

CREATE OR REPLACE FUNCTION public.store_nfse_events(_env public.environment, _items jsonb, _source text) RETURNS jsonb LANGUAGE plpgsql SET search_path='' AS $$
DECLARE it jsonb; res text; changed integer := 0; total integer := 0; BEGIN
  FOR it IN SELECT x FROM jsonb_array_elements(coalesce(_items,'[]'::jsonb)) x ORDER BY x->>'processed_at' NULLS LAST LOOP
    res := public.store_nfse_event(_env, it, _source); total := total + 1; IF res='changed' THEN changed := changed + 1; END IF;
  END LOOP;
  RETURN jsonb_build_object('total', total, 'changed', changed);
END $$;

-- Outbox: one webhook per official event and integration, deterministic ids so it never duplicates.
CREATE OR REPLACE FUNCTION public.emit_nfse_event_webhook(_event uuid, _nota jsonb) RETURNS integer LANGUAGE plpgsql SET search_path='' AS $$
DECLARE e public.nfse_document_events; i public.invoices; target uuid; evt text; envelope jsonb; n integer := 0; BEGIN
  SELECT * INTO e FROM public.nfse_document_events WHERE id=_event FOR UPDATE;
  IF e.id IS NULL OR e.webhook_type IS NULL OR e.webhook_emitted_at IS NOT NULL OR e.invoice_id IS NULL THEN RETURN 0; END IF;
  SELECT * INTO i FROM public.invoices WHERE id=e.invoice_id;
  FOR target IN SELECT DISTINCT w.integration_id FROM public.webhook_endpoints w JOIN public.integrations g ON g.id=w.integration_id AND g.active
    WHERE w.organization_id=i.organization_id AND w.environment=i.environment AND w.active AND w.deleted_at IS NULL LOOP
    evt := 'evt_' || substr(md5(e.id::text || ':' || target::text), 1, 32);
    IF EXISTS (SELECT 1 FROM public.webhook_events WHERE id=evt) THEN CONTINUE; END IF;
    envelope := jsonb_build_object('id',evt,'tipo',e.webhook_type,'criado_em',now(),'ambiente',CASE WHEN i.environment='sandbox' THEN 'homologacao' ELSE 'producao' END,'organizacao_id',i.organization_id,'integracao_id',target,'dados',_nota);
    PERFORM public.emit_webhook_event(evt, i.organization_id, target, i.environment, e.webhook_type, envelope::text, NULL, i.company_id);
    n := n + 1;
  END LOOP;
  UPDATE public.nfse_document_events SET webhook_emitted_at=now() WHERE id=e.id;
  RETURN n;
END $$;

DO $$ DECLARE f text; BEGIN
  FOREACH f IN ARRAY ARRAY['public.touch_nfse_refresh(public.environment,text,text,interval)','public.apply_nfse_event(uuid)','public.store_nfse_event(public.environment,jsonb,text)','public.store_nfse_document(public.environment,jsonb,bigint)','public.claim_adn_cursors(integer,text)','public.finish_adn_batch(text,public.environment,uuid,jsonb,jsonb)','public.store_nfse_events(public.environment,jsonb,text)','public.emit_nfse_event_webhook(uuid,jsonb)'] LOOP
    EXECUTE format('REVOKE ALL ON FUNCTION %s FROM PUBLIC, anon, authenticated', f);
    EXECUTE format('GRANT EXECUTE ON FUNCTION %s TO service_role', f);
  END LOOP; END $$;

-- New webhook type for unblocking by the municipality.
ALTER TABLE public.webhook_endpoints DROP CONSTRAINT IF EXISTS webhook_endpoints_events_known;
ALTER TABLE public.webhook_endpoints ADD CONSTRAINT webhook_endpoints_events_known CHECK (events <@ ARRAY['webhook.teste','nota.autorizada','nota.rejeitada','nota.cancelada','nota.cancelamento_em_analise','nota.cancelamento_indeferido','nota.substituida','nota.cancelada_prefeitura','nota.bloqueada_prefeitura','nota.desbloqueada_prefeitura','nota.manifestacao','empresa.situacao_alterada','certificado.vencendo','certificado.vencido','municipio.disponivel','nota.*','empresa.*','certificado.*','municipio.*']::text[]) NOT VALID;
