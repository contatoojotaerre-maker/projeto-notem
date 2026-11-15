-- Alphanumeric CNPJ in the database (rollback-only fixtures; nothing persists, nothing is sent).
-- Check digits (ASCII - 48), normalization, formats of key/Id/cursor, proof of possession, RLS of received notes
-- and the manual ADN request with a CNPJ that carries letters. Run through the migration tool.
DO $test$
DECLARE
 u uuid:=gen_random_uuid(); o uuid:=gen_random_uuid(); org1 uuid:=gen_random_uuid(); org2 uuid:=gen_random_uuid();
 c1 uuid:=gen_random_uuid(); c2 uuid:=gen_random_uuid(); municipality text; k text; v integer; r jsonb;
BEGIN
 IF NOT public.is_valid_cnpj('12ABC34501DE35') OR NOT public.is_valid_cnpj('11222333000181') OR NOT public.is_valid_cnpj('A1B2C3D4E5F668') THEN RAISE EXCEPTION 'TEST_FAIL_dv_valid'; END IF;
 IF public.is_valid_cnpj('12ABC34501DE36') OR public.is_valid_cnpj('12ABC34501DEA5') OR public.is_valid_cnpj('12abc34501de35') OR public.is_valid_cnpj('AAAAAAAAAAAAAA') OR public.is_valid_cnpj(NULL) THEN RAISE EXCEPTION 'TEST_FAIL_dv_invalid'; END IF;
 IF public.normalize_cnpj('12.abc.345/01de-35')<>'12ABC34501DE35' OR public.normalize_cnpj('11.222.333/0001-81')<>'11222333000181' THEN RAISE EXCEPTION 'TEST_FAIL_normalize'; END IF;
 SELECT ibge_code INTO municipality FROM public.municipalities LIMIT 1;
 IF municipality IS NULL THEN RAISE EXCEPTION 'Fixtures require the municipality catalog.'; END IF;
 k := '4212254'||'2'||'2'||'12ABC34501DE35'||'0000000000001'||'2611'||'123456789'||'0';
 BEGIN
  INSERT INTO auth.users(id,email,aud,role) VALUES(u,'cnpj-alfa-'||u||'@example.invalid','authenticated','authenticated'),(o,'cnpj-alfa-'||o||'@example.invalid','authenticated','authenticated');
  INSERT INTO public.profiles(id,display_name) VALUES(u,'Teste'),(o,'Teste') ON CONFLICT (id) DO NOTHING;
  PERFORM set_config('request.jwt.claims',jsonb_build_object('sub',u,'role','authenticated')::text,true);
  INSERT INTO public.organizations(id,name,slug,type,created_by) VALUES(org1,'CNPJ alfa','x','company',u),(org2,'CNPJ alfa outra','y','company',o);
  INSERT INTO public.organization_members(organization_id,user_id,role) VALUES(org1,u,'owner'),(org2,o,'owner');
  INSERT INTO public.companies(id,organization_id,cnpj,legal_name,municipality_ibge_code,state,created_by,updated_by) VALUES(c1,org1,'12ABC34501DE35','Empresa Alfa',municipality,'',u,u),(c2,org2,'A1B2C3D4E5F668','Empresa Beta',municipality,'',o,o);
  BEGIN INSERT INTO public.companies(organization_id,cnpj,legal_name,municipality_ibge_code,state,created_by,updated_by) VALUES(org1,'12ABC34501DE36','DV errado',municipality,'',u,u); RAISE EXCEPTION 'TEST_FAIL_company_dv'; EXCEPTION WHEN check_violation THEN NULL; END;
  BEGIN INSERT INTO public.companies(organization_id,cnpj,legal_name,municipality_ibge_code,state,created_by,updated_by) VALUES(org1,'12abc34501de35','Minúsculas',municipality,'',u,u); RAISE EXCEPTION 'TEST_FAIL_company_lower'; EXCEPTION WHEN check_violation THEN NULL; END;
  INSERT INTO public.company_certificates(company_id,organization_id,holder,cnpj,issuer,serial_number,valid_from,valid_until,status,uploaded_by) VALUES(c1,org1,'Teste','12ABC34501DE35','Teste','0',now()-interval '1 day',now()+interval '1 year','active',u);
  -- Formats: letters only where the CNPJ sits (positions 10–23 of the key).
  BEGIN INSERT INTO public.nfse_documents(environment,access_key,provider_cnpj) VALUES('sandbox',lower(k),'12ABC34501DE35'); RAISE EXCEPTION 'TEST_FAIL_key_lower'; EXCEPTION WHEN check_violation THEN NULL; END;
  BEGIN INSERT INTO public.nfse_documents(environment,access_key,provider_cnpj) VALUES('sandbox','A'||substr(k,2),'12ABC34501DE35'); RAISE EXCEPTION 'TEST_FAIL_key_position'; EXCEPTION WHEN check_violation THEN NULL; END;
  BEGIN INSERT INTO public.adn_sync_cursors(cnpj,environment,status) VALUES('12ABC34501DEA5','sandbox','pending'); RAISE EXCEPTION 'TEST_FAIL_cursor_dv_letter'; EXCEPTION WHEN check_violation THEN NULL; END;
  PERFORM public.store_nfse_document('sandbox', jsonb_build_object('access_key',k,'provider_cnpj','12ABC34501DE35','taker_document','A1B2C3D4E5F668','nfse_number','1','xml','<NFSe/>'), 1);
  IF NOT public.org_proven_cnpj(org1,'12ABC34501DE35') OR public.org_proven_cnpj(org2,'12ABC34501DE35') OR public.org_proven_cnpj(org2,'A1B2C3D4E5F668') THEN RAISE EXCEPTION 'TEST_FAIL_proof'; END IF;
  -- External note: visible to the organization that proves possession (company + certificate), invisible to the other.
  SET LOCAL ROLE authenticated;
  SELECT count(*) INTO v FROM public.nfse_documents WHERE access_key=k; IF v<>1 THEN RAISE EXCEPTION 'TEST_FAIL_rls_owner %', v; END IF;
  SELECT count(*) INTO v FROM public.list_org_notes(org1,'sandbox'); IF v<>1 THEN RAISE EXCEPTION 'TEST_FAIL_list_external %', v; END IF;
  RESET ROLE;
  PERFORM set_config('request.jwt.claims',jsonb_build_object('sub',o,'role','authenticated')::text,true);
  SET LOCAL ROLE authenticated;
  SELECT count(*) INTO v FROM public.nfse_documents WHERE access_key=k; IF v<>0 THEN RAISE EXCEPTION 'TEST_FAIL_rls_taker_without_certificate'; END IF;
  RESET ROLE;
  INSERT INTO public.company_certificates(company_id,organization_id,holder,cnpj,issuer,serial_number,valid_from,valid_until,status,uploaded_by) VALUES(c2,org2,'Teste','A1B2C3D4E5F668','Teste','0',now()-interval '1 day',now()+interval '1 year','active',o);
  SET LOCAL ROLE authenticated;
  SELECT count(*) INTO v FROM public.nfse_documents WHERE access_key=k; IF v<>1 THEN RAISE EXCEPTION 'TEST_FAIL_rls_received'; END IF;
  RESET ROLE;
  -- Manual ADN request accepts the alphanumeric CNPJ only for the organization that owns the company.
  r := public.request_adn_sync('12ABC34501DE35','sandbox','period',1,u,org1);
  IF r->>'mode'<>'period' OR NOT EXISTS (SELECT 1 FROM public.adn_sync_cursors WHERE cnpj='12ABC34501DE35' AND environment='sandbox' AND status='syncing') THEN RAISE EXCEPTION 'TEST_FAIL_adn_request'; END IF;
  BEGIN PERFORM public.request_adn_sync('12ABC34501DE35','sandbox','period',1,o,org2); RAISE EXCEPTION 'TEST_FAIL_adn_other_org'; EXCEPTION WHEN OTHERS THEN IF SQLERRM<>'SEM_PERMISSAO' THEN RAISE; END IF; END;
  BEGIN PERFORM public.request_adn_sync('12abc34501de35','sandbox','period',1,u,org1); RAISE EXCEPTION 'TEST_FAIL_adn_lower'; EXCEPTION WHEN OTHERS THEN IF SQLERRM<>'ADN_PEDIDO_INVALIDO' THEN RAISE; END IF; END;
  RAISE EXCEPTION USING ERRCODE='ZX001', MESSAGE='cnpj assertions passed; rollback';
 EXCEPTION WHEN SQLSTATE 'ZX001' THEN NULL; END;
 IF EXISTS (SELECT 1 FROM auth.users WHERE email LIKE 'cnpj-alfa-%@example.invalid') OR EXISTS (SELECT 1 FROM public.companies WHERE cnpj IN ('12ABC34501DE35','A1B2C3D4E5F668')) THEN RAISE EXCEPTION 'TEST_FAIL_rollback'; END IF;
 RAISE NOTICE 'CNPJ_ALFANUMERICO_DB_TESTS_OK';
END $test$;
