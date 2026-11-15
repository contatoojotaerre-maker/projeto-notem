-- IBS/CBS in the database (rollback-only fixtures; nothing persists, nothing is sent). Run through the migration tool.
-- Catalog counts, profile rule trigger (same messages as src/lib/ibscbs.ts), IBS/CBS regime defaults and the audited,
-- platform-admin-only fiscal dates.
DO $test$
DECLARE
 u uuid:=gen_random_uuid(); org uuid:=gen_random_uuid(); c uuid:=gen_random_uuid(); municipality text; v integer; reg integer; audits integer; msg text;
BEGIN
 SELECT count(*) INTO v FROM public.ibscbs_classifications; IF v<>73 THEN RAISE EXCEPTION 'TEST_FAIL_classifications %',v; END IF;
 SELECT count(*) INTO v FROM public.ibscbs_classifications WHERE requires_taxation; IF v<>43 THEN RAISE EXCEPTION 'TEST_FAIL_classifications_taxed %',v; END IF;
 SELECT count(*) INTO v FROM public.ibscbs_operation_indicators WHERE active; IF v<>28 THEN RAISE EXCEPTION 'TEST_FAIL_indicators_active %',v; END IF;
 IF (SELECT array_agg(code ORDER BY code) FROM public.ibscbs_operation_indicators WHERE NOT active)<>ARRAY['030103','030104','050103','050104','080101'] THEN RAISE EXCEPTION 'TEST_FAIL_indicators_inactive'; END IF;
 SELECT count(*) INTO v FROM public.ibscbs_service_correlations; IF v<>209 THEN RAISE EXCEPTION 'TEST_FAIL_correlations %',v; END IF;
 IF has_table_privilege('anon','public.ibscbs_classifications','SELECT') OR has_table_privilege('authenticated','public.ibscbs_classifications','INSERT') OR has_function_privilege('authenticated','public.set_fiscal_platform_setting(text,text,uuid)','EXECUTE') OR has_table_privilege('authenticated','public.platform_settings','SELECT') THEN RAISE EXCEPTION 'TEST_FAIL_grants'; END IF;
 SELECT ibge_code INTO municipality FROM public.municipalities LIMIT 1;
 BEGIN
  INSERT INTO auth.users(id,email,aud,role) VALUES(u,'ibscbs-'||u||'@example.invalid','authenticated','authenticated');
  INSERT INTO public.profiles(id,display_name) VALUES(u,'Teste') ON CONFLICT (id) DO NOTHING;
  PERFORM set_config('request.jwt.claims',jsonb_build_object('sub',u,'role','authenticated')::text,true);
  INSERT INTO public.organizations(id,name,slug,type,created_by) VALUES(org,'IBS teste','x','company',u);
  INSERT INTO public.organization_members(organization_id,user_id,role) VALUES(org,u,'owner');
  INSERT INTO public.companies(id,organization_id,cnpj,legal_name,municipality_ibge_code,state,created_by,updated_by) VALUES(c,org,'11222333000181','Empresa IBS',municipality,'',u,u);
  -- Regime: default follows the ISS regime (1 → 1, 2 → 2); invalid pairs are refused; changing only the ISS regime resets it.
  INSERT INTO public.company_fiscal_settings(company_id,organization_id,cnpj,simples_nacional_option,simples_nacional_regime,special_tax_regime,approx_taxes_mode,approx_simples_percent,created_by,updated_by) VALUES(c,org,'',3,1,0,'percent_simples',6,u,u);
  SELECT ibscbs_simples_regime INTO reg FROM public.company_fiscal_settings WHERE company_id=c; IF reg<>1 THEN RAISE EXCEPTION 'TEST_FAIL_regime_default %',reg; END IF;
  BEGIN UPDATE public.company_fiscal_settings SET ibscbs_simples_regime=2 WHERE company_id=c; RAISE EXCEPTION 'TEST_FAIL_regime_invalid'; EXCEPTION WHEN OTHERS THEN IF SQLERRM NOT LIKE 'O regime de apuração do IBS/CBS%' THEN RAISE; END IF; END;
  UPDATE public.company_fiscal_settings SET simples_nacional_regime=2 WHERE company_id=c;
  SELECT ibscbs_simples_regime INTO reg FROM public.company_fiscal_settings WHERE company_id=c; IF reg<>2 THEN RAISE EXCEPTION 'TEST_FAIL_regime_follow %',reg; END IF;
  UPDATE public.company_fiscal_settings SET ibscbs_simples_regime=3 WHERE company_id=c;
  UPDATE public.company_fiscal_settings SET simples_nacional_option=1,simples_nacional_regime=NULL,approx_taxes_mode='percent_by_sphere',approx_simples_percent=NULL,approx_federal_percent=1,approx_state_percent=0,approx_municipal_percent=0 WHERE company_id=c;
  SELECT ibscbs_simples_regime INTO reg FROM public.company_fiscal_settings WHERE company_id=c; IF reg IS NOT NULL THEN RAISE EXCEPTION 'TEST_FAIL_regime_not_simples'; END IF;
  -- Service profile rules (one per approved rule) and the retired indicator.
  FOR msg IN SELECT unnest(ARRAY[
    '160101|000001|100501|09|A atividade 10 do Simples',
    '990301|000001|100501||Serviços dos subitens 99.03',
    '250501|000001|100501||Serviços dos subitens 25.05',
    '010501|000001|||Informe o indicador de operação',
    '010501|410999|100501||Não informe o indicador de operação',
    '010501|410003|||Doações',
    '010501|000001|030103||Este indicador de operação foi retirado'])
  LOOP
   BEGIN
    INSERT INTO public.company_service_profiles(company_id,organization_id,name,service_code,iss_taxation,iss_withholding,ibscbs_classification,ibscbs_operation_indicator,simples_activity_code,created_by,updated_by)
    VALUES(c,org,'S',split_part(msg,'|',1),1,1,nullif(split_part(msg,'|',2),''),nullif(split_part(msg,'|',3),''),nullif(split_part(msg,'|',4),''),u,u);
    RAISE EXCEPTION 'TEST_FAIL_profile_accepted %',msg;
   EXCEPTION WHEN OTHERS THEN IF position(split_part(msg,'|',5) IN SQLERRM)<>1 THEN RAISE EXCEPTION 'TEST_FAIL_profile % -> %',msg,SQLERRM; END IF; END;
  END LOOP;
  INSERT INTO public.company_service_profiles(company_id,organization_id,name,service_code,nbs_code,iss_taxation,iss_withholding,ibscbs_classification,ibscbs_operation_indicator,created_by,updated_by) VALUES(c,org,'Ok','010501','111032100',1,1,'000001','100501',u,u);
  -- Platform dates: only platform admins (the function checks the actor) and every change is audited.
  BEGIN PERFORM public.set_fiscal_platform_setting('ibscbs_required_sandbox_from','2026-12-01',u); RAISE EXCEPTION 'TEST_FAIL_setting_non_admin'; EXCEPTION WHEN OTHERS THEN IF SQLERRM<>'SEM_PERMISSAO' THEN RAISE; END IF; END;
  INSERT INTO public.platform_admins(user_id) VALUES(u);
  SELECT count(*) INTO audits FROM public.admin_audit_events WHERE action='fiscal.configuracao_plataforma_alterada';
  PERFORM public.set_fiscal_platform_setting('ibscbs_required_sandbox_from','2026-12-01',u);
  IF (SELECT ibscbs_required_sandbox_from FROM public.platform_settings WHERE id)<>'2026-12-01' OR (SELECT ibscbs_required_production_from FROM public.platform_settings WHERE id)<>'2027-01-01' THEN RAISE EXCEPTION 'TEST_FAIL_setting_value'; END IF;
  PERFORM public.set_fiscal_platform_setting('nt009r2_production_starts_at','',u);
  IF (SELECT nt009r2_production_starts_at FROM public.platform_settings WHERE id) IS NOT NULL THEN RAISE EXCEPTION 'TEST_FAIL_r2_off'; END IF;
  BEGIN PERFORM public.set_fiscal_platform_setting('ibscbs_required_sandbox_from','2040-01-01',u); RAISE EXCEPTION 'TEST_FAIL_setting_range'; EXCEPTION WHEN OTHERS THEN IF SQLERRM<>'DATA_INVALIDA' THEN RAISE; END IF; END;
  IF (SELECT count(*) FROM public.admin_audit_events WHERE action='fiscal.configuracao_plataforma_alterada')<>audits+2 THEN RAISE EXCEPTION 'TEST_FAIL_audit'; END IF;
  RAISE EXCEPTION USING ERRCODE='ZX001', MESSAGE='ibscbs assertions passed; rollback';
 EXCEPTION WHEN SQLSTATE 'ZX001' THEN NULL; END;
 IF EXISTS (SELECT 1 FROM auth.users WHERE email LIKE 'ibscbs-%@example.invalid') OR (SELECT ibscbs_required_sandbox_from FROM public.platform_settings WHERE id)<>'2027-01-01' THEN RAISE EXCEPTION 'TEST_FAIL_rollback'; END IF;
 RAISE NOTICE 'IBSCBS_DB_TESTS_OK';
END $test$;
