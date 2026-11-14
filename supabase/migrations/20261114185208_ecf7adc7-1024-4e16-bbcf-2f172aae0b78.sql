CREATE OR REPLACE FUNCTION public.special_tax_rule_error(_option integer,_regime integer,_special integer,_taxation integer DEFAULT 1) RETURNS text LANGUAGE sql IMMUTABLE SET search_path='' AS $$ SELECT CASE WHEN _special=0 THEN NULL WHEN _option=2 THEN 'Para MEI, o regime especial deve ser Nenhum (E0174).' WHEN _option=3 AND _regime=1 THEN 'Para ME/EPP com apuração dentro do Simples, o regime especial deve ser Nenhum (E0175).' WHEN _taxation IN (2,3,4) THEN 'Para imunidade, exportação ou não incidência, o regime especial deve ser Nenhum (E0172).' ELSE NULL END $$;
REVOKE ALL ON FUNCTION public.special_tax_rule_error(integer,integer,integer,integer) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.special_tax_rule_error(integer,integer,integer,integer) TO authenticated,service_role;
CREATE OR REPLACE FUNCTION public.guard_special_tax_settings() RETURNS trigger LANGUAGE plpgsql SET search_path='' AS $$ DECLARE msg text; BEGIN
IF TG_TABLE_NAME='company_fiscal_settings' THEN
 PERFORM 1 FROM public.companies WHERE id=NEW.company_id FOR UPDATE;
 msg:=public.special_tax_rule_error(NEW.simples_nacional_option,NEW.simples_nacional_regime,NEW.special_tax_regime);
 IF msg IS NULL AND NEW.special_tax_regime<>0 AND EXISTS(SELECT 1 FROM public.company_service_profiles WHERE company_id=NEW.company_id AND active AND iss_taxation IN(2,3,4)) THEN msg:=public.special_tax_rule_error(1,NULL,NEW.special_tax_regime,2); END IF;
ELSE
 PERFORM 1 FROM public.companies WHERE id=NEW.company_id FOR UPDATE;
 SELECT public.special_tax_rule_error(s.simples_nacional_option,s.simples_nacional_regime,s.special_tax_regime,NEW.iss_taxation) INTO msg FROM public.company_fiscal_settings s WHERE s.company_id=NEW.company_id AND NEW.active;
END IF;
IF msg IS NOT NULL THEN RAISE EXCEPTION '%',msg; END IF; RETURN NEW; END $$;
CREATE TRIGGER fiscal_special_tax_guard BEFORE INSERT OR UPDATE ON public.company_fiscal_settings FOR EACH ROW EXECUTE FUNCTION public.guard_special_tax_settings();
CREATE TRIGGER service_special_tax_guard BEFORE INSERT OR UPDATE ON public.company_service_profiles FOR EACH ROW EXECUTE FUNCTION public.guard_special_tax_settings();
REVOKE ALL ON FUNCTION public.guard_special_tax_settings() FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.guard_special_tax_settings() TO service_role;
CREATE OR REPLACE FUNCTION public.create_invoice_request(_payload jsonb) RETURNS public.invoices LANGUAGE plpgsql SET search_path='' AS $$ DECLARE prior public.invoices; c public.companies; s public.company_fiscal_settings; p public.company_service_profiles; n text; did text; msg text; inserted public.invoices; BEGIN
PERFORM pg_advisory_xact_lock(hashtextextended((_payload->>'integration_id')||':'||(_payload->>'environment')||':'||(_payload->>'idempotency_key'),0));
SELECT * INTO prior FROM public.invoices WHERE integration_id=(_payload->>'integration_id')::uuid AND environment=(_payload->>'environment')::public.environment AND idempotency_key=_payload->>'idempotency_key';
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
 IF _payload->'customer_snapshot'->>'tipo' NOT IN('pj','pf') OR NULLIF(_payload->'customer_snapshot'->>'documento','') IS NULL THEN RAISE EXCEPTION 'ISS retido pelo tomador exige CPF ou CNPJ identificado (E0204).'; END IF;
 IF NULLIF(_payload->'customer_snapshot'->'endereco'->>'cep','') IS NULL OR NULLIF(_payload->'customer_snapshot'->'endereco'->>'codigo_municipio','') IS NULL OR NULLIF(_payload->'customer_snapshot'->'endereco'->>'logradouro','') IS NULL OR NULLIF(_payload->'customer_snapshot'->'endereco'->>'numero','') IS NULL OR NULLIF(_payload->'customer_snapshot'->'endereco'->>'bairro','') IS NULL THEN RAISE EXCEPTION 'ISS retido pelo tomador exige endereço nacional completo (E0237).'; END IF;
END IF;
n:=public.reserve_dps_number(c.id,c.organization_id,s.dps_series,(_payload->>'environment')::public.environment,(_payload->>'created_by')::uuid);
did:='DPS'||c.municipality_ibge_code||'2'||c.cnpj||lpad(s.dps_series::text,5,'0')||lpad(n,15,'0');
INSERT INTO public.invoices(organization_id,company_id,integration_id,environment,external_id,dps_series,dps_number,dps_id,competence,customer_snapshot,provider_snapshot,fiscal_snapshot,service_snapshot,service_profile_id,description,complementary_information,sent_values,service_location,emitted_at,unsigned_dps_xml,idempotency_key,request_hash,created_by,updated_by)
VALUES(c.organization_id,c.id,(_payload->>'integration_id')::uuid,(_payload->>'environment')::public.environment,_payload->>'external_id',s.dps_series,n::numeric,did,(_payload->>'competence')::date,NULLIF(_payload->'customer_snapshot','null'::jsonb),_payload->'provider_snapshot',_payload->'fiscal_snapshot',_payload->'service_snapshot',p.id,_payload->>'description',_payload->>'complementary_information',_payload->'sent_values',_payload->'service_location',(_payload->>'emitted_at')::timestamptz,replace(replace(_payload->>'unsigned_dps_xml',_payload->>'placeholder_id',did),'<nDPS>1</nDPS>','<nDPS>'||n||'</nDPS>'),_payload->>'idempotency_key',_payload->>'request_hash',(_payload->>'created_by')::uuid,(_payload->>'created_by')::uuid) RETURNING * INTO inserted;
INSERT INTO public.invoice_events(invoice_id,organization_id,type) VALUES(inserted.id,c.organization_id,'created'); RETURN inserted;
END $$;
REVOKE ALL ON FUNCTION public.create_invoice_request(jsonb) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.create_invoice_request(jsonb) TO service_role;
CREATE OR REPLACE FUNCTION public.claim_invoice_dispatch(_id uuid,_org uuid) RETURNS SETOF public.invoices LANGUAGE plpgsql SET search_path='' AS $$ BEGIN
RETURN QUERY UPDATE public.invoices SET claim_token=gen_random_uuid(),lease_until=now()+interval '60 seconds',dispatch_state='sending',last_attempt_at=now(),verification_started_at=coalesce(verification_started_at,now()),next_verification_at=now()+interval '1 minute' WHERE id=_id AND organization_id=_org AND status='processing' AND dispatch_state='not_sent' AND (lease_until IS NULL OR lease_until<now()) RETURNING *;
END $$;
REVOKE ALL ON FUNCTION public.claim_invoice_dispatch(uuid,uuid) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.claim_invoice_dispatch(uuid,uuid) TO service_role;
CREATE OR REPLACE FUNCTION public.claim_invoice_verifications(_limit integer DEFAULT 5) RETURNS SETOF public.invoices LANGUAGE plpgsql SET search_path='' AS $$ BEGIN
RETURN QUERY WITH due AS(SELECT id FROM public.invoices WHERE (status='verifying' OR (status='processing' AND dispatch_state='sending')) AND next_verification_at<=now() AND (lease_until IS NULL OR lease_until<now()) ORDER BY next_verification_at,id FOR UPDATE SKIP LOCKED LIMIT least(greatest(_limit,1),5)) UPDATE public.invoices i SET status='verifying',dispatch_state='uncertain',claim_token=gen_random_uuid(),lease_until=now()+interval '3 minutes',next_verification_at=now()+interval '1 minute' FROM due WHERE i.id=due.id RETURNING i.*;
END $$;
REVOKE ALL ON FUNCTION public.claim_invoice_verifications(integer) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.claim_invoice_verifications(integer) TO service_role;
CREATE OR REPLACE FUNCTION public.finish_invoice_attempt(_id uuid,_token uuid,_patch jsonb,_nota jsonb,_event text) RETURNS public.invoices LANGUAGE plpgsql SET search_path='' AS $$ DECLARE i public.invoices; target uuid; evt text; envelope jsonb; BEGIN
SELECT * INTO i FROM public.invoices WHERE id=_id AND claim_token=_token AND lease_until>now() FOR UPDATE; IF i.id IS NULL THEN RETURN NULL; END IF;
UPDATE public.invoices SET status=coalesce(_patch->>'status',status),dispatch_state=coalesce(_patch->>'dispatch_state',dispatch_state),signed_dps_xml=coalesce(_patch->>'signed_dps_xml',signed_dps_xml),authorized_nfse_xml=coalesce(_patch->>'authorized_nfse_xml',authorized_nfse_xml),access_key=coalesce(_patch->>'access_key',access_key),nfse_number=coalesce(_patch->>'nfse_number',nfse_number),authorized_at=coalesce((_patch->>'authorized_at')::timestamptz,authorized_at),government_values=coalesce(_patch->'government_values',government_values),government_errors=coalesce(_patch->'government_errors',government_errors),verification_started_at=coalesce(verification_started_at,now()),next_verification_at=CASE WHEN _patch->>'status' IN('authorized','rejected') THEN NULL ELSE now()+interval '1 minute' END,claim_token=NULL,lease_until=NULL WHERE id=i.id RETURNING * INTO i;
INSERT INTO public.invoice_events(invoice_id,organization_id,type,details) VALUES(i.id,i.organization_id,_event,jsonb_build_object('mensagem',_patch->>'message'));
IF i.status IN('authorized','rejected') THEN
FOR target IN SELECT DISTINCT integration_id FROM public.webhook_endpoints WHERE organization_id=i.organization_id AND environment=i.environment AND active AND deleted_at IS NULL LOOP
 evt:='evt_'||replace(gen_random_uuid()::text,'-','');
 envelope:=jsonb_build_object('id',evt,'tipo','nota.'||CASE WHEN i.status='authorized' THEN 'autorizada' ELSE 'rejeitada' END,'criado_em',now(),'ambiente',CASE WHEN i.environment='sandbox' THEN 'homologacao' ELSE 'producao' END,'organizacao_id',i.organization_id,'integracao_id',target,'dados',_nota);
 PERFORM public.emit_webhook_event(evt,i.organization_id,target,i.environment,envelope->>'tipo',envelope::text,NULL,i.company_id);
END LOOP; END IF; RETURN i;
END $$;
REVOKE ALL ON FUNCTION public.finish_invoice_attempt(uuid,uuid,jsonb,jsonb,text) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.finish_invoice_attempt(uuid,uuid,jsonb,jsonb,text) TO service_role;