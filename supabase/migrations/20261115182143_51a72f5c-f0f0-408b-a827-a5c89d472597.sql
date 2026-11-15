-- ===== S-03 rate limits =====
CREATE TABLE public.api_rate_counters (
  scope text NOT NULL, bucket text NOT NULL, window_start timestamptz NOT NULL, hits integer NOT NULL DEFAULT 0,
  PRIMARY KEY (scope, bucket, window_start));
GRANT ALL ON public.api_rate_counters TO service_role;
ALTER TABLE public.api_rate_counters ENABLE ROW LEVEL SECURITY;

CREATE TABLE public.api_rate_limit_overrides (
  organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  bucket text NOT NULL, max_hits integer NOT NULL CHECK (max_hits > 0),
  window_seconds integer NOT NULL CHECK (window_seconds BETWEEN 1 AND 86400),
  updated_by uuid, created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (organization_id, bucket));
GRANT SELECT ON public.api_rate_limit_overrides TO authenticated;
GRANT ALL ON public.api_rate_limit_overrides TO service_role;
ALTER TABLE public.api_rate_limit_overrides ENABLE ROW LEVEL SECURITY;
CREATE POLICY rate_overrides_admin_read ON public.api_rate_limit_overrides FOR SELECT TO authenticated USING (public.is_platform_admin());
CREATE TRIGGER api_rate_limit_overrides_touch BEFORE UPDATE ON public.api_rate_limit_overrides FOR EACH ROW EXECUTE FUNCTION public.touch_record();

CREATE TABLE public.api_concurrency_slots (
  scope text NOT NULL, slot integer NOT NULL, token uuid NOT NULL, lease_until timestamptz NOT NULL,
  PRIMARY KEY (scope, slot));
GRANT ALL ON public.api_concurrency_slots TO service_role;
ALTER TABLE public.api_concurrency_slots ENABLE ROW LEVEL SECURITY;

-- Fixed-window counters; every rule is counted atomically; an organization override replaces max/window of a bucket.
CREATE OR REPLACE FUNCTION public.api_rate_check(_org uuid, _rules jsonb) RETURNS jsonb
LANGUAGE plpgsql SET search_path = '' AS $$
DECLARE r jsonb; mx integer; win integer; ws timestamptz; n integer; retry integer := 0; blocked text; o record;
BEGIN
  FOR r IN SELECT * FROM jsonb_array_elements(coalesce(_rules, '[]'::jsonb)) LOOP
    mx := (r->>'max')::integer; win := (r->>'window')::integer;
    IF _org IS NOT NULL THEN
      SELECT max_hits, window_seconds INTO o FROM public.api_rate_limit_overrides WHERE organization_id = _org AND bucket = r->>'bucket';
      IF FOUND THEN mx := o.max_hits; win := o.window_seconds; END IF;
    END IF;
    IF mx IS NULL OR win IS NULL OR win < 1 THEN CONTINUE; END IF;
    ws := to_timestamp(floor(extract(epoch FROM now()) / win) * win);
    INSERT INTO public.api_rate_counters AS c (scope, bucket, window_start, hits) VALUES (r->>'scope', r->>'bucket', ws, 1)
      ON CONFLICT (scope, bucket, window_start) DO UPDATE SET hits = c.hits + 1 RETURNING hits INTO n;
    IF n > mx THEN
      blocked := coalesce(blocked, r->>'bucket');
      retry := greatest(retry, ceil(extract(epoch FROM (ws + make_interval(secs => win) - now())))::integer);
    END IF;
  END LOOP;
  RETURN jsonb_build_object('allowed', blocked IS NULL, 'bucket', blocked, 'retry_after', greatest(retry, 1));
END $$;

CREATE OR REPLACE FUNCTION public.api_slot_acquire(_scope text, _max integer, _ttl integer) RETURNS uuid
LANGUAGE plpgsql SET search_path = '' AS $$
DECLARE t uuid := gen_random_uuid(); s integer;
BEGIN
  PERFORM pg_advisory_xact_lock(hashtext('api_slot:' || _scope));
  FOR s IN 1..greatest(_max, 1) LOOP
    INSERT INTO public.api_concurrency_slots AS x (scope, slot, token, lease_until) VALUES (_scope, s, t, now() + make_interval(secs => _ttl))
      ON CONFLICT (scope, slot) DO UPDATE SET token = excluded.token, lease_until = excluded.lease_until WHERE x.lease_until < now();
    IF FOUND THEN RETURN t; END IF;
  END LOOP;
  RETURN NULL;
END $$;

CREATE OR REPLACE FUNCTION public.api_slot_release(_token uuid) RETURNS void
LANGUAGE sql SET search_path = '' AS $$ DELETE FROM public.api_concurrency_slots WHERE token = _token $$;

REVOKE ALL ON FUNCTION public.api_rate_check(uuid, jsonb) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.api_slot_acquire(text, integer, integer) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.api_slot_release(uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.api_rate_check(uuid, jsonb), public.api_slot_acquire(text, integer, integer), public.api_slot_release(uuid) TO service_role;

-- ===== S-04 changes made by sandbox keys =====
CREATE TABLE public.sandbox_change_audit (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  integration_id uuid REFERENCES public.integrations(id) ON DELETE SET NULL,
  integration_name text NOT NULL, key_id uuid,
  company_id uuid REFERENCES public.companies(id) ON DELETE SET NULL,
  item text NOT NULL CHECK (item IN ('empresa', 'configuracao_fiscal', 'servico', 'tomador', 'certificado')),
  action text NOT NULL CHECK (action IN ('criado', 'alterado', 'excluido')),
  method text NOT NULL, path text NOT NULL, request_id text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  acknowledged_at timestamptz, acknowledged_by uuid);
CREATE INDEX sandbox_change_audit_org ON public.sandbox_change_audit (organization_id, created_at DESC);
GRANT SELECT ON public.sandbox_change_audit TO authenticated;
GRANT UPDATE (acknowledged_at, acknowledged_by) ON public.sandbox_change_audit TO authenticated;
GRANT ALL ON public.sandbox_change_audit TO service_role;
ALTER TABLE public.sandbox_change_audit ENABLE ROW LEVEL SECURITY;
CREATE POLICY sandbox_change_read ON public.sandbox_change_audit FOR SELECT TO authenticated
  USING (public.is_org_member(organization_id) OR public.is_platform_admin());
CREATE POLICY sandbox_change_ack ON public.sandbox_change_audit FOR UPDATE TO authenticated
  USING (public.has_org_role(organization_id, ARRAY['owner', 'admin']::public.org_role[]) OR public.is_platform_admin())
  WITH CHECK ((public.has_org_role(organization_id, ARRAY['owner', 'admin']::public.org_role[]) OR public.is_platform_admin()) AND acknowledged_by = auth.uid());

-- ===== S-05 request logs: technical roles only =====
DROP POLICY IF EXISTS api_logs_read ON public.api_request_logs;
CREATE POLICY api_logs_read ON public.api_request_logs FOR SELECT TO authenticated
  USING (created_at >= now() - interval '90 days'
    AND (public.has_org_role(organization_id, ARRAY['owner', 'admin', 'developer']::public.org_role[]) OR public.is_platform_admin()));

-- ===== S-06 invitations expire after 7 days; revocation is recorded =====
ALTER TABLE public.invitations ADD COLUMN expires_at timestamptz NOT NULL DEFAULT (now() + interval '7 days'),
  ADD COLUMN revoked_at timestamptz, ADD COLUMN revoked_by uuid;
UPDATE public.invitations SET expires_at = created_at + interval '7 days';

CREATE OR REPLACE FUNCTION public.accept_invitation(invitation_id uuid) RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $function$
declare inv public.invitations; verified_email text; has_valid_method boolean;
begin
  select exists(select 1 from jsonb_array_elements(coalesce(auth.jwt()->'amr','[]'::jsonb)) a where a->>'method' in ('password','oauth','invite')) into has_valid_method;
  if not has_valid_method then raise exception 'Password setup or authenticated login required'; end if;
  select lower(email) into verified_email from auth.users where id=auth.uid() and email_confirmed_at is not null;
  if verified_email is null then raise exception 'Verified sign-in required'; end if;
  select * into inv from public.invitations where id=invitation_id and status='pending' and email=verified_email and expires_at > now() for update;
  if inv.id is null then raise exception 'Invitation unavailable'; end if;
  insert into public.organization_members(organization_id,user_id,role) values(inv.organization_id,auth.uid(),inv.role) on conflict(organization_id,user_id) do nothing;
  update public.invitations set status='accepted',accepted_by=auth.uid(),accepted_at=now() where id=inv.id;
  return inv.organization_id;
end $function$;

CREATE OR REPLACE FUNCTION public.pending_invitations()
RETURNS TABLE(id uuid, organization_id uuid, organization_name text, role org_role, requires_explicit_acceptance boolean)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public' AS $function$
  select i.id,i.organization_id,o.name,i.role,i.requires_explicit_acceptance from public.invitations i join public.organizations o on o.id=i.organization_id
  where i.status='pending' and i.expires_at > now() and i.email=(select lower(email) from auth.users where id=auth.uid() and email_confirmed_at is not null)
$function$;

-- ===== S-16 administrative trail =====
CREATE TABLE public.admin_audit_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  actor_id uuid, actor_is_platform_admin boolean NOT NULL DEFAULT false,
  action text NOT NULL, organization_id uuid, target_type text NOT NULL, target_id uuid,
  details jsonb NOT NULL DEFAULT '{}'::jsonb, created_at timestamptz NOT NULL DEFAULT now());
CREATE INDEX admin_audit_events_created ON public.admin_audit_events (created_at DESC);
GRANT SELECT ON public.admin_audit_events TO authenticated;
GRANT ALL ON public.admin_audit_events TO service_role;
ALTER TABLE public.admin_audit_events ENABLE ROW LEVEL SECURITY;
CREATE POLICY admin_audit_read ON public.admin_audit_events FOR SELECT TO authenticated USING (public.is_platform_admin());

CREATE OR REPLACE FUNCTION public.record_admin_audit() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE actor uuid := auth.uid(); act text; org uuid; target uuid; info jsonb := '{}'::jsonb;
BEGIN
  IF TG_TABLE_NAME = 'organizations' THEN
    IF TG_OP = 'INSERT' THEN act := 'organizacao.criada'; actor := coalesce(actor, NEW.created_by); info := jsonb_build_object('nome', NEW.name, 'tipo', NEW.type);
    ELSE
      IF NEW.name IS NOT DISTINCT FROM OLD.name AND NEW.type IS NOT DISTINCT FROM OLD.type THEN RETURN NEW; END IF;
      act := 'organizacao.alterada'; info := jsonb_build_object('nome_anterior', OLD.name, 'nome', NEW.name, 'tipo_anterior', OLD.type, 'tipo', NEW.type);
    END IF;
    org := NEW.id; target := NEW.id;
  ELSIF TG_TABLE_NAME = 'invitations' THEN
    org := NEW.organization_id; target := NEW.id; info := jsonb_build_object('papel', NEW.role);
    IF TG_OP = 'INSERT' THEN act := 'convite.criado'; actor := coalesce(actor, NEW.invited_by);
    ELSIF NEW.status IS DISTINCT FROM OLD.status THEN
      act := 'convite.' || NEW.status::text; actor := coalesce(actor, NEW.revoked_by, NEW.accepted_by);
      IF NEW.revoked_at IS NOT NULL AND NEW.revoked_by IS NULL THEN info := info || jsonb_build_object('motivo', 'vencido'); END IF;
    ELSE RETURN NEW; END IF;
  ELSIF TG_TABLE_NAME = 'organization_members' THEN
    IF TG_OP = 'DELETE' THEN org := OLD.organization_id; target := OLD.user_id; act := 'membro.removido'; info := jsonb_build_object('papel', OLD.role);
    ELSIF TG_OP = 'INSERT' THEN org := NEW.organization_id; target := NEW.user_id; act := 'membro.adicionado'; info := jsonb_build_object('papel', NEW.role);
    ELSE IF NEW.role IS NOT DISTINCT FROM OLD.role THEN RETURN NEW; END IF; org := NEW.organization_id; target := NEW.user_id; act := 'membro.papel_alterado'; info := jsonb_build_object('papel_anterior', OLD.role, 'papel', NEW.role); END IF;
  ELSIF TG_TABLE_NAME = 'platform_admins' THEN
    IF TG_OP = 'DELETE' THEN target := OLD.user_id; act := 'admin_plataforma.removido'; ELSE target := NEW.user_id; act := 'admin_plataforma.adicionado'; actor := coalesce(actor, NEW.created_by); END IF;
  END IF;
  INSERT INTO public.admin_audit_events (actor_id, actor_is_platform_admin, action, organization_id, target_type, target_id, details)
  VALUES (actor, actor IS NOT NULL AND EXISTS (SELECT 1 FROM public.platform_admins p WHERE p.user_id = actor), act, org, TG_TABLE_NAME, target, info);
  IF TG_OP = 'DELETE' THEN RETURN OLD; END IF; RETURN NEW;
END $$;
REVOKE ALL ON FUNCTION public.record_admin_audit() FROM PUBLIC, anon, authenticated;
CREATE TRIGGER organizations_admin_audit AFTER INSERT OR UPDATE ON public.organizations FOR EACH ROW EXECUTE FUNCTION public.record_admin_audit();
CREATE TRIGGER invitations_admin_audit AFTER INSERT OR UPDATE ON public.invitations FOR EACH ROW EXECUTE FUNCTION public.record_admin_audit();
CREATE TRIGGER organization_members_admin_audit AFTER INSERT OR UPDATE OR DELETE ON public.organization_members FOR EACH ROW EXECUTE FUNCTION public.record_admin_audit();
CREATE TRIGGER platform_admins_admin_audit AFTER INSERT OR DELETE ON public.platform_admins FOR EACH ROW EXECUTE FUNCTION public.record_admin_audit();

-- ===== S-17 last organization must be one of the user's organizations =====
CREATE OR REPLACE FUNCTION public.guard_profile_last_organization() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
BEGIN
  IF NEW.last_organization_id IS DISTINCT FROM OLD.last_organization_id AND NEW.last_organization_id IS NOT NULL AND auth.uid() IS NOT NULL
     AND NOT EXISTS (SELECT 1 FROM public.organization_members m WHERE m.organization_id = NEW.last_organization_id AND m.user_id = NEW.id)
     AND NOT EXISTS (SELECT 1 FROM public.platform_admins p WHERE p.user_id = NEW.id) THEN
    RAISE EXCEPTION 'Organização indisponível.';
  END IF;
  RETURN NEW;
END $$;
REVOKE ALL ON FUNCTION public.guard_profile_last_organization() FROM PUBLIC, anon, authenticated;
CREATE TRIGGER profiles_guard_last_organization BEFORE UPDATE ON public.profiles FOR EACH ROW EXECUTE FUNCTION public.guard_profile_last_organization();

-- ===== S-09 remove broad table grants =====
REVOKE ALL ON public.api_idempotency_keys, public.certificate_expiry_notices, public.company_readiness_state FROM anon, authenticated;
REVOKE ALL ON public.company_certificates, public.certificate_audit_events, public.municipality_agreement_queries FROM anon, authenticated;
GRANT SELECT ON public.company_certificates, public.certificate_audit_events, public.municipality_agreement_queries TO authenticated;
GRANT ALL ON public.api_idempotency_keys, public.certificate_expiry_notices, public.company_readiness_state, public.company_certificates, public.certificate_audit_events, public.municipality_agreement_queries TO service_role;

-- ===== S-14 retention located by job name =====
SELECT cron.alter_job((SELECT jobid FROM cron.job WHERE jobname = 'notem-api-log-retention'), command := $cmd$
DELETE FROM public.webhook_alerts WHERE created_at < now()-interval '90 days';
DELETE FROM public.webhook_deliveries WHERE event_id IN (SELECT id FROM public.webhook_events WHERE created_at < now()-interval '90 days');
DELETE FROM public.webhook_events WHERE created_at < now()-interval '90 days';
DELETE FROM public.api_request_logs WHERE created_at < now()-interval '90 days';
DELETE FROM public.api_idempotency_keys WHERE expires_at < now();
DELETE FROM public.webhook_scheduler_runs WHERE created_at < now()-interval '90 days';
DELETE FROM public.api_rate_counters WHERE window_start < now()-interval '2 days';
DELETE FROM public.api_concurrency_slots WHERE lease_until < now()-interval '1 day';
UPDATE public.invitations SET status='revoked', revoked_at=now() WHERE status='pending' AND expires_at < now();
$cmd$);