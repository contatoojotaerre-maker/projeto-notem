-- System health (platform administration). Every new object is service-role only.
CREATE TABLE public.government_calls (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  environment public.environment NOT NULL,
  system text NOT NULL CHECK (system IN ('sefin','adn')),
  service text NOT NULL CHECK (service IN ('emissao','consulta','evento','distribuicao')),
  outcome text NOT NULL CHECK (outcome IN ('respondeu','erro_governo','conexao','tempo_esgotado')),
  http_status integer CHECK (http_status IS NULL OR http_status BETWEEN 100 AND 599),
  duration_ms integer CHECK (duration_ms IS NULL OR duration_ms BETWEEN 0 AND 600000),
  created_at timestamptz NOT NULL DEFAULT now()
);
REVOKE ALL ON public.government_calls FROM PUBLIC, anon, authenticated;
GRANT ALL ON public.government_calls TO service_role;
ALTER TABLE public.government_calls ENABLE ROW LEVEL SECURITY;
CREATE POLICY government_calls_no_client ON public.government_calls FOR ALL TO authenticated, anon USING (false) WITH CHECK (false);
CREATE INDEX government_calls_window ON public.government_calls (created_at DESC, environment, system, service);

CREATE TABLE public.health_checks (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  trigger text NOT NULL CHECK (trigger IN ('agendada','manual')),
  actor_id uuid,
  overall text NOT NULL CHECK (overall IN ('ok','atencao','problema')),
  result jsonb NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
REVOKE ALL ON public.health_checks FROM PUBLIC, anon, authenticated;
GRANT ALL ON public.health_checks TO service_role;
ALTER TABLE public.health_checks ENABLE ROW LEVEL SECURITY;
CREATE POLICY health_checks_no_client ON public.health_checks FOR ALL TO authenticated, anon USING (false) WITH CHECK (false);
CREATE INDEX health_checks_recent ON public.health_checks (created_at DESC);
CREATE INDEX health_checks_scheduled ON public.health_checks (created_at DESC) WHERE trigger = 'agendada';

CREATE TABLE public.health_alerts (
  key text PRIMARY KEY CHECK (key ~ '^[a-z0-9_:.-]{1,120}$'),
  title text NOT NULL CHECK (length(title) BETWEEN 1 AND 200),
  state text NOT NULL CHECK (state IN ('problema','ok')),
  since timestamptz NOT NULL,
  details jsonb NOT NULL DEFAULT '{}',
  last_notified_at timestamptz,
  last_notified_kind text CHECK (last_notified_kind IS NULL OR last_notified_kind IN ('problema','lembrete','resolvido')),
  resolved_at timestamptz,
  send_failed_at timestamptz,
  send_error text CHECK (send_error IS NULL OR length(send_error) <= 200),
  updated_at timestamptz NOT NULL DEFAULT now()
);
REVOKE ALL ON public.health_alerts FROM PUBLIC, anon, authenticated;
GRANT ALL ON public.health_alerts TO service_role;
ALTER TABLE public.health_alerts ENABLE ROW LEVEL SECURITY;
CREATE POLICY health_alerts_no_client ON public.health_alerts FOR ALL TO authenticated, anon USING (false) WITH CHECK (false);

CREATE TABLE public.health_runtime (
  id boolean PRIMARY KEY DEFAULT true CHECK (id),
  lease_until timestamptz,
  last_manual_at timestamptz,
  last_test_email_at timestamptz,
  last_email_failed_at timestamptz,
  last_email_error text CHECK (last_email_error IS NULL OR length(last_email_error) <= 200)
);
REVOKE ALL ON public.health_runtime FROM PUBLIC, anon, authenticated;
GRANT ALL ON public.health_runtime TO service_role;
ALTER TABLE public.health_runtime ENABLE ROW LEVEL SECURITY;
CREATE POLICY health_runtime_no_client ON public.health_runtime FOR ALL TO authenticated, anon USING (false) WITH CHECK (false);
INSERT INTO public.health_runtime(id) VALUES (true) ON CONFLICT DO NOTHING;

ALTER TABLE public.platform_settings
  ADD COLUMN health_alert_recipients text[] NOT NULL DEFAULT '{}' CHECK (cardinality(health_alert_recipients) <= 5),
  ADD COLUMN health_alerts_enabled boolean NOT NULL DEFAULT false;

-- One run at a time; manual runs and test e-mails at most once per minute.
CREATE OR REPLACE FUNCTION public.claim_health_run(_manual boolean) RETURNS text
LANGUAGE plpgsql SET search_path TO '' AS $$
DECLARE r public.health_runtime; BEGIN
  INSERT INTO public.health_runtime(id) VALUES (true) ON CONFLICT DO NOTHING;
  SELECT * INTO r FROM public.health_runtime WHERE id FOR UPDATE;
  IF _manual AND r.last_manual_at IS NOT NULL AND r.last_manual_at > now() - interval '60 seconds' THEN RETURN 'limite'; END IF;
  IF r.lease_until IS NOT NULL AND r.lease_until > now() THEN RETURN 'ocupado'; END IF;
  UPDATE public.health_runtime SET lease_until = now() + interval '2 minutes', last_manual_at = CASE WHEN _manual THEN now() ELSE last_manual_at END WHERE id;
  RETURN 'ok';
END $$;
CREATE OR REPLACE FUNCTION public.release_health_run() RETURNS void
LANGUAGE sql SET search_path TO '' AS $$ UPDATE public.health_runtime SET lease_until = NULL WHERE id $$;
CREATE OR REPLACE FUNCTION public.claim_health_test_email() RETURNS boolean
LANGUAGE plpgsql SET search_path TO '' AS $$
DECLARE r public.health_runtime; BEGIN
  INSERT INTO public.health_runtime(id) VALUES (true) ON CONFLICT DO NOTHING;
  SELECT * INTO r FROM public.health_runtime WHERE id FOR UPDATE;
  IF r.last_test_email_at IS NOT NULL AND r.last_test_email_at > now() - interval '60 seconds' THEN RETURN false; END IF;
  UPDATE public.health_runtime SET last_test_email_at = now() WHERE id; RETURN true;
END $$;

-- Recipients and switch: platform admin only, validated, audited.
CREATE OR REPLACE FUNCTION public.set_health_alert_settings(_recipients text[], _enabled boolean, _actor uuid)
RETURNS TABLE(recipients text[], enabled boolean)
LANGUAGE plpgsql SET search_path TO '' AS $$
DECLARE cur public.platform_settings; clean text[] := '{}'; e text; BEGIN
  IF _actor IS NULL OR NOT EXISTS (SELECT 1 FROM public.platform_admins WHERE user_id = _actor) THEN RAISE EXCEPTION 'SEM_PERMISSAO'; END IF;
  FOREACH e IN ARRAY coalesce(_recipients, '{}') LOOP
    e := lower(btrim(e));
    IF e = '' THEN CONTINUE; END IF;
    IF length(e) > 254 OR e !~ '^[^@[:space:]]+@[^@[:space:]]+\.[^@[:space:]]+$' THEN RAISE EXCEPTION 'EMAIL_INVALIDO'; END IF;
    IF NOT e = ANY(clean) THEN clean := clean || e; END IF;
  END LOOP;
  IF cardinality(clean) > 5 THEN RAISE EXCEPTION 'MAXIMO_DESTINATARIOS'; END IF;
  IF coalesce(_enabled, false) AND cardinality(clean) = 0 THEN RAISE EXCEPTION 'SEM_DESTINATARIOS'; END IF;
  INSERT INTO public.platform_settings(id) VALUES (true) ON CONFLICT DO NOTHING;
  SELECT * INTO cur FROM public.platform_settings WHERE id FOR UPDATE;
  UPDATE public.platform_settings SET health_alert_recipients = clean, health_alerts_enabled = coalesce(_enabled, false), updated_at = now(), updated_by = _actor WHERE id;
  INSERT INTO public.admin_audit_events(actor_id, actor_is_platform_admin, action, organization_id, target_type, target_id, details)
  VALUES (_actor, true, 'plataforma.avisos_saude_alterados', NULL, 'platform_settings', NULL,
    jsonb_build_object('destinatarios_anteriores', to_jsonb(cur.health_alert_recipients), 'destinatarios_novos', to_jsonb(clean),
      'ligado_anterior', cur.health_alerts_enabled, 'ligado_novo', coalesce(_enabled, false)));
  RETURN QUERY SELECT clean, coalesce(_enabled, false);
END $$;

-- All numbers of the health screen in one read (names only; no tax IDs of customers).
CREATE OR REPLACE FUNCTION public.health_snapshot() RETURNS jsonb
LANGUAGE sql STABLE SET search_path TO '' AS $$
SELECT jsonb_build_object(
  'now', now(),
  'heartbeats', coalesce((SELECT jsonb_object_agg(name, last_success_at) FROM public.system_heartbeats), '{}'::jsonb),
  'last_scheduler_run', (SELECT jsonb_build_object('at', created_at, 'reserved', reserved, 'completed', completed, 'failed', failed, 'error', error)
      FROM public.webhook_scheduler_runs ORDER BY created_at DESC LIMIT 1),
  'daily_today', (SELECT jsonb_build_object('checked', coalesce(sum(checked), 0), 'updated', coalesce(sum(updated), 0), 'failed', coalesce(sum(failed), 0), 'last_at', max(last_checked_at))
      FROM public.nfse_daily_checks WHERE run_date = (now() AT TIME ZONE 'America/Sao_Paulo')::date),
  'queue', (SELECT coalesce(jsonb_object_agg(env, q), '{}'::jsonb) FROM (
      SELECT e::text AS env, jsonb_build_object(
        'pending', (SELECT count(*) FROM public.webhook_deliveries d WHERE d.environment = e AND d.status = 'pending'),
        'late', (SELECT count(*) FROM public.webhook_deliveries d WHERE d.environment = e AND d.status = 'pending' AND d.next_attempt_at < now() - interval '5 minutes'),
        'exhausted_24h', (SELECT count(*) FROM public.webhook_deliveries d WHERE d.environment = e AND d.status = 'exhausted' AND d.updated_at > now() - interval '24 hours')) AS q
      FROM unnest(enum_range(NULL::public.environment)) e) s),
  'api_5xx', (SELECT coalesce(jsonb_object_agg(env, q), '{}'::jsonb) FROM (
      SELECT e::text AS env, jsonb_build_object(
        'hour', (SELECT count(*) FROM public.api_request_logs l WHERE l.environment = e AND l.status_code >= 500 AND l.created_at > now() - interval '1 hour'),
        'day', (SELECT count(*) FROM public.api_request_logs l WHERE l.environment = e AND l.status_code >= 500 AND l.created_at > now() - interval '24 hours')) AS q
      FROM unnest(enum_range(NULL::public.environment)) e) s),
  'stuck_invoices', coalesce((SELECT jsonb_agg(x ORDER BY x->>'since') FROM (
      SELECT jsonb_build_object('id', i.id, 'organization', o.name, 'organization_slug', o.slug, 'company', coalesce(nullif(c.trade_name, ''), c.legal_name), 'company_id', c.id,
        'environment', i.environment, 'since', coalesce(i.verification_started_at, i.last_attempt_at, i.emitted_at)) AS x
      FROM public.invoices i JOIN public.organizations o ON o.id = i.organization_id JOIN public.companies c ON c.id = i.company_id
      WHERE i.status = 'verifying' AND coalesce(i.verification_started_at, i.last_attempt_at, i.emitted_at) < now() - interval '30 minutes'
      ORDER BY coalesce(i.verification_started_at, i.last_attempt_at, i.emitted_at) LIMIT 50) t), '[]'::jsonb),
  'stuck_events', coalesce((SELECT jsonb_agg(x ORDER BY x->>'since') FROM (
      SELECT jsonb_build_object('id', f.id, 'invoice_id', f.invoice_id, 'organization', o.name, 'organization_slug', o.slug, 'company', coalesce(nullif(c.trade_name, ''), c.legal_name), 'company_id', c.id,
        'environment', f.environment, 'code', f.code, 'since', f.created_at) AS x
      FROM public.invoice_fiscal_events f JOIN public.organizations o ON o.id = f.organization_id JOIN public.companies c ON c.id = f.company_id
      WHERE f.status IN ('sending','verifying') AND f.created_at < now() - interval '24 hours'
      ORDER BY f.created_at LIMIT 50) t), '[]'::jsonb),
  'certificates', coalesce((SELECT jsonb_agg(x ORDER BY x->>'valid_until') FROM (
      SELECT jsonb_build_object('id', k.id, 'organization', o.name, 'organization_slug', o.slug, 'company', coalesce(nullif(c.trade_name, ''), c.legal_name), 'company_id', c.id,
        'cnpj', c.cnpj, 'valid_until', k.valid_until) AS x
      FROM public.company_certificates k JOIN public.companies c ON c.id = k.company_id JOIN public.organizations o ON o.id = k.organization_id
      WHERE k.status = 'active' AND c.active AND k.valid_until < now() + interval '30 days'
      ORDER BY k.valid_until LIMIT 100) t), '[]'::jsonb),
  'government', coalesce((SELECT jsonb_agg(jsonb_build_object('environment', environment, 'system', system, 'service', service, 'total', total, 'answered', answered,
        'avg_ms', avg_ms, 'last_at', last_at, 'last_outcomes', last_outcomes)) FROM (
      SELECT g.environment, g.system, g.service, count(*) AS total, count(*) FILTER (WHERE g.outcome = 'respondeu') AS answered,
        round(avg(g.duration_ms))::int AS avg_ms, max(g.created_at) AS last_at,
        (SELECT jsonb_agg(z.outcome) FROM (SELECT h.outcome FROM public.government_calls h WHERE h.environment = g.environment AND h.system = g.system AND h.service = g.service ORDER BY h.created_at DESC, h.id DESC LIMIT 3) z) AS last_outcomes
      FROM public.government_calls g WHERE g.created_at > now() - interval '1 hour'
      GROUP BY g.environment, g.system, g.service) s), '[]'::jsonb)
) $$;

CREATE OR REPLACE FUNCTION public.cleanup_health_data() RETURNS void
LANGUAGE sql SET search_path TO '' AS $$
  DELETE FROM public.government_calls WHERE created_at < now() - interval '30 days';
  DELETE FROM public.health_checks WHERE created_at < now() - interval '30 days';
  DELETE FROM public.health_alerts WHERE state = 'ok' AND resolved_at < now() - interval '30 days';
$$;

REVOKE ALL ON FUNCTION public.claim_health_run(boolean), public.release_health_run(), public.claim_health_test_email(),
  public.set_health_alert_settings(text[], boolean, uuid), public.health_snapshot(), public.cleanup_health_data() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.claim_health_run(boolean), public.release_health_run(), public.claim_health_test_email(),
  public.set_health_alert_settings(text[], boolean, uuid), public.health_snapshot(), public.cleanup_health_data() TO service_role;