CREATE OR REPLACE FUNCTION public.approximate_tax_rule_error(_option integer, _mode text) RETURNS text LANGUAGE sql IMMUTABLE SET search_path='' AS $$ SELECT CASE WHEN _option=1 AND _mode IS DISTINCT FROM 'percent_by_sphere' THEN 'Para empresas não optantes do Simples, preencha os percentuais federal, estadual e municipal (E0713).' WHEN _option=2 AND _mode='percent_simples' THEN 'Para MEI, informe os percentuais federal, estadual e municipal ou escolha não informar tributos aproximados (E0710).' WHEN _option=3 AND _mode='none' THEN 'Para ME/EPP, informe o percentual do Simples ou os percentuais federal, estadual e municipal. Não informar não é permitido (E0712).' ELSE NULL END $$;
REVOKE ALL ON FUNCTION public.approximate_tax_rule_error(integer,text) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.approximate_tax_rule_error(integer,text) TO authenticated,service_role;
CREATE OR REPLACE FUNCTION public.validate_guided_fiscal_settings() RETURNS trigger LANGUAGE plpgsql SET search_path='' AS $$ DECLARE rule_error text; BEGIN
rule_error:=public.approximate_tax_rule_error(NEW.simples_nacional_option,NEW.approx_taxes_mode);
IF rule_error IS NOT NULL THEN RAISE EXCEPTION '%',rule_error; END IF;
IF NEW.simples_nacional_option=1 AND (NEW.approx_federal_percent IS NULL OR NEW.approx_state_percent IS NULL OR NEW.approx_municipal_percent IS NULL OR NEW.approx_simples_percent IS NOT NULL) THEN RAISE EXCEPTION 'Para empresas não optantes do Simples, preencha os percentuais federal, estadual e municipal (E0713).'; END IF;
IF NEW.simples_iss_withholding_percent IS NOT NULL THEN
IF NEW.simples_nacional_option<>3 OR NEW.simples_nacional_regime IS DISTINCT FROM 1 THEN RAISE EXCEPTION 'A alíquota do ISS no Simples só pode ser informada para ME/EPP com ISS dentro do Simples (DAS).'; END IF;
IF NEW.simples_iss_withholding_percent NOT BETWEEN 1.8 AND 9.99 OR NEW.simples_iss_withholding_percent<>round(NEW.simples_iss_withholding_percent,2) THEN RAISE EXCEPTION 'Informe a alíquota do ISS entre 1,80%% e 9,99%%, com até duas casas decimais.'; END IF; END IF; RETURN NEW; END $$;
CREATE OR REPLACE FUNCTION public.reserve_dps_number(_company_id uuid,_organization_id uuid,_series integer,_environment public.environment,_requested_by uuid) RETURNS text LANGUAGE plpgsql SET search_path='' AS $$ DECLARE seq public.dps_sequences; reserved bigint; settings public.company_fiscal_settings; rule_error text; BEGIN
IF _requested_by IS NULL OR NOT(EXISTS(SELECT 1 FROM public.platform_admins WHERE user_id=_requested_by) OR EXISTS(SELECT 1 FROM public.organization_members WHERE organization_id=_organization_id AND user_id=_requested_by AND role IN('owner','admin'))) THEN RAISE EXCEPTION 'Acesso não autorizado.'; END IF;
SELECT * INTO settings FROM public.company_fiscal_settings WHERE company_id=_company_id AND organization_id=_organization_id AND dps_series=_series FOR SHARE;
IF settings.company_id IS NULL THEN RAISE EXCEPTION 'Série DPS não atribuída a esta empresa.'; END IF;
rule_error:=public.approximate_tax_rule_error(settings.simples_nacional_option,settings.approx_taxes_mode);
IF rule_error IS NOT NULL THEN RAISE EXCEPTION '%',rule_error; END IF;
SELECT * INTO seq FROM public.dps_sequences WHERE company_id=_company_id AND organization_id=_organization_id AND series=_series AND environment=_environment FOR UPDATE;
IF seq.company_id IS NULL OR seq.exhausted THEN RAISE EXCEPTION 'Numeração DPS indisponível ou esgotada.'; END IF;
reserved:=seq.next_number;
UPDATE public.dps_sequences SET next_number=CASE WHEN reserved=999999999999999 THEN reserved ELSE reserved+1 END,exhausted=(reserved=999999999999999),updated_at=now() WHERE company_id=_company_id AND series=_series AND environment=_environment;
-- Definitive reservation: future issuance is a separate transaction; no return or recycling operation exists.
RETURN reserved::text; END $$;
REVOKE ALL ON FUNCTION public.reserve_dps_number(uuid,uuid,integer,public.environment,uuid) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.reserve_dps_number(uuid,uuid,integer,public.environment,uuid) TO service_role;