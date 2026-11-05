ALTER TABLE public.companies ADD COLUMN active boolean NOT NULL DEFAULT true, ADD COLUMN external_id text CHECK (external_id IS NULL OR length(external_id) BETWEEN 1 AND 100), ADD COLUMN changed_by_integration_id uuid REFERENCES public.integrations(id) ON DELETE SET NULL;
CREATE UNIQUE INDEX companies_external_id_unique ON public.companies(organization_id, external_id) WHERE external_id IS NOT NULL;
ALTER TABLE public.company_service_profiles ADD COLUMN external_id text CHECK (external_id IS NULL OR length(external_id) BETWEEN 1 AND 100), ADD COLUMN change_origin public.change_origin NOT NULL DEFAULT 'panel', ADD COLUMN changed_by_integration_id uuid REFERENCES public.integrations(id) ON DELETE SET NULL;
CREATE UNIQUE INDEX service_profiles_external_id_unique ON public.company_service_profiles(organization_id, external_id) WHERE external_id IS NOT NULL;
ALTER TABLE public.company_fiscal_settings ADD COLUMN change_origin public.change_origin NOT NULL DEFAULT 'panel', ADD COLUMN changed_by_integration_id uuid REFERENCES public.integrations(id) ON DELETE SET NULL;
ALTER TABLE public.api_request_logs ADD COLUMN company_id uuid;
CREATE INDEX api_request_logs_company ON public.api_request_logs(organization_id, company_id, created_at DESC);

-- Audit: authenticated sessions are always "panel"; only the service role (no auth.uid) may record API origin and actor.
CREATE OR REPLACE FUNCTION public.audit_company() RETURNS trigger LANGUAGE plpgsql SET search_path TO 'public' AS $$ begin
 select state into new.state from public.municipalities where ibge_code=new.municipality_ibge_code; if new.state is null then raise exception 'Invalid municipality'; end if;
 if TG_OP='INSERT' then new.created_by:=coalesce(auth.uid(),new.created_by); new.created_at:=now();
 else if new.organization_id<>old.organization_id then raise exception 'Organization is immutable'; end if; new.created_by:=old.created_by; new.created_at:=old.created_at;
  if new.external_id is distinct from old.external_id and old.external_id is not null and auth.uid() is not null then raise exception 'O identificador externo só pode ser alterado pela API.'; end if; end if;
 new.updated_at:=now();
 if auth.uid() is not null then new.updated_by:=auth.uid(); new.change_origin:='panel'; new.changed_by_integration_id:=null; if TG_OP='INSERT' then new.external_id:=null; end if; end if;
 return new; end $$;
CREATE OR REPLACE FUNCTION public.audit_fiscal_record() RETURNS trigger LANGUAGE plpgsql SET search_path TO '' AS $$
BEGIN
 IF TG_OP='UPDATE' THEN
  IF NEW.company_id IS DISTINCT FROM OLD.company_id OR NEW.organization_id IS DISTINCT FROM OLD.organization_id THEN RAISE EXCEPTION 'Empresa e organização não podem ser alteradas.'; END IF;
  NEW.created_by:=OLD.created_by; NEW.created_at:=OLD.created_at;
 ELSE NEW.created_by:=coalesce(auth.uid(),NEW.created_by); NEW.created_at:=now(); END IF;
 NEW.updated_at:=now();
 IF auth.uid() IS NOT NULL THEN NEW.updated_by:=auth.uid(); NEW.change_origin:='panel'; NEW.changed_by_integration_id:=NULL; END IF;
 RETURN NEW;
END $$;
REVOKE ALL ON FUNCTION public.audit_fiscal_record() FROM PUBLIC,anon,authenticated;

-- Developer role becomes read-only on companies.
DROP POLICY companies_create ON public.companies; DROP POLICY companies_update ON public.companies;
CREATE POLICY companies_create ON public.companies FOR INSERT TO authenticated WITH CHECK (public.has_org_role(organization_id, ARRAY['owner','admin','operator']::public.org_role[]) OR public.is_platform_admin());
CREATE POLICY companies_update ON public.companies FOR UPDATE TO authenticated USING (public.has_org_role(organization_id, ARRAY['owner','admin','operator']::public.org_role[]) OR public.is_platform_admin()) WITH CHECK (public.has_org_role(organization_id, ARRAY['owner','admin','operator']::public.org_role[]) OR public.is_platform_admin());

-- Integrations always cover the whole organization.
DELETE FROM public.integration_companies;
UPDATE public.integrations SET company_scope='all' WHERE company_scope<>'all';
ALTER TABLE public.integrations ADD CONSTRAINT integrations_scope_all CHECK (company_scope='all');

-- Idempotency (24 h, per integration + environment + key).
CREATE TABLE public.api_idempotency_keys(integration_id uuid NOT NULL REFERENCES public.integrations(id) ON DELETE CASCADE, environment public.environment NOT NULL, key text NOT NULL CHECK (length(key) BETWEEN 1 AND 100), method text NOT NULL, path text NOT NULL, body_hash text NOT NULL, status_code integer, response_body jsonb, created_at timestamptz NOT NULL DEFAULT now(), expires_at timestamptz NOT NULL DEFAULT now()+interval '24 hours', PRIMARY KEY(integration_id, environment, key));
GRANT ALL ON public.api_idempotency_keys TO service_role;
ALTER TABLE public.api_idempotency_keys ENABLE ROW LEVEL SECURITY;
CREATE INDEX api_idempotency_expiry ON public.api_idempotency_keys(expires_at);

CREATE TABLE public.company_readiness_state(company_id uuid NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE, environment public.environment NOT NULL, ready boolean NOT NULL, pending text[] NOT NULL DEFAULT '{}', updated_at timestamptz NOT NULL DEFAULT now(), PRIMARY KEY(company_id, environment));
GRANT ALL ON public.company_readiness_state TO service_role;
ALTER TABLE public.company_readiness_state ENABLE ROW LEVEL SECURITY;

CREATE TABLE public.certificate_expiry_notices(certificate_id uuid NOT NULL REFERENCES public.company_certificates(id) ON DELETE CASCADE, milestone text NOT NULL CHECK (milestone IN ('30','15','7','1','vencido')), created_at timestamptz NOT NULL DEFAULT now(), PRIMARY KEY(certificate_id, milestone));
GRANT ALL ON public.certificate_expiry_notices TO service_role;
ALTER TABLE public.certificate_expiry_notices ENABLE ROW LEVEL SECURITY;

-- Unused DPS sequences (no number ever reserved) may be removed together with the company.
CREATE OR REPLACE FUNCTION public.guard_dps_sequence() RETURNS trigger LANGUAGE plpgsql SET search_path='' AS $$
BEGIN
 IF TG_OP='DELETE' THEN IF OLD.next_number=1 AND NOT OLD.exhausted AND current_setting('notem.company_delete',true)='on' THEN RETURN OLD; END IF; RAISE EXCEPTION 'Uma sequência DPS atribuída não pode ser apagada.'; END IF;
 IF NEW.company_id IS DISTINCT FROM OLD.company_id OR NEW.organization_id IS DISTINCT FROM OLD.organization_id OR NEW.cnpj IS DISTINCT FROM OLD.cnpj OR NEW.series IS DISTINCT FROM OLD.series OR NEW.environment IS DISTINCT FROM OLD.environment THEN RAISE EXCEPTION 'A associação da sequência DPS é imutável.'; END IF;
 IF NEW.next_number<OLD.next_number OR (OLD.exhausted AND NOT NEW.exhausted) THEN RAISE EXCEPTION 'Um número reservado é definitivo e nunca pode ser devolvido ou reutilizado.'; END IF;
 RETURN NEW;
END $$;
REVOKE ALL ON FUNCTION public.guard_dps_sequence() FROM PUBLIC,anon,authenticated;

CREATE OR REPLACE FUNCTION public.delete_company_if_unused(_company uuid, _org uuid) RETURNS text LANGUAGE plpgsql SET search_path='' AS $$
BEGIN
 PERFORM 1 FROM public.companies WHERE id=_company AND organization_id=_org FOR UPDATE; IF NOT FOUND THEN RETURN 'NAO_ENCONTRADO'; END IF;
 IF EXISTS(SELECT 1 FROM public.dps_sequences WHERE company_id=_company AND (next_number>1 OR exhausted)) THEN RETURN 'EMPRESA_POSSUI_HISTORICO'; END IF;
 PERFORM set_config('notem.company_delete','on',true);
 DELETE FROM public.dps_sequences WHERE company_id=_company;
 UPDATE public.webhook_endpoints SET active=false, deleted_at=coalesce(deleted_at,now()), secret=NULL, previous_secret=NULL, previous_secret_expires_at=NULL, company_id=NULL, disabled_reason='Empresa excluída' WHERE company_id=_company;
 DELETE FROM public.company_service_profiles WHERE company_id=_company;
 DELETE FROM public.company_fiscal_settings WHERE company_id=_company;
 DELETE FROM public.company_certificate_material WHERE company_id=_company;
 DELETE FROM public.company_certificates WHERE company_id=_company;
 DELETE FROM public.certificate_audit_events WHERE company_id=_company;
 DELETE FROM public.municipality_agreement_queries WHERE company_id=_company;
 DELETE FROM public.integration_companies WHERE company_id=_company;
 DELETE FROM public.companies WHERE id=_company;
 PERFORM set_config('notem.company_delete','off',true);
 RETURN 'OK';
END $$;
REVOKE ALL ON FUNCTION public.delete_company_if_unused(uuid,uuid) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.delete_company_if_unused(uuid,uuid) TO service_role;