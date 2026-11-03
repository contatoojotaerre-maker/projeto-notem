DO $$
DECLARE actor uuid; org uuid; integration uuid; failed boolean; other_company uuid;
BEGIN
 SELECT user_id INTO actor FROM public.platform_admins LIMIT 1;
 SELECT id INTO org FROM public.organizations LIMIT 1;
 IF actor IS NULL OR org IS NULL THEN RAISE EXCEPTION 'Test fixtures unavailable'; END IF;
 IF has_column_privilege('authenticated','public.integration_keys','key_hash','SELECT') THEN RAISE EXCEPTION 'TEST_hash_exposed'; END IF;
 IF has_table_privilege('authenticated','public.integrations','INSERT') THEN RAISE EXCEPTION 'TEST_direct_write'; END IF;
 IF has_function_privilege('authenticated','public.manage_integration(uuid,uuid,text,uuid,jsonb)','EXECUTE') THEN RAISE EXCEPTION 'TEST_direct_rpc'; END IF;
 integration:=public.create_integration(actor,org,'{"name":"Rollback test","company_scope":"all"}'::jsonb);
 PERFORM public.manage_integration(actor,org,'generate',integration,jsonb_build_object('environment','sandbox','key_prefix','ntm_homolog_test…','key_hash',repeat('a',64)));
 PERFORM public.manage_integration(actor,org,'generate',integration,jsonb_build_object('environment','sandbox','key_prefix','ntm_homolog_test…','key_hash',repeat('b',64)));
 failed:=false; BEGIN PERFORM public.manage_integration(actor,org,'generate',integration,jsonb_build_object('environment','sandbox','key_prefix','ntm_homolog_test…','key_hash',repeat('c',64))); EXCEPTION WHEN OTHERS THEN failed:=true; END; IF NOT failed THEN RAISE EXCEPTION 'TEST_third_key'; END IF;
 PERFORM public.manage_integration(actor,org,'generate',integration,jsonb_build_object('environment','production','key_prefix','ntm_prod_test…','key_hash',repeat('d',64)));
 IF (SELECT count(*) FROM public.integration_keys WHERE integration_id=integration AND environment='sandbox' AND revoked_at IS NULL)<>2 THEN RAISE EXCEPTION 'TEST_environment'; END IF;
 PERFORM public.manage_integration(actor,org,'revoke',integration,jsonb_build_object('key_id',(SELECT id FROM public.integration_keys WHERE integration_id=integration AND key_hash=repeat('a',64))));
 PERFORM public.manage_integration(actor,org,'generate',integration,jsonb_build_object('environment','sandbox','key_prefix','ntm_homolog_test…','key_hash',repeat('c',64)));
 failed:=false; BEGIN PERFORM public.create_integration(gen_random_uuid(),org,'{"name":"Forbidden","company_scope":"all"}'::jsonb); EXCEPTION WHEN OTHERS THEN failed:=true; END; IF NOT failed THEN RAISE EXCEPTION 'TEST_role'; END IF;
 SELECT id INTO other_company FROM public.companies WHERE organization_id<>org LIMIT 1;
 IF other_company IS NOT NULL THEN failed:=false; BEGIN PERFORM public.create_integration(actor,org,jsonb_build_object('name','Foreign','company_scope','selected','company_ids',jsonb_build_array(other_company))); EXCEPTION WHEN foreign_key_violation THEN failed:=true; END; IF NOT failed THEN RAISE EXCEPTION 'TEST_foreign_company'; END IF; END IF;
 RAISE EXCEPTION USING ERRCODE='ZX001', MESSAGE='ROLLBACK_TEST_SUCCESS';
EXCEPTION WHEN SQLSTATE 'ZX001' THEN RAISE NOTICE 'Integration database tests passed; all fixtures rolled back';
END $$;