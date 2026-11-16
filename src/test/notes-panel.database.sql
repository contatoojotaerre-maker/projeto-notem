-- Fase 8 notes panel (rollback-only; nothing persists, nothing is sent).
-- org_notes_summary sums numeric decimal strings (exact cents, never float), counts per origin, includes
-- external notes only with proof of possession, and the list search matches normalized taker document/name.
DO $test$
DECLARE d public.nfse_documents; x public.nfse_documents; t public.invoices; a public.invoices; org uuid; owner uuid; stranger uuid; org2 uuid;
  s record; n bigint; v text; k text; i int; vals text[] := ARRAY['0.10','0.20','1749.99','0.05','100.00','55.55']; sts text[] := ARRAY['authorized','authorized','authorized','cancellation_pending','cancelled','rejected'];
  evals text[] := ARRAY['0.10','0.20','33.33','9.99']; ests text[] := ARRAY['authorized','authorized','authorized','cancelled'];
  f timestamptz := '2099-01-01T00:00:00-03:00'; tt timestamptz := '2099-02-01T00:00:00-03:00'; BEGIN
 SELECT dd.* INTO d FROM public.nfse_documents dd WHERE dd.invoice_id IS NULL AND EXISTS (SELECT 1 FROM public.companies c JOIN public.company_certificates cc ON cc.company_id=c.id AND cc.organization_id=c.organization_id WHERE public.normalize_cnpj(c.cnpj)=dd.provider_cnpj AND public.normalize_cnpj(cc.cnpj)=dd.provider_cnpj) ORDER BY dd.created_at LIMIT 1;
 IF d.id IS NULL THEN RAISE NOTICE 'NOTES_PANEL_DB_TESTS_SKIPPED (no external note with proof of possession)'; RETURN; END IF;
 SELECT c.organization_id INTO org FROM public.companies c JOIN public.company_certificates cc ON cc.company_id=c.id AND cc.organization_id=c.organization_id WHERE public.normalize_cnpj(c.cnpj)=d.provider_cnpj LIMIT 1;
 -- Any invoice of the organization serves as a template (copied into the external note's environment).
 SELECT * INTO t FROM public.invoices WHERE organization_id=org ORDER BY (environment=d.environment) DESC, created_at LIMIT 1;
 IF t.id IS NULL THEN RAISE NOTICE 'NOTES_PANEL_DB_TESTS_SKIPPED (no invoice)'; RETURN; END IF;
 BEGIN
  -- Temporary owner of the organization (rolled back with everything else).
  owner := gen_random_uuid();
  INSERT INTO auth.users(id,email,aud,role) VALUES(owner,'fase8-owner-'||owner||'@example.invalid','authenticated','authenticated');
  INSERT INTO public.profiles(id,display_name) VALUES(owner,'Teste') ON CONFLICT (id) DO NOTHING;
  INSERT INTO public.organization_members(organization_id,user_id,role) VALUES(org,owner,'owner');
  FOR i IN 1..6 LOOP
   a:=t; a.id:=gen_random_uuid(); a.environment:=d.environment; a.status:=sts[i]; a.dps_number:=999999999999900+i; a.dps_id:=left(t.dps_id,30)||lpad((999999999999900+i)::text,15,'0');
   a.access_key:=CASE WHEN t.access_key IS NULL THEN NULL ELSE left(t.access_key,23)||lpad(i::text,13,'8')||right(t.access_key,14) END; a.external_id:=NULL; a.idempotency_key:=NULL; a.nfse_number:='T8'||i;
   a.substitutes_invoice_id:=NULL; a.substituted_by_invoice_id:=NULL; a.cancellation:=NULL; a.pending_operation:=NULL; a.emitted_at:='2099-01-10T12:00:00-03:00';
   a.sent_values:=jsonb_set(coalesce(t.sent_values,'{}'),'{servico}',to_jsonb(vals[i]));
   a.customer_snapshot:=jsonb_build_object('nome','José Ação Teste Fase Oito','documento','12.345.678/0001-95');
   INSERT INTO public.invoices SELECT (a).*;
  END LOOP;
  FOR i IN 1..4 LOOP
   x:=d; x.id:=gen_random_uuid(); x.status:=ests[i]; x.access_key:=left(d.access_key,23)||lpad(i::text,13,'9')||right(d.access_key,14); x.nfse_number:='E8'||i;
   x.issued_at:='2099-01-15T09:00:00-03:00'; x.authorized_at:=x.issued_at; x.taker_name:='Ação Externa Fase Oito'; x.taker_document:='98765432000198';
   x.summary:=jsonb_set(coalesce(d.summary,'{}'),'{valores}',coalesce(d.summary->'valores','{}')||jsonb_build_object('valor_servico',evals[i]));
   INSERT INTO public.nfse_documents SELECT (x).*;
  END LOOP;
  -- Called as the organization owner, with the caller's own row rules.
  PERFORM set_config('request.jwt.claims',jsonb_build_object('sub',owner,'role','authenticated')::text,true);
  SET LOCAL ROLE authenticated;
  FOR s IN SELECT * FROM public.org_notes_summary(org,d.environment,f,tt) LOOP
   IF s.origin='notem' AND (s.emitted,s.amount,s.cancelled,s.rejected) IS DISTINCT FROM (5::bigint,'1750.34',1::bigint,1::bigint) THEN RAISE EXCEPTION 'TEST_FAIL_summary_notem %', row_to_json(s); END IF;
   IF s.origin='externa' AND (s.emitted,s.amount,s.cancelled,s.rejected) IS DISTINCT FROM (4::bigint,'33.63',1::bigint,0::bigint) THEN RAISE EXCEPTION 'TEST_FAIL_summary_externa %', row_to_json(s); END IF;
  END LOOP;
  -- Half-open window: one millisecond before/after leaves the notes out.
  IF (SELECT sum(emitted) FROM public.org_notes_summary(org,d.environment,'2099-01-15T09:00:00.001-03:00',tt) WHERE origin='externa')<>0 THEN RAISE EXCEPTION 'TEST_FAIL_window'; END IF;
  -- Search: masked or plain document, accents and case, key; filters by competence keep proof of possession.
  IF public.org_notes_count(org,d.environment,NULL,NULL,NULL,f,tt,'emissao','12345678000195')<>6 THEN RAISE EXCEPTION 'TEST_FAIL_search_doc_plain'; END IF;
  IF public.org_notes_count(org,d.environment,NULL,NULL,NULL,f,tt,'emissao','12.345.678/0001-95')<>6 THEN RAISE EXCEPTION 'TEST_FAIL_search_doc_mask'; END IF;
  IF public.org_notes_count(org,d.environment,NULL,NULL,NULL,f,tt,'emissao','acao externa')<>4 THEN RAISE EXCEPTION 'TEST_FAIL_search_name_external'; END IF;
  IF public.org_notes_count(org,d.environment,NULL,NULL,NULL,f,tt,'emissao','JOSÉ AÇÃO')<>6 THEN RAISE EXCEPTION 'TEST_FAIL_search_name_notem'; END IF;
  IF public.org_notes_count(org,d.environment,NULL,NULL,NULL,f,tt,'emissao','98.765.432/0001-98')<>4 THEN RAISE EXCEPTION 'TEST_FAIL_search_doc_external'; END IF;
  IF public.org_notes_count(org,d.environment,NULL,NULL,NULL,f,tt,'emissao','E82')<>1 THEN RAISE EXCEPTION 'TEST_FAIL_search_number'; END IF;
  IF public.org_notes_count(org,d.environment,NULL,NULL,NULL,f,tt,'emissao','100%_')<>0 THEN RAISE EXCEPTION 'TEST_FAIL_search_wildcards'; END IF;
  RESET ROLE;
  -- A member of another organization sees none of these notes (no proof of possession, other tenant).
  INSERT INTO public.organizations(name,type,created_by) VALUES('Teste painel Fase 8','company',owner) RETURNING id INTO org2;
  stranger := gen_random_uuid();
  INSERT INTO auth.users(id,email,aud,role) VALUES(stranger,'fase8-'||stranger||'@example.invalid','authenticated','authenticated');
  INSERT INTO public.profiles(id,display_name) VALUES(stranger,'Teste') ON CONFLICT (id) DO NOTHING;
  INSERT INTO public.organization_members(organization_id,user_id,role) VALUES(org2,stranger,'owner');
  PERFORM set_config('request.jwt.claims',jsonb_build_object('sub',stranger,'role','authenticated')::text,true);
  SET LOCAL ROLE authenticated;
  SELECT coalesce(sum(emitted),0) INTO n FROM public.org_notes_summary(org,d.environment,f,tt); IF n<>0 THEN RAISE EXCEPTION 'TEST_FAIL_foreign_summary %', n; END IF;
  IF public.org_notes_count(org,d.environment,NULL,NULL,NULL,f,tt,'emissao',NULL)<>0 THEN RAISE EXCEPTION 'TEST_FAIL_foreign_count'; END IF;
  BEGIN PERFORM * FROM public.platform_support_contact(); RAISE EXCEPTION 'TEST_FAIL_support_direct'; EXCEPTION WHEN insufficient_privilege THEN NULL; END;
  BEGIN PERFORM 1 FROM public.platform_settings; RAISE EXCEPTION 'TEST_FAIL_settings_read'; EXCEPTION WHEN insufficient_privilege THEN NULL; END;
  RESET ROLE;
  -- WhatsApp: digits with 55 only.
  BEGIN UPDATE public.platform_settings SET support_whatsapp='48999990000' WHERE id; RAISE EXCEPTION 'TEST_FAIL_whatsapp_ddi'; EXCEPTION WHEN check_violation THEN NULL; END;
  BEGIN UPDATE public.platform_settings SET support_whatsapp='+55 48 99999-0000' WHERE id; RAISE EXCEPTION 'TEST_FAIL_whatsapp_mask'; EXCEPTION WHEN check_violation THEN NULL; END;
  BEGIN PERFORM public.set_platform_support('a@b.co','5548999990000',owner); IF NOT EXISTS (SELECT 1 FROM public.platform_admins WHERE user_id=owner) THEN RAISE EXCEPTION 'TEST_FAIL_support_non_admin'; END IF; EXCEPTION WHEN OTHERS THEN IF position('SEM_PERMISSAO' IN SQLERRM)=0 THEN RAISE; END IF; END;
  RAISE EXCEPTION USING ERRCODE='ZX001', MESSAGE='notes panel assertions passed; rollback';
 EXCEPTION WHEN SQLSTATE 'ZX001' THEN NULL; END;
 IF EXISTS (SELECT 1 FROM public.invoices WHERE nfse_number LIKE 'T8_' AND emitted_at>'2098-12-31') OR EXISTS (SELECT 1 FROM public.organizations WHERE name='Teste painel Fase 8') OR EXISTS (SELECT 1 FROM auth.users WHERE email LIKE 'fase8-%@example.invalid') THEN RAISE EXCEPTION 'TEST_FAIL_rollback'; END IF;
 RAISE NOTICE 'NOTES_PANEL_DB_TESTS_OK';
END $test$;
