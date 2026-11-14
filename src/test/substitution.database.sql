-- Run as a single rollback-only block (no data persists; the DPS counter is restored by the rollback).
-- Panel substitution: role check, E0042 key, cancelled original refused, one substitute at a time, original unchanged until authorized.
DO $test$
DECLARE t public.invoices; a public.invoices; c public.companies; s public.company_fiscal_settings; p public.company_service_profiles; owner uuid; payload jsonb; n public.invoices; again public.invoices; seq_before numeric;
BEGIN
 SELECT * INTO t FROM public.invoices WHERE status='authorized' AND access_key IS NOT NULL ORDER BY created_at LIMIT 1;
 SELECT * INTO c FROM public.companies WHERE id=t.company_id; SELECT * INTO s FROM public.company_fiscal_settings WHERE company_id=c.id; SELECT * INTO p FROM public.company_service_profiles WHERE company_id=c.id AND active ORDER BY created_at LIMIT 1;
 SELECT coalesce((SELECT user_id FROM public.organization_members WHERE organization_id=c.organization_id AND role IN ('owner','admin','operator') LIMIT 1),(SELECT user_id FROM public.platform_admins LIMIT 1)) INTO owner;
 IF p.id IS NULL OR owner IS NULL THEN RAISE EXCEPTION 'Substitution DB test requires an active service and a manager'; END IF;
 SELECT next_number INTO seq_before FROM public.dps_sequences WHERE company_id=c.id AND environment=t.environment AND series=s.dps_series;
 BEGIN
  a:=t; a.id:=gen_random_uuid(); a.dps_number:=999999999999990; a.dps_id:=left(t.dps_id,30)||lpad('999999999999990',15,'0'); a.access_key:=left(t.access_key,23)||'9999999999990'||right(t.access_key,14); a.external_id:=NULL; a.idempotency_key:=NULL; a.nfse_number:='T1';
  INSERT INTO public.invoices SELECT (a).*;
  payload:=jsonb_build_object('organization_id',c.organization_id,'company_id',c.id,'integration_id',NULL,'origin','panel','environment',t.environment,'service_profile_id',p.id,'profile_snapshot',to_jsonb(p),'provider_snapshot',to_jsonb(c),'fiscal_snapshot',to_jsonb(s),'service_snapshot',to_jsonb(p)||jsonb_build_object('withholding',1),'customer_snapshot',NULL,'dps_input',jsonb_build_object('service',jsonb_build_object('withholding',1)),'competence',t.competence,'description','Substituta de teste','sent_values',t.sent_values,'service_location',t.service_location,'emitted_at',now(),'unsigned_dps_xml','<infDPS Id="PLACEHOLDER"><nDPS>1</nDPS><subst><chSubstda>'||a.access_key||'</chSubstda></subst></infDPS>','placeholder_id','PLACEHOLDER','idempotency_key','db-sub-1','request_hash','h','created_by',gen_random_uuid(),'substitutes_invoice_id',a.id);
  BEGIN PERFORM public.create_invoice_request(payload); RAISE EXCEPTION 'TEST_FAIL_panel_permission'; EXCEPTION WHEN OTHERS THEN IF position('Acesso não autorizado' IN SQLERRM)=0 THEN RAISE; END IF; END;
  payload:=payload||jsonb_build_object('created_by',owner);
  BEGIN PERFORM public.create_invoice_request(payload||jsonb_build_object('unsigned_dps_xml','<infDPS Id="PLACEHOLDER"><nDPS>1</nDPS></infDPS>')); RAISE EXCEPTION 'TEST_FAIL_subst_key'; EXCEPTION WHEN OTHERS THEN IF position('E0042' IN SQLERRM)=0 THEN RAISE; END IF; END;
  UPDATE public.invoices SET status='cancelled' WHERE id=a.id;
  BEGIN PERFORM public.create_invoice_request(payload); RAISE EXCEPTION 'TEST_FAIL_cancelled_substituted'; EXCEPTION WHEN OTHERS THEN IF position('CONFLITO_SITUACAO' IN SQLERRM)=0 THEN RAISE; END IF; END;
  UPDATE public.invoices SET status='authorized' WHERE id=a.id;
  n:=public.create_invoice_request(payload);
  IF n.substitutes_invoice_id<>a.id OR n.change_origin<>'panel' OR n.integration_id IS NOT NULL OR position('<nDPS>'||n.dps_number||'</nDPS>' IN n.unsigned_dps_xml)=0 THEN RAISE EXCEPTION 'TEST_FAIL_substitute_row'; END IF;
  IF (SELECT status FROM public.invoices WHERE id=a.id)<>'authorized' THEN RAISE EXCEPTION 'TEST_FAIL_original_changed_early'; END IF;
  IF (SELECT count(*) FROM public.invoice_events WHERE invoice_id=a.id AND type='substitution_requested')<>1 THEN RAISE EXCEPTION 'TEST_FAIL_original_timeline'; END IF;
  again:=public.create_invoice_request(payload); IF again.id<>n.id THEN RAISE EXCEPTION 'TEST_FAIL_panel_replay'; END IF;
  BEGIN PERFORM public.create_invoice_request(payload||jsonb_build_object('idempotency_key','db-sub-2')); RAISE EXCEPTION 'TEST_FAIL_second_substitute'; EXCEPTION WHEN OTHERS THEN IF position('CONFLITO_SUBSTITUICAO' IN SQLERRM)=0 THEN RAISE; END IF; END;
  RAISE EXCEPTION USING ERRCODE='ZX001',MESSAGE='Substitution assertions passed; rollback';
 EXCEPTION WHEN SQLSTATE 'ZX001' THEN NULL; END;
 IF EXISTS(SELECT 1 FROM public.invoices WHERE id IN (a.id,n.id)) OR (SELECT next_number FROM public.dps_sequences WHERE company_id=c.id AND environment=t.environment AND series=s.dps_series) IS DISTINCT FROM seq_before THEN RAISE EXCEPTION 'TEST_FAIL_rollback'; END IF;
END $test$;
