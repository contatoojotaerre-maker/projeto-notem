DO $test$
DECLARE s public.company_fiscal_settings; opt integer; mode text; allowed boolean; expected text; actual text;
BEGIN
 SELECT * INTO s FROM public.company_fiscal_settings LIMIT 1;
 IF s.company_id IS NULL THEN RAISE EXCEPTION 'Matrix tests require one fiscal fixture'; END IF;
 BEGIN
  PERFORM set_config('request.jwt.claims',jsonb_build_object('sub',s.updated_by,'role','service_role')::text,true);
  FOREACH opt IN ARRAY ARRAY[1,2,3] LOOP
   FOREACH mode IN ARRAY ARRAY['percent_by_sphere','percent_simples','none'] LOOP
    allowed:=mode='percent_by_sphere' OR (opt=2 AND mode='none') OR (opt=3 AND mode='percent_simples');
    expected:=CASE WHEN opt=1 THEN 'E0713' WHEN opt=2 THEN 'E0710' ELSE 'E0712' END;
    BEGIN
     UPDATE public.company_fiscal_settings SET simples_nacional_option=opt,simples_nacional_regime=CASE WHEN opt=3 THEN 1 ELSE NULL END,
      approx_taxes_mode=mode,approx_simples_percent=CASE WHEN mode='percent_simples' THEN 6 ELSE NULL END,
      approx_federal_percent=CASE WHEN mode='percent_by_sphere' THEN 10 ELSE NULL END,
      approx_state_percent=CASE WHEN mode='percent_by_sphere' THEN 0 ELSE NULL END,
      approx_municipal_percent=CASE WHEN mode='percent_by_sphere' THEN 2 ELSE NULL END,simples_iss_withholding_percent=NULL WHERE company_id=s.company_id;
     IF NOT allowed THEN RAISE EXCEPTION 'TEST_FAIL_accepted_%_%',opt,mode; END IF;
    EXCEPTION WHEN OTHERS THEN
     IF allowed OR position(expected IN SQLERRM)=0 THEN RAISE; END IF;
    END;
   END LOOP;
  END LOOP;
  ALTER TABLE public.company_fiscal_settings DISABLE TRIGGER fiscal_settings_guided_validation;
  UPDATE public.company_fiscal_settings SET simples_nacional_option=3,simples_nacional_regime=1,approx_taxes_mode='none',approx_simples_percent=NULL,approx_federal_percent=NULL,approx_state_percent=NULL,approx_municipal_percent=NULL WHERE company_id=s.company_id;
  ALTER TABLE public.company_fiscal_settings ENABLE TRIGGER fiscal_settings_guided_validation;
  SELECT next_number::text INTO expected FROM public.dps_sequences WHERE company_id=s.company_id AND series=s.dps_series AND environment='sandbox';
  BEGIN
   PERFORM public.reserve_dps_number(s.company_id,s.organization_id,s.dps_series,'sandbox',s.updated_by);
   RAISE EXCEPTION 'TEST_FAIL_legacy_numbered';
  EXCEPTION WHEN OTHERS THEN IF position('E0712' IN SQLERRM)=0 THEN RAISE; END IF; END;
  SELECT next_number::text INTO actual FROM public.dps_sequences WHERE company_id=s.company_id AND series=s.dps_series AND environment='sandbox';
  IF actual IS DISTINCT FROM expected THEN RAISE EXCEPTION 'TEST_FAIL_number_consumed'; END IF;
  RAISE EXCEPTION USING ERRCODE='ZX001',MESSAGE='Matrix assertions passed; rollback fixture';
 EXCEPTION WHEN SQLSTATE 'ZX001' THEN NULL; END;
 IF (SELECT to_jsonb(f) FROM public.company_fiscal_settings f WHERE company_id=s.company_id) IS DISTINCT FROM to_jsonb(s) THEN RAISE EXCEPTION 'TEST_FAIL_legacy_rewritten'; END IF;
END $test$;