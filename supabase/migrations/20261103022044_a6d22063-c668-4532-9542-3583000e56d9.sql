DO $test$ DECLARE u uuid; o uuid:=gen_random_uuid(); c uuid:=gen_random_uuid(); m text; failed boolean;
BEGIN
 SELECT user_id INTO u FROM public.platform_admins LIMIT 1; SELECT ibge_code INTO m FROM public.municipalities LIMIT 1;
 IF u IS NULL OR m IS NULL THEN RAISE EXCEPTION 'Missing test prerequisites'; END IF;
 BEGIN
 PERFORM set_config('request.jwt.claims',jsonb_build_object('sub',u,'role','authenticated')::text,true);
 INSERT INTO public.organizations(id,name,slug,type,created_by) VALUES(o,'Guided validation','gv-'||substr(o::text,1,8),'company',u);
 INSERT INTO public.companies(id,organization_id,cnpj,legal_name,municipality_ibge_code,state,created_by,updated_by) VALUES(c,o,'11222333000181','Guided validation',m,'',u,u);
 failed:=false;
 BEGIN INSERT INTO public.company_fiscal_settings(company_id,organization_id,cnpj,simples_nacional_option,approx_taxes_mode,created_by,updated_by) VALUES(c,o,'',1,'none',u,u); EXCEPTION WHEN OTHERS THEN IF position('E0713' IN SQLERRM)=0 THEN RAISE; END IF; failed:=true; END;
 IF NOT failed THEN RAISE EXCEPTION 'Non-optant none accepted'; END IF;
 INSERT INTO public.company_fiscal_settings(company_id,organization_id,cnpj,simples_nacional_option,approx_taxes_mode,approx_federal_percent,approx_state_percent,approx_municipal_percent,created_by,updated_by) VALUES(c,o,'',1,'percent_by_sphere',0,1,2,u,u);
 failed:=false; BEGIN UPDATE public.company_fiscal_settings SET simples_iss_withholding_percent=1.8 WHERE company_id=c; EXCEPTION WHEN OTHERS THEN IF position('ME/EPP' IN SQLERRM)=0 THEN RAISE; END IF;failed:=true; END; IF NOT failed THEN RAISE EXCEPTION 'Non-optant ISS rate accepted'; END IF;
 UPDATE public.company_fiscal_settings SET simples_nacional_option=3,simples_nacional_regime=1,simples_iss_withholding_percent=1.8 WHERE company_id=c;
 IF (SELECT simples_iss_withholding_percent FROM public.company_fiscal_settings WHERE company_id=c)<>1.8 THEN RAISE EXCEPTION '1.80 was not retained'; END IF;
 failed:=false; BEGIN UPDATE public.company_fiscal_settings SET simples_iss_withholding_percent=1.79 WHERE company_id=c; EXCEPTION WHEN OTHERS THEN IF position('1,80' IN SQLERRM)=0 THEN RAISE; END IF;failed:=true; END; IF NOT failed THEN RAISE EXCEPTION '1.79 accepted'; END IF;
 failed:=false; BEGIN UPDATE public.company_fiscal_settings SET simples_nacional_regime=2 WHERE company_id=c; EXCEPTION WHEN OTHERS THEN IF position('ME/EPP' IN SQLERRM)=0 THEN RAISE; END IF;failed:=true; END; IF NOT failed THEN RAISE EXCEPTION 'Regime 2 with rate accepted'; END IF;
 failed:=false; BEGIN UPDATE public.company_fiscal_settings SET simples_iss_withholding_percent=1.801 WHERE company_id=c; EXCEPTION WHEN OTHERS THEN IF position('casas decimais' IN SQLERRM)=0 THEN RAISE; END IF;failed:=true; END; IF NOT failed THEN RAISE EXCEPTION 'Extra precision accepted'; END IF;
 UPDATE public.company_fiscal_settings SET simples_iss_withholding_percent=null,approx_taxes_mode='none',approx_federal_percent=null,approx_state_percent=null,approx_municipal_percent=null WHERE company_id=c;
 RAISE EXCEPTION USING ERRCODE='ZX001',MESSAGE='ROLLBACK_GUIDED_TEST_SUCCESS';
 EXCEPTION WHEN SQLSTATE 'ZX001' THEN RAISE NOTICE 'Guided fiscal database rules passed; fixtures rolled back.'; END;
END $test$;