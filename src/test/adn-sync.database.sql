-- ADN synchronization database tests. Single rollback-only block: nothing persists, nothing is sent to the government,
-- and the real invoice is never modified. Fixtures are copies with distinct keys plus a temporary non-admin user.
DO $test$
DECLARE t public.invoices; a public.invoices; b public.invoices; c public.invoices; co public.companies; co2 public.companies;
  k record; tok uuid; r jsonb; res text; n integer; hooks integer; before_hooks integer; tl integer; uid uuid := gen_random_uuid(); org2 uuid;
  ka text; kx text; ke text; kr text; kn text; prov text; f public.invoice_fiscal_events; ev public.nfse_document_events;
  nf jsonb; evt jsonb;
BEGIN
 SELECT * INTO t FROM public.invoices WHERE status='authorized' AND access_key IS NOT NULL ORDER BY created_at LIMIT 1;
 IF t.id IS NULL THEN RAISE EXCEPTION 'ADN tests require an authorized invoice'; END IF;
 SELECT * INTO co FROM public.companies WHERE id=t.company_id; prov := co.cnpj;
 SELECT count(DISTINCT w.integration_id) INTO hooks FROM public.webhook_endpoints w JOIN public.integrations g ON g.id=w.integration_id AND g.active WHERE w.organization_id=t.organization_id AND w.environment=t.environment AND w.active AND w.deleted_at IS NULL;
 BEGIN
  ka := left(t.access_key,23)||'8888888888880'||right(t.access_key,14); kx := left(t.access_key,23)||'8888888888881'||right(t.access_key,14);
  ke := left(t.access_key,23)||'8888888888882'||right(t.access_key,14); kr := left(t.access_key,23)||'8888888888883'||right(t.access_key,14);
  kn := left(t.access_key,23)||'8888888888884'||right(t.access_key,14);
  a:=t; a.id:=gen_random_uuid(); a.dps_number:=999999999999980; a.dps_id:=left(t.dps_id,30)||lpad('999999999999980',15,'0'); a.access_key:=ka; a.external_id:=NULL; a.idempotency_key:=NULL; a.nfse_number:='A1'; a.cancellation:=NULL; a.restrictions:='[]'; a.manifestation:=NULL;
  INSERT INTO public.invoices SELECT (a).*;
  b:=a; b.id:=gen_random_uuid(); b.dps_number:=999999999999981; b.dps_id:=left(t.dps_id,30)||lpad('999999999999981',15,'0'); b.access_key:=left(t.access_key,23)||'8888888888885'||right(t.access_key,14); b.nfse_number:='B1';
  INSERT INTO public.invoices SELECT (b).*;
  c:=a; c.id:=gen_random_uuid(); c.dps_number:=999999999999982; c.dps_id:=left(t.dps_id,30)||lpad('999999999999982',15,'0'); c.access_key:=left(t.access_key,23)||'8888888888886'||right(t.access_key,14); c.nfse_number:='C1';
  INSERT INTO public.invoices SELECT (c).*;

  -- Cursor: created for the eligible CNPJ, reserved once; a second reservation while leased returns nothing.
  UPDATE public.adn_sync_cursors SET next_query_at=now(), lease_until=NULL, claim_token=NULL WHERE cnpj=prov;
  SELECT * INTO k FROM public.claim_adn_cursors(5, prov) WHERE environment='production';
  IF k.claim_token IS NULL THEN RAISE EXCEPTION 'TEST_FAIL_claim'; END IF; tok := k.claim_token;
  IF EXISTS (SELECT 1 FROM public.claim_adn_cursors(5, prov) x WHERE x.environment='production') THEN RAISE EXCEPTION 'TEST_FAIL_concurrent_claim'; END IF;
  BEGIN PERFORM public.finish_adn_batch(prov,'production',gen_random_uuid(),'[]','{}'); RAISE EXCEPTION 'TEST_FAIL_wrong_token'; EXCEPTION WHEN OTHERS THEN IF position('ADN_LEASE_LOST' IN SQLERRM)=0 THEN RAISE; END IF; END;

  nf := jsonb_build_object('nfse_number','1','dps_series','900','dps_number','1','issued_at','2026-11-10T12:00:00Z','authorized_at','2026-11-10T12:00:01Z','summary','{}'::jsonb,'xml','<NFSe/>');
  evt := jsonb_build_object('sequence',1,'processed_at','2026-11-14T12:00:00Z','xml','<evento/>');
  r := public.finish_adn_batch(prov,'production',tok, jsonb_build_array(
    jsonb_build_object('nsu',0,'document_type','NFSE','access_key',ka,'nfse', nf || jsonb_build_object('access_key',ka,'dps_id',a.dps_id,'provider_cnpj',prov,'taker_document','11444777000161')),
    jsonb_build_object('nsu',1,'document_type','EVENTO','access_key',ka,'event', evt || jsonb_build_object('access_key',ka,'code','305102','reason_text','Bloqueio de teste')),
    jsonb_build_object('nsu',2,'document_type','EVENTO','access_key',kx,'event', evt || jsonb_build_object('access_key',kx,'code','101101','reason_code','1')),
    jsonb_build_object('nsu',3,'document_type','NFSE','access_key',ke,'nfse', nf || jsonb_build_object('access_key',ke,'provider_cnpj',prov,'taker_document','11444777000161')),
    jsonb_build_object('nsu',4,'document_type','NFSE','access_key',kr,'nfse', nf || jsonb_build_object('access_key',kr,'provider_cnpj','11444777000161','taker_document',prov)),
    jsonb_build_object('nsu',6,'document_type','DPS')),
    '{"status":"syncing","next_nsu":7,"continue":true}');
  IF (r->>'inserted')::int<>6 THEN RAISE EXCEPTION 'TEST_FAIL_inserted %', r; END IF;
  SELECT * INTO k FROM public.adn_sync_cursors WHERE cnpj=prov AND environment='production';
  IF k.next_nsu<>7 OR k.claim_token IS DISTINCT FROM tok OR k.documents_imported<6 THEN RAISE EXCEPTION 'TEST_FAIL_cursor_advance'; END IF;
  -- Same NSUs again: nothing is processed twice.
  r := public.finish_adn_batch(prov,'production',tok, jsonb_build_array(jsonb_build_object('nsu',1,'document_type','EVENTO','access_key',ka,'event', evt || jsonb_build_object('access_key',ka,'code','305102'))), '{"status":"up_to_date","next_query_at":"2099-01-01T00:00:00Z"}');
  IF (r->>'inserted')::int<>0 THEN RAISE EXCEPTION 'TEST_FAIL_nsu_idempotent'; END IF;
  SELECT * INTO k FROM public.adn_sync_cursors WHERE cnpj=prov AND environment='production';
  IF k.claim_token IS NOT NULL OR k.next_nsu<>7 OR k.status<>'up_to_date' THEN RAISE EXCEPTION 'TEST_FAIL_cursor_release'; END IF;
  IF EXISTS (SELECT 1 FROM public.claim_adn_cursors(5, prov) x WHERE x.environment='production') THEN RAISE EXCEPTION 'TEST_FAIL_wait_respected'; END IF;

  -- Notem NFS-e is linked, not duplicated as external; block applied to the notem invoice with a webhook in the outbox.
  IF (SELECT invoice_id FROM public.nfse_documents WHERE environment='production' AND access_key=ka) IS DISTINCT FROM a.id THEN RAISE EXCEPTION 'TEST_FAIL_notem_link'; END IF;
  SELECT * INTO a FROM public.invoices WHERE id=a.id;
  IF a.restrictions->0->>'tipo'<>'bloqueio_prefeitura' THEN RAISE EXCEPTION 'TEST_FAIL_block'; END IF;
  IF (SELECT webhook_type FROM public.nfse_document_events WHERE access_key=ka AND code='305102')<>'nota.bloqueada_prefeitura' THEN RAISE EXCEPTION 'TEST_FAIL_block_webhook'; END IF;
  -- External and received are stored without invoice; event before the note waits and applies on arrival.
  IF (SELECT invoice_id FROM public.nfse_documents WHERE access_key=ke) IS NOT NULL OR (SELECT invoice_id FROM public.nfse_documents WHERE access_key=kr) IS NOT NULL THEN RAISE EXCEPTION 'TEST_FAIL_external'; END IF;
  IF (SELECT applied_at FROM public.nfse_document_events WHERE access_key=kx) IS NOT NULL THEN RAISE EXCEPTION 'TEST_FAIL_pending_event'; END IF;
  PERFORM public.store_nfse_document('production', nf || jsonb_build_object('access_key',kx,'provider_cnpj',prov), 99);
  IF (SELECT status FROM public.nfse_documents WHERE access_key=kx)<>'cancelled' OR (SELECT applied_at FROM public.nfse_document_events WHERE access_key=kx) IS NULL THEN RAISE EXCEPTION 'TEST_FAIL_event_before_note'; END IF;
  IF (SELECT webhook_type FROM public.nfse_document_events WHERE access_key=kx) IS NOT NULL THEN RAISE EXCEPTION 'TEST_FAIL_external_webhook'; END IF;

  -- Transitions on an external note: analysis → rejected (back to authorized) → cancelled; never back from a final state.
  PERFORM public.store_nfse_event('production', evt || jsonb_build_object('access_key',ke,'code','101103'), 'adn_dfe');
  IF (SELECT status FROM public.nfse_documents WHERE access_key=ke)<>'cancellation_pending' THEN RAISE EXCEPTION 'TEST_FAIL_analysis'; END IF;
  PERFORM public.store_nfse_event('production', evt || jsonb_build_object('access_key',ke,'code','105105'), 'adn_dfe');
  IF (SELECT status FROM public.nfse_documents WHERE access_key=ke)<>'authorized' OR (SELECT cancellation->>'situacao' FROM public.nfse_documents WHERE access_key=ke)<>'indeferido' THEN RAISE EXCEPTION 'TEST_FAIL_rejected_analysis'; END IF;
  PERFORM public.store_nfse_event('production', evt || jsonb_build_object('access_key',ke,'code','101103','sequence',2), 'adn_dfe');
  PERFORM public.store_nfse_event('production', evt || jsonb_build_object('access_key',ke,'code','105104'), 'adn_dfe');
  IF (SELECT status FROM public.nfse_documents WHERE access_key=ke)<>'cancelled' THEN RAISE EXCEPTION 'TEST_FAIL_granted'; END IF;
  PERFORM public.store_nfse_event('production', evt || jsonb_build_object('access_key',ke,'code','305101'), 'adn_dfe');
  PERFORM public.store_nfse_event('production', evt || jsonb_build_object('access_key',ke,'code','105105','sequence',2), 'adn_dfe');
  IF (SELECT status FROM public.nfse_documents WHERE access_key=ke)<>'cancelled' THEN RAISE EXCEPTION 'TEST_FAIL_no_regression'; END IF;
  -- Substitution, municipality cancellation, manifestation, informative events.
  PERFORM public.store_nfse_document('production', nf || jsonb_build_object('access_key',kn,'provider_cnpj',prov), 100);
  PERFORM public.store_nfse_event('production', evt || jsonb_build_object('access_key',kn,'code','105102','substitute_key',ke), 'adn_dfe');
  IF (SELECT status||'|'||substituted_by_key FROM public.nfse_documents WHERE access_key=kn)<>'substituted|'||ke THEN RAISE EXCEPTION 'TEST_FAIL_substitution'; END IF;
  PERFORM public.store_nfse_event('production', evt || jsonb_build_object('access_key',kr,'code','203206','reason_text','Serviço não reconhecido'), 'adn_dfe');
  IF (SELECT manifestation->>'situacao'||'|'||(manifestation->>'autor') FROM public.nfse_documents WHERE access_key=kr)<>'rejeitada|tomador' THEN RAISE EXCEPTION 'TEST_FAIL_manifestation'; END IF;
  PERFORM public.store_nfse_event('production', evt || jsonb_build_object('access_key',kr,'code','305101'), 'adn_dfe');
  IF (SELECT status FROM public.nfse_documents WHERE access_key=kr)<>'cancelled_by_authority' THEN RAISE EXCEPTION 'TEST_FAIL_authority'; END IF;
  res := public.store_nfse_event('production', evt || jsonb_build_object('access_key',kr,'code','TRIBUTOS_NFSE_RECOLHIDOS'), 'adn_dfe');
  IF res<>'recorded' THEN RAISE EXCEPTION 'TEST_FAIL_informative %', res; END IF;

  -- Notem invoice cancelled outside notem: timeline "Registrado fora da notem", one webhook per integration, never twice.
  SELECT count(*) INTO before_hooks FROM public.webhook_events WHERE organization_id=a.organization_id AND type='nota.cancelada';
  res := public.store_nfse_event('production', evt || jsonb_build_object('access_key',ka,'code','101101','reason_code','1','reason_text','SERVIÇO NÃO REALIZADO'), 'sefin_consulta');
  IF res<>'changed' THEN RAISE EXCEPTION 'TEST_FAIL_outside_cancel %', res; END IF;
  SELECT * INTO a FROM public.invoices WHERE id=a.id;
  IF a.status<>'cancelled' OR (a.cancellation->>'registrado_fora_da_notem')::boolean IS NOT TRUE OR a.cancellation->>'motivo'<>'erro_emissao' THEN RAISE EXCEPTION 'TEST_FAIL_outside_state'; END IF;
  IF NOT EXISTS (SELECT 1 FROM public.invoice_events WHERE invoice_id=a.id AND type='government_event' AND details->>'mensagem' LIKE 'Registrado fora da notem.%' AND details->>'codigo_evento'='101101') THEN RAISE EXCEPTION 'TEST_FAIL_outside_timeline'; END IF;
  SELECT * INTO ev FROM public.nfse_document_events WHERE access_key=ka AND code='101101';
  IF ev.webhook_type<>'nota.cancelada' THEN RAISE EXCEPTION 'TEST_FAIL_outbox'; END IF;
  n := public.emit_nfse_event_webhook(ev.id, '{"situacao":"cancelada"}'); IF n<>hooks THEN RAISE EXCEPTION 'TEST_FAIL_emit % %', n, hooks; END IF;
  n := public.emit_nfse_event_webhook(ev.id, '{"situacao":"cancelada"}'); IF n<>0 THEN RAISE EXCEPTION 'TEST_FAIL_emit_twice'; END IF;
  IF (SELECT count(*) FROM public.webhook_events WHERE organization_id=a.organization_id AND type='nota.cancelada')<>before_hooks+hooks THEN RAISE EXCEPTION 'TEST_FAIL_webhook_count'; END IF;
  res := public.store_nfse_event('production', evt || jsonb_build_object('access_key',ka,'code','101101'), 'adn_dfe');
  IF res<>'duplicate' THEN RAISE EXCEPTION 'TEST_FAIL_event_idempotent %', res; END IF;
  -- Unblock: restriction removed with its own webhook type.
  PERFORM public.store_nfse_event('production', evt || jsonb_build_object('access_key',ka,'code','305103'), 'adn_dfe');
  IF (SELECT restrictions FROM public.invoices WHERE id=a.id)<>'[]'::jsonb OR (SELECT webhook_type FROM public.nfse_document_events WHERE access_key=ka AND code='305103')<>'nota.desbloqueada_prefeitura' THEN RAISE EXCEPTION 'TEST_FAIL_unblock'; END IF;
  -- Environment isolation: a sandbox event with the same key never touches the production invoice.
  PERFORM public.store_nfse_event('sandbox', evt || jsonb_build_object('access_key',b.access_key,'code','101101'), 'adn_dfe');
  IF (SELECT status FROM public.invoices WHERE id=b.id)<>'authorized' THEN RAISE EXCEPTION 'TEST_FAIL_env_isolation'; END IF;

  -- A notem request awaiting confirmation is confirmed (not "outside"); an already registered one is not duplicated.
  INSERT INTO public.invoice_fiscal_events(invoice_id,organization_id,company_id,environment,origin,requested_by,code,sequence,reason,justification,idempotency_key,request_hash,request_id,status,unsigned_xml)
   VALUES(b.id,b.organization_id,b.company_id,b.environment,'panel',t.created_by,'101101',1,'erro_emissao','Teste de confirmação pelo ADN.','db-adn-1','h','PRE'||b.access_key||'101101','verifying','<x/>') RETURNING * INTO f;
  UPDATE public.invoices SET pending_operation='{"tipo":"cancelamento","estado":"em_verificacao"}' WHERE id=b.id;
  res := public.store_nfse_event('production', evt || jsonb_build_object('access_key',b.access_key,'code','101101'), 'adn_dfe');
  SELECT * INTO b FROM public.invoices WHERE id=b.id; SELECT * INTO f FROM public.invoice_fiscal_events WHERE id=f.id;
  IF b.status<>'cancelled' OR b.pending_operation IS NOT NULL OR f.status<>'registered' OR (b.cancellation->>'registrado_fora_da_notem')::boolean OR b.cancellation->>'justificativa'<>'Teste de confirmação pelo ADN.' THEN RAISE EXCEPTION 'TEST_FAIL_confirm_notem'; END IF;
  IF NOT (SELECT requested_by_notem FROM public.nfse_document_events WHERE environment='production' AND access_key=b.access_key AND code='101101') OR NOT EXISTS (SELECT 1 FROM public.invoice_events WHERE invoice_id=b.id AND type='cancellation_registered') THEN RAISE EXCEPTION 'TEST_FAIL_confirm_flags'; END IF;
  INSERT INTO public.invoice_fiscal_events(invoice_id,organization_id,company_id,environment,origin,requested_by,code,sequence,reason,justification,idempotency_key,request_hash,request_id,status,unsigned_xml,registered_at)
   VALUES(c.id,c.organization_id,c.company_id,c.environment,'panel',t.created_by,'101101',1,'erro_emissao','Teste já registrado pela notem.','db-adn-2','h','PRE'||c.access_key||'101101','registered','<x/>',now());
  UPDATE public.invoices SET status='cancelled' WHERE id=c.id;
  SELECT count(*) INTO tl FROM public.invoice_events WHERE invoice_id=c.id;
  res := public.store_nfse_event('production', evt || jsonb_build_object('access_key',c.access_key,'code','101101'), 'adn_dfe');
  IF res<>'already' OR (SELECT count(*) FROM public.invoice_events WHERE invoice_id=c.id)<>tl THEN RAISE EXCEPTION 'TEST_FAIL_already_registered %', res; END IF;

  -- Visibility with a temporary non-admin user: member of the issuing organization (has certificate) and of another organization.
  co2 := co; co2.id := gen_random_uuid(); co2.cnpj := '11222333000181'; co2.external_id := NULL;
  INSERT INTO public.companies SELECT (co2).*;
  PERFORM public.store_nfse_document('production', nf || jsonb_build_object('access_key',left(t.access_key,23)||'8888888888887'||right(t.access_key,14),'provider_cnpj','11222333000181'), 101);
  INSERT INTO auth.users(id, email, aud, role) VALUES(uid, 'adn-test-'||uid||'@example.invalid', 'authenticated', 'authenticated');
  INSERT INTO public.profiles(id, display_name) VALUES(uid,'Teste ADN') ON CONFLICT (id) DO NOTHING;
  INSERT INTO public.organization_members(organization_id,user_id,role) VALUES(t.organization_id,uid,'viewer');
  PERFORM set_config('request.jwt.claims', json_build_object('sub',uid,'role','authenticated')::text, true);
  SET LOCAL ROLE authenticated;
  IF NOT EXISTS (SELECT 1 FROM public.nfse_documents WHERE access_key=ke) THEN RAISE EXCEPTION 'TEST_FAIL_sees_external'; END IF;
  IF NOT EXISTS (SELECT 1 FROM public.nfse_documents WHERE access_key=kr) THEN RAISE EXCEPTION 'TEST_FAIL_sees_received'; END IF;
  IF EXISTS (SELECT 1 FROM public.nfse_documents WHERE access_key=ka) THEN RAISE EXCEPTION 'TEST_FAIL_notem_as_external'; END IF;
  IF EXISTS (SELECT 1 FROM public.nfse_documents WHERE provider_cnpj='11222333000181') THEN RAISE EXCEPTION 'TEST_FAIL_proof_of_possession'; END IF;
  IF NOT EXISTS (SELECT 1 FROM public.nfse_document_events WHERE access_key=ka) OR NOT EXISTS (SELECT 1 FROM public.adn_sync_cursors WHERE cnpj=prov) THEN RAISE EXCEPTION 'TEST_FAIL_member_reads'; END IF;
  RESET ROLE;
  -- Another organization (member, no company with that CNPJ) sees nothing.
  SELECT id INTO org2 FROM public.organizations WHERE id<>t.organization_id LIMIT 1;
  IF org2 IS NOT NULL THEN
    DELETE FROM public.organization_members WHERE user_id=uid;
    INSERT INTO public.organization_members(organization_id,user_id,role) VALUES(org2,uid,'owner');
    SET LOCAL ROLE authenticated;
    IF EXISTS (SELECT 1 FROM public.nfse_documents) OR EXISTS (SELECT 1 FROM public.nfse_document_events) OR EXISTS (SELECT 1 FROM public.adn_sync_cursors) THEN RAISE EXCEPTION 'TEST_FAIL_org_isolation'; END IF;
    RESET ROLE;
  END IF;
  -- Grants: browsers never write or call the sync functions.
  IF has_function_privilege('authenticated','public.finish_adn_batch(text,public.environment,uuid,jsonb,jsonb)','EXECUTE') OR has_function_privilege('authenticated','public.claim_adn_cursors(integer,text)','EXECUTE')
     OR has_function_privilege('authenticated','public.apply_nfse_event(uuid)','EXECUTE') OR has_function_privilege('authenticated','public.org_proven_cnpj(uuid,text)','EXECUTE')
     OR has_table_privilege('authenticated','public.nfse_documents','INSERT') OR has_table_privilege('authenticated','public.adn_distributions','SELECT') THEN RAISE EXCEPTION 'TEST_FAIL_grants'; END IF;
  IF (SELECT status FROM public.invoices WHERE id=t.id)<>'authorized' THEN RAISE EXCEPTION 'TEST_FAIL_real_invoice_touched'; END IF;
  RAISE EXCEPTION USING ERRCODE='ZX001', MESSAGE='ADN assertions passed; rollback';
 EXCEPTION WHEN SQLSTATE 'ZX001' THEN NULL; END;
 IF EXISTS (SELECT 1 FROM public.invoices WHERE id IN (a.id,b.id,c.id)) OR EXISTS (SELECT 1 FROM public.nfse_documents WHERE access_key IN (ka,ke,kr,kx,kn)) OR EXISTS (SELECT 1 FROM auth.users WHERE id=uid) THEN RAISE EXCEPTION 'TEST_FAIL_rollback'; END IF;
 RAISE NOTICE 'ADN_DB_TESTS_OK';
END $test$;
