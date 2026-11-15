-- Phase 7: XML columns removed after the approved report; files in the private bucket are the only copy.
-- 1) Safety: every XML still in a table must already have a file with the same SHA-256, otherwise nothing changes.
DO $chk$ DECLARE missing integer; BEGIN
SELECT count(*) INTO missing FROM (
  SELECT 'invoices'::text t, i.id, k.kind, k.xml FROM public.invoices i CROSS JOIN LATERAL (VALUES ('unsigned_dps',i.unsigned_dps_xml),('signed_dps',i.signed_dps_xml),('authorized_nfse',i.authorized_nfse_xml)) k(kind,xml)
  UNION ALL SELECT 'invoice_dps_attempts', a.id, k.kind, k.xml FROM public.invoice_dps_attempts a CROSS JOIN LATERAL (VALUES ('unsigned',a.unsigned_xml),('signed',a.signed_xml)) k(kind,xml)
  UNION ALL SELECT 'invoice_fiscal_events', e.id, k.kind, k.xml FROM public.invoice_fiscal_events e CROSS JOIN LATERAL (VALUES ('unsigned',e.unsigned_xml),('signed',e.signed_xml),('event',e.event_xml)) k(kind,xml)
  UNION ALL SELECT 'nfse_documents', d.id, 'xml', d.xml FROM public.nfse_documents d
  UNION ALL SELECT 'nfse_document_events', e.id, 'xml', e.xml FROM public.nfse_document_events e
) x WHERE x.xml IS NOT NULL AND NOT EXISTS (SELECT 1 FROM public.fiscal_xml_files f WHERE f.owner_table=x.t AND f.owner_id=x.id AND f.kind=x.kind AND f.sha256=encode(extensions.digest(convert_to(x.xml,'UTF8'),'sha256'),'hex'));
IF missing>0 THEN RAISE EXCEPTION 'XML_SEM_ARQUIVO_CONFERIDO: %', missing; END IF;
END $chk$;

-- 2) File reference helper (server only). _replace=true only for working copies that legitimately change (signed DPS after an E0014 skip).
CREATE OR REPLACE FUNCTION public.put_xml_file(_table text, _id uuid, _kind text, _file jsonb, _replace boolean DEFAULT false) RETURNS void LANGUAGE plpgsql SET search_path='' AS $f$
BEGIN
  IF _file IS NULL OR jsonb_typeof(_file)<>'object' THEN RETURN; END IF;
  IF _replace THEN
    INSERT INTO public.fiscal_xml_files(owner_table,owner_id,kind,path,size,stored_size,sha256)
      VALUES(_table,_id,_kind,_file->>'path',(_file->>'size')::int,(_file->>'stored_size')::int,_file->>'sha256')
      ON CONFLICT (owner_table,owner_id,kind) DO UPDATE SET path=EXCLUDED.path,size=EXCLUDED.size,stored_size=EXCLUDED.stored_size,sha256=EXCLUDED.sha256,created_at=now();
  ELSE
    INSERT INTO public.fiscal_xml_files(owner_table,owner_id,kind,path,size,stored_size,sha256)
      VALUES(_table,_id,_kind,_file->>'path',(_file->>'size')::int,(_file->>'stored_size')::int,_file->>'sha256') ON CONFLICT DO NOTHING;
  END IF;
END $f$;
REVOKE ALL ON FUNCTION public.put_xml_file(text,uuid,text,jsonb,boolean) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.put_xml_file(text,uuid,text,jsonb,boolean) TO service_role;

CREATE OR REPLACE FUNCTION public.create_invoice_request(_payload jsonb)
 RETURNS public.invoices LANGUAGE plpgsql SET search_path TO '' AS $function$ DECLARE prior public.invoices; c public.companies; s public.company_fiscal_settings; p public.company_service_profiles; n text; did text; msg text; inserted public.invoices; orig public.invoices; integ uuid:=NULLIF(_payload->>'integration_id','')::uuid; panel boolean:=coalesce(_payload->>'origin','api')='panel'; BEGIN
PERFORM pg_advisory_xact_lock(hashtextextended(coalesce(integ::text,'panel:'||(_payload->>'organization_id'))||':'||(_payload->>'environment')||':'||(_payload->>'idempotency_key'),0));
SELECT * INTO prior FROM public.invoices WHERE integration_id IS NOT DISTINCT FROM integ AND organization_id=(_payload->>'organization_id')::uuid AND environment=(_payload->>'environment')::public.environment AND idempotency_key=_payload->>'idempotency_key';
IF prior.id IS NOT NULL THEN IF prior.request_hash IS DISTINCT FROM _payload->>'request_hash' THEN RAISE EXCEPTION 'IDEMPOTENCIA_CONFLITO'; END IF; RETURN prior; END IF;
SELECT * INTO c FROM public.companies WHERE id=(_payload->>'company_id')::uuid AND organization_id=(_payload->>'organization_id')::uuid FOR UPDATE;
IF c.id IS NULL OR NOT c.active THEN RAISE EXCEPTION 'EMPRESA_NAO_PRONTA'; END IF;
SELECT * INTO s FROM public.company_fiscal_settings WHERE company_id=c.id;
SELECT * INTO p FROM public.company_service_profiles WHERE id=(_payload->>'service_profile_id')::uuid AND company_id=c.id AND active;
IF s.company_id IS NULL OR p.id IS NULL THEN RAISE EXCEPTION 'EMPRESA_NAO_PRONTA'; END IF;
IF to_jsonb(s) IS DISTINCT FROM _payload->'fiscal_snapshot' OR to_jsonb(p) IS DISTINCT FROM _payload->'profile_snapshot' OR to_jsonb(c) IS DISTINCT FROM _payload->'provider_snapshot' THEN RAISE EXCEPTION 'CONFIGURACAO_ALTERADA'; END IF;
msg:=public.special_tax_rule_error(s.simples_nacional_option,s.simples_nacional_regime,s.special_tax_regime,p.iss_taxation); IF msg IS NOT NULL THEN RAISE EXCEPTION '%',msg; END IF;
IF _payload->'customer_snapshot'->>'documento'=c.cnpj THEN RAISE EXCEPTION 'O tomador não pode ser a própria empresa emitente'; END IF;
IF (_payload->'dps_input'->'service'->>'withholding')::integer=2 THEN
 IF coalesce(_payload->'customer_snapshot'->>'tipo','') NOT IN('pj','pf') OR NULLIF(_payload->'customer_snapshot'->>'documento','') IS NULL THEN RAISE EXCEPTION 'ISS retido pelo tomador exige CPF ou CNPJ identificado (E0204).'; END IF;
 IF NULLIF(_payload->'customer_snapshot'->'endereco'->>'cep','') IS NULL OR NULLIF(_payload->'customer_snapshot'->'endereco'->>'codigo_municipio','') IS NULL OR NULLIF(_payload->'customer_snapshot'->'endereco'->>'logradouro','') IS NULL OR NULLIF(_payload->'customer_snapshot'->'endereco'->>'numero','') IS NULL OR NULLIF(_payload->'customer_snapshot'->'endereco'->>'bairro','') IS NULL THEN RAISE EXCEPTION 'ISS retido pelo tomador exige endereço nacional completo (E0237).'; END IF;
END IF;
IF panel THEN
 IF integ IS NOT NULL OR NOT public.can_issue_fiscal_change(c.organization_id,(_payload->>'created_by')::uuid) THEN RAISE EXCEPTION 'Acesso não autorizado.'; END IF;
 PERFORM set_config('notem.invoice_panel','on',true);
ELSE
 PERFORM 1 FROM public.integrations WHERE id=integ AND organization_id=c.organization_id AND active AND created_by=(_payload->>'created_by')::uuid; IF NOT FOUND THEN RAISE EXCEPTION 'Acesso não autorizado.'; END IF; PERFORM set_config('notem.invoice_integration',integ::text,true);
END IF;
IF NULLIF(_payload->>'substitutes_invoice_id','') IS NOT NULL THEN
 SELECT * INTO orig FROM public.invoices WHERE id=(_payload->>'substitutes_invoice_id')::uuid AND organization_id=c.organization_id FOR UPDATE;
 IF orig.id IS NULL THEN RAISE EXCEPTION 'NAO_ENCONTRADO'; END IF;
 IF orig.company_id<>c.id THEN RAISE EXCEPTION 'A nota substituída deve ser da mesma empresa e do mesmo município emissor (E0042).'; END IF;
 IF orig.environment<>(_payload->>'environment')::public.environment THEN RAISE EXCEPTION 'A nota substituída deve ser do mesmo ambiente (E0065).'; END IF;
 IF orig.status<>'authorized' OR orig.access_key IS NULL OR orig.substituted_by_invoice_id IS NOT NULL THEN RAISE EXCEPTION 'CONFLITO_SITUACAO'; END IF;
 IF EXISTS(SELECT 1 FROM public.invoice_fiscal_events WHERE invoice_id=orig.id AND status IN ('sending','verifying')) THEN RAISE EXCEPTION 'CONFLITO_OPERACAO'; END IF;
 IF EXISTS(SELECT 1 FROM public.invoices WHERE substitutes_invoice_id=orig.id AND status IN ('processing','verifying')) THEN RAISE EXCEPTION 'CONFLITO_SUBSTITUICAO'; END IF;
 IF position(('<chSubstda>'||orig.access_key||'</chSubstda>') IN _payload->>'unsigned_dps_xml')=0 THEN RAISE EXCEPTION 'A nota substituída deve ser da mesma empresa e do mesmo município emissor (E0042).'; END IF;
END IF;
IF NULLIF(_payload->'unsigned_dps_file'->>'sha256','') IS NULL OR _payload->'unsigned_dps_file'->>'sha256'<>encode(extensions.digest(convert_to(_payload->>'unsigned_dps_xml','UTF8'),'sha256'),'hex') THEN RAISE EXCEPTION 'XML_ARQUIVO_INVALIDO'; END IF;
n:=public.reserve_dps_number(c.id,c.organization_id,s.dps_series,(_payload->>'environment')::public.environment,(_payload->>'created_by')::uuid);
did:='DPS'||c.municipality_ibge_code||'2'||c.cnpj||lpad(s.dps_series::text,5,'0')||lpad(n,15,'0');
INSERT INTO public.invoices(organization_id,company_id,integration_id,environment,external_id,dps_series,dps_number,dps_id,competence,customer_snapshot,provider_snapshot,fiscal_snapshot,service_snapshot,service_profile_id,description,complementary_information,sent_values,service_location,emitted_at,idempotency_key,request_hash,created_by,updated_by,substitutes_invoice_id,change_origin)
VALUES(c.organization_id,c.id,integ,(_payload->>'environment')::public.environment,_payload->>'external_id',s.dps_series,n::numeric,did,(_payload->>'competence')::date,NULLIF(_payload->'customer_snapshot','null'::jsonb),_payload->'provider_snapshot',_payload->'fiscal_snapshot',_payload->'service_snapshot',p.id,_payload->>'description',_payload->>'complementary_information',_payload->'sent_values',_payload->'service_location',(_payload->>'emitted_at')::timestamptz,_payload->>'idempotency_key',_payload->>'request_hash',(_payload->>'created_by')::uuid,(_payload->>'created_by')::uuid,orig.id,CASE WHEN panel THEN 'panel' ELSE 'api' END::public.change_origin) RETURNING * INTO inserted;
-- Base DPS (number 1 placeholder); the reserved id/number are applied when sending.
PERFORM public.put_xml_file('invoices',inserted.id,'unsigned_dps',_payload->'unsigned_dps_file');
INSERT INTO public.invoice_events(invoice_id,organization_id,type,details) VALUES(inserted.id,c.organization_id,'created',CASE WHEN orig.id IS NULL THEN '{}'::jsonb ELSE jsonb_build_object('mensagem','Nota substituta da NFS-e '||coalesce(orig.nfse_number,'')||'.','substitui_nota_id',orig.id) END);
IF orig.id IS NOT NULL THEN INSERT INTO public.invoice_events(invoice_id,organization_id,type,details) VALUES(orig.id,c.organization_id,'substitution_requested',jsonb_build_object('mensagem','Substituição solicitada; a nota segue autorizada até a nova ser autorizada.','nota_substituta_id',inserted.id)); END IF;
RETURN inserted;
END $function$;

CREATE OR REPLACE FUNCTION public.finish_invoice_attempt(_id uuid, _token uuid, _patch jsonb, _nota jsonb, _event text, _substituted_nota jsonb DEFAULT NULL)
 RETURNS public.invoices LANGUAGE plpgsql SET search_path TO '' AS $function$ DECLARE i public.invoices; o public.invoices; target uuid; evt text; envelope jsonb; BEGIN
SELECT * INTO i FROM public.invoices WHERE id=_id AND claim_token=_token AND lease_until>now() FOR UPDATE; IF i.id IS NULL THEN RETURN NULL; END IF;
UPDATE public.invoices SET status=coalesce(_patch->>'status',status),dispatch_state=coalesce(_patch->>'dispatch_state',dispatch_state),access_key=coalesce(_patch->>'access_key',access_key),nfse_number=coalesce(_patch->>'nfse_number',nfse_number),authorized_at=coalesce((_patch->>'authorized_at')::timestamptz,authorized_at),government_values=coalesce(_patch->'government_values',government_values),government_errors=coalesce(_patch->'government_errors',government_errors),verification_started_at=coalesce(verification_started_at,now()),next_verification_at=CASE WHEN _patch->>'status' IN('authorized','rejected') THEN NULL ELSE now()+interval '1 minute' END,claim_token=NULL,lease_until=NULL WHERE id=i.id RETURNING * INTO i;
PERFORM public.put_xml_file('invoices',i.id,'signed_dps',_patch->'files'->'signed_dps',true);
PERFORM public.put_xml_file('invoices',i.id,'authorized_nfse',_patch->'files'->'authorized_nfse');
IF i.status='authorized' AND NOT EXISTS(SELECT 1 FROM public.fiscal_xml_files WHERE owner_table='invoices' AND owner_id=i.id AND kind='authorized_nfse') THEN RAISE EXCEPTION 'XML_AUTORIZADO_AUSENTE'; END IF;
INSERT INTO public.invoice_events(invoice_id,organization_id,type,details) VALUES(i.id,i.organization_id,_event,jsonb_build_object('mensagem',_patch->>'message'));
IF i.status='authorized' AND i.substitutes_invoice_id IS NOT NULL THEN
 UPDATE public.invoices SET status='substituted',substituted_by_invoice_id=i.id,pending_operation=NULL WHERE id=i.substitutes_invoice_id AND organization_id=i.organization_id AND status='authorized' AND substituted_by_invoice_id IS NULL RETURNING * INTO o;
 IF o.id IS NOT NULL THEN INSERT INTO public.invoice_events(invoice_id,organization_id,type,details) VALUES(o.id,o.organization_id,'substituted',jsonb_build_object('mensagem','Nota substituída pela NFS-e '||coalesce(i.nfse_number,'')||'.','substituida_por_nota_id',i.id)); END IF;
END IF;
IF i.status IN('authorized','rejected') THEN
FOR target IN SELECT DISTINCT w.integration_id FROM public.webhook_endpoints w JOIN public.integrations g ON g.id=w.integration_id AND g.active WHERE w.organization_id=i.organization_id AND w.environment=i.environment AND w.active AND w.deleted_at IS NULL LOOP
 evt:='evt_'||replace(gen_random_uuid()::text,'-','');
 envelope:=jsonb_build_object('id',evt,'tipo','nota.'||CASE WHEN i.status='authorized' THEN 'autorizada' ELSE 'rejeitada' END,'criado_em',now(),'ambiente',CASE WHEN i.environment='sandbox' THEN 'homologacao' ELSE 'producao' END,'organizacao_id',i.organization_id,'integracao_id',target,'dados',_nota);
 PERFORM public.emit_webhook_event(evt,i.organization_id,target,i.environment,envelope->>'tipo',envelope::text,NULL,i.company_id);
 IF o.id IS NOT NULL AND _substituted_nota IS NOT NULL THEN
  evt:='evt_'||replace(gen_random_uuid()::text,'-','');
  envelope:=jsonb_build_object('id',evt,'tipo','nota.substituida','criado_em',now(),'ambiente',CASE WHEN i.environment='sandbox' THEN 'homologacao' ELSE 'producao' END,'organizacao_id',i.organization_id,'integracao_id',target,'dados',_substituted_nota);
  PERFORM public.emit_webhook_event(evt,i.organization_id,target,i.environment,'nota.substituida',envelope::text,NULL,i.company_id);
 END IF;
END LOOP; END IF; RETURN i;
END $function$;

DROP FUNCTION public.retry_external_dps(uuid,uuid,uuid,jsonb,text);
CREATE OR REPLACE FUNCTION public.retry_external_dps(_id uuid,_org uuid,_token uuid,_response jsonb,_files jsonb DEFAULT NULL) RETURNS public.invoices LANGUAGE plpgsql SET search_path='' AS $$ DECLARE i public.invoices; seq public.dps_sequences; next_n numeric; did text; previous_id text; previous_number numeric; att uuid; BEGIN
SELECT * INTO i FROM public.invoices WHERE id=_id AND organization_id=_org AND claim_token=_token AND lease_until>now() AND status='processing' AND dispatch_state='sending' FOR UPDATE;
IF i.id IS NULL THEN RETURN NULL; END IF;
IF (_response->>'status')::integer<>400 OR jsonb_array_length(coalesce(_response->'corpo_json'->'erros',_response->'corpo_json'->'Erros','[]'::jsonb))=0 OR EXISTS(SELECT 1 FROM jsonb_array_elements(coalesce(_response->'corpo_json'->'erros',_response->'corpo_json'->'Erros','[]'::jsonb)) e WHERE coalesce(e->>'codigo',e->>'Codigo','')<>'E0014') THEN RAISE EXCEPTION 'Explicit E0014 required'; END IF;
INSERT INTO public.invoice_dps_attempts(invoice_id,organization_id,series,number,dps_id,government_response,disposition) VALUES(i.id,i.organization_id,i.dps_series,i.dps_number,i.dps_id,_response,'used_externally') ON CONFLICT(invoice_id,dps_id) DO NOTHING RETURNING id INTO att;
IF att IS NULL THEN SELECT id INTO att FROM public.invoice_dps_attempts WHERE invoice_id=i.id AND dps_id=i.dps_id; END IF;
PERFORM public.put_xml_file('invoice_dps_attempts',att,'unsigned',_files->'unsigned');
PERFORM public.put_xml_file('invoice_dps_attempts',att,'signed',_files->'signed');
IF i.external_number_retries>=5 THEN RETURN i; END IF;
SELECT * INTO seq FROM public.dps_sequences WHERE company_id=i.company_id AND organization_id=i.organization_id AND series=i.dps_series AND environment=i.environment FOR UPDATE;
IF seq.company_id IS NULL OR seq.exhausted THEN RETURN i; END IF;
next_n:=seq.next_number;
UPDATE public.dps_sequences SET next_number=CASE WHEN next_n=999999999999999 THEN next_n ELSE next_n+1 END,exhausted=(next_n=999999999999999),updated_at=now() WHERE company_id=i.company_id AND series=i.dps_series AND environment=i.environment;
previous_id:=i.dps_id;previous_number:=i.dps_number;
did:=left(i.dps_id,30)||lpad(next_n::text,15,'0');
-- DPS has a 3-char prefix + municipality(7) + document type(1) + document(14) + series(5) = 30.
UPDATE public.invoices SET dps_number=next_n,dps_id=did,external_number_retries=external_number_retries+1,claim_token=NULL,lease_until=NULL,dispatch_state='not_sent',verification_started_at=NULL,next_verification_at=now(),updated_at=now() WHERE id=i.id RETURNING * INTO i;
DELETE FROM public.fiscal_xml_files WHERE owner_table='invoices' AND owner_id=i.id AND kind='signed_dps';
INSERT INTO public.invoice_events(invoice_id,organization_id,type,details) VALUES(i.id,i.organization_id,'external_number_skipped',jsonb_build_object('mensagem','DPS '||previous_number||' usada externamente (E0014). Reservada DPS '||next_n||'.','serie',i.dps_series,'numero_anterior',previous_number::text,'numero_novo',next_n::text,'codigo_governo','E0014','salto',i.external_number_retries));
RETURN i; END $$;
REVOKE ALL ON FUNCTION public.retry_external_dps(uuid,uuid,uuid,jsonb,jsonb) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.retry_external_dps(uuid,uuid,uuid,jsonb,jsonb) TO service_role;

CREATE OR REPLACE FUNCTION public.create_fiscal_event_request(_payload jsonb)
RETURNS jsonb LANGUAGE plpgsql SET search_path TO '' AS $$
DECLARE prior public.invoice_fiscal_events; i public.invoices; e public.invoice_fiscal_events; org uuid:=(_payload->>'organization_id')::uuid; env public.environment:=(_payload->>'environment')::public.environment; integ uuid:=NULLIF(_payload->>'integration_id','')::uuid; orig public.change_origin:=(_payload->>'origin')::public.change_origin; actor uuid:=(_payload->>'requested_by')::uuid; BEGIN
PERFORM pg_advisory_xact_lock(hashtextextended('evt:'||org||':'||env||':'||orig||':'||coalesce(integ::text,'-')||':'||(_payload->>'idempotency_key'),0));
SELECT * INTO prior FROM public.invoice_fiscal_events WHERE organization_id=org AND environment=env AND origin=orig AND integration_id IS NOT DISTINCT FROM integ AND idempotency_key=_payload->>'idempotency_key';
IF prior.id IS NOT NULL THEN
 IF prior.request_hash IS DISTINCT FROM _payload->>'request_hash' OR prior.invoice_id IS DISTINCT FROM (_payload->>'invoice_id')::uuid THEN RAISE EXCEPTION 'IDEMPOTENCIA_CONFLITO'; END IF;
 RETURN jsonb_build_object('created',false,'event',to_jsonb(prior));
END IF;
IF orig='panel' THEN IF NOT public.can_issue_fiscal_change(org,actor) THEN RAISE EXCEPTION 'SEM_PERMISSAO'; END IF;
ELSE PERFORM 1 FROM public.integrations WHERE id=integ AND organization_id=org AND active AND created_by=actor; IF NOT FOUND THEN RAISE EXCEPTION 'SEM_PERMISSAO'; END IF; END IF;
SELECT * INTO i FROM public.invoices WHERE id=(_payload->>'invoice_id')::uuid AND organization_id=org AND environment=env FOR UPDATE;
IF i.id IS NULL THEN RAISE EXCEPTION 'NAO_ENCONTRADO'; END IF;
IF i.status<>'authorized' OR i.access_key IS NULL THEN RAISE EXCEPTION 'CONFLITO_SITUACAO'; END IF;
IF EXISTS(SELECT 1 FROM public.invoice_fiscal_events WHERE invoice_id=i.id AND status IN ('sending','verifying')) THEN RAISE EXCEPTION 'CONFLITO_OPERACAO'; END IF;
IF EXISTS(SELECT 1 FROM public.invoices WHERE substitutes_invoice_id=i.id AND status IN ('processing','verifying')) THEN RAISE EXCEPTION 'CONFLITO_SUBSTITUICAO'; END IF;
IF _payload->>'request_id' IS DISTINCT FROM 'PRE'||i.access_key||(_payload->>'code') OR position(('<chNFSe>'||i.access_key||'</chNFSe>') IN _payload->>'unsigned_xml')=0 THEN RAISE EXCEPTION 'EVENTO_INVALIDO'; END IF;
IF NULLIF(_payload->'unsigned_file'->>'sha256','') IS NULL OR _payload->'unsigned_file'->>'sha256'<>encode(extensions.digest(convert_to(_payload->>'unsigned_xml','UTF8'),'sha256'),'hex') THEN RAISE EXCEPTION 'XML_ARQUIVO_INVALIDO'; END IF;
INSERT INTO public.invoice_fiscal_events(invoice_id,organization_id,company_id,environment,integration_id,origin,requested_by,code,reason,justification,idempotency_key,request_hash,request_id,status,claim_token,lease_until,verification_started_at,next_verification_at)
VALUES(i.id,org,i.company_id,env,integ,orig,actor,_payload->>'code',_payload->>'reason',_payload->>'justification',_payload->>'idempotency_key',_payload->>'request_hash',_payload->>'request_id','sending',gen_random_uuid(),now()+interval '60 seconds',now(),now()+interval '1 minute') RETURNING * INTO e;
PERFORM public.put_xml_file('invoice_fiscal_events',e.id,'unsigned',_payload->'unsigned_file');
INSERT INTO public.invoice_events(invoice_id,organization_id,type,details) VALUES(i.id,org,CASE WHEN e.code='101101' THEN 'cancellation_requested' ELSE 'analysis_requested' END,jsonb_build_object('mensagem',CASE WHEN e.code='101101' THEN 'Cancelamento solicitado ao governo.' ELSE 'Análise fiscal do cancelamento solicitada ao governo.' END,'motivo',e.reason,'evento_id',e.id));
RETURN jsonb_build_object('created',true,'event',to_jsonb(e));
END $$;

CREATE OR REPLACE FUNCTION public.finish_fiscal_event(_id uuid, _token uuid, _patch jsonb, _invoice jsonb, _nota jsonb, _timeline text, _message text, _webhook text DEFAULT NULL)
RETURNS public.invoice_fiscal_events LANGUAGE plpgsql SET search_path TO '' AS $$
DECLARE e public.invoice_fiscal_events; i public.invoices; prev text; next_status text; changed boolean:=false; target uuid; evt text; envelope jsonb; BEGIN
SELECT * INTO e FROM public.invoice_fiscal_events WHERE id=_id AND claim_token=_token AND lease_until>now() FOR UPDATE; IF e.id IS NULL THEN RETURN NULL; END IF;
prev:=e.status;
SELECT * INTO i FROM public.invoices WHERE id=e.invoice_id AND organization_id=e.organization_id FOR UPDATE;
IF (_patch->>'status') NOT IN ('not_sent','verifying','registered','rejected','not_registered') THEN RAISE EXCEPTION 'Estado de evento inválido'; END IF;
UPDATE public.invoice_fiscal_events SET status=_patch->>'status',government_response=coalesce(_patch->'government_response',government_response),government_errors=coalesce(_patch->'government_errors',government_errors),can_request_analysis=coalesce((_patch->>'can_request_analysis')::boolean,can_request_analysis),registered_outside=coalesce((_patch->>'registered_outside')::boolean,registered_outside),registered_at=CASE WHEN _patch->>'status'='registered' THEN coalesce((_patch->>'registered_at')::timestamptz,now()) ELSE registered_at END,next_verification_at=CASE WHEN _patch->>'status'='verifying' THEN now()+interval '1 minute' ELSE NULL END,claim_token=NULL,lease_until=NULL WHERE id=e.id RETURNING * INTO e;
PERFORM public.put_xml_file('invoice_fiscal_events',e.id,'signed',_patch->'files'->'signed',true);
PERFORM public.put_xml_file('invoice_fiscal_events',e.id,'event',_patch->'files'->'event');
IF e.status='registered' THEN
 IF i.status NOT IN ('authorized','cancellation_pending') THEN RAISE EXCEPTION 'CONFLITO_SITUACAO'; END IF;
 next_status:=CASE WHEN e.code='101101' THEN 'cancelled' ELSE 'cancellation_pending' END;
 changed:=i.status IS DISTINCT FROM next_status;
 UPDATE public.invoices SET status=next_status,pending_operation=NULL,cancellation=coalesce(_invoice->'cancellation',cancellation) WHERE id=i.id;
ELSIF e.status='verifying' THEN
 UPDATE public.invoices SET pending_operation=coalesce(_invoice->'pending_operation',pending_operation),cancellation=coalesce(_invoice->'cancellation',cancellation) WHERE id=i.id;
ELSE
 UPDATE public.invoices SET pending_operation=NULL,cancellation=coalesce(_invoice->'cancellation',cancellation) WHERE id=i.id;
END IF;
IF NOT (prev='verifying' AND e.status='verifying') THEN
 INSERT INTO public.invoice_events(invoice_id,organization_id,type,details) VALUES(i.id,i.organization_id,_timeline,jsonb_build_object('mensagem',_message,'evento_id',e.id,'codigo_evento',e.code));
END IF;
IF changed AND _webhook IN ('nota.cancelada','nota.cancelamento_em_analise') THEN
 FOR target IN SELECT DISTINCT w.integration_id FROM public.webhook_endpoints w JOIN public.integrations g ON g.id=w.integration_id AND g.active WHERE w.organization_id=i.organization_id AND w.environment=i.environment AND w.active AND w.deleted_at IS NULL LOOP
  evt:='evt_'||replace(gen_random_uuid()::text,'-','');
  envelope:=jsonb_build_object('id',evt,'tipo',_webhook,'criado_em',now(),'ambiente',CASE WHEN i.environment='sandbox' THEN 'homologacao' ELSE 'producao' END,'organizacao_id',i.organization_id,'integracao_id',target,'dados',_nota);
  PERFORM public.emit_webhook_event(evt,i.organization_id,target,i.environment,_webhook,envelope::text,NULL,i.company_id);
 END LOOP;
END IF;
RETURN e;
END $$;

CREATE OR REPLACE FUNCTION public.apply_nfse_event(_id uuid) RETURNS text LANGUAGE plpgsql SET search_path='' AS $$
DECLARE e public.nfse_document_events; d public.nfse_documents; i public.invoices; f public.invoice_fiscal_events;
  cur text; nxt text; outside boolean := true; msg text; wh text; reason text; restr jsonb; man jsonb; canc jsonb; changed boolean; canc_apply boolean; timeline text; sub uuid;
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
      UPDATE public.invoice_fiscal_events SET status='registered', registered_at=coalesce(e.processed_at,now()), claim_token=NULL, lease_until=NULL, next_verification_at=NULL WHERE id=f.id;
      INSERT INTO public.fiscal_xml_files(owner_table,owner_id,kind,path,size,stored_size,sha256)
        SELECT 'invoice_fiscal_events',f.id,'event',x.path,x.size,x.stored_size,x.sha256 FROM public.fiscal_xml_files x WHERE x.owner_table='nfse_document_events' AND x.owner_id=e.id AND x.kind='xml' ON CONFLICT DO NOTHING;
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
  -- The cancellation object changes only with the status or when confirming a notem request; late decisions never rewrite a final state.
  canc_apply := e.code IN ('101101','101103','105104','105105') AND (nxt IS DISTINCT FROM cur OR NOT outside);

  IF i.id IS NOT NULL THEN
    IF e.code='105102' AND nxt='substituted' AND e.substitute_key IS NOT NULL THEN
      SELECT s.id INTO sub FROM public.invoices s WHERE s.environment=i.environment AND s.organization_id=i.organization_id AND s.access_key=e.substitute_key LIMIT 1;
    END IF;
    UPDATE public.invoices SET status=nxt, restrictions=restr, manifestation=man,
      cancellation=CASE WHEN canc_apply THEN canc ELSE cancellation END,
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
      cancellation=CASE WHEN canc_apply THEN canc ELSE cancellation END,
      substituted_by_key=CASE WHEN e.code='105102' THEN coalesce(e.substitute_key, substituted_by_key) ELSE substituted_by_key END, updated_at=now()
    WHERE id=d.id;
  END IF;

  UPDATE public.nfse_document_events SET applied_at=now(), requested_by_notem=NOT outside, invoice_id=i.id,
    webhook_type=CASE WHEN i.id IS NOT NULL AND changed THEN wh ELSE NULL END WHERE id=e.id;
  RETURN CASE WHEN changed THEN 'changed' ELSE 'recorded' END;
END $$;

CREATE OR REPLACE FUNCTION public.store_nfse_document(_env public.environment, _d jsonb, _nsu bigint) RETURNS uuid LANGUAGE plpgsql SET search_path TO '' AS $function$
DECLARE inv public.invoices; doc uuid; ev uuid; BEGIN
  SELECT * INTO inv FROM public.invoices i WHERE i.environment=_env AND (i.access_key=_d->>'access_key' OR (_d->>'dps_id' IS NOT NULL AND i.dps_id=_d->>'dps_id'))
    ORDER BY (i.access_key IS NOT DISTINCT FROM _d->>'access_key') DESC LIMIT 1;
  INSERT INTO public.nfse_documents(environment,access_key,invoice_id,nfse_number,dps_id,dps_series,dps_number,competence,issued_at,authorized_at,provider_cnpj,provider_name,taker_document,taker_name,intermediary_document,intermediary_name,substitutes_key,summary,first_nsu)
  VALUES(_env,_d->>'access_key',inv.id,_d->>'nfse_number',_d->>'dps_id',_d->>'dps_series',_d->>'dps_number',(_d->>'competence')::date,(_d->>'issued_at')::timestamptz,(_d->>'authorized_at')::timestamptz,
    _d->>'provider_cnpj',_d->>'provider_name',_d->>'taker_document',_d->>'taker_name',_d->>'intermediary_document',_d->>'intermediary_name',_d->>'substitutes_key',coalesce(_d->'summary','{}'::jsonb),_nsu)
  ON CONFLICT (environment,access_key) DO UPDATE SET invoice_id=coalesce(public.nfse_documents.invoice_id, EXCLUDED.invoice_id), updated_at=now()
  RETURNING id INTO doc;
  IF _d ? 'xml_file' THEN
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
  INSERT INTO public.nfse_document_events(environment,access_key,code,sequence,adn_type,processed_at,event_at,author_document,reason_code,reason_text,substitute_key,source)
  VALUES(_env,_e->>'access_key',_e->>'code',coalesce((_e->>'sequence')::int,1),_e->>'adn_type',(_e->>'processed_at')::timestamptz,(_e->>'event_at')::timestamptz,_e->>'author_document',_e->>'reason_code',_e->>'reason_text',_e->>'substitute_key',_source)
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

-- 3) Copy/offload helpers are no longer needed.
DROP FUNCTION public.attach_xml_file(text,uuid,text,jsonb,boolean);
DROP FUNCTION public.xml_offload_candidates(integer);
DROP FUNCTION public.xml_column(text,text);

-- 4) Drop the XML columns (approved by the owner after the byte-by-byte report).
ALTER TABLE public.invoices DROP COLUMN unsigned_dps_xml, DROP COLUMN signed_dps_xml, DROP COLUMN authorized_nfse_xml;
ALTER TABLE public.invoice_dps_attempts DROP COLUMN unsigned_xml, DROP COLUMN signed_xml;
ALTER TABLE public.invoice_fiscal_events DROP COLUMN unsigned_xml, DROP COLUMN signed_xml, DROP COLUMN event_xml;
ALTER TABLE public.nfse_documents DROP COLUMN xml;
ALTER TABLE public.nfse_document_events DROP COLUMN xml;

-- 5) Manual synchronization permission, enforced in the database too: owner/admin of the organization or platform administrator,
--    and the CNPJ must belong to a company of that organization.
CREATE OR REPLACE FUNCTION public.can_request_adn_sync(_org uuid, _user uuid) RETURNS boolean LANGUAGE sql STABLE SET search_path='' AS $f$
  SELECT _org IS NOT NULL AND _user IS NOT NULL AND (EXISTS(SELECT 1 FROM public.platform_admins WHERE user_id=_user)
    OR EXISTS(SELECT 1 FROM public.organization_members WHERE organization_id=_org AND user_id=_user AND role IN ('owner','admin')))
$f$;
REVOKE ALL ON FUNCTION public.can_request_adn_sync(uuid,uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.can_request_adn_sync(uuid,uuid) TO service_role;

CREATE OR REPLACE FUNCTION public.request_adn_sync(_cnpj text, _env public.environment, _mode text, _months integer, _actor uuid, _org uuid) RETURNS jsonb LANGUAGE plpgsql SET search_path='' AS $$
DECLARE k public.adn_sync_cursors; req jsonb; target timestamptz; lo bigint; hi bigint; BEGIN
  IF _cnpj !~ '^[0-9]{14}$' OR _mode NOT IN ('news','period') OR (_mode='period' AND (_months IS NULL OR _months NOT IN (1,3,6,12,24))) THEN RAISE EXCEPTION 'ADN_PEDIDO_INVALIDO'; END IF;
  IF NOT public.can_request_adn_sync(_org,_actor) THEN RAISE EXCEPTION 'SEM_PERMISSAO'; END IF;
  IF NOT EXISTS (SELECT 1 FROM public.companies WHERE organization_id=_org AND regexp_replace(cnpj,'[^0-9]','','g')=_cnpj) THEN RAISE EXCEPTION 'SEM_PERMISSAO'; END IF;
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