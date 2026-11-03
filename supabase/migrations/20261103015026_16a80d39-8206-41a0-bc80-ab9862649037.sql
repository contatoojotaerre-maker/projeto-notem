CREATE TABLE public.service_codes(code text PRIMARY KEY CHECK(code ~ '^[0-9]{6}$'), description text NOT NULL, group_description text NOT NULL);
GRANT SELECT ON public.service_codes TO authenticated; GRANT ALL ON public.service_codes TO service_role;
ALTER TABLE public.service_codes ENABLE ROW LEVEL SECURITY;
CREATE POLICY service_codes_read ON public.service_codes FOR SELECT TO authenticated USING(true);
CREATE TABLE public.nbs_codes(code text PRIMARY KEY CHECK(code ~ '^[0-9]{9}$'), formatted_code text NOT NULL, description text NOT NULL);
GRANT SELECT ON public.nbs_codes TO authenticated; GRANT ALL ON public.nbs_codes TO service_role;
ALTER TABLE public.nbs_codes ENABLE ROW LEVEL SECURITY;
CREATE POLICY nbs_codes_read ON public.nbs_codes FOR SELECT TO authenticated USING(true);
CREATE TABLE public.ibscbs_operation_indicators(code text PRIMARY KEY CHECK(code ~ '^[0-9]{6}$'), operation_type text NOT NULL, operation_location text NOT NULL, supply_characteristic text NOT NULL, location_to_identify text NOT NULL);
GRANT SELECT ON public.ibscbs_operation_indicators TO authenticated; GRANT ALL ON public.ibscbs_operation_indicators TO service_role;
ALTER TABLE public.ibscbs_operation_indicators ENABLE ROW LEVEL SECURITY;
CREATE POLICY indicators_read ON public.ibscbs_operation_indicators FOR SELECT TO authenticated USING(true);
CREATE INDEX service_description_search ON public.service_codes USING gin(public.normalize_municipality_name(description) extensions.gin_trgm_ops);
CREATE INDEX nbs_description_search ON public.nbs_codes USING gin(public.normalize_municipality_name(description) extensions.gin_trgm_ops);
CREATE INDEX indicator_description_search ON public.ibscbs_operation_indicators USING gin(public.normalize_municipality_name(operation_type || ' ' || operation_location || ' ' || supply_characteristic || ' ' || location_to_identify) extensions.gin_trgm_ops);
CREATE TABLE public.company_fiscal_settings(
 company_id uuid PRIMARY KEY, organization_id uuid NOT NULL, cnpj text NOT NULL,
 simples_nacional_option smallint NOT NULL CHECK(simples_nacional_option IN(1,2,3)),
 simples_nacional_regime smallint CHECK(simples_nacional_regime IN(1,2,3)),
 special_tax_regime smallint NOT NULL DEFAULT 0 CHECK(special_tax_regime IN(0,1,2,3,4,5,6,9)),
 dps_series integer NOT NULL CHECK(dps_series BETWEEN 1 AND 49999),
 approx_taxes_mode text NOT NULL CHECK(approx_taxes_mode IN('percent_simples','percent_by_sphere','none')),
 approx_simples_percent numeric(7,4), approx_federal_percent numeric(7,4), approx_state_percent numeric(7,4), approx_municipal_percent numeric(7,4),
 created_by uuid NOT NULL, updated_by uuid NOT NULL, created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now(),
 FOREIGN KEY(company_id,organization_id) REFERENCES public.companies(id,organization_id), UNIQUE(cnpj,dps_series),
 CHECK((simples_nacional_option=3 AND simples_nacional_regime IS NOT NULL) OR (simples_nacional_option IN(1,2) AND simples_nacional_regime IS NULL)),
 CHECK(approx_simples_percent BETWEEN 0 AND 100), CHECK(approx_federal_percent BETWEEN 0 AND 100), CHECK(approx_state_percent BETWEEN 0 AND 100), CHECK(approx_municipal_percent BETWEEN 0 AND 100),
 CHECK((approx_taxes_mode='percent_simples' AND simples_nacional_option IN(2,3) AND approx_simples_percent IS NOT NULL AND approx_federal_percent IS NULL AND approx_state_percent IS NULL AND approx_municipal_percent IS NULL) OR
 (approx_taxes_mode='percent_by_sphere' AND approx_simples_percent IS NULL AND approx_federal_percent IS NOT NULL AND approx_state_percent IS NOT NULL AND approx_municipal_percent IS NOT NULL) OR
 (approx_taxes_mode='none' AND approx_simples_percent IS NULL AND approx_federal_percent IS NULL AND approx_state_percent IS NULL AND approx_municipal_percent IS NULL))
);
GRANT SELECT, INSERT, UPDATE ON public.company_fiscal_settings TO authenticated; GRANT ALL ON public.company_fiscal_settings TO service_role;
ALTER TABLE public.company_fiscal_settings ENABLE ROW LEVEL SECURITY;
CREATE POLICY fiscal_read ON public.company_fiscal_settings FOR SELECT TO authenticated USING(public.is_org_member(organization_id) OR public.is_platform_admin());
CREATE POLICY fiscal_create ON public.company_fiscal_settings FOR INSERT TO authenticated WITH CHECK(public.has_org_role(organization_id,ARRAY['owner','admin']::public.org_role[]) OR public.is_platform_admin());
CREATE POLICY fiscal_update ON public.company_fiscal_settings FOR UPDATE TO authenticated USING(public.has_org_role(organization_id,ARRAY['owner','admin']::public.org_role[]) OR public.is_platform_admin()) WITH CHECK(public.has_org_role(organization_id,ARRAY['owner','admin']::public.org_role[]) OR public.is_platform_admin());
CREATE TABLE public.dps_sequences(
 company_id uuid NOT NULL, organization_id uuid NOT NULL, cnpj text NOT NULL, series integer NOT NULL CHECK(series BETWEEN 1 AND 49999), environment public.environment NOT NULL,
 next_number bigint NOT NULL DEFAULT 1 CHECK(next_number BETWEEN 1 AND 999999999999999), exhausted boolean NOT NULL DEFAULT false,
 created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now(),
 PRIMARY KEY(company_id,series,environment), UNIQUE(cnpj,series,environment), FOREIGN KEY(company_id,organization_id) REFERENCES public.companies(id,organization_id)
);
GRANT SELECT ON public.dps_sequences TO authenticated; GRANT ALL ON public.dps_sequences TO service_role;
ALTER TABLE public.dps_sequences ENABLE ROW LEVEL SECURITY;
CREATE POLICY sequences_read ON public.dps_sequences FOR SELECT TO authenticated USING(public.is_org_member(organization_id) OR public.is_platform_admin());
CREATE TABLE public.company_service_profiles(
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), company_id uuid NOT NULL, organization_id uuid NOT NULL,
 name text NOT NULL CHECK(char_length(btrim(name)) BETWEEN 1 AND 200), active boolean NOT NULL DEFAULT true,
 service_code text NOT NULL REFERENCES public.service_codes(code), municipal_tax_code text,
 nbs_code text REFERENCES public.nbs_codes(code), default_description text NOT NULL DEFAULT '' CHECK(char_length(default_description)<=2000),
 iss_taxation smallint NOT NULL DEFAULT 1 CHECK(iss_taxation IN(1,2,3,4)), immunity_type smallint CHECK(immunity_type BETWEEN 0 AND 5),
 iss_withholding smallint NOT NULL DEFAULT 1 CHECK(iss_withholding IN(1,2,3)),
 ibscbs_operation_indicator text REFERENCES public.ibscbs_operation_indicators(code), municipal_benefit_number text,
 created_by uuid NOT NULL, updated_by uuid NOT NULL, created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now(),
 FOREIGN KEY(company_id,organization_id) REFERENCES public.companies(id,organization_id),
 CHECK((iss_taxation=2 AND immunity_type IS NOT NULL) OR (iss_taxation<>2 AND immunity_type IS NULL))
);
GRANT SELECT,INSERT,UPDATE ON public.company_service_profiles TO authenticated; GRANT ALL ON public.company_service_profiles TO service_role;
ALTER TABLE public.company_service_profiles ENABLE ROW LEVEL SECURITY;
CREATE POLICY services_read ON public.company_service_profiles FOR SELECT TO authenticated USING(public.is_org_member(organization_id) OR public.is_platform_admin());
CREATE POLICY services_create ON public.company_service_profiles FOR INSERT TO authenticated WITH CHECK(public.has_org_role(organization_id,ARRAY['owner','admin']::public.org_role[]) OR public.is_platform_admin());
CREATE POLICY services_update ON public.company_service_profiles FOR UPDATE TO authenticated USING(public.has_org_role(organization_id,ARRAY['owner','admin']::public.org_role[]) OR public.is_platform_admin()) WITH CHECK(public.has_org_role(organization_id,ARRAY['owner','admin']::public.org_role[]) OR public.is_platform_admin());
CREATE OR REPLACE FUNCTION public.audit_fiscal_record() RETURNS trigger LANGUAGE plpgsql SET search_path='' AS $$
BEGIN
 IF TG_OP='UPDATE' THEN
  IF NEW.company_id IS DISTINCT FROM OLD.company_id OR NEW.organization_id IS DISTINCT FROM OLD.organization_id THEN RAISE EXCEPTION 'Empresa e organização não podem ser alteradas.'; END IF;
  NEW.created_by:=OLD.created_by; NEW.created_at:=OLD.created_at;
 ELSE NEW.created_by:=auth.uid(); NEW.created_at:=now(); END IF;
 NEW.updated_by:=auth.uid(); NEW.updated_at:=now(); RETURN NEW;
END $$;
REVOKE ALL ON FUNCTION public.audit_fiscal_record() FROM PUBLIC,anon,authenticated;
CREATE TRIGGER service_profiles_audit BEFORE INSERT OR UPDATE ON public.company_service_profiles FOR EACH ROW EXECUTE FUNCTION public.audit_fiscal_record();
CREATE TRIGGER fiscal_settings_audit BEFORE INSERT OR UPDATE ON public.company_fiscal_settings FOR EACH ROW EXECUTE FUNCTION public.audit_fiscal_record();
CREATE OR REPLACE FUNCTION public.assign_company_dps_series() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE company public.companies; selected_series integer;
BEGIN
 IF auth.uid() IS NULL OR NOT(public.has_org_role(NEW.organization_id,ARRAY['owner','admin']::public.org_role[]) OR public.is_platform_admin()) THEN RAISE EXCEPTION 'Acesso não autorizado.'; END IF;
 SELECT * INTO company FROM public.companies WHERE id=NEW.company_id AND organization_id=NEW.organization_id FOR UPDATE;
 IF company.id IS NULL THEN RAISE EXCEPTION 'Empresa não encontrada.'; END IF;
 PERFORM pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(company.cnpj,712));
 IF TG_OP='UPDATE' THEN
  IF NEW.cnpj IS DISTINCT FROM OLD.cnpj THEN RAISE EXCEPTION 'CNPJ fiscal é imutável.'; END IF;
  IF NEW.dps_series IS DISTINCT FROM OLD.dps_series AND NOT public.is_platform_admin() THEN RAISE EXCEPTION 'Só o administrador da plataforma pode alterar a série DPS.'; END IF;
 ELSE
  NEW.cnpj:=company.cnpj;
  IF NEW.dps_series IS NOT NULL AND NOT public.is_platform_admin() THEN RAISE EXCEPTION 'A série inicial deve ser automática.'; END IF;
 END IF;
 IF NEW.dps_series IS NULL THEN
  SELECT s INTO selected_series FROM generate_series(1,49999) s WHERE NOT EXISTS(SELECT 1 FROM public.dps_sequences d WHERE d.cnpj=company.cnpj AND d.series=s) ORDER BY s LIMIT 1;
  IF selected_series IS NULL THEN RAISE EXCEPTION 'Todas as séries DPS deste CNPJ estão reservadas.'; END IF;
  NEW.dps_series:=selected_series;
 END IF;
 IF NEW.dps_series NOT BETWEEN 1 AND 49999 THEN RAISE EXCEPTION 'A série DPS deve estar entre 00001 e 49999.'; END IF;
 IF EXISTS(SELECT 1 FROM public.dps_sequences WHERE cnpj=company.cnpj AND series=NEW.dps_series AND company_id<>company.id) THEN RAISE EXCEPTION 'Esta série DPS já está reservada para este CNPJ em outra empresa.'; END IF;
 INSERT INTO public.dps_sequences(company_id,organization_id,cnpj,series,environment) VALUES(company.id,company.organization_id,company.cnpj,NEW.dps_series,'production'),(company.id,company.organization_id,company.cnpj,NEW.dps_series,'sandbox') ON CONFLICT(company_id,series,environment) DO NOTHING;
 RETURN NEW;
END $$;
REVOKE ALL ON FUNCTION public.assign_company_dps_series() FROM PUBLIC,anon,authenticated;
CREATE TRIGGER fiscal_settings_series BEFORE INSERT OR UPDATE ON public.company_fiscal_settings FOR EACH ROW EXECUTE FUNCTION public.assign_company_dps_series();
CREATE OR REPLACE FUNCTION public.guard_company_cnpj() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
BEGIN
 IF NEW.cnpj IS DISTINCT FROM OLD.cnpj AND (EXISTS(SELECT 1 FROM public.company_certificates WHERE company_id=OLD.id) OR EXISTS(SELECT 1 FROM public.company_fiscal_settings WHERE company_id=OLD.id) OR EXISTS(SELECT 1 FROM public.dps_sequences WHERE company_id=OLD.id)) THEN
 RAISE EXCEPTION 'O CNPJ não pode ser alterado porque a empresa já tem certificado ou série. Cadastre uma nova empresa.';
 END IF; RETURN NEW;
END $$;
REVOKE ALL ON FUNCTION public.guard_company_cnpj() FROM PUBLIC,anon,authenticated;
CREATE TRIGGER companies_guard_cnpj BEFORE UPDATE ON public.companies FOR EACH ROW EXECUTE FUNCTION public.guard_company_cnpj();
CREATE OR REPLACE FUNCTION public.guard_certificate_company_cnpj() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE current_cnpj text;
BEGIN
 SELECT cnpj INTO current_cnpj FROM public.companies WHERE id=NEW.company_id AND organization_id=NEW.organization_id FOR UPDATE;
 IF current_cnpj IS NULL OR current_cnpj<>NEW.cnpj THEN RAISE EXCEPTION 'O CNPJ do certificado é diferente do cadastro da empresa.'; END IF; RETURN NEW;
END $$;
REVOKE ALL ON FUNCTION public.guard_certificate_company_cnpj() FROM PUBLIC,anon,authenticated;
CREATE TRIGGER certificate_guard_cnpj BEFORE INSERT ON public.company_certificates FOR EACH ROW EXECUTE FUNCTION public.guard_certificate_company_cnpj();
CREATE OR REPLACE FUNCTION public.reserve_dps_number(_company_id uuid,_organization_id uuid,_series integer,_environment public.environment) RETURNS text LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE seq public.dps_sequences; reserved bigint;
BEGIN
 IF auth.uid() IS NULL OR NOT(public.has_org_role(_organization_id,ARRAY['owner','admin']::public.org_role[]) OR public.is_platform_admin()) THEN RAISE EXCEPTION 'Acesso não autorizado.'; END IF;
 IF NOT EXISTS(SELECT 1 FROM public.company_fiscal_settings WHERE company_id=_company_id AND organization_id=_organization_id AND dps_series=_series) THEN RAISE EXCEPTION 'Série DPS não atribuída a esta empresa.'; END IF;
 SELECT * INTO seq FROM public.dps_sequences WHERE company_id=_company_id AND organization_id=_organization_id AND series=_series AND environment=_environment FOR UPDATE;
 IF seq.company_id IS NULL OR seq.exhausted THEN RAISE EXCEPTION 'Numeração DPS indisponível ou esgotada.'; END IF;
 reserved:=seq.next_number;
 UPDATE public.dps_sequences SET next_number=CASE WHEN reserved=999999999999999 THEN reserved ELSE reserved+1 END, exhausted=(reserved=999999999999999),updated_at=now() WHERE company_id=_company_id AND series=_series AND environment=_environment;
 -- Reservation commits independently of future issuance. Never return, recycle or reuse a reserved number; gaps are accepted.
 RETURN reserved::text;
END $$;
REVOKE ALL ON FUNCTION public.reserve_dps_number(uuid,uuid,integer,public.environment) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.reserve_dps_number(uuid,uuid,integer,public.environment) TO authenticated;
COMMENT ON FUNCTION public.reserve_dps_number(uuid,uuid,integer,public.environment) IS 'Definitive reservation. Never return, recycle or reuse even if future issuance fails. Gaps accepted. Call in a separate committed transaction before future issuance.';
CREATE OR REPLACE FUNCTION public.search_fiscal_catalog(_catalog text,_search text) RETURNS TABLE(code text,description text,details jsonb) LANGUAGE plpgsql STABLE SECURITY INVOKER SET search_path='' AS $$
DECLARE term text:=btrim(_search); pattern text;
BEGIN
 IF char_length(term)<2 THEN RETURN; END IF;
 pattern:='%'||replace(replace(replace(public.normalize_municipality_name(term),E'\\',E'\\\\'),'%',E'\\%'),'_',E'\\_')||'%';
 IF _catalog='service_codes' THEN RETURN QUERY SELECT s.code,s.description,jsonb_build_object('group_description',s.group_description) FROM public.service_codes s WHERE s.code LIKE term||'%' OR public.normalize_municipality_name(s.description) LIKE pattern ORDER BY s.code LIMIT 30;
 ELSIF _catalog='nbs_codes' THEN RETURN QUERY SELECT s.code,s.description,jsonb_build_object('formatted_code',s.formatted_code) FROM public.nbs_codes s WHERE s.code LIKE term||'%' OR public.normalize_municipality_name(s.description) LIKE pattern ORDER BY s.code LIMIT 30;
 ELSIF _catalog='ibscbs_operation_indicators' THEN RETURN QUERY SELECT s.code,s.operation_type||' · '||s.operation_location||' · '||s.supply_characteristic||' · '||s.location_to_identify,to_jsonb(s)-'code' FROM public.ibscbs_operation_indicators s WHERE s.code LIKE term||'%' OR public.normalize_municipality_name(s.operation_type||' '||s.operation_location||' '||s.supply_characteristic||' '||s.location_to_identify) LIKE pattern ORDER BY s.code LIMIT 30;
 ELSE RAISE EXCEPTION 'Catálogo inválido.'; END IF;
END $$;
REVOKE ALL ON FUNCTION public.search_fiscal_catalog(text,text) FROM PUBLIC,anon; GRANT EXECUTE ON FUNCTION public.search_fiscal_catalog(text,text) TO authenticated;
CREATE INDEX profiles_company_idx ON public.company_service_profiles(company_id,organization_id);
