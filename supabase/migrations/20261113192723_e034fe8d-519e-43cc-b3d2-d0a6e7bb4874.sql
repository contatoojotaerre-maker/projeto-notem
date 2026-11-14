ALTER TABLE public.companies ADD CONSTRAINT companies_id_organization_unique UNIQUE(id,organization_id);
CREATE TABLE public.company_customers (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), company_id uuid NOT NULL, organization_id uuid NOT NULL,
 external_id text CHECK(external_id IS NULL OR length(external_id) BETWEEN 1 AND 100), customer_data jsonb NOT NULL CHECK(jsonb_typeof(customer_data)='object'),
 created_by uuid NOT NULL REFERENCES public.profiles(id), updated_by uuid NOT NULL REFERENCES public.profiles(id), changed_by_integration_id uuid REFERENCES public.integrations(id), change_origin public.change_origin NOT NULL DEFAULT 'api',
 created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now(),
 UNIQUE(company_id,external_id), UNIQUE(id,company_id,organization_id), FOREIGN KEY(company_id,organization_id) REFERENCES public.companies(id,organization_id) ON DELETE CASCADE);
GRANT SELECT ON public.company_customers TO authenticated; GRANT ALL ON public.company_customers TO service_role;
ALTER TABLE public.company_customers ENABLE ROW LEVEL SECURITY;
CREATE POLICY customers_read ON public.company_customers FOR SELECT TO authenticated USING(public.is_org_member(organization_id) OR public.is_platform_admin());
CREATE INDEX customers_company_created ON public.company_customers(company_id,created_at DESC,id);
CREATE TRIGGER customers_touch BEFORE UPDATE ON public.company_customers FOR EACH ROW EXECUTE FUNCTION public.touch_record();
CREATE TABLE public.invoices (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), organization_id uuid NOT NULL REFERENCES public.organizations(id), company_id uuid NOT NULL, integration_id uuid,
 environment public.environment NOT NULL, external_id text CHECK(external_id IS NULL OR length(external_id) BETWEEN 1 AND 100),
 status text NOT NULL DEFAULT 'processing' CHECK(status IN ('processing','verifying','authorized','rejected','cancellation_pending','cancelled','substituted','cancelled_by_authority')),
 dps_series integer NOT NULL CHECK(dps_series BETWEEN 1 AND 49999), dps_number numeric(15,0) NOT NULL CHECK(dps_number BETWEEN 1 AND 999999999999999), dps_id text NOT NULL CHECK(dps_id ~ '^DPS[0-9]{42}$'), competence date NOT NULL,
 customer_snapshot jsonb, provider_snapshot jsonb NOT NULL, fiscal_snapshot jsonb NOT NULL, service_snapshot jsonb NOT NULL, service_profile_id uuid REFERENCES public.company_service_profiles(id), description text NOT NULL CHECK(length(description)<=2000), complementary_information text CHECK(length(complementary_information)<=2000),
 sent_values jsonb NOT NULL, government_values jsonb, service_location jsonb NOT NULL, access_key text CHECK(access_key IS NULL OR access_key ~ '^[0-9]{50}$'), nfse_number text,
 emitted_at timestamptz NOT NULL, authorized_at timestamptz, government_errors jsonb NOT NULL DEFAULT '[]', restrictions jsonb NOT NULL DEFAULT '[]', manifestation jsonb,
 unsigned_dps_xml text NOT NULL, signed_dps_xml text, authorized_nfse_xml text,
 idempotency_key text CHECK(idempotency_key IS NULL OR length(idempotency_key) BETWEEN 1 AND 100), request_hash text,
 dispatch_state text NOT NULL DEFAULT 'not_sent' CHECK(dispatch_state IN ('not_sent','sending','sent','uncertain','completed')), last_attempt_at timestamptz, verification_started_at timestamptz, next_verification_at timestamptz, claim_token uuid, lease_until timestamptz,
 substitutes_invoice_id uuid REFERENCES public.invoices(id), substituted_by_invoice_id uuid REFERENCES public.invoices(id),
 created_by uuid NOT NULL REFERENCES public.profiles(id), updated_by uuid NOT NULL REFERENCES public.profiles(id), change_origin public.change_origin NOT NULL DEFAULT 'api', created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now(),
 UNIQUE(organization_id,external_id), UNIQUE(company_id,environment,dps_series,dps_number), UNIQUE(environment,dps_id), UNIQUE(id,organization_id), FOREIGN KEY(company_id,organization_id) REFERENCES public.companies(id,organization_id), FOREIGN KEY(integration_id,organization_id) REFERENCES public.integrations(id,organization_id));
GRANT SELECT ON public.invoices TO authenticated; GRANT ALL ON public.invoices TO service_role;
ALTER TABLE public.invoices ENABLE ROW LEVEL SECURITY;
CREATE POLICY invoices_read ON public.invoices FOR SELECT TO authenticated USING(public.is_org_member(organization_id) OR public.is_platform_admin());
CREATE UNIQUE INDEX invoices_request_unique ON public.invoices(integration_id,environment,idempotency_key) WHERE idempotency_key IS NOT NULL;
CREATE INDEX invoices_list ON public.invoices(organization_id,environment,emitted_at DESC,id);
CREATE INDEX invoices_verifying ON public.invoices(next_verification_at) WHERE status='verifying';
CREATE TRIGGER invoices_touch BEFORE UPDATE ON public.invoices FOR EACH ROW EXECUTE FUNCTION public.touch_record();
CREATE TABLE public.invoice_events (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), invoice_id uuid NOT NULL, organization_id uuid NOT NULL, type text NOT NULL, details jsonb NOT NULL DEFAULT '{}', created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now(), FOREIGN KEY(invoice_id,organization_id) REFERENCES public.invoices(id,organization_id));
GRANT SELECT ON public.invoice_events TO authenticated; GRANT ALL ON public.invoice_events TO service_role;
ALTER TABLE public.invoice_events ENABLE ROW LEVEL SECURITY;
CREATE POLICY invoice_events_read ON public.invoice_events FOR SELECT TO authenticated USING(public.is_org_member(organization_id) OR public.is_platform_admin());
CREATE INDEX invoice_events_timeline ON public.invoice_events(invoice_id,created_at,id);
CREATE TRIGGER invoice_events_touch BEFORE UPDATE ON public.invoice_events FOR EACH ROW EXECUTE FUNCTION public.touch_record();
CREATE OR REPLACE FUNCTION public.delete_company_if_unused(_company uuid, _org uuid) RETURNS text LANGUAGE plpgsql SET search_path='' AS $$
BEGIN
 PERFORM 1 FROM public.companies WHERE id=_company AND organization_id=_org FOR UPDATE; IF NOT FOUND THEN RETURN 'NAO_ENCONTRADO'; END IF;
 IF EXISTS(SELECT 1 FROM public.dps_sequences WHERE company_id=_company AND (next_number>1 OR exhausted)) OR EXISTS(SELECT 1 FROM public.invoices WHERE company_id=_company) THEN RETURN 'EMPRESA_POSSUI_HISTORICO'; END IF;
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
 PERFORM set_config('notem.company_delete','off',true); RETURN 'OK';
END $$;
REVOKE ALL ON FUNCTION public.delete_company_if_unused(uuid,uuid) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.delete_company_if_unused(uuid,uuid) TO service_role;