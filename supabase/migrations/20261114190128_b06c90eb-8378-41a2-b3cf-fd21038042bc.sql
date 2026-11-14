CREATE OR REPLACE FUNCTION public.reserve_dps_number(_company_id uuid,_organization_id uuid,_series integer,_environment public.environment,_requested_by uuid) RETURNS text LANGUAGE plpgsql SET search_path='' AS $$ DECLARE seq public.dps_sequences; reserved bigint; settings public.company_fiscal_settings; rule_error text; BEGIN
IF _requested_by IS NULL OR NOT(EXISTS(SELECT 1 FROM public.platform_admins WHERE user_id=_requested_by) OR EXISTS(SELECT 1 FROM public.organization_members WHERE organization_id=_organization_id AND user_id=_requested_by AND role IN('owner','admin')) OR (current_setting('notem.invoice_integration',true) IS NOT NULL AND EXISTS(SELECT 1 FROM public.integrations WHERE id::text=current_setting('notem.invoice_integration',true) AND organization_id=_organization_id AND active AND created_by=_requested_by))) THEN RAISE EXCEPTION 'Acesso não autorizado.'; END IF;
SELECT * INTO settings FROM public.company_fiscal_settings WHERE company_id=_company_id AND organization_id=_organization_id AND dps_series=_series FOR SHARE;
IF settings.company_id IS NULL THEN RAISE EXCEPTION 'Série DPS não atribuída a esta empresa.'; END IF;
rule_error:=public.approximate_tax_rule_error(settings.simples_nacional_option,settings.approx_taxes_mode); IF rule_error IS NOT NULL THEN RAISE EXCEPTION '%',rule_error; END IF;
rule_error:=public.special_tax_rule_error(settings.simples_nacional_option,settings.simples_nacional_regime,settings.special_tax_regime); IF rule_error IS NOT NULL THEN RAISE EXCEPTION '%',rule_error; END IF;
IF settings.special_tax_regime<>0 AND EXISTS(SELECT 1 FROM public.company_service_profiles WHERE company_id=_company_id AND active AND iss_taxation IN(2,3,4)) THEN RAISE EXCEPTION 'Para imunidade, exportação ou não incidência, o regime especial deve ser Nenhum (E0172).'; END IF;
SELECT * INTO seq FROM public.dps_sequences WHERE company_id=_company_id AND organization_id=_organization_id AND series=_series AND environment=_environment FOR UPDATE;
IF seq.company_id IS NULL OR seq.exhausted THEN RAISE EXCEPTION 'Numeração DPS indisponível ou esgotada.'; END IF;
reserved:=seq.next_number;
UPDATE public.dps_sequences SET next_number=CASE WHEN reserved=999999999999999 THEN reserved ELSE reserved+1 END,exhausted=(reserved=999999999999999),updated_at=now() WHERE company_id=_company_id AND series=_series AND environment=_environment;
RETURN reserved::text; END $$;
REVOKE ALL ON FUNCTION public.reserve_dps_number(uuid,uuid,integer,public.environment,uuid) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.reserve_dps_number(uuid,uuid,integer,public.environment,uuid) TO service_role;
DO $$ DECLARE def text; BEGIN
SELECT pg_get_functiondef('public.create_invoice_request(jsonb)'::regprocedure) INTO def;
def:=replace(def,'IF _payload->''customer_snapshot''->>''tipo'' NOT IN(''pj'',''pf'')','IF coalesce(_payload->''customer_snapshot''->>''tipo'','''') NOT IN(''pj'',''pf'')');
def:=replace(def,'n:=public.reserve_dps_number','PERFORM 1 FROM public.integrations WHERE id=(_payload->>''integration_id'')::uuid AND organization_id=c.organization_id AND active AND created_by=(_payload->>''created_by'')::uuid; IF NOT FOUND THEN RAISE EXCEPTION ''Acesso não autorizado.''; END IF; PERFORM set_config(''notem.invoice_integration'',_payload->>''integration_id'',true); n:=public.reserve_dps_number');
EXECUTE def;
END $$;
REVOKE ALL ON FUNCTION public.create_invoice_request(jsonb) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.create_invoice_request(jsonb) TO service_role;