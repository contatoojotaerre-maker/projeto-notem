DO $$ DECLARE def text; BEGIN SELECT pg_get_functiondef('public.assign_company_dps_series()'::regprocedure) INTO def; IF position('generate_series(1,49999)' IN def)=0 THEN RAISE EXCEPTION 'Automatic series definition differs'; END IF; EXECUTE replace(def,'generate_series(1,49999)','generate_series(900,49999)'); END $$;
ALTER TABLE public.invoices ADD COLUMN external_number_retries integer NOT NULL DEFAULT 0 CHECK(external_number_retries BETWEEN 0 AND 5);
CREATE TABLE public.invoice_dps_attempts(id uuid PRIMARY KEY DEFAULT gen_random_uuid(),invoice_id uuid NOT NULL REFERENCES public.invoices(id),organization_id uuid NOT NULL REFERENCES public.organizations(id),series integer NOT NULL,number numeric(15,0) NOT NULL,dps_id text NOT NULL,unsigned_xml text NOT NULL,signed_xml text,government_response jsonb NOT NULL,disposition text NOT NULL CHECK(disposition='used_externally'),created_at timestamptz NOT NULL DEFAULT now(),updated_at timestamptz NOT NULL DEFAULT now(),UNIQUE(invoice_id,dps_id));
GRANT SELECT ON public.invoice_dps_attempts TO authenticated;
GRANT ALL ON public.invoice_dps_attempts TO service_role;
ALTER TABLE public.invoice_dps_attempts ENABLE ROW LEVEL SECURITY;
CREATE POLICY attempt_read ON public.invoice_dps_attempts FOR SELECT TO authenticated USING(public.is_org_member(organization_id) OR public.is_platform_admin());
CREATE FUNCTION public.retry_external_dps(_id uuid,_org uuid,_token uuid,_response jsonb,_signed text DEFAULT NULL) RETURNS public.invoices LANGUAGE plpgsql SET search_path='' AS $$ DECLARE i public.invoices; seq public.dps_sequences; next_n numeric; did text; previous_id text; previous_number numeric; BEGIN
SELECT * INTO i FROM public.invoices WHERE id=_id AND organization_id=_org AND claim_token=_token AND lease_until>now() AND status='processing' AND dispatch_state='sending' FOR UPDATE;
IF i.id IS NULL THEN RETURN NULL; END IF;
IF (_response->>'status')::integer<>400 OR jsonb_array_length(coalesce(_response->'corpo_json'->'erros',_response->'corpo_json'->'Erros','[]'::jsonb))=0 OR EXISTS(SELECT 1 FROM jsonb_array_elements(coalesce(_response->'corpo_json'->'erros',_response->'corpo_json'->'Erros','[]'::jsonb)) e WHERE coalesce(e->>'codigo',e->>'Codigo','')<>'E0014') THEN RAISE EXCEPTION 'Explicit E0014 required'; END IF;
INSERT INTO public.invoice_dps_attempts(invoice_id,organization_id,series,number,dps_id,unsigned_xml,signed_xml,government_response,disposition) VALUES(i.id,i.organization_id,i.dps_series,i.dps_number,i.dps_id,i.unsigned_dps_xml,_signed,_response,'used_externally') ON CONFLICT(invoice_id,dps_id) DO NOTHING;
IF i.external_number_retries>=5 THEN RETURN i; END IF;
SELECT * INTO seq FROM public.dps_sequences WHERE company_id=i.company_id AND organization_id=i.organization_id AND series=i.dps_series AND environment=i.environment FOR UPDATE;
IF seq.company_id IS NULL OR seq.exhausted THEN RETURN i; END IF;
next_n:=seq.next_number;
UPDATE public.dps_sequences SET next_number=CASE WHEN next_n=999999999999999 THEN next_n ELSE next_n+1 END,exhausted=(next_n=999999999999999),updated_at=now() WHERE company_id=i.company_id AND series=i.dps_series AND environment=i.environment;
previous_id:=i.dps_id;previous_number:=i.dps_number;
did:=left(i.dps_id,30)||lpad(next_n::text,15,'0');
-- DPS has a 3-char prefix + municipality(7) + document type(1) + document(14) + series(5) = 30.
UPDATE public.invoices SET dps_number=next_n,dps_id=did,unsigned_dps_xml=replace(replace(unsigned_dps_xml,previous_id,did),'<nDPS>'||previous_number::text||'</nDPS>','<nDPS>'||next_n::text||'</nDPS>'),signed_dps_xml=NULL,external_number_retries=external_number_retries+1,claim_token=NULL,lease_until=NULL,dispatch_state='not_sent',verification_started_at=NULL,next_verification_at=now(),updated_at=now() WHERE id=i.id RETURNING * INTO i;
INSERT INTO public.invoice_events(invoice_id,organization_id,type,details) VALUES(i.id,i.organization_id,'external_number_skipped',jsonb_build_object('mensagem','DPS '||previous_number||' usada externamente (E0014). Reservada DPS '||next_n||'.','serie',i.dps_series,'numero_anterior',previous_number::text,'numero_novo',next_n::text,'codigo_governo','E0014','salto',i.external_number_retries));
RETURN i; END $$;
REVOKE ALL ON FUNCTION public.retry_external_dps(uuid,uuid,uuid,jsonb,text) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.retry_external_dps(uuid,uuid,uuid,jsonb,text) TO service_role;
CREATE FUNCTION public.pending_external_dps(_limit integer DEFAULT 5) RETURNS SETOF public.invoices LANGUAGE sql SET search_path='' AS $$ SELECT * FROM public.invoices WHERE status='processing' AND dispatch_state='not_sent' AND external_number_retries>0 AND next_verification_at<=now() AND (lease_until IS NULL OR lease_until<now()) ORDER BY next_verification_at,id LIMIT least(greatest(_limit,1),5) $$;
REVOKE ALL ON FUNCTION public.pending_external_dps(integer) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.pending_external_dps(integer) TO service_role;