-- NT 009 layout start and base DPS replacement in the database (rollback-only; nothing persists, nothing is sent).
-- Only a platform administrator may change the start (audited); browsers cannot read settings or call the functions;
-- the base DPS is replaced only under the current dispatch lease.
DO $test$
DECLARE co public.companies; org2 uuid; u uuid; adm uuid; role_name text; before timestamptz; n int; inv public.invoices; ok boolean; BEGIN
 BEGIN
  SELECT nt009r1_production_starts_at INTO before FROM public.platform_settings WHERE id;
  IF before IS DISTINCT FROM '2026-12-01 03:00:00+00'::timestamptz THEN RAISE EXCEPTION 'TEST_FAIL_default %', before; END IF;
  SELECT * INTO co FROM public.companies ORDER BY created_at LIMIT 1;
  FOREACH role_name IN ARRAY ARRAY['owner','admin','operator','developer','viewer','none'] LOOP
   u := gen_random_uuid();
   INSERT INTO auth.users(id,email,aud,role) VALUES(u,'layout-perm-'||u||'@example.invalid','authenticated','authenticated');
   INSERT INTO public.profiles(id,display_name) VALUES(u,'Teste') ON CONFLICT (id) DO NOTHING;
   IF role_name<>'none' AND co.id IS NOT NULL THEN INSERT INTO public.organization_members(organization_id,user_id,role) VALUES(co.organization_id,u,role_name::public.org_role); END IF;
   BEGIN PERFORM public.set_nt009_production_start('2027-01-01 03:00:00+00',u); RAISE EXCEPTION 'TEST_FAIL_accepted_%', role_name;
   EXCEPTION WHEN OTHERS THEN IF position('SEM_PERMISSAO' IN SQLERRM)=0 THEN RAISE; END IF; END;
  END LOOP;
  IF (SELECT nt009r1_production_starts_at FROM public.platform_settings WHERE id) <> before THEN RAISE EXCEPTION 'TEST_FAIL_changed_by_refused'; END IF;
  adm := gen_random_uuid();
  INSERT INTO auth.users(id,email,aud,role) VALUES(adm,'layout-perm-'||adm||'@example.invalid','authenticated','authenticated');
  INSERT INTO public.profiles(id,display_name) VALUES(adm,'Teste') ON CONFLICT (id) DO NOTHING;
  INSERT INTO public.platform_admins(user_id) VALUES(adm);
  BEGIN PERFORM public.set_nt009_production_start('1999-01-01 00:00:00+00',adm); RAISE EXCEPTION 'TEST_FAIL_invalid_date';
  EXCEPTION WHEN OTHERS THEN IF position('DATA_INVALIDA' IN SQLERRM)=0 THEN RAISE; END IF; END;
  PERFORM public.set_nt009_production_start('2027-01-01 03:00:00+00',adm);
  IF (SELECT nt009r1_production_starts_at FROM public.platform_settings WHERE id) <> '2027-01-01 03:00:00+00'::timestamptz THEN RAISE EXCEPTION 'TEST_FAIL_not_changed'; END IF;
  SELECT count(*) INTO n FROM public.admin_audit_events WHERE actor_id=adm AND action='leiaute.vigencia_producao_alterada' AND details->>'anterior' IS NOT NULL AND (details->>'novo')::timestamptz='2027-01-01 03:00:00+00';
  IF n<>1 THEN RAISE EXCEPTION 'TEST_FAIL_audit %', n; END IF;
  -- Browsers never read the settings nor call the functions.
  IF has_table_privilege('authenticated','public.platform_settings','SELECT') OR has_table_privilege('anon','public.platform_settings','SELECT')
     OR has_function_privilege('authenticated','public.set_nt009_production_start(timestamptz,uuid)','EXECUTE')
     OR has_function_privilege('authenticated','public.replace_invoice_dps_base(uuid,uuid,uuid,jsonb,text,text)','EXECUTE') THEN RAISE EXCEPTION 'TEST_FAIL_grants'; END IF;
  -- Base replacement requires the current lease of a not-yet-sent dispatch.
  SELECT * INTO inv FROM public.invoices ORDER BY created_at LIMIT 1;
  IF inv.id IS NOT NULL THEN
   ok := public.replace_invoice_dps_base(inv.id,inv.organization_id,gen_random_uuid(),jsonb_build_object('path','x/y/z.xml.gz','size',1,'stored_size',1,'sha256',repeat('a',64)),'nt004','nt009r1');
   IF ok THEN RAISE EXCEPTION 'TEST_FAIL_replace_without_lease'; END IF;
   BEGIN PERFORM public.replace_invoice_dps_base(inv.id,inv.organization_id,gen_random_uuid(),'{}'::jsonb,'nt004','nt004'); RAISE EXCEPTION 'TEST_FAIL_same_layout';
   EXCEPTION WHEN OTHERS THEN IF position('LEIAUTE_INVALIDO' IN SQLERRM)=0 THEN RAISE; END IF; END;
  END IF;
  RAISE EXCEPTION USING ERRCODE='ZX001', MESSAGE='layout assertions passed; rollback';
 EXCEPTION WHEN SQLSTATE 'ZX001' THEN NULL; END;
 IF (SELECT nt009r1_production_starts_at FROM public.platform_settings WHERE id) <> '2026-12-01 03:00:00+00'::timestamptz OR EXISTS (SELECT 1 FROM auth.users WHERE email LIKE 'layout-perm-%@example.invalid') THEN RAISE EXCEPTION 'TEST_FAIL_rollback'; END IF;
 RAISE NOTICE 'LAYOUT_SETTINGS_DB_TESTS_OK';
END $test$;
