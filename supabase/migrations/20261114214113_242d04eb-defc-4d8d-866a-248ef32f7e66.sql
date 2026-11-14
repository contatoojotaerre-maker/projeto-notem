ALTER TABLE public.invoices ADD COLUMN pending_operation jsonb, ADD COLUMN cancellation jsonb;

CREATE TABLE public.invoice_fiscal_events(
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 invoice_id uuid NOT NULL,
 organization_id uuid NOT NULL,
 company_id uuid NOT NULL REFERENCES public.companies(id),
 environment public.environment NOT NULL,
 integration_id uuid REFERENCES public.integrations(id),
 origin public.change_origin NOT NULL,
 requested_by uuid NOT NULL REFERENCES public.profiles(id),
 code text NOT NULL CHECK (code IN ('101101','101103')),
 sequence integer NOT NULL DEFAULT 1 CHECK (sequence BETWEEN 1 AND 99),
 reason text NOT NULL CHECK (reason IN ('erro_emissao','servico_nao_prestado','outros')),
 justification text NOT NULL CHECK (char_length(justification) BETWEEN 15 AND 255),
 idempotency_key text NOT NULL CHECK (char_length(idempotency_key) BETWEEN 1 AND 100),
 request_hash text NOT NULL,
 request_id text NOT NULL CHECK (request_id ~ '^PRE[0-9]{56}$'),
 status text NOT NULL DEFAULT 'sending' CHECK (status IN ('not_sent','sending','verifying','registered','rejected','not_registered')),
 unsigned_xml text NOT NULL,
 signed_xml text,
 event_xml text,
 government_response jsonb,
 government_errors jsonb NOT NULL DEFAULT '[]'::jsonb,
 can_request_analysis boolean NOT NULL DEFAULT false,
 registered_outside boolean NOT NULL DEFAULT false,
 registered_at timestamptz,
 claim_token uuid,
 lease_until timestamptz,
 verification_started_at timestamptz,
 next_verification_at timestamptz,
 created_at timestamptz NOT NULL DEFAULT now(),
 updated_at timestamptz NOT NULL DEFAULT now(),
 FOREIGN KEY (invoice_id, organization_id) REFERENCES public.invoices(id, organization_id)
);
GRANT SELECT ON public.invoice_fiscal_events TO authenticated;
GRANT ALL ON public.invoice_fiscal_events TO service_role;
ALTER TABLE public.invoice_fiscal_events ENABLE ROW LEVEL SECURITY;
CREATE POLICY fiscal_event_read ON public.invoice_fiscal_events FOR SELECT TO authenticated USING (public.is_org_member(organization_id) OR public.is_platform_admin());
CREATE UNIQUE INDEX invoice_fiscal_events_request ON public.invoice_fiscal_events(organization_id, environment, origin, coalesce(integration_id,'00000000-0000-0000-0000-000000000000'::uuid), idempotency_key);
CREATE UNIQUE INDEX invoice_fiscal_events_active ON public.invoice_fiscal_events(invoice_id) WHERE status IN ('sending','verifying');
CREATE INDEX invoice_fiscal_events_due ON public.invoice_fiscal_events(next_verification_at) WHERE status IN ('sending','verifying');
CREATE INDEX invoice_fiscal_events_timeline ON public.invoice_fiscal_events(invoice_id, created_at, id);
CREATE TRIGGER invoice_fiscal_events_touch BEFORE UPDATE ON public.invoice_fiscal_events FOR EACH ROW EXECUTE FUNCTION public.touch_record();

-- Who may issue fiscal events or substitutions from the panel.
CREATE OR REPLACE FUNCTION public.can_issue_fiscal_change(_org uuid, _user uuid)
RETURNS boolean LANGUAGE sql STABLE SET search_path TO '' AS $$
 SELECT _user IS NOT NULL AND (EXISTS(SELECT 1 FROM public.platform_admins WHERE user_id=_user) OR EXISTS(SELECT 1 FROM public.organization_members WHERE organization_id=_org AND user_id=_user AND role IN ('owner','admin','operator')))
$$;
REVOKE EXECUTE ON FUNCTION public.can_issue_fiscal_change(uuid,uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.can_issue_fiscal_change(uuid,uuid) TO service_role;

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
INSERT INTO public.invoice_fiscal_events(invoice_id,organization_id,company_id,environment,integration_id,origin,requested_by,code,reason,justification,idempotency_key,request_hash,request_id,status,unsigned_xml,claim_token,lease_until,verification_started_at,next_verification_at)
VALUES(i.id,org,i.company_id,env,integ,orig,actor,_payload->>'code',_payload->>'reason',_payload->>'justification',_payload->>'idempotency_key',_payload->>'request_hash',_payload->>'request_id','sending',_payload->>'unsigned_xml',gen_random_uuid(),now()+interval '60 seconds',now(),now()+interval '1 minute') RETURNING * INTO e;
INSERT INTO public.invoice_events(invoice_id,organization_id,type,details) VALUES(i.id,org,CASE WHEN e.code='101101' THEN 'cancellation_requested' ELSE 'analysis_requested' END,jsonb_build_object('mensagem',CASE WHEN e.code='101101' THEN 'Cancelamento solicitado ao governo.' ELSE 'Análise fiscal do cancelamento solicitada ao governo.' END,'motivo',e.reason,'evento_id',e.id));
RETURN jsonb_build_object('created',true,'event',to_jsonb(e));
END $$;

-- Re-send only after a definite "not sent"; the same idempotency key reclaims it.
CREATE OR REPLACE FUNCTION public.claim_fiscal_event_dispatch(_id uuid, _org uuid)
RETURNS SETOF public.invoice_fiscal_events LANGUAGE plpgsql SET search_path TO '' AS $$ BEGIN
RETURN QUERY UPDATE public.invoice_fiscal_events e SET status='sending',claim_token=gen_random_uuid(),lease_until=now()+interval '60 seconds',verification_started_at=now(),next_verification_at=now()+interval '1 minute'
 WHERE e.id=_id AND e.organization_id=_org AND e.status='not_sent' AND (e.lease_until IS NULL OR e.lease_until<now())
 AND NOT EXISTS(SELECT 1 FROM public.invoice_fiscal_events o WHERE o.invoice_id=e.invoice_id AND o.id<>e.id AND o.status IN ('sending','verifying'))
 AND EXISTS(SELECT 1 FROM public.invoices i WHERE i.id=e.invoice_id AND i.status='authorized')
 RETURNING e.*;
END $$;

CREATE OR REPLACE FUNCTION public.claim_fiscal_event_verifications(_limit integer DEFAULT 5)
RETURNS SETOF public.invoice_fiscal_events LANGUAGE plpgsql SET search_path TO '' AS $$ BEGIN
RETURN QUERY WITH due AS(SELECT id FROM public.invoice_fiscal_events WHERE (status='verifying' AND next_verification_at<=now() AND (lease_until IS NULL OR lease_until<now())) OR (status='sending' AND lease_until<now()) ORDER BY next_verification_at,id FOR UPDATE SKIP LOCKED LIMIT least(greatest(_limit,1),5)),
 claimed AS(UPDATE public.invoice_fiscal_events e SET status='verifying',claim_token=gen_random_uuid(),lease_until=now()+interval '3 minutes',next_verification_at=now()+interval '1 minute' FROM due WHERE e.id=due.id RETURNING e.*),
 touched AS(UPDATE public.invoices i SET pending_operation=jsonb_build_object('tipo',CASE WHEN c.code='101101' THEN 'cancelamento' ELSE 'analise_cancelamento' END,'estado','em_verificacao','desde',c.created_at) FROM claimed c WHERE i.id=c.invoice_id AND i.pending_operation IS NULL RETURNING i.id)
 SELECT * FROM claimed;
END $$;

CREATE OR REPLACE FUNCTION public.finish_fiscal_event(_id uuid, _token uuid, _patch jsonb, _invoice jsonb, _nota jsonb, _timeline text, _message text, _webhook text DEFAULT NULL)
RETURNS public.invoice_fiscal_events LANGUAGE plpgsql SET search_path TO '' AS $$
DECLARE e public.invoice_fiscal_events; i public.invoices; next_status text; changed boolean:=false; target uuid; evt text; envelope jsonb; BEGIN
SELECT * INTO e FROM public.invoice_fiscal_events WHERE id=_id AND claim_token=_token AND lease_until>now() FOR UPDATE; IF e.id IS NULL THEN RETURN NULL; END IF;
SELECT * INTO i FROM public.invoices WHERE id=e.invoice_id AND organization_id=e.organization_id FOR UPDATE;
IF (_patch->>'status') NOT IN ('not_sent','verifying','registered','rejected','not_registered') THEN RAISE EXCEPTION 'Estado de evento inválido'; END IF;
UPDATE public.invoice_fiscal_events SET status=_patch->>'status',signed_xml=coalesce(_patch->>'signed_xml',signed_xml),event_xml=coalesce(_patch->>'event_xml',event_xml),government_response=coalesce(_patch->'government_response',government_response),government_errors=coalesce(_patch->'government_errors',government_errors),can_request_analysis=coalesce((_patch->>'can_request_analysis')::boolean,can_request_analysis),registered_outside=coalesce((_patch->>'registered_outside')::boolean,registered_outside),registered_at=CASE WHEN _patch->>'status'='registered' THEN coalesce((_patch->>'registered_at')::timestamptz,now()) ELSE registered_at END,next_verification_at=CASE WHEN _patch->>'status'='verifying' THEN now()+interval '1 minute' ELSE NULL END,claim_token=NULL,lease_until=NULL WHERE id=e.id RETURNING * INTO e;
IF e.status='registered' THEN
 IF i.status NOT IN ('authorized','cancellation_pending') THEN RAISE EXCEPTION 'CONFLITO_SITUACAO'; END IF;
 next_status:=CASE WHEN e.code='101101' THEN 'cancelled' ELSE 'cancellation_pending' END;
 changed:=i.status IS DISTINCT FROM next_status;
 UPDATE public.invoices SET status=next_status,pending_operation=NULL,cancellation=coalesce(_invoice->'cancellation',cancellation) WHERE id=i.id;
ELSIF e.status='verifying' THEN
 UPDATE public.invoices SET pending_operation=coalesce(_invoice->'pending_operation',pending_operation) WHERE id=i.id;
ELSE
 UPDATE public.invoices SET pending_operation=NULL,cancellation=coalesce(_invoice->'cancellation',cancellation) WHERE id=i.id;
END IF;
INSERT INTO public.invoice_events(invoice_id,organization_id,type,details) VALUES(i.id,i.organization_id,_timeline,jsonb_build_object('mensagem',_message,'evento_id',e.id,'codigo_evento',e.code));
IF changed AND _webhook IN ('nota.cancelada','nota.cancelamento_em_analise') THEN
 FOR target IN SELECT DISTINCT w.integration_id FROM public.webhook_endpoints w JOIN public.integrations g ON g.id=w.integration_id AND g.active WHERE w.organization_id=i.organization_id AND w.environment=i.environment AND w.active AND w.deleted_at IS NULL LOOP
  evt:='evt_'||replace(gen_random_uuid()::text,'-','');
  envelope:=jsonb_build_object('id',evt,'tipo',_webhook,'criado_em',now(),'ambiente',CASE WHEN i.environment='sandbox' THEN 'homologacao' ELSE 'producao' END,'organizacao_id',i.organization_id,'integracao_id',target,'dados',_nota);
  PERFORM public.emit_webhook_event(evt,i.organization_id,target,i.environment,_webhook,envelope::text,NULL,i.company_id);
 END LOOP;
END IF;
RETURN e;
END $$;

-- Panel substitutions by operators: the caller's role is verified in create_invoice_request.
CREATE OR REPLACE FUNCTION public.reserve_dps_number(_company_id uuid, _organization_id uuid, _series integer, _environment public.environment, _requested_by uuid)
 RETURNS text LANGUAGE plpgsql SET search_path TO '' AS $function$ DECLARE seq public.dps_sequences; reserved bigint; settings public.company_fiscal_settings; rule_error text; BEGIN
IF _requested_by IS NULL OR NOT(EXISTS(SELECT 1 FROM public.platform_admins WHERE user_id=_requested_by) OR EXISTS(SELECT 1 FROM public.organization_members WHERE organization_id=_organization_id AND user_id=_requested_by AND role IN('owner','admin')) OR (current_setting('notem.invoice_panel',true)='on' AND public.can_issue_fiscal_change(_organization_id,_requested_by)) OR (current_setting('notem.invoice_integration',true) IS NOT NULL AND EXISTS(SELECT 1 FROM public.integrations WHERE id::text=current_setting('notem.invoice_integration',true) AND organization_id=_organization_id AND active AND created_by=_requested_by))) THEN RAISE EXCEPTION 'Acesso não autorizado.'; END IF;
SELECT * INTO settings FROM public.company_fiscal_settings WHERE company_id=_company_id AND organization_id=_organization_id AND dps_series=_series FOR SHARE;
IF settings.company_id IS NULL THEN RAISE EXCEPTION 'Série DPS não atribuída a esta empresa.'; END IF;
rule_error:=public.approximate_tax_rule_error(settings.simples_nacional_option,settings.approx_taxes_mode); IF rule_error IS NOT NULL THEN RAISE EXCEPTION '%',rule_error; END IF;
rule_error:=public.special_tax_rule_error(settings.simples_nacional_option,settings.simples_nacional_regime,settings.special_tax_regime); IF rule_error IS NOT NULL THEN RAISE EXCEPTION '%',rule_error; END IF;
IF settings.special_tax_regime<>0 AND EXISTS(SELECT 1 FROM public.company_service_profiles WHERE company_id=_company_id AND active AND iss_taxation IN(2,3,4)) THEN RAISE EXCEPTION 'Para imunidade, exportação ou não incidência, o regime especial deve ser Nenhum (E0172).'; END IF;
SELECT * INTO seq FROM public.dps_sequences WHERE company_id=_company_id AND organization_id=_organization_id AND series=_series AND environment=_environment FOR UPDATE;
IF seq.company_id IS NULL OR seq.exhausted THEN RAISE EXCEPTION 'Numeração DPS indisponível ou esgotada.'; END IF;
reserved:=seq.next_number;
UPDATE public.dps_sequences SET next_number=CASE WHEN reserved=999999999999999 THEN reserved ELSE reserved+1 END,exhausted=(reserved=999999999999999),updated_at=now() WHERE company_id=_company_id AND series=_series AND environment=_environment;
RETURN reserved::text; END $function$;

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
n:=public.reserve_dps_number(c.id,c.organization_id,s.dps_series,(_payload->>'environment')::public.environment,(_payload->>'created_by')::uuid);
did:='DPS'||c.municipality_ibge_code||'2'||c.cnpj||lpad(s.dps_series::text,5,'0')||lpad(n,15,'0');
INSERT INTO public.invoices(organization_id,company_id,integration_id,environment,external_id,dps_series,dps_number,dps_id,competence,customer_snapshot,provider_snapshot,fiscal_snapshot,service_snapshot,service_profile_id,description,complementary_information,sent_values,service_location,emitted_at,unsigned_dps_xml,idempotency_key,request_hash,created_by,updated_by,substitutes_invoice_id,change_origin)
VALUES(c.organization_id,c.id,integ,(_payload->>'environment')::public.environment,_payload->>'external_id',s.dps_series,n::numeric,did,(_payload->>'competence')::date,NULLIF(_payload->'customer_snapshot','null'::jsonb),_payload->'provider_snapshot',_payload->'fiscal_snapshot',_payload->'service_snapshot',p.id,_payload->>'description',_payload->>'complementary_information',_payload->'sent_values',_payload->'service_location',(_payload->>'emitted_at')::timestamptz,replace(replace(_payload->>'unsigned_dps_xml',_payload->>'placeholder_id',did),'<nDPS>1</nDPS>','<nDPS>'||n||'</nDPS>'),_payload->>'idempotency_key',_payload->>'request_hash',(_payload->>'created_by')::uuid,(_payload->>'created_by')::uuid,orig.id,CASE WHEN panel THEN 'panel' ELSE 'api' END::public.change_origin) RETURNING * INTO inserted;
INSERT INTO public.invoice_events(invoice_id,organization_id,type,details) VALUES(inserted.id,c.organization_id,'created',CASE WHEN orig.id IS NULL THEN '{}'::jsonb ELSE jsonb_build_object('mensagem','Nota substituta da NFS-e '||coalesce(orig.nfse_number,'')||'.','substitui_nota_id',orig.id) END);
IF orig.id IS NOT NULL THEN INSERT INTO public.invoice_events(invoice_id,organization_id,type,details) VALUES(orig.id,c.organization_id,'substitution_requested',jsonb_build_object('mensagem','Substituição solicitada; a nota segue autorizada até a nova ser autorizada.','nota_substituta_id',inserted.id)); END IF;
RETURN inserted;
END $function$;

DROP FUNCTION public.finish_invoice_attempt(uuid,uuid,jsonb,jsonb,text);
CREATE FUNCTION public.finish_invoice_attempt(_id uuid, _token uuid, _patch jsonb, _nota jsonb, _event text, _substituted_nota jsonb DEFAULT NULL)
 RETURNS public.invoices LANGUAGE plpgsql SET search_path TO '' AS $function$ DECLARE i public.invoices; o public.invoices; target uuid; evt text; envelope jsonb; BEGIN
SELECT * INTO i FROM public.invoices WHERE id=_id AND claim_token=_token AND lease_until>now() FOR UPDATE; IF i.id IS NULL THEN RETURN NULL; END IF;
UPDATE public.invoices SET status=coalesce(_patch->>'status',status),dispatch_state=coalesce(_patch->>'dispatch_state',dispatch_state),signed_dps_xml=coalesce(_patch->>'signed_dps_xml',signed_dps_xml),authorized_nfse_xml=coalesce(_patch->>'authorized_nfse_xml',authorized_nfse_xml),access_key=coalesce(_patch->>'access_key',access_key),nfse_number=coalesce(_patch->>'nfse_number',nfse_number),authorized_at=coalesce((_patch->>'authorized_at')::timestamptz,authorized_at),government_values=coalesce(_patch->'government_values',government_values),government_errors=coalesce(_patch->'government_errors',government_errors),verification_started_at=coalesce(verification_started_at,now()),next_verification_at=CASE WHEN _patch->>'status' IN('authorized','rejected') THEN NULL ELSE now()+interval '1 minute' END,claim_token=NULL,lease_until=NULL WHERE id=i.id RETURNING * INTO i;
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

REVOKE EXECUTE ON FUNCTION public.create_fiscal_event_request(jsonb) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.claim_fiscal_event_dispatch(uuid,uuid) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.claim_fiscal_event_verifications(integer) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.finish_fiscal_event(uuid,uuid,jsonb,jsonb,jsonb,text,text,text) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.finish_invoice_attempt(uuid,uuid,jsonb,jsonb,text,jsonb) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.create_invoice_request(jsonb) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.reserve_dps_number(uuid,uuid,integer,public.environment,uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.create_fiscal_event_request(jsonb), public.claim_fiscal_event_dispatch(uuid,uuid), public.claim_fiscal_event_verifications(integer), public.finish_fiscal_event(uuid,uuid,jsonb,jsonb,jsonb,text,text,text), public.finish_invoice_attempt(uuid,uuid,jsonb,jsonb,text,jsonb), public.create_invoice_request(jsonb), public.reserve_dps_number(uuid,uuid,integer,public.environment,uuid) TO service_role;