ALTER TABLE public.webhook_endpoints ADD COLUMN auth_header text CHECK (auth_header IS NULL OR (auth_header ~ '^[A-Za-z0-9!#$%&''*+.^_`|~-]{1,64}$' AND lower(auth_header) NOT LIKE 'notem-%' AND lower(auth_header) NOT IN ('host','content-length','content-type','content-encoding','transfer-encoding','connection','keep-alive','upgrade','te','trailer','expect','proxy-authorization','proxy-connection','cookie','user-agent','accept-encoding'))), ADD COLUMN auth_value jsonb, ADD COLUMN auth_configured boolean GENERATED ALWAYS AS (auth_value IS NOT NULL) STORED, ADD COLUMN company_id uuid, ADD CONSTRAINT webhook_endpoint_company_fk FOREIGN KEY (company_id, organization_id) REFERENCES public.companies(id, organization_id), ADD CONSTRAINT webhook_endpoint_auth_pair CHECK ((auth_value IS NULL) = (auth_header IS NULL)), ADD CONSTRAINT webhook_endpoint_deleted_auth CHECK (deleted_at IS NULL OR auth_value IS NULL);
GRANT SELECT (auth_header, auth_configured, company_id) ON public.webhook_endpoints TO authenticated;

CREATE TABLE public.webhook_secret_reveals (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), organization_id uuid NOT NULL, endpoint_id uuid NOT NULL REFERENCES public.webhook_endpoints(id), actor_id uuid NOT NULL REFERENCES public.profiles(id), created_at timestamptz NOT NULL DEFAULT now());
REVOKE ALL ON public.webhook_secret_reveals FROM PUBLIC, anon, authenticated;
GRANT SELECT ON public.webhook_secret_reveals TO authenticated;
GRANT ALL ON public.webhook_secret_reveals TO service_role;
ALTER TABLE public.webhook_secret_reveals ENABLE ROW LEVEL SECURITY;
CREATE POLICY webhook_secret_reveal_read ON public.webhook_secret_reveals FOR SELECT TO authenticated USING (public.has_org_role(organization_id, ARRAY['owner','admin']::public.org_role[]) OR public.is_platform_admin());

CREATE TABLE public.webhook_scheduler_runs (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), reserved integer NOT NULL DEFAULT 0, completed integer NOT NULL DEFAULT 0, failed integer NOT NULL DEFAULT 0, disabled integer NOT NULL DEFAULT 0, error text, created_at timestamptz NOT NULL DEFAULT now());
REVOKE ALL ON public.webhook_scheduler_runs FROM PUBLIC, anon, authenticated;
GRANT SELECT ON public.webhook_scheduler_runs TO authenticated;
GRANT ALL ON public.webhook_scheduler_runs TO service_role;
ALTER TABLE public.webhook_scheduler_runs ENABLE ROW LEVEL SECURITY;
CREATE POLICY webhook_scheduler_runs_admin ON public.webhook_scheduler_runs FOR SELECT TO authenticated USING (public.is_platform_admin());
CREATE INDEX webhook_scheduler_runs_created ON public.webhook_scheduler_runs(created_at);

CREATE TABLE public.system_heartbeats (name text PRIMARY KEY CHECK (name ~ '^[a-z_]{1,64}$'), last_success_at timestamptz NOT NULL, updated_at timestamptz NOT NULL DEFAULT now());
REVOKE ALL ON public.system_heartbeats FROM PUBLIC, anon, authenticated;
GRANT SELECT ON public.system_heartbeats TO authenticated;
GRANT ALL ON public.system_heartbeats TO service_role;
ALTER TABLE public.system_heartbeats ENABLE ROW LEVEL SECURITY;
CREATE POLICY system_heartbeats_admin ON public.system_heartbeats FOR SELECT TO authenticated USING (public.is_platform_admin());

CREATE OR REPLACE FUNCTION public.manage_webhook(_actor uuid,_org uuid,_integration uuid,_action text,_id uuid,_payload jsonb) RETURNS uuid LANGUAGE plpgsql SET search_path=public AS $$ DECLARE e public.webhook_endpoints; roles_ok boolean; _company uuid; BEGIN
SELECT EXISTS(SELECT 1 FROM public.platform_admins WHERE user_id=_actor) OR EXISTS(SELECT 1 FROM public.organization_members WHERE user_id=_actor AND organization_id=_org AND role IN ('owner','admin','developer')) INTO roles_ok;
IF NOT roles_ok THEN RAISE EXCEPTION 'Acesso não autorizado'; END IF;
PERFORM 1 FROM public.integrations WHERE id=_integration AND organization_id=_org FOR UPDATE; IF NOT FOUND THEN RAISE EXCEPTION 'Integração inválida'; END IF;
_company=NULLIF(_payload->>'company_id','')::uuid;
IF _action IN ('create','save') AND _company IS NOT NULL AND NOT EXISTS(SELECT 1 FROM public.integration_companies WHERE integration_id=_integration AND organization_id=_org AND company_id=_company) THEN RAISE EXCEPTION 'Empresa não autorizada'; END IF;
IF _action='create' THEN
INSERT INTO public.webhook_endpoints(id,organization_id,integration_id,environment,url,description,events,secret,secret_prefix,created_by,company_id,auth_header,auth_value) VALUES(_id,_org,_integration,(_payload->>'environment')::public.environment,_payload->>'url',COALESCE(_payload->>'description',''),ARRAY(SELECT jsonb_array_elements_text(_payload->'events')),_payload->'secret',_payload->>'secret_prefix',_actor,_company,CASE WHEN _payload ? 'auth_value' THEN COALESCE(NULLIF(_payload->>'auth_header',''),'Authorization') END,_payload->'auth_value') RETURNING * INTO e;
ELSE SELECT * INTO e FROM public.webhook_endpoints WHERE id=_id AND organization_id=_org AND integration_id=_integration AND deleted_at IS NULL FOR UPDATE; IF NOT FOUND THEN RAISE EXCEPTION 'Endereço não encontrado'; END IF;
IF _action='save' THEN UPDATE public.webhook_endpoints SET url=_payload->>'url',description=COALESCE(_payload->>'description',''),events=ARRAY(SELECT jsonb_array_elements_text(_payload->'events')),company_id=_company,
 auth_value=CASE WHEN COALESCE((_payload->>'auth_clear')::boolean,false) THEN NULL WHEN _payload ? 'auth_value' THEN _payload->'auth_value' ELSE auth_value END,
 auth_header=CASE WHEN COALESCE((_payload->>'auth_clear')::boolean,false) THEN NULL WHEN _payload ? 'auth_value' OR auth_value IS NOT NULL THEN COALESCE(NULLIF(_payload->>'auth_header',''),'Authorization') ELSE NULL END WHERE id=e.id;
ELSIF _action='rotate' THEN UPDATE public.webhook_endpoints SET previous_secret=secret,previous_secret_expires_at=now()+interval '24 hours',secret=_payload->'secret',secret_prefix=_payload->>'secret_prefix' WHERE id=e.id;
ELSIF _action='active' THEN UPDATE public.webhook_endpoints SET active=(_payload->>'active')::boolean,disabled_reason=NULL,failing_since=CASE WHEN (_payload->>'active')::boolean THEN NULL ELSE failing_since END WHERE id=e.id;
ELSIF _action='delete' THEN UPDATE public.webhook_endpoints SET active=false,deleted_at=now(),secret=NULL,previous_secret=NULL,previous_secret_expires_at=NULL,auth_value=NULL,auth_header=NULL,disabled_reason='Excluído pelo responsável' WHERE id=e.id; UPDATE public.webhook_deliveries SET status='exhausted',error='ENDERECO_EXCLUIDO',claim_token=NULL,lease_until=NULL WHERE endpoint_id=e.id AND status='pending';
ELSIF _action='reveal' THEN INSERT INTO public.webhook_secret_reveals(organization_id,endpoint_id,actor_id) VALUES(_org,e.id,_actor);
ELSE RAISE EXCEPTION 'Ação inválida'; END IF; END IF; RETURN _id; END $$;
REVOKE ALL ON FUNCTION public.manage_webhook(uuid,uuid,uuid,text,uuid,jsonb) FROM PUBLIC,anon,authenticated; GRANT EXECUTE ON FUNCTION public.manage_webhook(uuid,uuid,uuid,text,uuid,jsonb) TO service_role;

DROP FUNCTION public.emit_webhook_event(text,uuid,uuid,public.environment,text,text,uuid);
CREATE FUNCTION public.emit_webhook_event(_id text,_org uuid,_integration uuid,_environment public.environment,_type text,_body text,_endpoint uuid DEFAULT NULL,_company uuid DEFAULT NULL) RETURNS integer LANGUAGE plpgsql SET search_path=public AS $$ DECLARE n integer; BEGIN
PERFORM 1 FROM public.integrations WHERE id=_integration AND organization_id=_org AND active FOR UPDATE; IF NOT FOUND THEN RAISE EXCEPTION 'Integração inativa'; END IF;
IF _body::jsonb->>'id' IS DISTINCT FROM _id OR _body::jsonb->>'organizacao_id' IS DISTINCT FROM _org::text OR _body::jsonb->>'integracao_id' IS DISTINCT FROM _integration::text OR _body::jsonb->>'tipo' IS DISTINCT FROM _type OR _body::jsonb->>'ambiente' IS DISTINCT FROM (CASE WHEN _environment='sandbox' THEN 'homologacao' ELSE 'producao' END) THEN RAISE EXCEPTION 'Evento inválido'; END IF;
INSERT INTO public.webhook_events(id,organization_id,integration_id,environment,type,payload,body) VALUES(_id,_org,_integration,_environment,_type,_body::jsonb,_body);
INSERT INTO public.webhook_deliveries(id,event_id,endpoint_id,organization_id,integration_id,environment,attempt) SELECT 'whd_'||replace(gen_random_uuid()::text,'-',''),_id,id,_org,_integration,_environment,1 FROM public.webhook_endpoints WHERE organization_id=_org AND integration_id=_integration AND environment=_environment AND active AND deleted_at IS NULL AND (_endpoint IS NULL OR id=_endpoint) AND (_type='webhook.teste' OR (_type=ANY(events) AND (company_id IS NULL OR company_id=_company))); GET DIAGNOSTICS n=ROW_COUNT; RETURN n; END $$;
REVOKE ALL ON FUNCTION public.emit_webhook_event(text,uuid,uuid,public.environment,text,text,uuid,uuid) FROM PUBLIC,anon,authenticated; GRANT EXECUTE ON FUNCTION public.emit_webhook_event(text,uuid,uuid,public.environment,text,text,uuid,uuid) TO service_role;