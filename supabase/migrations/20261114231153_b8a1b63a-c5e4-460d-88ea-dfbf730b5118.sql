CREATE OR REPLACE FUNCTION public.store_nfse_document(_env public.environment, _d jsonb, _nsu bigint) RETURNS uuid LANGUAGE plpgsql SET search_path='' AS $$
DECLARE inv public.invoices; doc uuid; ev uuid; BEGIN
  SELECT * INTO inv FROM public.invoices i WHERE i.environment=_env AND (i.access_key=_d->>'access_key' OR (_d->>'dps_id' IS NOT NULL AND i.dps_id=_d->>'dps_id'))
    ORDER BY (i.access_key IS NOT DISTINCT FROM _d->>'access_key') DESC LIMIT 1;
  INSERT INTO public.nfse_documents(environment,access_key,invoice_id,nfse_number,dps_id,dps_series,dps_number,competence,issued_at,authorized_at,provider_cnpj,provider_name,taker_document,taker_name,intermediary_document,intermediary_name,substitutes_key,summary,xml,first_nsu)
  VALUES(_env,_d->>'access_key',inv.id,_d->>'nfse_number',_d->>'dps_id',_d->>'dps_series',_d->>'dps_number',(_d->>'competence')::date,(_d->>'issued_at')::timestamptz,(_d->>'authorized_at')::timestamptz,
    _d->>'provider_cnpj',_d->>'provider_name',_d->>'taker_document',_d->>'taker_name',_d->>'intermediary_document',_d->>'intermediary_name',_d->>'substitutes_key',coalesce(_d->'summary','{}'::jsonb),_d->>'xml',_nsu)
  ON CONFLICT (environment,access_key) DO UPDATE SET invoice_id=coalesce(public.nfse_documents.invoice_id, EXCLUDED.invoice_id), updated_at=now()
  RETURNING id INTO doc;
  -- Notem invoice: events may have been applied before the official copy arrived; the copy mirrors the invoice state.
  IF inv.id IS NOT NULL AND inv.status IN ('authorized','cancellation_pending','cancelled','substituted','cancelled_by_authority') THEN
    UPDATE public.nfse_documents SET status=inv.status, restrictions=coalesce(inv.restrictions,'[]'::jsonb), manifestation=inv.manifestation, cancellation=inv.cancellation, updated_at=now() WHERE id=doc;
  END IF;
  FOR ev IN SELECT id FROM public.nfse_document_events WHERE environment=_env AND access_key=_d->>'access_key' AND applied_at IS NULL ORDER BY processed_at NULLS LAST, created_at LOOP
    PERFORM public.apply_nfse_event(ev);
  END LOOP;
  RETURN doc;
END $$;
REVOKE ALL ON FUNCTION public.store_nfse_document(public.environment,jsonb,bigint) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.store_nfse_document(public.environment,jsonb,bigint) TO service_role;