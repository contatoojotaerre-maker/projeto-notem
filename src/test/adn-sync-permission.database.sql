-- Manual ADN synchronization permission in the database (rollback-only; nothing persists, nothing is sent).
-- owner/admin of the organization and platform administrator are accepted; operator, developer, viewer and a
-- member of another organization are refused by request_adn_sync before any cursor is touched.
DO $test$
DECLARE co public.companies; org2 uuid; u uuid; r text; cnpj text; role_name text; ok boolean; BEGIN
 SELECT * INTO co FROM public.companies ORDER BY created_at LIMIT 1;
 IF co.id IS NULL THEN RAISE NOTICE 'ADN_PERMISSION_DB_TESTS_SKIPPED (no company)'; RETURN; END IF;
 cnpj := regexp_replace(co.cnpj,'[^0-9]','','g');
 BEGIN
  INSERT INTO public.organizations(name,type,created_by) VALUES('Teste permissão ADN','company',(SELECT created_by FROM public.organizations WHERE id=co.organization_id)) RETURNING id INTO org2;
  FOREACH role_name IN ARRAY ARRAY['owner','admin','operator','developer','viewer','foreign','platform'] LOOP
   u := gen_random_uuid();
   INSERT INTO auth.users(id,email,aud,role) VALUES(u,'adn-perm-'||u||'@example.invalid','authenticated','authenticated');
   INSERT INTO public.profiles(id,display_name) VALUES(u,'Teste') ON CONFLICT (id) DO NOTHING;
   IF role_name='foreign' THEN INSERT INTO public.organization_members(organization_id,user_id,role) VALUES(org2,u,'owner');
   ELSIF role_name='platform' THEN INSERT INTO public.platform_admins(user_id) VALUES(u);
   ELSE INSERT INTO public.organization_members(organization_id,user_id,role) VALUES(co.organization_id,u,role_name::public.org_role); END IF;
   ok := public.can_request_adn_sync(co.organization_id,u);
   IF ok IS DISTINCT FROM (role_name IN ('owner','admin','platform')) THEN RAISE EXCEPTION 'TEST_FAIL_can_request_%', role_name; END IF;
   IF NOT ok THEN
    BEGIN PERFORM public.request_adn_sync(cnpj,'sandbox','period',1,u,co.organization_id); RAISE EXCEPTION 'TEST_FAIL_request_accepted_%', role_name;
    EXCEPTION WHEN OTHERS THEN IF position('SEM_PERMISSAO' IN SQLERRM)=0 THEN RAISE; END IF; END;
   END IF;
  END LOOP;
  -- A CNPJ that is not a company of the organization is refused even for an administrator.
  BEGIN PERFORM public.request_adn_sync('00000000000000','sandbox','period',1,u,co.organization_id); RAISE EXCEPTION 'TEST_FAIL_foreign_cnpj';
  EXCEPTION WHEN OTHERS THEN IF position('SEM_PERMISSAO' IN SQLERRM)=0 THEN RAISE; END IF; END;
  -- Browsers never call the permission or request functions directly.
  IF has_function_privilege('authenticated','public.can_request_adn_sync(uuid,uuid)','EXECUTE') OR has_function_privilege('authenticated','public.request_adn_sync(text,public.environment,text,integer,uuid,uuid)','EXECUTE')
     OR has_function_privilege('authenticated','public.put_xml_file(text,uuid,text,jsonb,boolean)','EXECUTE') THEN RAISE EXCEPTION 'TEST_FAIL_grants'; END IF;
  RAISE EXCEPTION USING ERRCODE='ZX001', MESSAGE='permission assertions passed; rollback';
 EXCEPTION WHEN SQLSTATE 'ZX001' THEN NULL; END;
 IF EXISTS (SELECT 1 FROM public.organizations WHERE name='Teste permissão ADN') OR EXISTS (SELECT 1 FROM auth.users WHERE email LIKE 'adn-perm-%@example.invalid') THEN RAISE EXCEPTION 'TEST_FAIL_rollback'; END IF;
 RAISE NOTICE 'ADN_PERMISSION_DB_TESTS_OK';
END $test$;
