CREATE UNIQUE INDEX IF NOT EXISTS companies_id_org_uidx ON public.companies(id, organization_id);

CREATE OR REPLACE FUNCTION public.guard_company_organization() RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$
BEGIN
  IF NEW.organization_id IS DISTINCT FROM OLD.organization_id THEN
    RAISE EXCEPTION 'A organização da empresa não pode ser alterada.';
  END IF;
  RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS companies_guard_organization ON public.companies;
CREATE TRIGGER companies_guard_organization BEFORE UPDATE ON public.companies FOR EACH ROW EXECUTE FUNCTION public.guard_company_organization();

CREATE TABLE public.company_certificates (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL,
  organization_id uuid NOT NULL,
  holder text NOT NULL,
  cnpj text NOT NULL,
  issuer text NOT NULL,
  serial_number text NOT NULL,
  valid_from timestamptz NOT NULL,
  valid_until timestamptz NOT NULL,
  status text NOT NULL CHECK (status IN ('active','replaced')),
  uploaded_by uuid NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  replaced_at timestamptz,
  FOREIGN KEY (company_id, organization_id) REFERENCES public.companies(id, organization_id)
);
GRANT SELECT ON public.company_certificates TO authenticated;
GRANT ALL ON public.company_certificates TO service_role;
ALTER TABLE public.company_certificates ENABLE ROW LEVEL SECURITY;
CREATE POLICY company_certificates_read ON public.company_certificates FOR SELECT TO authenticated USING (public.is_org_member(organization_id) OR public.is_platform_admin());
CREATE UNIQUE INDEX company_certificates_one_active ON public.company_certificates(company_id) WHERE status = 'active';

CREATE TABLE public.company_certificate_material (
  company_id uuid PRIMARY KEY,
  organization_id uuid NOT NULL,
  key_version text NOT NULL,
  nonce text NOT NULL,
  data text NOT NULL,
  updated_at timestamptz NOT NULL DEFAULT now(),
  FOREIGN KEY (company_id, organization_id) REFERENCES public.companies(id, organization_id)
);
REVOKE ALL ON public.company_certificate_material FROM anon, authenticated, PUBLIC;
GRANT ALL ON public.company_certificate_material TO service_role;
ALTER TABLE public.company_certificate_material ENABLE ROW LEVEL SECURITY;

CREATE TABLE public.certificate_audit_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL,
  organization_id uuid NOT NULL,
  user_id uuid NOT NULL,
  action text NOT NULL CHECK (action IN ('uploaded','replaced','used','failed')),
  purpose text NOT NULL,
  environment text,
  result text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  FOREIGN KEY (company_id, organization_id) REFERENCES public.companies(id, organization_id)
);
GRANT SELECT ON public.certificate_audit_events TO authenticated;
GRANT ALL ON public.certificate_audit_events TO service_role;
ALTER TABLE public.certificate_audit_events ENABLE ROW LEVEL SECURITY;
CREATE POLICY certificate_audit_read ON public.certificate_audit_events FOR SELECT TO authenticated USING (public.has_org_role(organization_id, ARRAY['owner','admin']::org_role[]) OR public.is_platform_admin());

CREATE TABLE public.municipality_agreement_queries (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL,
  organization_id uuid NOT NULL,
  municipality_ibge_code text NOT NULL,
  environment environment NOT NULL,
  requested_by uuid NOT NULL,
  http_status integer,
  response_body text,
  error_code text,
  url text,
  duration_ms integer,
  created_at timestamptz NOT NULL DEFAULT now(),
  FOREIGN KEY (company_id, organization_id) REFERENCES public.companies(id, organization_id)
);
GRANT SELECT ON public.municipality_agreement_queries TO authenticated;
GRANT ALL ON public.municipality_agreement_queries TO service_role;
ALTER TABLE public.municipality_agreement_queries ENABLE ROW LEVEL SECURITY;
CREATE POLICY agreement_queries_read ON public.municipality_agreement_queries FOR SELECT TO authenticated USING (public.is_org_member(organization_id) OR public.is_platform_admin());
CREATE INDEX agreement_queries_lookup ON public.municipality_agreement_queries(company_id, environment, created_at DESC);

CREATE OR REPLACE FUNCTION public.replace_company_certificate(
  _company_id uuid, _organization_id uuid, _user_id uuid,
  _holder text, _cnpj text, _issuer text, _serial text, _valid_from timestamptz, _valid_until timestamptz,
  _key_version text, _nonce text, _data text
) RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE had_active boolean; new_id uuid;
BEGIN
  PERFORM pg_advisory_xact_lock(hashtext(_company_id::text));
  UPDATE company_certificates SET status='replaced', replaced_at=now() WHERE company_id=_company_id AND status='active';
  had_active := FOUND;
  INSERT INTO company_certificates(company_id, organization_id, holder, cnpj, issuer, serial_number, valid_from, valid_until, status, uploaded_by)
  VALUES (_company_id, _organization_id, _holder, _cnpj, _issuer, _serial, _valid_from, _valid_until, 'active', _user_id) RETURNING id INTO new_id;
  INSERT INTO company_certificate_material(company_id, organization_id, key_version, nonce, data, updated_at)
  VALUES (_company_id, _organization_id, _key_version, _nonce, _data, now())
  ON CONFLICT (company_id) DO UPDATE SET key_version=EXCLUDED.key_version, nonce=EXCLUDED.nonce, data=EXCLUDED.data, updated_at=now();
  INSERT INTO certificate_audit_events(company_id, organization_id, user_id, action, purpose, result)
  VALUES (_company_id, _organization_id, _user_id, CASE WHEN had_active THEN 'replaced' ELSE 'uploaded' END, 'envio de certificado', 'sucesso');
  RETURN new_id;
END $$;
REVOKE ALL ON FUNCTION public.replace_company_certificate(uuid,uuid,uuid,text,text,text,text,timestamptz,timestamptz,text,text,text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.replace_company_certificate(uuid,uuid,uuid,text,text,text,text,timestamptz,timestamptz,text,text,text) TO service_role;