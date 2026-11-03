DROP FUNCTION public.reserve_dps_number(uuid,uuid,integer,public.environment);
CREATE FUNCTION public.reserve_dps_number(_company_id uuid,_organization_id uuid,_series integer,_environment public.environment,_requested_by uuid) RETURNS text LANGUAGE plpgsql SECURITY INVOKER SET search_path='' AS $$
DECLARE seq public.dps_sequences; reserved bigint;
BEGIN
 IF _requested_by IS NULL OR NOT(EXISTS(SELECT 1 FROM public.platform_admins WHERE user_id=_requested_by) OR EXISTS(SELECT 1 FROM public.organization_members WHERE organization_id=_organization_id AND user_id=_requested_by AND role IN('owner','admin'))) THEN RAISE EXCEPTION 'Acesso não autorizado.'; END IF;
 IF NOT EXISTS(SELECT 1 FROM public.company_fiscal_settings WHERE company_id=_company_id AND organization_id=_organization_id AND dps_series=_series) THEN RAISE EXCEPTION 'Série DPS não atribuída a esta empresa.'; END IF;
 SELECT * INTO seq FROM public.dps_sequences WHERE company_id=_company_id AND organization_id=_organization_id AND series=_series AND environment=_environment FOR UPDATE;
 IF seq.company_id IS NULL OR seq.exhausted THEN RAISE EXCEPTION 'Numeração DPS indisponível ou esgotada.'; END IF;
 reserved:=seq.next_number;
 UPDATE public.dps_sequences SET next_number=CASE WHEN reserved=999999999999999 THEN reserved ELSE reserved+1 END,exhausted=(reserved=999999999999999),updated_at=now() WHERE company_id=_company_id AND series=_series AND environment=_environment;
 -- Definitive reservation: future issuance is a separate transaction; no return or recycling operation exists.
 RETURN reserved::text;
END $$;
REVOKE ALL ON FUNCTION public.reserve_dps_number(uuid,uuid,integer,public.environment,uuid) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.reserve_dps_number(uuid,uuid,integer,public.environment,uuid) TO service_role;
COMMENT ON FUNCTION public.reserve_dps_number(uuid,uuid,integer,public.environment,uuid) IS 'Server-only definitive reservation. Call in its own committed transaction. Never return, recycle or reuse numbers even after future issuance failure; gaps accepted.';