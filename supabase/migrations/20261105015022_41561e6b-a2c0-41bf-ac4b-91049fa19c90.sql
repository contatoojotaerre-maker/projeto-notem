BEGIN;
DO $$ DECLARE actor uuid; org uuid; integ uuid; ep uuid=gen_random_uuid(); event text='evt_'||replace(gen_random_uuid()::text,'-',''); d public.webhook_deliveries; n integer; original_body text; BEGIN
SELECT user_id INTO actor FROM public.platform_admins LIMIT 1; SELECT organization_id,id INTO org,integ FROM public.integrations WHERE active LIMIT 1; IF actor IS NULL OR integ IS NULL THEN RAISE EXCEPTION 'Teste exige administrador e integração'; END IF;
IF has_function_privilege('authenticated','public.manage_webhook(uuid,uuid,uuid,text,uuid,jsonb)','EXECUTE') OR has_column_privilege('authenticated','public.webhook_endpoints','secret','SELECT') OR has_table_privilege('authenticated','public.webhook_deliveries','INSERT') THEN RAISE EXCEPTION 'TEST_GRANTS'; END IF;
PERFORM public.manage_webhook(actor,org,integ,'create',ep,jsonb_build_object('environment','sandbox','url','https://example.com/webhook','events',jsonb_build_array('webhook.teste'),'secret',jsonb_build_object('version','test'),'secret_prefix','test'));
original_body=jsonb_build_object('id',event,'tipo','webhook.teste','ambiente','homologacao','organizacao_id',org,'integracao_id',integ,'dados',jsonb_build_object())::text;
PERFORM public.emit_webhook_event(event,org,integ,'sandbox','webhook.teste',original_body,ep);
FOR n IN 1..8 LOOP SELECT * INTO d FROM public.claim_webhook_deliveries(event,10); IF d.id IS NULL OR d.attempt<>n THEN RAISE EXCEPTION 'TEST_ATTEMPT_%',n; END IF; PERFORM public.finish_webhook_delivery(d.id,d.claim_token,500,'safe',10,'HTTP_FALHOU'); UPDATE public.webhook_deliveries SET next_attempt_at=now() WHERE event_id=event AND status='pending'; END LOOP;
IF (SELECT count(*) FROM public.webhook_deliveries WHERE event_id=event)<>8 OR (SELECT count(*) FROM public.webhook_deliveries WHERE event_id=event AND status='exhausted')<>1 THEN RAISE EXCEPTION 'TEST_EIGHT'; END IF;
PERFORM public.replay_webhook_delivery(actor,org,d.id); SELECT * INTO d FROM public.claim_webhook_deliveries(event,10); IF d.attempt<>1 OR d.cycle<>1 THEN RAISE EXCEPTION 'TEST_REPLAY'; END IF;
PERFORM public.finish_webhook_delivery(d.id,d.claim_token,204,'',10,''); IF (SELECT failing_since FROM public.webhook_endpoints WHERE id=ep) IS NOT NULL THEN RAISE EXCEPTION 'TEST_SUCCESS_RESET'; END IF;
IF (SELECT body FROM public.webhook_events WHERE id=event)<>original_body THEN RAISE EXCEPTION 'TEST_RAW_BODY'; END IF;
UPDATE public.webhook_endpoints SET failing_since=now()-interval '3 days' WHERE id=ep; PERFORM public.disable_failing_webhooks(); IF (SELECT active FROM public.webhook_endpoints WHERE id=ep) OR NOT EXISTS(SELECT 1 FROM public.webhook_alerts WHERE endpoint_id=ep) THEN RAISE EXCEPTION 'TEST_DISABLE'; END IF;
IF EXISTS(SELECT 1 FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname='public' AND c.relname IN ('webhook_endpoints','webhook_events','webhook_deliveries','webhook_alerts') AND NOT c.relrowsecurity) THEN RAISE EXCEPTION 'TEST_RLS'; END IF;
END $$;
ROLLBACK;