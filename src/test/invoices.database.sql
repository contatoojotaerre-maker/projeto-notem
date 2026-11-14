-- Run via migration tool only. Every fixture write and counter increment rolls back.
DO $test$
DECLARE c public.companies; f public.company_fiscal_settings; p public.company_service_profiles; integ public.integrations;
 payload jsonb; n public.invoices; again public.invoices; lease public.invoices; old_number bigint; actual bigint; opt integer; tax integer;
BEGIN
 SELECT * INTO c FROM public.companies LIMIT 1;
 SELECT * INTO f FROM public.company_fiscal_settings WHERE company_id=c.id;
 SELECT * INTO integ FROM public.integrations WHERE organization_id=c.organization_id AND active LIMIT 1;
 IF f.company_id IS NULL OR integ.id IS NULL THEN RAISE EXCEPTION 'Invoice tests require a fiscal company/integration'; END IF;
 BEGIN
  PERFORM set_config('request.jwt.claims',jsonb_build_object('sub',integ.created_by,'role','service_role')::text,true);
  UPDATE public.company_fiscal_settings SET special_tax_regime=0,simples_nacional_option=3,simples_nacional_regime=2,approx_taxes_mode='percent_simples',approx_simples_percent=6,approx_federal_percent=NULL,approx_state_percent=NULL,approx_municipal_percent=NULL,simples_iss_withholding_percent=NULL WHERE company_id=c.id;
  INSERT INTO public.company_service_profiles(company_id,organization_id,name,active,service_code,default_description,iss_taxation,iss_withholding,created_by,updated_by)
  VALUES(c.id,c.organization_id,'Rollback-only invoice fixture',true,(SELECT code FROM public.service_codes ORDER BY code LIMIT 1),'Teste sem transmissão',1,1,integ.created_by,integ.created_by) RETURNING * INTO p;
  FOREACH opt IN ARRAY ARRAY[2,3] LOOP
   BEGIN
    UPDATE public.company_fiscal_settings SET simples_nacional_option=opt,simples_nacional_regime=CASE WHEN opt=3 THEN 1 ELSE NULL END,approx_taxes_mode=CASE WHEN opt=2 THEN 'none' ELSE 'percent_simples' END,approx_simples_percent=CASE WHEN opt=3 THEN 6 ELSE NULL END,special_tax_regime=9 WHERE company_id=c.id;
    RAISE EXCEPTION 'TEST_FAIL_special_accepted';
   EXCEPTION WHEN OTHERS THEN IF position(CASE WHEN opt=2 THEN 'E0174' ELSE 'E0175' END IN SQLERRM)=0 THEN RAISE; END IF; END;
  END LOOP;
  UPDATE public.company_fiscal_settings SET special_tax_regime=9 WHERE company_id=c.id;
  FOREACH tax IN ARRAY ARRAY[2,3,4] LOOP
   BEGIN
    UPDATE public.company_service_profiles SET iss_taxation=tax,immunity_type=CASE WHEN tax=2 THEN 0 ELSE NULL END WHERE id=p.id;
    RAISE EXCEPTION 'TEST_FAIL_E0172_accepted';
   EXCEPTION WHEN OTHERS THEN IF position('E0172' IN SQLERRM)=0 THEN RAISE; END IF; END;
  END LOOP;
  UPDATE public.company_fiscal_settings SET special_tax_regime=0 WHERE company_id=c.id;
  SELECT * INTO c FROM public.companies WHERE id=c.id;
  SELECT * INTO f FROM public.company_fiscal_settings WHERE company_id=c.id;
  SELECT * INTO p FROM public.company_service_profiles WHERE id=p.id;
  SELECT next_number INTO old_number FROM public.dps_sequences WHERE company_id=c.id AND environment='sandbox' AND series=f.dps_series;
  payload:=jsonb_build_object('organization_id',c.organization_id,'company_id',c.id,'integration_id',integ.id,'environment','sandbox','service_profile_id',p.id,'profile_snapshot',to_jsonb(p),'provider_snapshot',to_jsonb(c),'fiscal_snapshot',to_jsonb(f),'service_snapshot',to_jsonb(p),'customer_snapshot',NULL,'dps_input',jsonb_build_object('service',jsonb_build_object('withholding',2)),'competence',current_date,'description','Teste sem transmissão','sent_values',jsonb_build_object('servico','150.00'),'service_location',jsonb_build_object('codigo_municipio',c.municipality_ibge_code),'emitted_at',now(),'unsigned_dps_xml','<DPS><nDPS>1</nDPS></DPS>','placeholder_id','DPSPLACEHOLDER','idempotency_key','rollback-only-'||gen_random_uuid()::text,'request_hash','same','created_by',integ.created_by);
  BEGIN PERFORM public.create_invoice_request(payload); RAISE EXCEPTION 'TEST_FAIL_E0204_accepted'; EXCEPTION WHEN OTHERS THEN IF position('E0204' IN SQLERRM)=0 THEN RAISE; END IF; END;
  payload:=jsonb_set(payload,'{customer_snapshot}',jsonb_build_object('tipo','pj','documento','11444777000161','nome','Teste'));
  BEGIN PERFORM public.create_invoice_request(payload); RAISE EXCEPTION 'TEST_FAIL_E0237_accepted'; EXCEPTION WHEN OTHERS THEN IF position('E0237' IN SQLERRM)=0 THEN RAISE; END IF; END;
  payload:=jsonb_set(payload,'{customer_snapshot}',jsonb_build_object('tipo','pj','documento',c.cnpj,'nome','Teste'));
  BEGIN PERFORM public.create_invoice_request(payload); RAISE EXCEPTION 'TEST_FAIL_E0202_accepted'; EXCEPTION WHEN OTHERS THEN IF position('O tomador não pode ser a própria empresa emitente' IN SQLERRM)=0 THEN RAISE; END IF; END;
  SELECT next_number INTO actual FROM public.dps_sequences WHERE company_id=c.id AND environment='sandbox' AND series=f.dps_series;
  IF actual IS DISTINCT FROM old_number THEN RAISE EXCEPTION 'TEST_FAIL_number_before_validation'; END IF;
  payload:=jsonb_set(jsonb_set(payload,'{customer_snapshot}','null'::jsonb),'{dps_input,service,withholding}','1'::jsonb);
  n:=public.create_invoice_request(payload);again:=public.create_invoice_request(payload);
  IF n.id<>again.id OR n.dps_number<>old_number THEN RAISE EXCEPTION 'TEST_FAIL_idempotency'; END IF;
  BEGIN PERFORM public.create_invoice_request(jsonb_set(payload,'{request_hash}','"other"')); RAISE EXCEPTION 'TEST_FAIL_hash_conflict'; EXCEPTION WHEN OTHERS THEN IF position('IDEMPOTENCIA_CONFLITO' IN SQLERRM)=0 THEN RAISE; END IF; END;
  SELECT next_number INTO actual FROM public.dps_sequences WHERE company_id=c.id AND environment='sandbox' AND series=f.dps_series;
  IF actual<>old_number+1 THEN RAISE EXCEPTION 'TEST_FAIL_number_duplicate'; END IF;
  SELECT * INTO lease FROM public.claim_invoice_dispatch(n.id,c.organization_id);
  IF lease.claim_token IS NULL OR EXISTS(SELECT 1 FROM public.claim_invoice_dispatch(n.id,c.organization_id)) THEN RAISE EXCEPTION 'TEST_FAIL_lease'; END IF;
  PERFORM public.finish_invoice_attempt(n.id,lease.claim_token,'{"status":"verifying","dispatch_state":"uncertain"}'::jsonb,'{}'::jsonb,'verifying');
  IF (SELECT status FROM public.invoices WHERE id=n.id)<>'verifying' THEN RAISE EXCEPTION 'TEST_FAIL_verification'; END IF;
  IF EXISTS(SELECT 1 FROM public.invoices WHERE id=n.id AND organization_id=gen_random_uuid()) OR EXISTS(SELECT 1 FROM public.invoices WHERE id=n.id AND environment='production') THEN RAISE EXCEPTION 'TEST_FAIL_scope'; END IF;
  IF has_function_privilege('authenticated','public.create_invoice_request(jsonb)','EXECUTE') OR has_function_privilege('authenticated','public.finish_invoice_attempt(uuid,uuid,jsonb,jsonb,text,jsonb)','EXECUTE') OR has_table_privilege('authenticated','public.invoices','INSERT') THEN RAISE EXCEPTION 'TEST_FAIL_grants'; END IF;
  RAISE EXCEPTION USING ERRCODE='ZX001',MESSAGE='Invoice assertions passed; rollback';
 EXCEPTION WHEN SQLSTATE 'ZX001' THEN NULL; END;
 IF EXISTS(SELECT 1 FROM public.invoices WHERE id=n.id) OR EXISTS(SELECT 1 FROM public.company_service_profiles WHERE id=p.id) THEN RAISE EXCEPTION 'TEST_FAIL_rollback'; END IF;
END $test$;