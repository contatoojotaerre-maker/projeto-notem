DO $t$ DECLARE u uuid; o uuid:=gen_random_uuid(); c uuid:=gen_random_uuid(); m text; n text;
BEGIN SELECT user_id INTO u FROM public.platform_admins LIMIT 1;SELECT ibge_code INTO m FROM public.municipalities LIMIT 1;
BEGIN
PERFORM set_config('request.jwt.claims',jsonb_build_object('sub',u,'role','authenticated')::text,true);
INSERT INTO public.organizations(id,name,slug,type,created_by) VALUES(o,'Reservation validation','rv-'||substr(o::text,1,8),'company',u);
INSERT INTO public.companies(id,organization_id,cnpj,legal_name,municipality_ibge_code,state,created_by,updated_by) VALUES(c,o,'11222333000181','Reservation test',m,'',u,u);
INSERT INTO public.company_fiscal_settings(company_id,organization_id,cnpj,simples_nacional_option,approx_taxes_mode,created_by,updated_by) VALUES(c,o,'',1,'none',u,u);
n:=public.reserve_dps_number(c,o,1,'production',u);IF n<>'1' THEN RAISE EXCEPTION 'First reservation failed';END IF;
BEGIN RAISE EXCEPTION USING ERRCODE='ZX002',MESSAGE='Simulated future issuance failure';EXCEPTION WHEN SQLSTATE 'ZX002' THEN NULL;END;
n:=public.reserve_dps_number(c,o,1,'production',u);IF n<>'2' THEN RAISE EXCEPTION 'Number reused after future issuance failure';END IF;
BEGIN UPDATE public.dps_sequences SET next_number=1 WHERE company_id=c AND series=1 AND environment='production';RAISE EXCEPTION 'FAIL_reuse';EXCEPTION WHEN OTHERS THEN IF SQLERRM='FAIL_reuse' OR position('definitivo' IN SQLERRM)=0 THEN RAISE;END IF;END;
RAISE EXCEPTION USING ERRCODE='ZX001',MESSAGE='ROLLBACK_RESERVATION_SUCCESS';
EXCEPTION WHEN SQLSTATE 'ZX001' THEN RAISE NOTICE 'Definitive reservation assertions passed; temporary fixtures rolled back.';END;
END $t$;