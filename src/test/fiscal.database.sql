-- Integration assertions use rollback-only fixtures, never real fiscal rows or numbers.
-- Run through the migration tool; any failed assertion aborts the validation.
DO $test$
DECLARE
 u uuid; org1 uuid:=gen_random_uuid(); org2 uuid:=gen_random_uuid(); c1 uuid:=gen_random_uuid(); c2 uuid:=gen_random_uuid();
 c3 uuid:=gen_random_uuid(); c4 uuid:=gen_random_uuid(); municipality text; n text; v integer;
BEGIN
 SELECT user_id INTO u FROM public.platform_admins LIMIT 1;
 SELECT ibge_code INTO municipality FROM public.municipalities LIMIT 1;
 IF u IS NULL OR municipality IS NULL THEN RAISE EXCEPTION 'Fiscal integration fixtures require existing platform admin and municipality.'; END IF;
 BEGIN
  PERFORM set_config('request.jwt.claims',jsonb_build_object('sub',u,'role','authenticated')::text,true);
  INSERT INTO public.organizations(id,name,slug,type,created_by) VALUES(org1,'Fiscal test','fiscal-test-'||substr(org1::text,1,8),'company',u),(org2,'Fiscal test other','fiscal-test-'||substr(org2::text,1,8),'company',u);
  INSERT INTO public.organization_members(organization_id,user_id,role) VALUES(org1,u,'owner'),(org2,u,'owner');
  INSERT INTO public.companies(id,organization_id,cnpj,legal_name,municipality_ibge_code,state,created_by,updated_by) VALUES
  (c1,org1,'11222333000181','Fiscal test',municipality,'',u,u),
  (c2,org2,'11222333000181','Fiscal other',municipality,'',u,u),
  (c3,org1,'11444777000161','Fiscal editable',municipality,'',u,u),
  (c4,org2,'11444777000161','Fiscal cert',municipality,'',u,u);
  UPDATE public.companies SET cnpj='19131243000197' WHERE id=c3;
  IF NOT EXISTS(SELECT 1 FROM public.companies WHERE id=c3 AND cnpj='19131243000197') THEN RAISE EXCEPTION 'CNPJ must be editable before certificate/series'; END IF;
  INSERT INTO public.company_fiscal_settings(company_id,organization_id,cnpj,simples_nacional_option,simples_nacional_regime,approx_taxes_mode,created_by,updated_by) VALUES(c1,org1,'',1,null,'none',u,u),(c2,org2,'',3,1,'none',u,u);
  SELECT dps_series INTO v FROM public.company_fiscal_settings WHERE company_id=c1;IF v<>1 THEN RAISE EXCEPTION 'First series must be 1'; END IF;
  SELECT dps_series INTO v FROM public.company_fiscal_settings WHERE company_id=c2;IF v<>2 THEN RAISE EXCEPTION 'Same CNPJ other organization must receive 2'; END IF;
  BEGIN UPDATE public.companies SET cnpj='19131243000197' WHERE id=c1; RAISE EXCEPTION 'TEST_FAIL_series_cnpj'; EXCEPTION WHEN OTHERS THEN IF SQLERRM='TEST_FAIL_series_cnpj' OR position('O CNPJ não pode ser alterado' IN SQLERRM)=0 THEN RAISE; END IF; END;
  INSERT INTO public.company_certificates(company_id,organization_id,holder,cnpj,issuer,serial_number,valid_from,valid_until,status,uploaded_by) VALUES(c4,org2,'Test','11444777000161','Test','0','2020-01-01','2021-01-01','replaced',u);
  BEGIN UPDATE public.companies SET cnpj='19131243000197' WHERE id=c4; RAISE EXCEPTION 'TEST_FAIL_history_cnpj'; EXCEPTION WHEN OTHERS THEN IF SQLERRM='TEST_FAIL_history_cnpj' OR position('O CNPJ não pode ser alterado' IN SQLERRM)=0 THEN RAISE; END IF; END;
  UPDATE public.company_certificates SET status='active' WHERE company_id=c4;
  BEGIN UPDATE public.companies SET cnpj='19131243000197' WHERE id=c4; RAISE EXCEPTION 'TEST_FAIL_active_cnpj'; EXCEPTION WHEN OTHERS THEN IF SQLERRM='TEST_FAIL_active_cnpj' OR position('O CNPJ não pode ser alterado' IN SQLERRM)=0 THEN RAISE; END IF; END;
  BEGIN UPDATE public.company_fiscal_settings SET simples_nacional_regime=1 WHERE company_id=c1; RAISE EXCEPTION 'TEST_FAIL_SN'; EXCEPTION WHEN check_violation THEN NULL; END;
  BEGIN UPDATE public.company_fiscal_settings SET simples_nacional_regime=null WHERE company_id=c2; RAISE EXCEPTION 'TEST_FAIL_SN3'; EXCEPTION WHEN check_violation THEN NULL; END;
  BEGIN UPDATE public.company_fiscal_settings SET approx_taxes_mode='percent_by_sphere',approx_federal_percent=0,approx_state_percent=100 WHERE company_id=c1; RAISE EXCEPTION 'TEST_FAIL_percent_required'; EXCEPTION WHEN check_violation THEN NULL; END;
  UPDATE public.company_fiscal_settings SET approx_taxes_mode='percent_by_sphere',approx_federal_percent=0,approx_state_percent=100,approx_municipal_percent=0 WHERE company_id=c1;
  BEGIN UPDATE public.company_fiscal_settings SET approx_federal_percent=101 WHERE company_id=c1; RAISE EXCEPTION 'TEST_FAIL_percent_range'; EXCEPTION WHEN check_violation THEN NULL; END;
  BEGIN UPDATE public.company_fiscal_settings SET dps_series=50000 WHERE company_id=c1; RAISE EXCEPTION 'TEST_FAIL_series_range'; EXCEPTION WHEN OTHERS THEN IF SQLERRM='TEST_FAIL_series_range' THEN RAISE; END IF; END;
  BEGIN UPDATE public.company_fiscal_settings SET dps_series=2 WHERE company_id=c1; RAISE EXCEPTION 'TEST_FAIL_series_unique'; EXCEPTION WHEN OTHERS THEN IF SQLERRM='TEST_FAIL_series_unique' OR position('já está reservada' IN SQLERRM)=0 THEN RAISE; END IF; END;
  UPDATE public.company_fiscal_settings SET dps_series=49999 WHERE company_id=c1;
  UPDATE public.company_fiscal_settings SET dps_series=1 WHERE company_id=c1;
  n:=public.reserve_dps_number(c1,org1,1,'production',u); IF n<>'1' THEN RAISE EXCEPTION 'First production reservation must be 1'; END IF;
  -- Failure in a separate future issuance transaction cannot undo the prior reservation.
  BEGIN
   RAISE EXCEPTION USING ERRCODE='ZX002',MESSAGE='Simulated future issuance failure';
  EXCEPTION WHEN SQLSTATE 'ZX002' THEN NULL;
  END;
  -- No issuance succeeds: the reserved number remains consumed and the next number must advance.
  n:=public.reserve_dps_number(c1,org1,1,'production',u); IF n<>'2' THEN RAISE EXCEPTION 'Definitive reservation without issuance must advance to 2'; END IF;
  n:=public.reserve_dps_number(c1,org1,1,'sandbox',u); IF n<>'1' THEN RAISE EXCEPTION 'Sandbox must independently start at 1'; END IF;
  UPDATE public.company_fiscal_settings SET dps_series=49999 WHERE company_id=c1;
  UPDATE public.company_fiscal_settings SET dps_series=1 WHERE company_id=c1;
  n:=public.reserve_dps_number(c1,org1,1,'production',u); IF n<>'3' THEN RAISE EXCEPTION 'Returning to series must preserve sequence'; END IF;
  BEGIN UPDATE public.dps_sequences SET next_number=1 WHERE company_id=c1 AND series=1 AND environment='production'; RAISE EXCEPTION 'TEST_FAIL_reuse'; EXCEPTION WHEN OTHERS THEN IF SQLERRM='TEST_FAIL_reuse' OR position('definitivo' IN SQLERRM)=0 THEN RAISE; END IF; END;
  UPDATE public.dps_sequences SET next_number=999999999999999 WHERE company_id=c1 AND series=1 AND environment='production';
  n:=public.reserve_dps_number(c1,org1,1,'production',u);IF n<>'999999999999999' THEN RAISE EXCEPTION 'Maximum reservation must be allowed'; END IF;
  BEGIN PERFORM public.reserve_dps_number(c1,org1,1,'production',u); RAISE EXCEPTION 'TEST_FAIL_exhaustion'; EXCEPTION WHEN OTHERS THEN IF SQLERRM='TEST_FAIL_exhaustion' OR position('esgotada' IN SQLERRM)=0 THEN RAISE; END IF; END;
  INSERT INTO public.service_codes(code,description,group_description) VALUES('999998','Ação fiscal de teste','Teste');
  SELECT count(*) INTO v FROM public.search_fiscal_catalog('service_codes','acao');IF v<>1 THEN RAISE EXCEPTION 'Accent-insensitive catalog search failed'; END IF;
  INSERT INTO public.company_service_profiles(company_id,organization_id,name,service_code,iss_taxation,immunity_type,created_by,updated_by) VALUES(c1,org1,'Test','999998',2,0,u,u);
  BEGIN UPDATE public.company_service_profiles SET immunity_type=null WHERE company_id=c1; RAISE EXCEPTION 'TEST_FAIL_immunity'; EXCEPTION WHEN check_violation THEN NULL; END;
  BEGIN INSERT INTO public.company_service_profiles(company_id,organization_id,name,service_code,created_by,updated_by) VALUES(c1,org1,'Invalid','999997',u,u); RAISE EXCEPTION 'TEST_FAIL_code_fk'; EXCEPTION WHEN foreign_key_violation THEN NULL; END;
  -- Simulate the existing user as each organization role inside this rollback-only subtransaction.
  DELETE FROM public.platform_admins WHERE user_id=u;
  SET LOCAL ROLE authenticated;
  UPDATE public.company_fiscal_settings SET special_tax_regime=9 WHERE company_id=c1;
  GET DIAGNOSTICS v=ROW_COUNT;IF v<>1 THEN RAISE EXCEPTION 'Owner must edit'; END IF;
  BEGIN UPDATE public.company_fiscal_settings SET dps_series=3 WHERE company_id=c1; RAISE EXCEPTION 'TEST_FAIL_owner_series'; EXCEPTION WHEN OTHERS THEN IF SQLERRM='TEST_FAIL_owner_series' OR position('Só o administrador' IN SQLERRM)=0 THEN RAISE; END IF; END;
  BEGIN UPDATE public.dps_sequences SET next_number=1 WHERE company_id=c1; RAISE EXCEPTION 'TEST_FAIL_counter_direct'; EXCEPTION WHEN insufficient_privilege THEN NULL; END;
  BEGIN PERFORM public.reserve_dps_number(c1,org1,1,'sandbox',u); RAISE EXCEPTION 'TEST_FAIL_rpc_direct'; EXCEPTION WHEN insufficient_privilege THEN NULL; END;
  RESET ROLE;
  UPDATE public.organization_members SET role='admin' WHERE organization_id=org1 AND user_id=u;
  SET LOCAL ROLE authenticated;
  UPDATE public.company_fiscal_settings SET special_tax_regime=0 WHERE company_id=c1;GET DIAGNOSTICS v=ROW_COUNT;IF v<>1 THEN RAISE EXCEPTION 'Admin must edit'; END IF;
  RESET ROLE;
  FOR n IN SELECT unnest(ARRAY['operator','viewer','developer']) LOOP
   UPDATE public.organization_members SET role=n::public.org_role WHERE organization_id=org1 AND user_id=u;
   SET LOCAL ROLE authenticated;
   SELECT count(*) INTO v FROM public.company_fiscal_settings WHERE company_id=c1;IF v<>1 THEN RAISE EXCEPTION 'Member must read'; END IF;
   UPDATE public.company_fiscal_settings SET special_tax_regime=9 WHERE company_id=c1;GET DIAGNOSTICS v=ROW_COUNT;IF v<>0 THEN RAISE EXCEPTION 'Read-only role must not edit'; END IF;
   UPDATE public.company_service_profiles SET active=false WHERE company_id=c1;GET DIAGNOSTICS v=ROW_COUNT;IF v<>0 THEN RAISE EXCEPTION 'Read-only role must not edit services'; END IF;
   RESET ROLE;
  END LOOP;
  DELETE FROM public.organization_members WHERE organization_id=org1 AND user_id=u;
  SET LOCAL ROLE authenticated;
  SELECT count(*) INTO v FROM public.company_fiscal_settings WHERE company_id=c1;IF v<>0 THEN RAISE EXCEPTION 'Other organization must not read fiscal settings'; END IF;
  SELECT count(*) INTO v FROM public.company_service_profiles WHERE company_id=c1;IF v<>0 THEN RAISE EXCEPTION 'Other organization must not read services'; END IF;
  RESET ROLE;
  SET LOCAL ROLE anon;
  BEGIN PERFORM count(*) FROM public.service_codes; RAISE EXCEPTION 'TEST_FAIL_anon'; EXCEPTION WHEN insufficient_privilege THEN NULL; END;
  RESET ROLE;
  RAISE EXCEPTION USING ERRCODE='ZX001',MESSAGE='ROLLBACK_FISCAL_TEST_SUCCESS';
 EXCEPTION WHEN SQLSTATE 'ZX001' THEN
  RAISE NOTICE 'Fiscal integration assertions passed; all test fixtures and reservations rolled back.';
 END;
END $test$;