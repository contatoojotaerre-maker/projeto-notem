-- Fase C Parte 3: IBS/CBS. Catálogos oficiais (somente leitura), datas da plataforma, regime IBS/CBS e classificação do serviço.

ALTER TABLE public.platform_settings
  ADD COLUMN ibscbs_required_sandbox_from date NOT NULL DEFAULT '2027-01-01',
  ADD COLUMN ibscbs_required_production_from date NOT NULL DEFAULT '2027-01-01',
  ADD COLUMN nt009r2_sandbox_starts_at timestamptz,
  ADD COLUMN nt009r2_production_starts_at timestamptz;

CREATE OR REPLACE FUNCTION public.set_fiscal_platform_setting(_setting text, _value text, _actor uuid) RETURNS public.platform_settings
LANGUAGE plpgsql SET search_path = '' AS $$
DECLARE cur public.platform_settings; out public.platform_settings; d date; t timestamptz; before text; BEGIN
  IF _actor IS NULL OR NOT EXISTS (SELECT 1 FROM public.platform_admins WHERE user_id = _actor) THEN RAISE EXCEPTION 'SEM_PERMISSAO'; END IF;
  INSERT INTO public.platform_settings(id) VALUES (true) ON CONFLICT DO NOTHING;
  SELECT * INTO cur FROM public.platform_settings WHERE id FOR UPDATE;
  IF _setting IN ('ibscbs_required_sandbox_from', 'ibscbs_required_production_from') THEN
    BEGIN d := _value::date; EXCEPTION WHEN others THEN RAISE EXCEPTION 'DATA_INVALIDA'; END;
    IF d IS NULL OR d < '2026-01-01' OR d > '2035-12-31' THEN RAISE EXCEPTION 'DATA_INVALIDA'; END IF;
    IF _setting = 'ibscbs_required_sandbox_from' THEN before := cur.ibscbs_required_sandbox_from::text;
      UPDATE public.platform_settings SET ibscbs_required_sandbox_from = d, updated_at = now(), updated_by = _actor WHERE id RETURNING * INTO out;
    ELSE before := cur.ibscbs_required_production_from::text;
      UPDATE public.platform_settings SET ibscbs_required_production_from = d, updated_at = now(), updated_by = _actor WHERE id RETURNING * INTO out; END IF;
  ELSIF _setting IN ('nt009r2_sandbox_starts_at', 'nt009r2_production_starts_at') THEN
    IF _value IS NULL OR btrim(_value) = '' THEN t := NULL; ELSE
      BEGIN t := _value::timestamptz; EXCEPTION WHEN others THEN RAISE EXCEPTION 'DATA_INVALIDA'; END;
      IF t < '2026-01-01 00:00:00+00' OR t > '2035-12-31 23:59:59+00' THEN RAISE EXCEPTION 'DATA_INVALIDA'; END IF; END IF;
    IF _setting = 'nt009r2_sandbox_starts_at' THEN before := cur.nt009r2_sandbox_starts_at::text;
      UPDATE public.platform_settings SET nt009r2_sandbox_starts_at = t, updated_at = now(), updated_by = _actor WHERE id RETURNING * INTO out;
    ELSE before := cur.nt009r2_production_starts_at::text;
      UPDATE public.platform_settings SET nt009r2_production_starts_at = t, updated_at = now(), updated_by = _actor WHERE id RETURNING * INTO out; END IF;
  ELSE RAISE EXCEPTION 'CONFIGURACAO_INVALIDA'; END IF;
  INSERT INTO public.admin_audit_events(actor_id, actor_is_platform_admin, action, organization_id, target_type, target_id, details)
  VALUES (_actor, true, 'fiscal.configuracao_plataforma_alterada', NULL, 'platform_settings', NULL, jsonb_build_object('campo', _setting, 'anterior', before, 'novo', nullif(btrim(coalesce(_value, '')), '')));
  RETURN out;
END $$;
REVOKE ALL ON FUNCTION public.set_fiscal_platform_setting(text, text, uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.set_fiscal_platform_setting(text, text, uuid) TO service_role;

CREATE TABLE public.fiscal_catalog_versions(
  catalog text PRIMARY KEY CHECK (catalog IN ('ibscbs_classifications', 'ibscbs_operation_indicators', 'ibscbs_service_correlations')),
  version text NOT NULL, source_file text NOT NULL, source_sha256 text NOT NULL CHECK (source_sha256 ~ '^[0-9a-f]{64}$'),
  row_count integer NOT NULL CHECK (row_count >= 0), loaded_at timestamptz NOT NULL DEFAULT now());
REVOKE ALL ON public.fiscal_catalog_versions FROM PUBLIC, anon, authenticated;
GRANT SELECT ON public.fiscal_catalog_versions TO authenticated; GRANT ALL ON public.fiscal_catalog_versions TO service_role;
ALTER TABLE public.fiscal_catalog_versions ENABLE ROW LEVEL SECURITY;
CREATE POLICY catalog_versions_read ON public.fiscal_catalog_versions FOR SELECT TO authenticated USING (true);

CREATE TABLE public.ibscbs_classifications(
  code text PRIMARY KEY CHECK (code ~ '^[0-9]{6}$'),
  cst text NOT NULL CHECK (cst ~ '^[0-9]{3}$'),
  cst_description text NOT NULL, description text NOT NULL,
  requires_taxation boolean NOT NULL,
  ibs_reduction_percent numeric(6,2) NOT NULL CHECK (ibs_reduction_percent BETWEEN 0 AND 100),
  cbs_reduction_percent numeric(6,2) NOT NULL CHECK (cbs_reduction_percent BETWEEN 0 AND 100),
  regular_taxation boolean NOT NULL, presumed_credit boolean NOT NULL, deferral boolean NOT NULL,
  simples_revenue_type text, donation_type text, legislation_url text,
  catalog_version text NOT NULL,
  CHECK (cst = left(code, 3)));
REVOKE ALL ON public.ibscbs_classifications FROM PUBLIC, anon, authenticated;
GRANT SELECT ON public.ibscbs_classifications TO authenticated; GRANT ALL ON public.ibscbs_classifications TO service_role;
ALTER TABLE public.ibscbs_classifications ENABLE ROW LEVEL SECURITY;
CREATE POLICY classifications_read ON public.ibscbs_classifications FOR SELECT TO authenticated USING (true);
CREATE INDEX classification_description_search ON public.ibscbs_classifications USING gin (public.normalize_municipality_name(cst_description || ' ' || description) extensions.gin_trgm_ops);

CREATE TABLE public.ibscbs_service_correlations(
  service_item text PRIMARY KEY CHECK (service_item ~ '^[0-9]{2}\.[0-9]{2}(\.[0-9]{2})?$'),
  item_description text, simples_activity text, simples_activity_description text,
  nbs jsonb NOT NULL DEFAULT '[]' CHECK (jsonb_typeof(nbs) = 'array'),
  operation_indicators jsonb NOT NULL DEFAULT '[]' CHECK (jsonb_typeof(operation_indicators) = 'array'),
  classifications jsonb NOT NULL DEFAULT '[]' CHECK (jsonb_typeof(classifications) = 'array'),
  catalog_version text NOT NULL);
REVOKE ALL ON public.ibscbs_service_correlations FROM PUBLIC, anon, authenticated;
GRANT SELECT ON public.ibscbs_service_correlations TO authenticated; GRANT ALL ON public.ibscbs_service_correlations TO service_role;
ALTER TABLE public.ibscbs_service_correlations ENABLE ROW LEVEL SECURITY;
CREATE POLICY correlations_read ON public.ibscbs_service_correlations FOR SELECT TO authenticated USING (true);

ALTER TABLE public.ibscbs_operation_indicators
  ADD COLUMN active boolean NOT NULL DEFAULT true,
  ADD COLUMN incidence_location text, ADD COLUMN legal_basis text, ADD COLUMN notes text,
  ADD COLUMN catalog_version text;

ALTER TABLE public.company_fiscal_settings ADD COLUMN ibscbs_simples_regime smallint CHECK (ibscbs_simples_regime IN (1, 2, 3));
-- Backfill only this new column: series/audit triggers stay out (no actor, and "última alteração" must not move).
ALTER TABLE public.company_fiscal_settings DISABLE TRIGGER fiscal_settings_series;
ALTER TABLE public.company_fiscal_settings DISABLE TRIGGER fiscal_settings_audit;
UPDATE public.company_fiscal_settings SET ibscbs_simples_regime = simples_nacional_regime WHERE simples_nacional_option = 3;
ALTER TABLE public.company_fiscal_settings ENABLE TRIGGER fiscal_settings_series;
ALTER TABLE public.company_fiscal_settings ENABLE TRIGGER fiscal_settings_audit;
ALTER TABLE public.company_fiscal_settings ADD CONSTRAINT fiscal_ibscbs_regime_only_me_epp CHECK (simples_nacional_option = 3 OR ibscbs_simples_regime IS NULL);

CREATE OR REPLACE FUNCTION public.ibscbs_regime_allowed(_iss_regime integer, _value integer) RETURNS boolean LANGUAGE sql IMMUTABLE SET search_path = '' AS $$
  SELECT CASE _iss_regime WHEN 1 THEN _value IN (1, 3) WHEN 2 THEN _value IN (2, 3) ELSE _value = 3 END $$;
CREATE OR REPLACE FUNCTION public.ibscbs_regime_default(_iss_regime integer) RETURNS integer LANGUAGE sql IMMUTABLE SET search_path = '' AS $$
  SELECT CASE _iss_regime WHEN 1 THEN 1 WHEN 2 THEN 2 ELSE 3 END $$;
REVOKE ALL ON FUNCTION public.ibscbs_regime_allowed(integer, integer) FROM PUBLIC, anon; GRANT EXECUTE ON FUNCTION public.ibscbs_regime_allowed(integer, integer) TO authenticated, service_role;
REVOKE ALL ON FUNCTION public.ibscbs_regime_default(integer) FROM PUBLIC, anon; GRANT EXECUTE ON FUNCTION public.ibscbs_regime_default(integer) TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public.guard_ibscbs_simples_regime() RETURNS trigger LANGUAGE plpgsql SET search_path = '' AS $$ BEGIN
  IF NEW.simples_nacional_option <> 3 THEN NEW.ibscbs_simples_regime := NULL; RETURN NEW; END IF;
  IF NEW.ibscbs_simples_regime IS NULL THEN NEW.ibscbs_simples_regime := public.ibscbs_regime_default(NEW.simples_nacional_regime); RETURN NEW; END IF;
  IF NOT public.ibscbs_regime_allowed(NEW.simples_nacional_regime, NEW.ibscbs_simples_regime) THEN
    IF TG_OP = 'UPDATE' AND NEW.simples_nacional_regime IS DISTINCT FROM OLD.simples_nacional_regime AND NEW.ibscbs_simples_regime IS NOT DISTINCT FROM OLD.ibscbs_simples_regime THEN
      NEW.ibscbs_simples_regime := public.ibscbs_regime_default(NEW.simples_nacional_regime);
    ELSE RAISE EXCEPTION 'O regime de apuração do IBS/CBS escolhido não é permitido para o regime de apuração do ISS desta empresa.'; END IF;
  END IF;
  RETURN NEW; END $$;
CREATE TRIGGER fiscal_settings_ibscbs_regime BEFORE INSERT OR UPDATE ON public.company_fiscal_settings FOR EACH ROW EXECUTE FUNCTION public.guard_ibscbs_simples_regime();

ALTER TABLE public.company_service_profiles
  ADD COLUMN ibscbs_classification text REFERENCES public.ibscbs_classifications(code),
  ADD COLUMN ibscbs_final_consumer boolean NOT NULL DEFAULT false,
  ADD COLUMN simples_activity_code text CHECK (simples_activity_code ~ '^(0[7-9]|1[0-4]|90)$');

CREATE OR REPLACE FUNCTION public.ibscbs_service_rule_error(_service_code text, _classification text, _indicator text, _activity text) RETURNS text
LANGUAGE plpgsql STABLE SET search_path = '' AS $$ DECLARE c public.ibscbs_classifications; sub text := left(coalesce(_service_code, ''), 4); BEGIN
  IF _activity IS NOT NULL THEN
    IF (sub = '1601') <> (_activity = '10') THEN RETURN 'A atividade 10 do Simples deve ser usada se, e somente se, o serviço for do subitem 16.01.'; END IF;
    IF (left(coalesce(_service_code, ''), 6) = '990401') <> (_activity = '11') THEN RETURN 'A atividade 11 do Simples deve ser usada se, e somente se, o serviço for 99.04.01.'; END IF;
    IF (sub IN ('0702', '0705')) <> (_activity IN ('12', '13')) THEN RETURN 'As atividades 12 ou 13 do Simples devem ser usadas se, e somente se, o serviço for dos subitens 7.02 ou 7.05.'; END IF;
  END IF;
  IF _classification IS NULL THEN RETURN NULL; END IF;
  SELECT * INTO c FROM public.ibscbs_classifications WHERE code = _classification;
  IF NOT FOUND THEN RETURN 'Selecione uma classificação tributária do catálogo oficial.'; END IF;
  IF sub IN ('9903', '9904', '9905') THEN RETURN 'Serviços dos subitens 99.03, 99.04 e 99.05 (imóveis, bens móveis e condomínios) ainda não são suportados para IBS/CBS.'; END IF;
  IF sub IN ('2505', '1509', '1712', '1005') THEN RETURN 'Serviços dos subitens 25.05, 15.09, 17.12 e 10.05 exigem o tipo de operação (tpOper), ainda não suportado para IBS/CBS.'; END IF;
  IF c.regular_taxation OR c.presumed_credit OR c.deferral THEN RETURN 'Classificações que exigem tributação regular, crédito presumido ou diferimento ainda não são suportadas.'; END IF;
  IF c.cst IN ('800', '811') THEN RETURN 'Classificações de transferência ou ajuste de crédito (CST 800 e 811) ainda não são suportadas.'; END IF;
  IF c.code IN ('410003', '410026') THEN RETURN 'Doações (410003 e 410026) ainda não são suportadas.'; END IF;
  IF c.requires_taxation AND _indicator IS NULL THEN RETURN 'Informe o indicador de operação: a classificação escolhida exige tributação do IBS/CBS (E0860).'; END IF;
  IF NOT c.requires_taxation AND _indicator IS NOT NULL THEN RETURN 'Não informe o indicador de operação: a classificação escolhida não tem tributação do IBS/CBS (E0859).'; END IF;
  RETURN NULL; END $$;
REVOKE ALL ON FUNCTION public.ibscbs_service_rule_error(text, text, text, text) FROM PUBLIC, anon; GRANT EXECUTE ON FUNCTION public.ibscbs_service_rule_error(text, text, text, text) TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public.guard_ibscbs_service_profile() RETURNS trigger LANGUAGE plpgsql SET search_path = '' AS $$ DECLARE msg text; BEGIN
  msg := public.ibscbs_service_rule_error(NEW.service_code, NEW.ibscbs_classification, NEW.ibscbs_operation_indicator, NEW.simples_activity_code);
  IF msg IS NOT NULL THEN RAISE EXCEPTION '%', msg; END IF;
  IF NEW.ibscbs_operation_indicator IS NOT NULL AND (TG_OP = 'INSERT' OR NEW.ibscbs_operation_indicator IS DISTINCT FROM OLD.ibscbs_operation_indicator)
     AND EXISTS (SELECT 1 FROM public.ibscbs_operation_indicators WHERE code = NEW.ibscbs_operation_indicator AND NOT active) THEN
    RAISE EXCEPTION 'Este indicador de operação foi retirado da tabela oficial (Anexo VII v1.03). Escolha outro.'; END IF;
  RETURN NEW; END $$;
CREATE TRIGGER service_profiles_ibscbs_guard BEFORE INSERT OR UPDATE ON public.company_service_profiles FOR EACH ROW EXECUTE FUNCTION public.guard_ibscbs_service_profile();

CREATE OR REPLACE FUNCTION public.search_fiscal_catalog(_catalog text, _search text)
 RETURNS TABLE(code text, description text, details jsonb) LANGUAGE plpgsql STABLE SET search_path TO '' AS $function$
DECLARE term text:=btrim(_search); pattern text;
BEGIN
 IF char_length(term)<2 THEN RETURN; END IF;
 pattern:='%'||replace(replace(replace(public.normalize_municipality_name(term),E'\\',E'\\\\'),'%',E'\\%'),'_',E'\\_')||'%';
 IF _catalog='service_codes' THEN RETURN QUERY SELECT s.code,s.description,jsonb_build_object('group_description',s.group_description) FROM public.service_codes s WHERE s.code LIKE term||'%' OR public.normalize_municipality_name(s.description) LIKE pattern ORDER BY s.code LIMIT 30;
 ELSIF _catalog='nbs_codes' THEN RETURN QUERY SELECT s.code,s.description,jsonb_build_object('formatted_code',s.formatted_code) FROM public.nbs_codes s WHERE s.code LIKE term||'%' OR public.normalize_municipality_name(s.description) LIKE pattern ORDER BY s.code LIMIT 30;
 ELSIF _catalog='ibscbs_operation_indicators' THEN RETURN QUERY SELECT s.code,s.operation_type||' · '||s.supply_characteristic||' · '||s.location_to_identify,to_jsonb(s)-'code' FROM public.ibscbs_operation_indicators s WHERE s.active AND (s.code LIKE term||'%' OR public.normalize_municipality_name(s.operation_type||' '||s.operation_location||' '||s.supply_characteristic||' '||s.location_to_identify) LIKE pattern) ORDER BY s.code LIMIT 30;
 ELSIF _catalog='ibscbs_classifications' THEN RETURN QUERY SELECT s.code,s.description,to_jsonb(s)-'code' FROM public.ibscbs_classifications s WHERE s.code LIKE term||'%' OR public.normalize_municipality_name(s.cst_description||' '||s.description) LIKE pattern ORDER BY s.code LIMIT 30;
 ELSE RAISE EXCEPTION 'Catálogo inválido.'; END IF;
END $function$;
REVOKE ALL ON FUNCTION public.search_fiscal_catalog(text,text) FROM PUBLIC,anon; GRANT EXECUTE ON FUNCTION public.search_fiscal_catalog(text,text) TO authenticated;