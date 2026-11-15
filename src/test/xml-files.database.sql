-- Fiscal XML only as private-file references (rollback-only; nothing persists, nothing is sent).
-- Cancellation request/finish and ADN document/event store file references; no XML text column remains.
DO $test$
DECLARE t public.invoices; a public.invoices; owner uuid; r jsonb; e public.invoice_fiscal_events; k text; ref jsonb; doc uuid; res text; BEGIN
 IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name IN ('invoices','invoice_dps_attempts','invoice_fiscal_events','nfse_documents','nfse_document_events') AND column_name ~ '(^xml$|_xml$)') THEN RAISE EXCEPTION 'TEST_FAIL_xml_columns_remain'; END IF;
 SELECT * INTO t FROM public.invoices WHERE access_key IS NOT NULL ORDER BY created_at LIMIT 1;
 SELECT coalesce((SELECT user_id FROM public.organization_members WHERE organization_id=t.organization_id AND role IN ('owner','admin') LIMIT 1),(SELECT user_id FROM public.platform_admins LIMIT 1)) INTO owner;
 IF t.id IS NULL OR owner IS NULL THEN RAISE EXCEPTION 'requires invoice and manager'; END IF;
 BEGIN
  k := left(t.access_key,23)||'7777777777771'||right(t.access_key,14);
  a:=t; a.id:=gen_random_uuid(); a.status:='authorized'; a.cancellation:=NULL; a.pending_operation:=NULL; a.dps_number:=999999999999960; a.dps_id:=left(t.dps_id,30)||lpad('999999999999960',15,'0'); a.access_key:=k; a.external_id:=NULL; a.idempotency_key:=NULL; a.nfse_number:='X1'; a.substitutes_invoice_id:=NULL; a.substituted_by_invoice_id:=NULL;
  INSERT INTO public.invoices SELECT (a).*;
  ref := jsonb_build_object('path','homologacao/teste/evento.xml.gz','size',1,'stored_size',1,'sha256',encode(extensions.digest(convert_to('<chNFSe>'||k||'</chNFSe>','UTF8'),'sha256'),'hex'));
  r := public.create_fiscal_event_request(jsonb_build_object('organization_id',a.organization_id,'environment',a.environment,'integration_id',NULL,'origin','panel','requested_by',owner,'invoice_id',a.id,'code','101101','reason','erro_emissao','justification','Teste de arquivos XML no banco.','idempotency_key','db-files-1','request_hash','h','request_id','PRE'||k||'101101','unsigned_xml','<chNFSe>'||k||'</chNFSe>','unsigned_file',ref));
  e := jsonb_populate_record(NULL::public.invoice_fiscal_events, r->'event');
  IF NOT EXISTS (SELECT 1 FROM public.fiscal_xml_files WHERE owner_table='invoice_fiscal_events' AND owner_id=e.id AND kind='unsigned' AND sha256=ref->>'sha256') THEN RAISE EXCEPTION 'TEST_FAIL_event_unsigned_file'; END IF;
  PERFORM public.finish_fiscal_event(e.id,e.claim_token,jsonb_build_object('status','registered','files',jsonb_build_object('signed',ref||'{"path":"homologacao/teste/assinado.xml.gz"}','event',ref||'{"path":"homologacao/teste/oficial.xml.gz"}')),jsonb_build_object('cancellation',jsonb_build_object('situacao','cancelado')),'{"situacao":"cancelada"}','cancellation_registered','Cancelamento registrado pelo governo.','nota.cancelada');
  IF (SELECT count(*) FROM public.fiscal_xml_files WHERE owner_table='invoice_fiscal_events' AND owner_id=e.id)<>3 OR (SELECT status FROM public.invoices WHERE id=a.id)<>'cancelled' THEN RAISE EXCEPTION 'TEST_FAIL_event_finish_files'; END IF;
  doc := public.store_nfse_document(a.environment, jsonb_build_object('access_key',k,'provider_cnpj','00000000000000','xml','<NFSe/>','xml_file',ref||'{"path":"homologacao/teste/nfse.xml.gz"}'), 1);
  IF NOT EXISTS (SELECT 1 FROM public.fiscal_xml_files WHERE owner_table='nfse_documents' AND owner_id=doc AND kind='xml') THEN RAISE EXCEPTION 'TEST_FAIL_doc_file'; END IF;
  res := public.store_nfse_event(a.environment, jsonb_build_object('access_key',k,'code','101101','sequence',1,'processed_at','2026-11-14T12:00:00Z','xml','<evento/>','xml_file',ref||'{"path":"homologacao/teste/evt.xml.gz"}'), 'adn_eventos');
  IF res NOT IN ('already','recorded','changed') OR NOT EXISTS (SELECT 1 FROM public.fiscal_xml_files f JOIN public.nfse_document_events d ON d.id=f.owner_id WHERE f.owner_table='nfse_document_events' AND d.access_key=k) THEN RAISE EXCEPTION 'TEST_FAIL_event_file %', res; END IF;
  RAISE EXCEPTION USING ERRCODE='ZX001', MESSAGE='ok; rollback';
 EXCEPTION WHEN SQLSTATE 'ZX001' THEN NULL; END;
 IF EXISTS (SELECT 1 FROM public.invoices WHERE access_key=k) OR EXISTS (SELECT 1 FROM public.fiscal_xml_files WHERE path LIKE 'homologacao/teste/%') THEN RAISE EXCEPTION 'TEST_FAIL_rollback'; END IF;
END $test$;
