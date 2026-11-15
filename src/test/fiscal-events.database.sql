-- Run as a single rollback-only block (no data persists). Uses copies of an authorized invoice as fixtures;
-- the real invoice itself is never modified and nothing is sent to the government.
DO $test$
DECLARE t public.invoices; a public.invoices; b public.invoices; s public.invoices; integ public.integrations; r jsonb; e public.invoice_fiscal_events; payload jsonb; before_events integer; before_hooks integer; hooks integer; tl integer; claimed integer;
BEGIN
 SELECT * INTO t FROM public.invoices WHERE status='authorized' AND access_key IS NOT NULL ORDER BY created_at LIMIT 1;
 IF t.id IS NULL THEN RAISE EXCEPTION 'Fiscal event tests require an authorized invoice'; END IF;
 SELECT * INTO integ FROM public.integrations WHERE organization_id=t.organization_id AND active ORDER BY created_at LIMIT 1;
 SELECT count(DISTINCT w.integration_id) INTO hooks FROM public.webhook_endpoints w JOIN public.integrations g ON g.id=w.integration_id AND g.active WHERE w.organization_id=t.organization_id AND w.environment=t.environment AND w.active AND w.deleted_at IS NULL;
 BEGIN
  -- Fixture copies with distinct numbers/keys (rolled back).
  a:=t; a.id:=gen_random_uuid(); a.dps_number:=999999999999990; a.dps_id:=left(t.dps_id,30)||lpad('999999999999990',15,'0'); a.access_key:=left(t.access_key,23)||'9999999999990'||right(t.access_key,14); a.external_id:=NULL; a.idempotency_key:=NULL; a.nfse_number:='T1'; a.substituted_by_invoice_id:=NULL; a.substitutes_invoice_id:=NULL;
  INSERT INTO public.invoices SELECT (a).*;
  b:=a; b.id:=gen_random_uuid(); b.dps_number:=999999999999991; b.dps_id:=left(t.dps_id,30)||lpad('999999999999991',15,'0'); b.access_key:=left(t.access_key,23)||'9999999999991'||right(t.access_key,14); b.nfse_number:='T2';
  INSERT INTO public.invoices SELECT (b).*;
  payload:=jsonb_build_object('organization_id',a.organization_id,'environment',a.environment,'integration_id',integ.id,'origin','api','requested_by',integ.created_by,'invoice_id',a.id,'code','101101','reason','erro_emissao','justification','Teste de cancelamento sem envio.','idempotency_key','db-test-1','request_hash','h1','request_id','PRE'||a.access_key||'101101','unsigned_xml','<chNFSe>'||a.access_key||'</chNFSe>');
  payload:=payload||jsonb_build_object('unsigned_file',jsonb_build_object('path','homologacao/teste/rollback.xml.gz','size',1,'stored_size',1,'sha256',encode(extensions.digest(convert_to(payload->>'unsigned_xml','UTF8'),'sha256'),'hex')));
  -- Permissions: unknown panel user and wrong API actor are refused.
  BEGIN PERFORM public.create_fiscal_event_request(payload||jsonb_build_object('origin','panel','integration_id',NULL,'requested_by',gen_random_uuid())); RAISE EXCEPTION 'TEST_FAIL_panel_permission'; EXCEPTION WHEN OTHERS THEN IF position('SEM_PERMISSAO' IN SQLERRM)=0 THEN RAISE; END IF; END;
  BEGIN PERFORM public.create_fiscal_event_request(payload||jsonb_build_object('requested_by',gen_random_uuid())); RAISE EXCEPTION 'TEST_FAIL_api_permission'; EXCEPTION WHEN OTHERS THEN IF position('SEM_PERMISSAO' IN SQLERRM)=0 THEN RAISE; END IF; END;
  -- Request id must match the key.
  BEGIN PERFORM public.create_fiscal_event_request(payload||jsonb_build_object('request_id','PRE'||t.access_key||'101101')); RAISE EXCEPTION 'TEST_FAIL_request_id'; EXCEPTION WHEN OTHERS THEN IF position('EVENTO_INVALIDO' IN SQLERRM)=0 THEN RAISE; END IF; END;
  r:=public.create_fiscal_event_request(payload); IF NOT (r->>'created')::boolean THEN RAISE EXCEPTION 'TEST_FAIL_create'; END IF; e:=jsonb_populate_record(NULL::public.invoice_fiscal_events,r->'event');
  r:=public.create_fiscal_event_request(payload); IF (r->>'created')::boolean OR (r->'event'->>'id')::uuid<>e.id THEN RAISE EXCEPTION 'TEST_FAIL_idempotent_replay'; END IF;
  BEGIN PERFORM public.create_fiscal_event_request(payload||jsonb_build_object('request_hash','other')); RAISE EXCEPTION 'TEST_FAIL_hash'; EXCEPTION WHEN OTHERS THEN IF position('IDEMPOTENCIA_CONFLITO' IN SQLERRM)=0 THEN RAISE; END IF; END;
  BEGIN PERFORM public.create_fiscal_event_request(payload||jsonb_build_object('idempotency_key','db-test-2')); RAISE EXCEPTION 'TEST_FAIL_single_active'; EXCEPTION WHEN OTHERS THEN IF position('CONFLITO_OPERACAO' IN SQLERRM)=0 THEN RAISE; END IF; END;
  -- Registered cancellation: invoice cancelled, one timeline row, one webhook per subscribed integration.
  SELECT count(*) INTO before_hooks FROM public.webhook_events WHERE organization_id=a.organization_id AND type='nota.cancelada';
  SELECT count(*) INTO before_events FROM public.invoice_events WHERE invoice_id=a.id;
  PERFORM public.finish_fiscal_event(e.id,e.claim_token,jsonb_build_object('status','registered','event_xml','<evento/>'),jsonb_build_object('cancellation',jsonb_build_object('situacao','cancelado')),'{"situacao":"cancelada"}'::jsonb,'cancellation_registered','Cancelamento registrado pelo governo.','nota.cancelada');
  SELECT * INTO a FROM public.invoices WHERE id=a.id;
  IF a.status<>'cancelled' OR a.pending_operation IS NOT NULL OR a.cancellation->>'situacao'<>'cancelado' THEN RAISE EXCEPTION 'TEST_FAIL_registered_state'; END IF;
  IF (SELECT count(*) FROM public.invoice_events WHERE invoice_id=a.id)<>before_events+1 THEN RAISE EXCEPTION 'TEST_FAIL_timeline'; END IF;
  IF (SELECT count(*) FROM public.webhook_events WHERE organization_id=a.organization_id AND type='nota.cancelada')<>before_hooks+hooks THEN RAISE EXCEPTION 'TEST_FAIL_webhook_count'; END IF;
  IF public.finish_fiscal_event(e.id,e.claim_token,jsonb_build_object('status','registered'),'{}'::jsonb,'{}'::jsonb,'x','x','nota.cancelada') IS NOT NULL THEN RAISE EXCEPTION 'TEST_FAIL_token_reuse'; END IF;
  BEGIN PERFORM public.create_fiscal_event_request(payload||jsonb_build_object('idempotency_key','db-test-3')); RAISE EXCEPTION 'TEST_FAIL_cancelled_again'; EXCEPTION WHEN OTHERS THEN IF position('CONFLITO_SITUACAO' IN SQLERRM)=0 THEN RAISE; END IF; END;
  -- Ambiguous request: pending operation, no duplicate timeline on later checks, then "not registered" keeps the invoice authorized.
  r:=public.create_fiscal_event_request(payload||jsonb_build_object('invoice_id',b.id,'idempotency_key','db-test-4','request_id','PRE'||b.access_key||'101101','unsigned_xml','<chNFSe>'||b.access_key||'</chNFSe>','unsigned_file',jsonb_build_object('path','homologacao/teste/rollback.xml.gz','size',1,'stored_size',1,'sha256',encode(extensions.digest(convert_to('<chNFSe>'||b.access_key||'</chNFSe>','UTF8'),'sha256'),'hex'))));
  e:=jsonb_populate_record(NULL::public.invoice_fiscal_events,r->'event');
  PERFORM public.finish_fiscal_event(e.id,e.claim_token,jsonb_build_object('status','verifying'),jsonb_build_object('pending_operation',jsonb_build_object('tipo','cancelamento','estado','em_verificacao')),'{}'::jsonb,'event_verifying','Aguardando.',NULL);
  SELECT * INTO b FROM public.invoices WHERE id=b.id; IF b.status<>'authorized' OR b.pending_operation->>'estado'<>'em_verificacao' THEN RAISE EXCEPTION 'TEST_FAIL_pending'; END IF;
  SELECT count(*) INTO tl FROM public.invoice_events WHERE invoice_id=b.id;
  UPDATE public.invoice_fiscal_events SET next_verification_at=now()-interval '1 second' WHERE id=e.id;
  SELECT count(*) INTO claimed FROM public.claim_fiscal_event_verifications(5) c WHERE c.id=e.id; IF claimed<>1 THEN RAISE EXCEPTION 'TEST_FAIL_claim'; END IF;
  SELECT * INTO e FROM public.invoice_fiscal_events WHERE id=e.id;
  PERFORM public.finish_fiscal_event(e.id,e.claim_token,jsonb_build_object('status','verifying'),'{}'::jsonb,'{}'::jsonb,'event_verifying','Aguardando.',NULL);
  IF (SELECT count(*) FROM public.invoice_events WHERE invoice_id=b.id)<>tl THEN RAISE EXCEPTION 'TEST_FAIL_repeated_timeline'; END IF;
  UPDATE public.invoice_fiscal_events SET next_verification_at=now()-interval '1 second' WHERE id=e.id; PERFORM public.claim_fiscal_event_verifications(5); SELECT * INTO e FROM public.invoice_fiscal_events WHERE id=e.id;
  PERFORM public.finish_fiscal_event(e.id,e.claim_token,jsonb_build_object('status','not_registered'),jsonb_build_object('cancellation',jsonb_build_object('situacao','nao_registrado')),'{}'::jsonb,'event_not_registered','Sem registro.',NULL);
  SELECT * INTO b FROM public.invoices WHERE id=b.id; IF b.status<>'authorized' OR b.pending_operation IS NOT NULL THEN RAISE EXCEPTION 'TEST_FAIL_not_registered'; END IF;
  -- Substitution: substitute in progress blocks cancellation; the original changes only when the substitute is authorized.
  s:=b; s.id:=gen_random_uuid(); s.status:='processing'; s.dispatch_state:='sending'; s.dps_number:=999999999999992; s.dps_id:=left(t.dps_id,30)||lpad('999999999999992',15,'0'); s.access_key:=NULL; s.nfse_number:=NULL; s.substitutes_invoice_id:=b.id; s.claim_token:=gen_random_uuid(); s.lease_until:=now()+interval '1 minute'; s.cancellation:=NULL;
  INSERT INTO public.invoices SELECT (s).*;
  BEGIN PERFORM public.create_fiscal_event_request(payload||jsonb_build_object('invoice_id',b.id,'idempotency_key','db-test-5','request_id','PRE'||b.access_key||'101101','unsigned_xml','<chNFSe>'||b.access_key||'</chNFSe>','unsigned_file',jsonb_build_object('path','homologacao/teste/rollback.xml.gz','size',1,'stored_size',1,'sha256',encode(extensions.digest(convert_to('<chNFSe>'||b.access_key||'</chNFSe>','UTF8'),'sha256'),'hex')))); RAISE EXCEPTION 'TEST_FAIL_substitution_block'; EXCEPTION WHEN OTHERS THEN IF position('CONFLITO_SUBSTITUICAO' IN SQLERRM)=0 THEN RAISE; END IF; END;
  PERFORM public.finish_invoice_attempt(s.id,s.claim_token,jsonb_build_object('status','rejected','dispatch_state','completed','government_errors','[]'::jsonb,'message','Rejeitada.'),'{}'::jsonb,'rejected','{}'::jsonb);
  IF (SELECT status FROM public.invoices WHERE id=b.id)<>'authorized' THEN RAISE EXCEPTION 'TEST_FAIL_rejected_substitute_changed_original'; END IF;
  UPDATE public.invoices SET status='processing',claim_token=gen_random_uuid(),lease_until=now()+interval '1 minute' WHERE id=s.id RETURNING * INTO s;
  SELECT count(*) INTO before_hooks FROM public.webhook_events WHERE organization_id=b.organization_id AND type='nota.substituida';
  PERFORM public.finish_invoice_attempt(s.id,s.claim_token,jsonb_build_object('status','authorized','dispatch_state','completed','access_key',left(t.access_key,23)||'9999999999992'||right(t.access_key,14),'nfse_number','T3','message','Autorizada.'),'{}'::jsonb,'authorized','{"situacao":"substituida"}'::jsonb);
  SELECT * INTO b FROM public.invoices WHERE id=b.id; IF b.status<>'substituted' OR b.substituted_by_invoice_id<>s.id THEN RAISE EXCEPTION 'TEST_FAIL_substituted'; END IF;
  IF (SELECT count(*) FROM public.webhook_events WHERE organization_id=b.organization_id AND type='nota.substituida')<>before_hooks+hooks THEN RAISE EXCEPTION 'TEST_FAIL_substituted_webhook'; END IF;
  -- Grants: browsers read only.
  IF has_function_privilege('authenticated','public.create_fiscal_event_request(jsonb)','EXECUTE') OR has_function_privilege('authenticated','public.finish_fiscal_event(uuid,uuid,jsonb,jsonb,jsonb,text,text,text)','EXECUTE') OR has_function_privilege('authenticated','public.claim_fiscal_event_verifications(integer)','EXECUTE') OR has_function_privilege('authenticated','public.can_issue_fiscal_change(uuid,uuid)','EXECUTE') OR has_table_privilege('authenticated','public.invoice_fiscal_events','INSERT') OR NOT has_table_privilege('authenticated','public.invoice_fiscal_events','SELECT') THEN RAISE EXCEPTION 'TEST_FAIL_grants'; END IF;
  IF (SELECT status FROM public.invoices WHERE id=t.id)<>'authorized' THEN RAISE EXCEPTION 'TEST_FAIL_real_invoice_touched'; END IF;
  RAISE EXCEPTION USING ERRCODE='ZX001',MESSAGE='Fiscal event assertions passed; rollback';
 EXCEPTION WHEN SQLSTATE 'ZX001' THEN NULL; END;
 IF EXISTS(SELECT 1 FROM public.invoices WHERE id IN (a.id,b.id)) OR EXISTS(SELECT 1 FROM public.invoice_fiscal_events WHERE invoice_id IN (a.id,b.id)) THEN RAISE EXCEPTION 'TEST_FAIL_rollback'; END IF;
 RAISE NOTICE 'FISCAL_EVENT_DB_TESTS_OK';
END $test$;
