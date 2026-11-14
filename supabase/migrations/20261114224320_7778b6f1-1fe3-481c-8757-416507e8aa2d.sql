CREATE OR REPLACE FUNCTION public.apply_nfse_event(_id uuid) RETURNS text LANGUAGE plpgsql SET search_path='' AS $$
DECLARE e public.nfse_document_events; d public.nfse_documents; i public.invoices; f public.invoice_fiscal_events;
  cur text; nxt text; outside boolean := true; msg text; wh text; reason text; restr jsonb; man jsonb; canc jsonb; changed boolean; canc_apply boolean; timeline text; sub uuid;
  finals text[] := ARRAY['cancelled','substituted','cancelled_by_authority'];
BEGIN
  SELECT * INTO e FROM public.nfse_document_events WHERE id=_id FOR UPDATE;
  IF e.id IS NULL OR e.applied_at IS NOT NULL THEN RETURN 'skip'; END IF;
  SELECT * INTO d FROM public.nfse_documents WHERE environment=e.environment AND access_key=e.access_key FOR UPDATE;
  SELECT * INTO i FROM public.invoices WHERE environment=e.environment AND (access_key=e.access_key OR id=d.invoice_id)
    ORDER BY (access_key IS NOT DISTINCT FROM e.access_key) DESC LIMIT 1 FOR UPDATE;
  IF d.id IS NULL AND i.id IS NULL THEN RETURN 'pending'; END IF;

  IF i.id IS NOT NULL AND e.code IN ('101101','101103') THEN
    SELECT * INTO f FROM public.invoice_fiscal_events WHERE invoice_id=i.id AND code=e.code AND status IN ('registered','verifying') ORDER BY created_at DESC LIMIT 1 FOR UPDATE;
    IF f.id IS NOT NULL AND f.status='registered' THEN
      UPDATE public.nfse_document_events SET applied_at=now(), requested_by_notem=true, invoice_id=i.id WHERE id=e.id;
      RETURN 'already';
    ELSIF f.id IS NOT NULL THEN
      outside := false;
      UPDATE public.invoice_fiscal_events SET status='registered', event_xml=coalesce(event_xml,e.xml), registered_at=coalesce(e.processed_at,now()), claim_token=NULL, lease_until=NULL, next_verification_at=NULL WHERE id=f.id;
    END IF;
  END IF;

  cur := coalesce(i.status, d.status); nxt := cur;
  restr := coalesce(i.restrictions, d.restrictions, '[]'::jsonb); man := coalesce(i.manifestation, d.manifestation); canc := coalesce(i.cancellation, d.cancellation);
  reason := CASE e.reason_code WHEN '1' THEN 'erro_emissao' WHEN '2' THEN 'servico_nao_prestado' WHEN '9' THEN 'outros' ELSE NULL END;

  IF e.code='101101' THEN
    IF cur IN ('authorized','cancellation_pending') THEN nxt:='cancelled'; END IF;
    canc := jsonb_build_object('tipo','cancelamento','motivo',coalesce(f.reason,reason),'justificativa',coalesce(f.justification,e.reason_text),'solicitado_em',coalesce(f.created_at,e.event_at),'registrado_em',e.processed_at,'situacao','cancelado','pode_solicitar_analise',false,'registrado_fora_da_notem',outside,'erros_governo','[]'::jsonb,'evento_id',f.id);
    msg := 'Cancelamento da NFS-e registrado.'; wh := 'nota.cancelada';
  ELSIF e.code='101103' THEN
    IF cur='authorized' THEN nxt:='cancellation_pending'; END IF;
    canc := jsonb_build_object('tipo','analise_cancelamento','motivo',coalesce(f.reason,reason),'justificativa',coalesce(f.justification,e.reason_text),'solicitado_em',coalesce(f.created_at,e.event_at),'registrado_em',e.processed_at,'situacao','em_analise','pode_solicitar_analise',false,'registrado_fora_da_notem',outside,'erros_governo','[]'::jsonb,'evento_id',f.id);
    msg := 'Pedido de análise fiscal do cancelamento registrado; aguardando decisão da prefeitura.'; wh := 'nota.cancelamento_em_analise';
  ELSIF e.code='105104' THEN
    IF cur IN ('authorized','cancellation_pending') THEN nxt:='cancelled'; END IF;
    canc := coalesce(canc,'{}'::jsonb) || jsonb_build_object('situacao','cancelado','registrado_em',e.processed_at,'decisao_prefeitura','deferido');
    msg := 'A prefeitura deferiu o cancelamento.'; wh := 'nota.cancelada';
  ELSIF e.code='105105' THEN
    IF cur='cancellation_pending' THEN nxt:='authorized'; END IF;
    canc := coalesce(canc,'{}'::jsonb) || jsonb_build_object('situacao','indeferido','decisao_prefeitura','indeferido','decidido_em',e.processed_at);
    msg := 'A prefeitura indeferiu o cancelamento; a nota segue autorizada.'; wh := 'nota.cancelamento_indeferido';
  ELSIF e.code='105102' THEN
    IF cur IN ('authorized','cancellation_pending') THEN nxt:='substituted'; END IF;
    msg := 'NFS-e cancelada por substituição.'; wh := 'nota.substituida';
  ELSIF e.code='305101' THEN
    IF NOT (cur = ANY(finals)) THEN nxt:='cancelled_by_authority'; END IF;
    msg := 'A prefeitura cancelou a nota por ofício.'; wh := 'nota.cancelada_prefeitura';
  ELSIF e.code='305102' THEN
    restr := coalesce((SELECT jsonb_agg(x) FROM jsonb_array_elements(restr) x WHERE x->>'tipo' IS DISTINCT FROM 'bloqueio_prefeitura'),'[]'::jsonb)
      || jsonb_build_array(jsonb_build_object('tipo','bloqueio_prefeitura','evento','305102','desde',e.processed_at,'motivo',e.reason_text));
    msg := 'A prefeitura bloqueou a nota por ofício.'; wh := 'nota.bloqueada_prefeitura';
  ELSIF e.code='305103' THEN
    restr := coalesce((SELECT jsonb_agg(x) FROM jsonb_array_elements(restr) x WHERE x->>'tipo' IS DISTINCT FROM 'bloqueio_prefeitura'),'[]'::jsonb);
    msg := 'A prefeitura retirou o bloqueio da nota.'; wh := 'nota.desbloqueada_prefeitura';
  ELSIF e.code IN ('202201','203202','204203','205204','202205','203206','204207','205208') THEN
    man := jsonb_build_object(
      'situacao', CASE WHEN e.code IN ('202201','203202','204203') THEN 'confirmada' WHEN e.code='205204' THEN 'confirmada_tacitamente' WHEN e.code='205208' THEN 'rejeicao_anulada' ELSE 'rejeitada' END,
      'autor', CASE WHEN e.code IN ('202201','202205') THEN 'prestador' WHEN e.code IN ('203202','203206') THEN 'tomador' WHEN e.code IN ('204203','204207') THEN 'intermediario' ELSE NULL END,
      'evento', e.code, 'registrada_em', e.processed_at, 'motivo', e.reason_text);
    msg := CASE e.code WHEN '202201' THEN 'O prestador confirmou a nota.' WHEN '203202' THEN 'O tomador confirmou a nota.' WHEN '204203' THEN 'O intermediário confirmou a nota.' WHEN '205204' THEN 'Confirmação tácita registrada.' WHEN '202205' THEN 'O prestador rejeitou a nota.' WHEN '203206' THEN 'O tomador rejeitou a nota.' WHEN '204207' THEN 'O intermediário rejeitou a nota.' ELSE 'A rejeição da nota foi anulada.' END;
    wh := 'nota.manifestacao';
  ELSE
    msg := CASE e.code WHEN 'INCLUSAO_NFSE_DAN' THEN 'NFS-e incluída no documento de arrecadação (DAN).' WHEN 'TRIBUTOS_NFSE_RECOLHIDOS' THEN 'Tributos da NFS-e recolhidos.' ELSE 'Evento oficial registrado.' END;
  END IF;

  changed := nxt IS DISTINCT FROM cur OR restr IS DISTINCT FROM coalesce(i.restrictions, d.restrictions, '[]'::jsonb) OR man IS DISTINCT FROM coalesce(i.manifestation, d.manifestation)
    OR (e.code IN ('101101','101103','105104','105105') AND nxt IS DISTINCT FROM cur);
  IF wh IS NULL THEN changed := false; END IF;
  -- The cancellation object changes only with the status or when confirming a notem request; late decisions never rewrite a final state.
  canc_apply := e.code IN ('101101','101103','105104','105105') AND (nxt IS DISTINCT FROM cur OR NOT outside);

  IF i.id IS NOT NULL THEN
    IF e.code='105102' AND nxt='substituted' AND e.substitute_key IS NOT NULL THEN
      SELECT s.id INTO sub FROM public.invoices s WHERE s.environment=i.environment AND s.organization_id=i.organization_id AND s.access_key=e.substitute_key LIMIT 1;
    END IF;
    UPDATE public.invoices SET status=nxt, restrictions=restr, manifestation=man,
      cancellation=CASE WHEN canc_apply THEN canc ELSE cancellation END,
      pending_operation=CASE WHEN nxt IS DISTINCT FROM cur OR NOT outside THEN NULL ELSE pending_operation END,
      substituted_by_invoice_id=coalesce(substituted_by_invoice_id, sub), updated_at=now()
    WHERE id=i.id;
    IF changed OR wh IS NULL OR NOT outside THEN
      timeline := CASE WHEN NOT outside THEN (CASE WHEN e.code='101101' THEN 'cancellation_registered' ELSE 'analysis_registered' END) ELSE 'government_event' END;
      INSERT INTO public.invoice_events(invoice_id,organization_id,type,details) VALUES(i.id,i.organization_id,timeline,
        jsonb_build_object('mensagem', CASE WHEN outside THEN 'Registrado fora da notem. ' || msg ELSE msg END,'codigo_evento',e.code,'sequencia',e.sequence,'registrado_fora_da_notem',outside,'evento_oficial_id',e.id,'registrado_em',e.processed_at));
    END IF;
  END IF;

  IF d.id IS NOT NULL THEN
    UPDATE public.nfse_documents SET status=nxt, restrictions=restr, manifestation=man,
      cancellation=CASE WHEN canc_apply THEN canc ELSE cancellation END,
      substituted_by_key=CASE WHEN e.code='105102' THEN coalesce(e.substitute_key, substituted_by_key) ELSE substituted_by_key END, updated_at=now()
    WHERE id=d.id;
  END IF;

  UPDATE public.nfse_document_events SET applied_at=now(), requested_by_notem=NOT outside, invoice_id=i.id,
    webhook_type=CASE WHEN i.id IS NOT NULL AND changed THEN wh ELSE NULL END WHERE id=e.id;
  RETURN CASE WHEN changed THEN 'changed' ELSE 'recorded' END;
END $$;
REVOKE ALL ON FUNCTION public.apply_nfse_event(uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.apply_nfse_event(uuid) TO service_role;