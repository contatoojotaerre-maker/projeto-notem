-- Permanent isolation and role matrix (rollback-only). Run after schema/RLS changes; expected result: MATRIX_RESULT ... fails=0.
-- Isolation and role matrix (rollback-only). Runs table reads, direct writes and RPC calls AS the roles
-- authenticated/anon with temporary users, against the real data of one organization (T).
-- The whole block ends with an exception, so nothing persists.
DO $m$
DECLARE
 T uuid; co public.companies; tcnpj text; dser int; X uuid; xco public.companies;
 actors text[] := ARRAY['owner','admin','operator','developer','viewer','foreign','noorg','anon','platform'];
 a text; u uuid; users jsonb := '{}'; inorg boolean; plat boolean;
 base jsonb := '{}'; n bigint; e bigint; rc bigint; st text; msg text; refused boolean;
 fails text[] := '{}'; notes text[] := '{}'; checks int := 0; tname text; q text; allowed text[];
 rec jsonb; seed_inv uuid; ep uuid; integ uuid; prod_before text; prod_after text;
 org_tables text[] := ARRAY['companies','company_fiscal_settings','company_service_profiles','company_certificates','company_certificate_material',
   'company_customers','certificate_audit_events','municipality_agreement_queries','dps_sequences','integrations','integration_keys',
   'integration_companies','webhook_endpoints','webhook_events','webhook_deliveries','webhook_alerts','webhook_secret_reveals','sandbox_change_audit','invoices',
   'invoice_events','invoice_fiscal_events','invoice_dps_attempts','nfse_daily_checks','api_request_logs','invitations','organization_members'];
 svc_tables text[] := ARRAY['fiscal_xml_files','adn_distributions','nfse_key_refreshes','company_readiness_state','api_idempotency_keys','certificate_expiry_notices','api_rate_counters','api_concurrency_slots'];
 reads jsonb := '[]'; r jsonb; writes jsonb := '[]'; w jsonb;
BEGIN
 SELECT id INTO T FROM public.organizations WHERE slug='grupojota';
 SELECT * INTO co FROM public.companies WHERE organization_id=T ORDER BY created_at LIMIT 1;
 IF co.id IS NULL THEN RAISE EXCEPTION 'MATRIX_SKIPPED no company'; END IF;
 tcnpj := regexp_replace(co.cnpj,'\D','','g');
 SELECT dps_series INTO dser FROM public.company_fiscal_settings WHERE company_id=co.id;
 SELECT id INTO integ FROM public.integrations WHERE organization_id=T LIMIT 1;
 SELECT id INTO ep FROM public.webhook_endpoints WHERE organization_id=T LIMIT 1;

 -- temporary users
 FOREACH a IN ARRAY actors LOOP
  IF a='anon' THEN CONTINUE; END IF;
  u := gen_random_uuid(); users := users || jsonb_build_object(a,u);
  INSERT INTO auth.users(id,email,aud,role,email_confirmed_at) VALUES(u,'matriz-'||a||'-'||u||'@example.invalid','authenticated','authenticated',now());
  INSERT INTO public.profiles(id,display_name) VALUES(u,'Matriz '||a) ON CONFLICT (id) DO NOTHING;
  IF a IN ('owner','admin','operator','developer','viewer') THEN
   INSERT INTO public.organization_members(organization_id,user_id,role) VALUES(T,u,a::public.org_role);
  ELSIF a='platform' THEN INSERT INTO public.platform_admins(user_id) VALUES(u); END IF;
 END LOOP;
 -- foreign organization X, owned by "foreign", with a company using T's CNPJ but no certificate (proof of possession)
 INSERT INTO public.organizations(name,type,created_by) VALUES('Matriz isolamento B','company',(users->>'foreign')::uuid) RETURNING id INTO X;
 INSERT INTO public.organization_members(organization_id,user_id,role) VALUES(X,(users->>'foreign')::uuid,'owner');
 BEGIN
  xco := co; xco.id := gen_random_uuid(); xco.organization_id := X; xco.created_by := (users->>'foreign')::uuid; xco.updated_by := xco.created_by; xco.external_id := NULL;
  INSERT INTO public.companies SELECT xco.*;
 EXCEPTION WHEN OTHERS THEN notes := notes || ('seed company in B with same CNPJ failed: '||SQLSTATE||' '||SQLERRM); END;
 -- seeds in T for tables that are empty in production
 BEGIN INSERT INTO public.company_customers(company_id,organization_id,customer_data,created_by,updated_by) VALUES(co.id,T,'{"documento":"00000000191","nome":"Matriz"}',(users->>'owner')::uuid,(users->>'owner')::uuid);
 EXCEPTION WHEN OTHERS THEN notes := notes || ('seed customer: '||SQLERRM); END;
 BEGIN INSERT INTO public.invitations(organization_id,email,role,invited_by) VALUES(T,'matriz-convidado@example.invalid','viewer',(users->>'platform')::uuid) RETURNING id INTO seed_inv;
 EXCEPTION WHEN OTHERS THEN notes := notes || ('seed invitation: '||SQLERRM); END;
 BEGIN INSERT INTO public.webhook_secret_reveals(organization_id,endpoint_id,actor_id) VALUES(T,ep,(users->>'owner')::uuid);
 EXCEPTION WHEN OTHERS THEN notes := notes || ('seed reveal: '||SQLERRM); END;
 BEGIN INSERT INTO public.sandbox_change_audit(organization_id,integration_id,integration_name,company_id,item,action,method,path,request_id) VALUES(T,integ,'Matriz',co.id,'servico','alterado','PATCH','/api/v1/empresas/x/servicos/y','req_matriz');
 EXCEPTION WHEN OTHERS THEN notes := notes || ('seed sandbox alert: '||SQLERRM); END;
 BEGIN INSERT INTO public.api_rate_limit_overrides(organization_id,bucket,max_hits,window_seconds) VALUES(T,'geral',500,60);
 EXCEPTION WHEN OTHERS THEN notes := notes || ('seed override: '||SQLERRM); END;
 BEGIN INSERT INTO public.nfse_daily_checks(run_date,company_id,organization_id,environment) VALUES(current_date,co.id,T,'production');
 EXCEPTION WHEN OTHERS THEN notes := notes || ('seed daily: '||SQLERRM); END;

 -- read checks: name, sql, kind (org | admin_only | platform_only | none | special)
 FOREACH tname IN ARRAY org_tables LOOP
  reads := reads || jsonb_build_object('n',tname,'q',format('select count(%s) from public.%I where organization_id=$1',
     CASE WHEN tname IN ('integration_keys','webhook_endpoints') THEN 'id' WHEN tname='company_certificate_material' THEN 'company_id' ELSE '*' END, tname)
     || CASE WHEN tname='api_request_logs' THEN ' and created_at >= now() - interval ''90 days''' ELSE '' END,
   'k', CASE WHEN tname IN ('certificate_audit_events','webhook_secret_reveals') THEN 'admin_only' WHEN tname='api_request_logs' THEN 'logs' WHEN tname='invitations' THEN 'platform_only'
             WHEN tname='company_certificate_material' THEN 'none' ELSE 'org' END);
 END LOOP;
 FOREACH tname IN ARRAY svc_tables LOOP
  reads := reads || jsonb_build_object('n',tname,'q',format('select count(*) from public.%I',tname),'k','none');
 END LOOP;
 reads := reads || jsonb_build_array(
  jsonb_build_object('n','organizations','q','select count(*) from public.organizations where id=$1','k','org'),
  jsonb_build_object('n','nfse_documents(prova de posse)','q','select count(id) from public.nfse_documents where (invoice_id is null and provider_cnpj=$2) or taker_document=$2 or intermediary_document=$2','k','org'),
  jsonb_build_object('n','nfse_document_events','q','select count(e.id) from public.nfse_document_events e where e.invoice_id in (select id from public.invoices where organization_id=$1) or exists(select 1 from public.nfse_documents d where d.environment=e.environment and d.access_key=e.access_key and ((d.invoice_id is null and d.provider_cnpj=$2) or d.taker_document=$2 or d.intermediary_document=$2))','k','org'),
  jsonb_build_object('n','adn_sync_cursors','q','select count(cnpj) from public.adn_sync_cursors where cnpj=$2','k','org'),
  jsonb_build_object('n','list_org_notes(T)','q','select count(*) from public.list_org_notes($1,''production'')','k','org'),
  jsonb_build_object('n','api_rate_limit_overrides','q','select count(*) from public.api_rate_limit_overrides','k','platform_only'),
  jsonb_build_object('n','admin_audit_events','q','select count(*) from public.admin_audit_events','k','platform_only'),
  jsonb_build_object('n','system_heartbeats','q','select count(*) from public.system_heartbeats','k','platform_only'),
  jsonb_build_object('n','webhook_scheduler_runs','q','select count(*) from public.webhook_scheduler_runs','k','platform_only'),
  jsonb_build_object('n','platform_admins(outros)','q','select count(*) from public.platform_admins where user_id is distinct from $3','k','zero'),
  jsonb_build_object('n','profiles(outros)','q','select count(*) from public.profiles where id is distinct from $3','k','zero'),
  jsonb_build_object('n','storage fiscal-xml','q','select count(*) from storage.objects where bucket_id=''fiscal-xml''','k','zero'),
  jsonb_build_object('n','pending_invitations(alheio)','q','select count(*) from public.pending_invitations()','k','zero'));
 -- baseline counts as owner of the database
 FOR r IN SELECT * FROM jsonb_array_elements(reads) LOOP
  EXECUTE r->>'q' INTO n USING T, tcnpj, NULL::uuid; base := base || jsonb_build_object(r->>'n', n);
 END LOOP;

 -- write / RPC checks: name, sql, allowed actors
 writes := jsonb_build_array(
  jsonb_build_object('n','editar empresa','q','update public.companies set trade_name=trade_name where organization_id=$1','a','["owner","admin","operator","platform"]'),
  jsonb_build_object('n','editar configuracao fiscal','q','update public.company_fiscal_settings set updated_at=updated_at where organization_id=$1','a','["owner","admin","platform"]'),
  jsonb_build_object('n','editar perfil de servico','q','update public.company_service_profiles set name=name where organization_id=$1','a','["owner","admin","platform"]'),
  jsonb_build_object('n','editar organizacao','q','update public.organizations set name=name where id=$1','a','["owner","admin","platform"]'),
  jsonb_build_object('n','criar empresa em T','q','insert into public.companies select (jsonb_populate_record(null::public.companies, $4)).*','a','["owner","admin","operator","platform"]'),
  jsonb_build_object('n','apagar empresa','q','delete from public.companies where organization_id=$1','a','[]'),
  jsonb_build_object('n','entrar como owner em T','q','insert into public.organization_members(organization_id,user_id,role) values($1,$3,''owner'')','a','[]'),
  jsonb_build_object('n','elevar papel','q','update public.organization_members set role=''owner'' where organization_id=$1','a','[]'),
  jsonb_build_object('n','virar admin da plataforma','q','insert into public.platform_admins(user_id) values($3)','a','[]'),
  jsonb_build_object('n','marcar aviso de homologacao como lido','q','update public.sandbox_change_audit set acknowledged_at=now(), acknowledged_by=$3 where organization_id=$1','a','["owner","admin","platform"]'),
  jsonb_build_object('n','reescrever aviso de homologacao','q','update public.sandbox_change_audit set item=item where organization_id=$1','a','[]'),
  jsonb_build_object('n','ajustar limite da organizacao','q','update public.api_rate_limit_overrides set max_hits=max_hits where organization_id=$1','a','[]'),
  jsonb_build_object('n','gravar contador de limite','q','insert into public.api_rate_counters select * from public.api_rate_counters limit 0','a','[]'),
  jsonb_build_object('n','RPC api_rate_check','q','select public.api_rate_check($1,''[]''::jsonb)','a','[]'),
  jsonb_build_object('n','RPC api_slot_acquire','q','select public.api_slot_acquire(''x'',1,60)','a','[]'),
  jsonb_build_object('n','apagar trilha administrativa','q','delete from public.admin_audit_events','a','[]'),
  jsonb_build_object('n','criar convite direto','q','insert into public.invitations(organization_id,email,role,invited_by) values($1,''matriz-x@example.invalid'',''owner'',$3)','a','["platform"]'),
  jsonb_build_object('n','aceitar convite alheio','q','select public.accept_invitation($5)','a','[]'),
  jsonb_build_object('n','alterar perfil alheio','q','update public.profiles set display_name=display_name where id is distinct from $3','a','[]'),
  jsonb_build_object('n','listar equipe','q','select count(*) from public.organization_team($1)','a','["owner","admin","platform"]'),
  jsonb_build_object('n','gravar arquivo XML','q','insert into storage.objects(bucket_id,name) values(''fiscal-xml'',''matriz/x.xml'')','a','[]'),
  jsonb_build_object('n','apagar arquivos XML','q','delete from storage.objects where bucket_id=''fiscal-xml''','a','[]'),
  jsonb_build_object('n','RPC reserve_dps_number','q','select public.reserve_dps_number($6,$1,900,''sandbox'',$3)','a','[]'),
  jsonb_build_object('n','RPC request_adn_sync','q','select public.request_adn_sync($2,''sandbox'',''period'',1,$3,$1)','a','[]'),
  jsonb_build_object('n','RPC create_integration','q','select public.create_integration($3,$1,''{"name":"x"}''::jsonb)','a','[]'),
  jsonb_build_object('n','RPC manage_webhook','q','select public.manage_webhook($3,$1,null,''delete'',null,''{}''::jsonb)','a','[]'),
  jsonb_build_object('n','RPC org_proven_cnpj','q','select public.org_proven_cnpj($1,$2)','a','[]'),
  jsonb_build_object('n','RPC delete_company_if_unused','q','select public.delete_company_if_unused($6,$1)','a','[]'),
  jsonb_build_object('n','RPC create_invoice_request','q','select public.create_invoice_request(''{}''::jsonb)','a','[]'),
  jsonb_build_object('n','RPC create_fiscal_event_request','q','select public.create_fiscal_event_request(''{}''::jsonb)','a','[]'));
 FOREACH tname IN ARRAY org_tables LOOP
  writes := writes || jsonb_build_object('n','apagar '||tname,'q',format('delete from public.%I where organization_id=$1',tname),'a','[]');
  IF tname NOT IN ('companies','company_fiscal_settings','company_service_profiles') THEN
   writes := writes || jsonb_build_object('n','alterar '||tname,'q',format('update public.%I set organization_id=organization_id where organization_id=$1',tname),'a','[]');
  END IF;
 END LOOP;
 -- direct inserts into tables that still carry broad table grants (copy of an existing row with a new id)
 FOREACH tname IN ARRAY ARRAY['company_certificates','certificate_audit_events','municipality_agreement_queries','company_readiness_state','certificate_expiry_notices','invoices','webhook_events','integration_keys'] LOOP
  EXECUTE format('select to_jsonb(t) from public.%I t limit 1', tname) INTO rec;
  IF rec IS NULL THEN notes := notes || ('no row to copy for insert test: '||tname); CONTINUE; END IF;
  IF rec ? 'id' THEN rec := jsonb_set(rec,'{id}',to_jsonb(CASE WHEN jsonb_typeof(rec->'id')='string' AND rec->>'id' !~ '^[0-9a-f-]{36}$' THEN 'matriz-'||gen_random_uuid()::text ELSE gen_random_uuid()::text END)); END IF;
  writes := writes || jsonb_build_object('n','inserir '||tname,'q',format('insert into public.%I select (jsonb_populate_record(null::public.%I, %L::jsonb)).*',tname,tname,rec::text),'a','[]');
 END LOOP;
 writes := writes || jsonb_build_object('n','inserir api_idempotency_keys','q',format('insert into public.api_idempotency_keys(integration_id,environment,key,method,path,body_hash,expires_at) values(%L,''production'',''matriz'',''POST'',''/x'',''h'',now()+interval ''1 day'')',integ),'a','[]');

 -- run everything per actor
 FOREACH a IN ARRAY actors LOOP
  u := (users->>a)::uuid; inorg := a IN ('owner','admin','operator','developer','viewer'); plat := a='platform';
  rec := to_jsonb(co) || jsonb_build_object('id',gen_random_uuid(),'external_id',NULL,'created_by',coalesce(u,co.created_by),'updated_by',coalesce(u,co.created_by));
  IF a='anon' THEN EXECUTE 'set local role anon'; PERFORM set_config('request.jwt.claims','{"role":"anon"}',true);
  ELSE EXECUTE 'set local role authenticated';
   PERFORM set_config('request.jwt.claims',json_build_object('sub',u,'role','authenticated','email','matriz-'||a||'-'||u||'@example.invalid','amr',json_build_array(json_build_object('method','password')))::text,true);
  END IF;
  FOR r IN SELECT * FROM jsonb_array_elements(reads) LOOP
   checks := checks+1;
   BEGIN EXECUTE r->>'q' INTO n USING T, tcnpj, u; EXCEPTION WHEN OTHERS THEN n := -1; END;
   e := CASE r->>'k' WHEN 'org' THEN CASE WHEN inorg OR plat THEN (base->>(r->>'n'))::bigint ELSE 0 END
              WHEN 'admin_only' THEN CASE WHEN a IN ('owner','admin','platform') THEN (base->>(r->>'n'))::bigint ELSE 0 END
              WHEN 'logs' THEN CASE WHEN a IN ('owner','admin','developer','platform') THEN (base->>(r->>'n'))::bigint ELSE 0 END
              WHEN 'platform_only' THEN CASE WHEN plat THEN (base->>(r->>'n'))::bigint ELSE 0 END ELSE 0 END;
   IF (e=0 AND n NOT IN (0,-1)) OR (e>0 AND n<>e) THEN fails := fails || format('%s le %s: visto=%s esperado=%s',a,r->>'n',n,e); END IF;
  END LOOP;
  FOR w IN SELECT * FROM jsonb_array_elements(writes) LOOP
   checks := checks+1; st := 'ok'; msg := ''; rc := NULL;
   BEGIN
    EXECUTE w->>'q' USING T, tcnpj, u, rec, seed_inv, co.id; GET DIAGNOSTICS rc = ROW_COUNT;
    -- rolled back at once: a permitted write must not influence the next checks
    RAISE EXCEPTION USING ERRCODE='ZX002', MESSAGE='undo';
   EXCEPTION WHEN SQLSTATE 'ZX002' THEN NULL; WHEN OTHERS THEN st := SQLSTATE; msg := SQLERRM; END;
   refused := st='42501' OR (st='ok' AND rc=0 AND w->>'q' !~* '^select')
     OR (st='P0001' AND msg ~* '(unauthori|não autoriz|sem_permiss|unavailable|required|acesso|permiss)')
     OR (st='ok' AND w->>'q' ~* '^select public\.accept' AND false);
   allowed := ARRAY(SELECT jsonb_array_elements_text((w->>'a')::jsonb));
   IF a = ANY(allowed) AND refused THEN fails := fails || format('%s deveria poder "%s" (%s %s)',a,w->>'n',st,left(msg,80));
   ELSIF NOT (a = ANY(allowed)) AND NOT refused THEN fails := fails || format('%s NAO deveria poder "%s" (%s rows=%s %s)',a,w->>'n',st,rc,left(msg,80)); END IF;
  END LOOP;
  EXECUTE 'reset role'; PERFORM set_config('request.jwt.claims','',true);
 END LOOP;

 -- server-side role helpers (used by panel/API before privileged writes)
 FOREACH a IN ARRAY actors LOOP
  IF a='anon' THEN CONTINUE; END IF; u := (users->>a)::uuid; checks := checks+2;
  IF public.can_issue_fiscal_change(T,u) IS DISTINCT FROM (a IN ('owner','admin','operator','platform')) THEN fails := fails || ('can_issue_fiscal_change '||a); END IF;
  IF public.can_request_adn_sync(T,u) IS DISTINCT FROM (a IN ('owner','admin','platform')) THEN fails := fails || ('can_request_adn_sync '||a); END IF;
 END LOOP;
 -- numbering: a foreign actor cannot reserve T's numbers; sandbox reservation leaves production untouched
 checks := checks+2;
 BEGIN PERFORM public.reserve_dps_number(co.id,X,dser,'sandbox',(users->>'foreign')::uuid); fails := fails || 'reserve_dps_number aceitou organizacao alheia';
 EXCEPTION WHEN OTHERS THEN NULL; END;
 BEGIN PERFORM public.reserve_dps_number(co.id,T,dser,'production',(users->>'foreign')::uuid); fails := fails || 'reserve_dps_number aceitou usuario alheio';
 EXCEPTION WHEN OTHERS THEN NULL; END;
 SELECT string_agg(series||':'||next_number,',' ORDER BY series) INTO prod_before FROM public.dps_sequences WHERE company_id=co.id AND environment='production';
 checks := checks+1;
 BEGIN PERFORM public.reserve_dps_number(co.id,T,dser,'sandbox',(users->>'owner')::uuid);
  SELECT string_agg(series||':'||next_number,',' ORDER BY series) INTO prod_after FROM public.dps_sequences WHERE company_id=co.id AND environment='production';
  IF prod_before IS DISTINCT FROM prod_after THEN fails := fails || 'reserva em homologacao alterou producao'; END IF;
 EXCEPTION WHEN OTHERS THEN notes := notes || ('sandbox reservation not exercised: '||SQLERRM); END;

 RAISE EXCEPTION 'MATRIX_RESULT checks=% fails=% | FAILS: % | NOTES: %', checks, coalesce(array_length(fails,1),0), array_to_string(fails,' ; '), array_to_string(notes,' ; ');
END $m$;
