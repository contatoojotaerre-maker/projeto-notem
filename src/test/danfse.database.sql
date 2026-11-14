DO $test$
DECLARE i public.invoices; initial public.invoices; lease public.invoices; f public.company_fiscal_settings; integ public.integrations; n integer; response jsonb:='{"status":400,"corpo_json":{"erros":[{"codigo":"E0014","descricao":"DPS existente"}]}}'; before_n numeric;
BEGIN
 IF position('generate_series(900,49999)' IN pg_get_functiondef('public.assign_company_dps_series()'::regprocedure))=0 THEN RAISE EXCEPTION 'TEST_FAIL_series_900'; END IF;
 IF has_function_privilege('authenticated','public.retry_external_dps(uuid,uuid,uuid,jsonb,text)','EXECUTE') OR has_table_privilege('authenticated','public.invoice_dps_attempts','INSERT') THEN RAISE EXCEPTION 'TEST_FAIL_grants'; END IF;
 BEGIN
 SELECT * INTO f FROM public.company_fiscal_settings LIMIT 1;
 SELECT * INTO integ FROM public.integrations WHERE organization_id=f.organization_id LIMIT 1;
 IF f.company_id IS NULL OR integ.id IS NULL THEN RAISE EXCEPTION 'Test requires fiscal settings and integration'; END IF;
 PERFORM set_config('request.jwt.claims',jsonb_build_object('sub',integ.created_by,'role','service_role')::text,true);
 SELECT next_number INTO before_n FROM public.dps_sequences WHERE company_id=f.company_id AND series=f.dps_series AND environment='sandbox';
 INSERT INTO public.invoices(organization_id,company_id,integration_id,environment,dps_series,dps_number,dps_id,competence,provider_snapshot,fiscal_snapshot,service_snapshot,description,sent_values,service_location,emitted_at,unsigned_dps_xml,idempotency_key,request_hash,created_by,updated_by)
 VALUES(f.organization_id,f.company_id,integ.id,'sandbox',f.dps_series,before_n-1,'DPS'||repeat('8',42),current_date,'{}','{}','{}','Rollback E2','{}','{}',now(),'<DPS><nDPS>'||(before_n-1)||'</nDPS></DPS>','e2-test-'||gen_random_uuid(),'test',integ.created_by,integ.created_by) RETURNING * INTO initial;
 UPDATE public.invoices SET status='processing',dispatch_state='not_sent',external_number_retries=0,claim_token=NULL,lease_until=NULL WHERE id=initial.id RETURNING * INTO i;
 SELECT next_number INTO before_n FROM public.dps_sequences WHERE company_id=i.company_id AND series=i.dps_series AND environment=i.environment;
 FOR n IN 1..6 LOOP
 SELECT * INTO lease FROM public.claim_invoice_dispatch(i.id,i.organization_id);
 IF lease.claim_token IS NULL THEN RAISE EXCEPTION 'TEST_FAIL_claim'; END IF;
 i:=public.retry_external_dps(i.id,i.organization_id,lease.claim_token,response,'signed-test');
 IF i.external_number_retries<>least(n,5) THEN RAISE EXCEPTION 'TEST_FAIL_retry_limit'; END IF;
 IF i.id<>initial.id OR i.idempotency_key IS DISTINCT FROM initial.idempotency_key THEN RAISE EXCEPTION 'TEST_FAIL_identity'; END IF;
 END LOOP;
 IF (SELECT count(*) FROM public.invoice_dps_attempts WHERE invoice_id=i.id)<>6 THEN RAISE EXCEPTION 'TEST_FAIL_attempt_history'; END IF;
 IF (SELECT next_number FROM public.dps_sequences WHERE company_id=i.company_id AND series=i.dps_series AND environment=i.environment)<>before_n+5 THEN RAISE EXCEPTION 'TEST_FAIL_definitive_numbers'; END IF;
 RAISE EXCEPTION USING ERRCODE='ZX002',MESSAGE='E2 assertions passed; rollback';
 EXCEPTION WHEN SQLSTATE 'ZX002' THEN NULL; END;
 IF EXISTS(SELECT 1 FROM public.invoice_dps_attempts WHERE invoice_id=initial.id AND signed_xml='signed-test') OR EXISTS(SELECT 1 FROM public.invoices WHERE id=initial.id) THEN RAISE EXCEPTION 'TEST_FAIL_rollback'; END IF;
END $test$;