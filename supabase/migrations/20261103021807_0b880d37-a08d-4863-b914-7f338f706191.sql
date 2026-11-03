ALTER TABLE public.company_fiscal_settings ADD COLUMN simples_iss_withholding_percent numeric;
COMMENT ON COLUMN public.company_fiscal_settings.simples_iss_withholding_percent IS 'Optional company default for future withheld ISS DPS only; ME/EPP regime 1. E0621/E0625 applicability must be evaluated per document. TSDec1V2 precision.';
CREATE FUNCTION public.validate_guided_fiscal_settings() RETURNS trigger LANGUAGE plpgsql SET search_path='' AS $$
BEGIN
 IF NEW.simples_nacional_option=1 AND (NEW.approx_taxes_mode<>'percent_by_sphere' OR NEW.approx_federal_percent IS NULL OR NEW.approx_state_percent IS NULL OR NEW.approx_municipal_percent IS NULL OR NEW.approx_simples_percent IS NOT NULL) THEN
 RAISE EXCEPTION 'Para empresas não optantes do Simples, preencha os percentuais federal, estadual e municipal. Não informar não é permitido (E0713).';
 END IF;
 IF NEW.simples_iss_withholding_percent IS NOT NULL THEN
  IF NEW.simples_nacional_option<>3 OR NEW.simples_nacional_regime IS DISTINCT FROM 1 THEN RAISE EXCEPTION 'A alíquota do ISS no Simples só pode ser informada para ME/EPP com ISS dentro do Simples (DAS).'; END IF;
  IF NEW.simples_iss_withholding_percent NOT BETWEEN 1.8 AND 9.99 OR NEW.simples_iss_withholding_percent <> round(NEW.simples_iss_withholding_percent,2) THEN RAISE EXCEPTION 'Informe a alíquota do ISS entre 1,80%% e 9,99%%, com até duas casas decimais.'; END IF;
 END IF;
 RETURN NEW;
END $$;
REVOKE ALL ON FUNCTION public.validate_guided_fiscal_settings() FROM PUBLIC,anon,authenticated;
CREATE TRIGGER fiscal_settings_guided_validation BEFORE INSERT OR UPDATE ON public.company_fiscal_settings FOR EACH ROW EXECUTE FUNCTION public.validate_guided_fiscal_settings();