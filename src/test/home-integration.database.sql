-- Início: integration counts of the last 24 hours (rollback-only; nothing persists).
-- Counts only authenticated calls (key found and not refused with 401) of the organization, per environment;
-- "com erro" splits 4xx and 5xx; request logs follow their row rule (owner, admin, developer, platform admin).
DO $test$
DECLARE T uuid; O uuid; kp public.integration_keys; ks public.integration_keys; ko public.integration_keys; r record; f timestamptz := now() - interval '24 hours'; tt timestamptz := now() + interval '1 second';
  owner uuid; dev uuid; viewer uuid; other uuid; seq int := 0; codes int[]; c int;
BEGIN
 SELECT id INTO T FROM public.organizations WHERE slug='grupojota'; SELECT id INTO O FROM public.organizations WHERE slug='onedesp';
 SELECT * INTO kp FROM public.integration_keys WHERE organization_id=T AND environment='production' LIMIT 1;
 SELECT * INTO ks FROM public.integration_keys WHERE organization_id=T AND environment='sandbox' LIMIT 1;
 SELECT * INTO ko FROM public.integration_keys WHERE organization_id=O AND environment='sandbox' LIMIT 1;
 IF kp.id IS NULL OR ks.id IS NULL OR ko.id IS NULL THEN RAISE NOTICE 'HOME_INTEGRATION_DB_TESTS_SKIPPED (keys missing)'; RETURN; END IF;
 BEGIN
  -- the real logs of the window are removed inside the transaction so the expected numbers are exact
  DELETE FROM public.api_request_logs WHERE organization_id IN (T, O) AND created_at >= f;
  -- T production: 200, 201, 404, 422, 429, 500, 503 count; revoked key 401 and a call without key do not
  codes := ARRAY[200,201,404,422,429,500,503];
  FOREACH c IN ARRAY codes LOOP seq := seq+1;
   INSERT INTO public.api_request_logs(id,organization_id,integration_id,key_id,environment,method,path,status_code,duration_ms) VALUES('req_'||md5('home'||seq),T,kp.integration_id,kp.id,'production','GET','/api/v1/status',c,5);
  END LOOP;
  seq := seq+1; INSERT INTO public.api_request_logs(id,organization_id,integration_id,key_id,environment,method,path,status_code,error_code,duration_ms) VALUES('req_'||md5('home'||seq),T,kp.integration_id,kp.id,'production','GET','/api/v1/status',401,'AUTENTICACAO_INVALIDA',5);
  seq := seq+1; INSERT INTO public.api_request_logs(id,method,path,status_code,error_code,duration_ms) VALUES('req_'||md5('home'||seq),'GET','/api/v1/status',401,'AUTENTICACAO_INVALIDA',5);
  -- outside the 24-hour window
  seq := seq+1; INSERT INTO public.api_request_logs(id,organization_id,integration_id,key_id,environment,method,path,status_code,duration_ms,created_at) VALUES('req_'||md5('home'||seq),T,kp.integration_id,kp.id,'production','GET','/api/v1/status',500,5,now()-interval '25 hours');
  -- T sandbox: 200 and 500
  FOREACH c IN ARRAY ARRAY[200,500] LOOP seq := seq+1;
   INSERT INTO public.api_request_logs(id,organization_id,integration_id,key_id,environment,method,path,status_code,duration_ms) VALUES('req_'||md5('home'||seq),T,ks.integration_id,ks.id,'sandbox','GET','/api/v1/status',c,5);
  END LOOP;
  -- other organization (sandbox): 200 and 400
  FOREACH c IN ARRAY ARRAY[200,400] LOOP seq := seq+1;
   INSERT INTO public.api_request_logs(id,organization_id,integration_id,key_id,environment,method,path,status_code,duration_ms) VALUES('req_'||md5('home'||seq),O,ko.integration_id,ko.id,'sandbox','GET','/api/v1/status',c,5);
  END LOOP;

  owner := gen_random_uuid(); dev := gen_random_uuid(); viewer := gen_random_uuid(); other := gen_random_uuid();
  INSERT INTO auth.users(id,email,aud,role) SELECT u,'home-int-'||u||'@example.invalid','authenticated','authenticated' FROM unnest(ARRAY[owner,dev,viewer,other]) u;
  INSERT INTO public.profiles(id,display_name) SELECT u,'Teste' FROM unnest(ARRAY[owner,dev,viewer,other]) u ON CONFLICT (id) DO NOTHING;
  INSERT INTO public.organization_members(organization_id,user_id,role) VALUES(T,owner,'owner'),(T,dev,'developer'),(T,viewer,'viewer'),(O,other,'owner');

  PERFORM set_config('request.jwt.claims',jsonb_build_object('sub',owner,'role','authenticated')::text,true); SET LOCAL ROLE authenticated;
  SELECT * INTO r FROM public.org_integration_summary(T,'production',f,tt);
  IF (r.calls,r.client_errors,r.server_errors) IS DISTINCT FROM (7::bigint,3::bigint,2::bigint) THEN RAISE EXCEPTION 'TEST_FAIL_owner_production %', row_to_json(r); END IF;
  SELECT * INTO r FROM public.org_integration_summary(T,'sandbox',f,tt);
  IF (r.calls,r.client_errors,r.server_errors) IS DISTINCT FROM (2::bigint,0::bigint,1::bigint) THEN RAISE EXCEPTION 'TEST_FAIL_owner_sandbox %', row_to_json(r); END IF;
  -- the organization filter wins even when another organization's id is asked
  SELECT * INTO r FROM public.org_integration_summary(O,'sandbox',f,tt); IF r.calls<>0 THEN RAISE EXCEPTION 'TEST_FAIL_owner_reads_other_org %', r.calls; END IF;
  RESET ROLE;
  PERFORM set_config('request.jwt.claims',jsonb_build_object('sub',dev,'role','authenticated')::text,true); SET LOCAL ROLE authenticated;
  SELECT * INTO r FROM public.org_integration_summary(T,'production',f,tt); IF r.calls<>7 THEN RAISE EXCEPTION 'TEST_FAIL_developer %', r.calls; END IF;
  RESET ROLE;
  PERFORM set_config('request.jwt.claims',jsonb_build_object('sub',viewer,'role','authenticated')::text,true); SET LOCAL ROLE authenticated;
  SELECT * INTO r FROM public.org_integration_summary(T,'production',f,tt); IF r.calls<>0 THEN RAISE EXCEPTION 'TEST_FAIL_viewer_sees_logs %', r.calls; END IF;
  RESET ROLE;
  PERFORM set_config('request.jwt.claims',jsonb_build_object('sub',other,'role','authenticated')::text,true); SET LOCAL ROLE authenticated;
  SELECT * INTO r FROM public.org_integration_summary(T,'production',f,tt); IF r.calls<>0 THEN RAISE EXCEPTION 'TEST_FAIL_foreign %', r.calls; END IF;
  SELECT * INTO r FROM public.org_integration_summary(O,'sandbox',f,tt);
  IF (r.calls,r.client_errors,r.server_errors) IS DISTINCT FROM (2::bigint,1::bigint,0::bigint) THEN RAISE EXCEPTION 'TEST_FAIL_other_org_own %', row_to_json(r); END IF;
  SELECT * INTO r FROM public.org_integration_summary(O,'production',f,tt); IF r.calls<>0 THEN RAISE EXCEPTION 'TEST_FAIL_other_org_env %', r.calls; END IF;
  RESET ROLE;
  SET LOCAL ROLE anon; BEGIN PERFORM * FROM public.org_integration_summary(T,'production',f,tt); RAISE EXCEPTION 'TEST_FAIL_anon'; EXCEPTION WHEN insufficient_privilege THEN NULL; END; RESET ROLE;
  RAISE EXCEPTION USING ERRCODE='ZX001', MESSAGE='home integration assertions passed; rollback';
 EXCEPTION WHEN SQLSTATE 'ZX001' THEN NULL; END;
 IF EXISTS (SELECT 1 FROM public.api_request_logs WHERE id='req_'||md5('home1')) OR EXISTS (SELECT 1 FROM auth.users WHERE email LIKE 'home-int-%@example.invalid') THEN RAISE EXCEPTION 'TEST_FAIL_rollback'; END IF;
 RAISE NOTICE 'HOME_INTEGRATION_DB_TESTS_OK';
END $test$;
