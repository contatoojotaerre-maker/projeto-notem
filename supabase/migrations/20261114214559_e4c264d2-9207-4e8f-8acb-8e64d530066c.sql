CREATE OR REPLACE FUNCTION public.finish_fiscal_event(_id uuid, _token uuid, _patch jsonb, _invoice jsonb, _nota jsonb, _timeline text, _message text, _webhook text DEFAULT NULL)
RETURNS public.invoice_fiscal_events LANGUAGE plpgsql SET search_path TO '' AS $$
DECLARE e public.invoice_fiscal_events; i public.invoices; prev text; next_status text; changed boolean:=false; target uuid; evt text; envelope jsonb; BEGIN
SELECT * INTO e FROM public.invoice_fiscal_events WHERE id=_id AND claim_token=_token AND lease_until>now() FOR UPDATE; IF e.id IS NULL THEN RETURN NULL; END IF;
prev:=e.status;
SELECT * INTO i FROM public.invoices WHERE id=e.invoice_id AND organization_id=e.organization_id FOR UPDATE;
IF (_patch->>'status') NOT IN ('not_sent','verifying','registered','rejected','not_registered') THEN RAISE EXCEPTION 'Estado de evento inválido'; END IF;
UPDATE public.invoice_fiscal_events SET status=_patch->>'status',signed_xml=coalesce(_patch->>'signed_xml',signed_xml),event_xml=coalesce(_patch->>'event_xml',event_xml),government_response=coalesce(_patch->'government_response',government_response),government_errors=coalesce(_patch->'government_errors',government_errors),can_request_analysis=coalesce((_patch->>'can_request_analysis')::boolean,can_request_analysis),registered_outside=coalesce((_patch->>'registered_outside')::boolean,registered_outside),registered_at=CASE WHEN _patch->>'status'='registered' THEN coalesce((_patch->>'registered_at')::timestamptz,now()) ELSE registered_at END,next_verification_at=CASE WHEN _patch->>'status'='verifying' THEN now()+interval '1 minute' ELSE NULL END,claim_token=NULL,lease_until=NULL WHERE id=e.id RETURNING * INTO e;
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
REVOKE EXECUTE ON FUNCTION public.finish_fiscal_event(uuid,uuid,jsonb,jsonb,jsonb,text,text,text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.finish_fiscal_event(uuid,uuid,jsonb,jsonb,jsonb,text,text,text) TO service_role;