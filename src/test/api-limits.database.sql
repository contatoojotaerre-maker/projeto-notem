-- API rate limits and concurrency slots in the database (rollback-only; expected: RATE_TESTS_OK).
DO $t$
DECLARE r1 jsonb; r2 jsonb; r3 jsonb; r4 jsonb; o uuid; s1 uuid; s2 uuid; s3 uuid; rules jsonb;
BEGIN
 SELECT id INTO o FROM public.organizations ORDER BY created_at LIMIT 1;
 rules := jsonb_build_array(jsonb_build_object('scope','teste:'||gen_random_uuid(),'bucket','geral','max',2,'window',60));
 r1 := to_jsonb(public.api_rate_check(o,rules)); r2 := to_jsonb(public.api_rate_check(o,rules)); r3 := to_jsonb(public.api_rate_check(o,rules));
 IF (r1->>'allowed')::boolean IS NOT TRUE OR (r2->>'allowed')::boolean IS NOT TRUE THEN RAISE EXCEPTION 'TEST_FAIL first two refused % %', r1, r2; END IF;
 IF (r3->>'allowed')::boolean IS NOT FALSE OR (r3->>'retry_after')::int NOT BETWEEN 1 AND 60 OR r3->>'bucket' <> 'geral' THEN RAISE EXCEPTION 'TEST_FAIL third %', r3; END IF;
 INSERT INTO public.api_rate_limit_overrides(organization_id,bucket,max_hits,window_seconds) VALUES(o,'geral',5,60);
 r4 := to_jsonb(public.api_rate_check(o,rules));
 IF (r4->>'allowed')::boolean IS NOT TRUE THEN RAISE EXCEPTION 'TEST_FAIL override ignored %', r4; END IF;
 s1 := public.api_slot_acquire('teste-slot',2,60); s2 := public.api_slot_acquire('teste-slot',2,60); s3 := public.api_slot_acquire('teste-slot',2,60);
 IF s1 IS NULL OR s2 IS NULL OR s3 IS NOT NULL THEN RAISE EXCEPTION 'TEST_FAIL slots % % %', s1, s2, s3; END IF;
 PERFORM public.api_slot_release(s1);
 IF public.api_slot_acquire('teste-slot',2,60) IS NULL THEN RAISE EXCEPTION 'TEST_FAIL slot not released'; END IF;
 RAISE EXCEPTION 'RATE_TESTS_OK r3=%', r3;
END $t$;
