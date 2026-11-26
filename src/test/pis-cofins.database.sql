-- All fixtures are rolled back; no existing company is configured, no certificate or issuance is used.
DO $test$
DECLARE
  actor uuid; org uuid := gen_random_uuid(); other_org uuid := gen_random_uuid(); company uuid := gen_random_uuid(); municipality text;
  invalid jsonb; constraint_name text; attempts integer := 0; member_role text; row_count integer; role_checks integer := 0;
BEGIN
  SELECT user_id INTO actor FROM public.platform_admins LIMIT 1;
  SELECT ibge_code INTO municipality FROM public.municipalities LIMIT 1;
  IF actor IS NULL OR municipality IS NULL THEN RAISE EXCEPTION 'PIS_COFINS_TEST_REQUIRES_FIXTURES'; END IF;
  BEGIN
    PERFORM set_config('request.jwt.claims',jsonb_build_object('sub',actor,'role','authenticated')::text,true);
    INSERT INTO public.organizations(id,name,type,created_by) VALUES(org,'Teste PIS COFINS rollback','company',actor);
    INSERT INTO public.organization_members(organization_id,user_id,role) VALUES(org,actor,'owner');
    INSERT INTO public.companies(id,organization_id,cnpj,legal_name,municipality_ibge_code,state,created_by,updated_by)
      VALUES(company,org,'11222333000181','Teste PIS COFINS rollback',municipality,'',actor,actor);
    INSERT INTO public.company_fiscal_settings(company_id,organization_id,cnpj,simples_nacional_option,simples_nacional_regime,special_tax_regime,approx_taxes_mode,approx_simples_percent,created_by,updated_by)
      VALUES(company,org,'',3,3,0,'percent_simples',8.30,actor,actor);
    IF NOT EXISTS(SELECT FROM public.company_fiscal_settings WHERE company_id=company AND pis_cofins_cst IS NULL AND pis_cofins_withholding_type IS NULL)
      THEN RAISE EXCEPTION 'PIS_COFINS_MUST_START_UNCONFIGURED'; END IF;
    UPDATE public.company_fiscal_settings SET pis_cofins_cst='99',pis_cofins_withholding_type='0' WHERE company_id=company;
    IF NOT EXISTS(SELECT FROM public.company_fiscal_settings WHERE company_id=company AND pis_cofins_cst='99' AND pis_cofins_withholding_type='0')
      THEN RAISE EXCEPTION 'PIS_COFINS_99_0_NOT_SAVED'; END IF;
    FOR invalid IN SELECT value FROM jsonb_array_elements('[{"cst":"00","ret":"0"},{"cst":"01","ret":"0"},{"cst":"99","ret":"1"},{"cst":"99","ret":"2"},{"cst":"99","ret":"3"},{"cst":"99","ret":"4"},{"cst":"99","ret":"5"},{"cst":"99","ret":"6"},{"cst":"99","ret":"7"},{"cst":"99","ret":"8"},{"cst":"99","ret":"9"},{"cst":"99","ret":null},{"cst":null,"ret":"0"},{"cst":"","ret":""}]'::jsonb)
    LOOP
      BEGIN
        UPDATE public.company_fiscal_settings SET pis_cofins_cst=invalid->>'cst',pis_cofins_withholding_type=invalid->>'ret' WHERE company_id=company;
        RAISE EXCEPTION 'PIS_COFINS_INVALID_PAIR_ACCEPTED %',invalid;
      EXCEPTION WHEN check_violation THEN
        GET STACKED DIAGNOSTICS constraint_name=CONSTRAINT_NAME;
        IF constraint_name<>'company_fiscal_settings_pis_cofins_check' THEN RAISE; END IF;
        attempts:=attempts+1;
      END;
    END LOOP;
    IF attempts<>14 THEN RAISE EXCEPTION 'PIS_COFINS_INVALID_PAIR_CHECKS_MISSING'; END IF;
    UPDATE public.company_fiscal_settings SET pis_cofins_cst=null,pis_cofins_withholding_type=null WHERE company_id=company;
    IF NOT EXISTS(SELECT FROM public.company_fiscal_settings WHERE company_id=company AND pis_cofins_cst IS NULL AND pis_cofins_withholding_type IS NULL)
      THEN RAISE EXCEPTION 'PIS_COFINS_PAIR_NOT_REMOVED'; END IF;
    -- Existing identity is simulated as each role only inside this rollback-only subtransaction.
    UPDATE public.company_fiscal_settings SET pis_cofins_cst='99',pis_cofins_withholding_type='0' WHERE company_id=company;
    DELETE FROM public.platform_admins WHERE user_id=actor;
    FOREACH member_role IN ARRAY ARRAY['owner','admin','operator','viewer','developer'] LOOP
      UPDATE public.organization_members SET role=member_role::public.org_role WHERE organization_id=org AND user_id=actor;
      SET LOCAL ROLE authenticated;
      SELECT count(*) INTO row_count FROM public.company_fiscal_settings WHERE company_id=company AND pis_cofins_cst='99' AND pis_cofins_withholding_type='0';
      IF row_count<>1 THEN RAISE EXCEPTION 'PIS_COFINS_MEMBER_READ_FAILED %',member_role; END IF;
      role_checks:=role_checks+1;
      UPDATE public.company_fiscal_settings SET pis_cofins_cst='99',pis_cofins_withholding_type='0' WHERE company_id=company;
      GET DIAGNOSTICS row_count=ROW_COUNT;
      IF row_count<>(CASE WHEN member_role IN ('owner','admin') THEN 1 ELSE 0 END) THEN RAISE EXCEPTION 'PIS_COFINS_ROLE_WRITE_FAILED %',member_role; END IF;
      role_checks:=role_checks+1;
      RESET ROLE;
    END LOOP;
    DELETE FROM public.organization_members WHERE organization_id=org AND user_id=actor;
    INSERT INTO public.organizations(id,name,type,created_by) VALUES(other_org,'Teste PIS COFINS outra organização','company',actor);
    INSERT INTO public.organization_members(organization_id,user_id,role) VALUES(other_org,actor,'owner');
    SET LOCAL ROLE authenticated;
    SELECT count(*) INTO row_count FROM public.company_fiscal_settings WHERE company_id=company;
    IF row_count<>0 THEN RAISE EXCEPTION 'PIS_COFINS_FOREIGN_READ_LEAK'; END IF;
    UPDATE public.company_fiscal_settings SET pis_cofins_cst=null,pis_cofins_withholding_type=null WHERE company_id=company;
    GET DIAGNOSTICS row_count=ROW_COUNT;
    IF row_count<>0 THEN RAISE EXCEPTION 'PIS_COFINS_FOREIGN_WRITE_LEAK'; END IF;
    role_checks:=role_checks+2;
    RESET ROLE;
    DELETE FROM public.organization_members WHERE organization_id=other_org AND user_id=actor;
    SET LOCAL ROLE authenticated;
    SELECT count(*) INTO row_count FROM public.company_fiscal_settings WHERE company_id=company;
    IF row_count<>0 THEN RAISE EXCEPTION 'PIS_COFINS_NOORG_READ_LEAK'; END IF;
    role_checks:=role_checks+1;
    RESET ROLE;
    SET LOCAL ROLE anon;
    BEGIN
      PERFORM pis_cofins_cst FROM public.company_fiscal_settings WHERE company_id=company;
      RAISE EXCEPTION 'PIS_COFINS_ANON_READ_ALLOWED';
    EXCEPTION WHEN insufficient_privilege THEN NULL; END;
    role_checks:=role_checks+1;
    RESET ROLE;
    INSERT INTO public.platform_admins(user_id) VALUES(actor);
    SET LOCAL ROLE authenticated;
    SELECT count(*) INTO row_count FROM public.company_fiscal_settings WHERE company_id=company AND pis_cofins_cst='99' AND pis_cofins_withholding_type='0';
    IF row_count<>1 THEN RAISE EXCEPTION 'PIS_COFINS_PLATFORM_READ_FAILED'; END IF;
    UPDATE public.company_fiscal_settings SET pis_cofins_cst=null,pis_cofins_withholding_type=null WHERE company_id=company;
    GET DIAGNOSTICS row_count=ROW_COUNT;
    IF row_count<>1 THEN RAISE EXCEPTION 'PIS_COFINS_PLATFORM_WRITE_FAILED'; END IF;
    role_checks:=role_checks+2;
    RESET ROLE;
    IF role_checks<>16 THEN RAISE EXCEPTION 'PIS_COFINS_ROLE_CHECKS_MISSING'; END IF;
    RAISE EXCEPTION USING ERRCODE='ZX001',MESSAGE='ROLLBACK_PIS_COFINS_TEST_SUCCESS';
  EXCEPTION WHEN SQLSTATE 'ZX001' THEN
    RAISE NOTICE 'PIS_COFINS_DATABASE_OK: null default, exact 99/0, 14 rejected pairs, removal, 16 role/isolation assertions; all fixtures rolled back.';
  END;
END $test$;