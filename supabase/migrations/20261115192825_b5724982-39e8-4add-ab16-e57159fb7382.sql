CREATE TABLE public.platform_settings(
  id boolean PRIMARY KEY DEFAULT true CHECK (id),
  nt009r1_production_starts_at timestamptz NOT NULL DEFAULT '2026-12-01 03:00:00+00',
  updated_at timestamptz NOT NULL DEFAULT now(),
  updated_by uuid);
REVOKE ALL ON public.platform_settings FROM PUBLIC, anon, authenticated;
GRANT ALL ON public.platform_settings TO service_role;
ALTER TABLE public.platform_settings ENABLE ROW LEVEL SECURITY;
CREATE POLICY platform_settings_no_client ON public.platform_settings AS RESTRICTIVE FOR ALL TO anon, authenticated USING (false) WITH CHECK (false);
INSERT INTO public.platform_settings(id) VALUES (true) ON CONFLICT DO NOTHING;

-- Only a platform administrator may move the NT 009 production start; every change is audited.
CREATE OR REPLACE FUNCTION public.set_nt009_production_start(_value timestamptz, _actor uuid) RETURNS public.platform_settings
LANGUAGE plpgsql SET search_path = '' AS $$
DECLARE cur public.platform_settings; out public.platform_settings; BEGIN
  IF _actor IS NULL OR NOT EXISTS (SELECT 1 FROM public.platform_admins WHERE user_id = _actor) THEN RAISE EXCEPTION 'SEM_PERMISSAO'; END IF;
  IF _value IS NULL OR _value < '2026-01-01 00:00:00+00' OR _value > '2035-12-31 23:59:59+00' THEN RAISE EXCEPTION 'DATA_INVALIDA'; END IF;
  INSERT INTO public.platform_settings(id) VALUES (true) ON CONFLICT DO NOTHING;
  SELECT * INTO cur FROM public.platform_settings WHERE id FOR UPDATE;
  UPDATE public.platform_settings SET nt009r1_production_starts_at = _value, updated_at = now(), updated_by = _actor WHERE id RETURNING * INTO out;
  INSERT INTO public.admin_audit_events(actor_id, actor_is_platform_admin, action, organization_id, target_type, target_id, details)
  VALUES (_actor, true, 'leiaute.vigencia_producao_alterada', NULL, 'platform_settings', NULL,
          jsonb_build_object('leiaute', 'nt009r1', 'anterior', cur.nt009r1_production_starts_at, 'novo', _value));
  RETURN out;
END $$;
REVOKE ALL ON FUNCTION public.set_nt009_production_start(timestamptz, uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.set_nt009_production_start(timestamptz, uuid) TO service_role;

-- Replaces the base DPS with the same DPS in the layout in force, only under the current dispatch lease
-- (before anything is sent). The previous base is kept for audit.
CREATE OR REPLACE FUNCTION public.replace_invoice_dps_base(_id uuid, _org uuid, _token uuid, _file jsonb, _from text, _to text) RETURNS boolean
LANGUAGE plpgsql SET search_path = '' AS $$
DECLARE i public.invoices; prev public.fiscal_xml_files; BEGIN
  IF _from NOT IN ('nt004','nt009r1') OR _to NOT IN ('nt004','nt009r1') OR _from = _to THEN RAISE EXCEPTION 'LEIAUTE_INVALIDO'; END IF;
  IF _file IS NULL OR coalesce(_file->>'sha256','') !~ '^[0-9a-f]{64}$' THEN RAISE EXCEPTION 'XML_ARQUIVO_INVALIDO'; END IF;
  SELECT * INTO i FROM public.invoices WHERE id = _id AND organization_id = _org FOR UPDATE;
  IF i.id IS NULL OR i.claim_token IS DISTINCT FROM _token OR i.status <> 'processing' OR i.dispatch_state <> 'sending' OR i.lease_until IS NULL OR i.lease_until < now() THEN RETURN false; END IF;
  SELECT * INTO prev FROM public.fiscal_xml_files WHERE owner_table = 'invoices' AND owner_id = _id AND kind = 'unsigned_dps' FOR UPDATE;
  IF prev.owner_id IS NULL THEN RETURN false; END IF;
  INSERT INTO public.fiscal_xml_files(owner_table, owner_id, kind, path, size, stored_size, sha256)
    VALUES ('invoices', _id, 'unsigned_dps_' || _from, prev.path, prev.size, prev.stored_size, prev.sha256) ON CONFLICT DO NOTHING;
  PERFORM public.put_xml_file('invoices', _id, 'unsigned_dps', _file, true);
  INSERT INTO public.invoice_events(invoice_id, organization_id, type, details)
    VALUES (_id, _org, 'dps_layout_changed', jsonb_build_object('mensagem', 'DPS remontada no leiaute vigente antes do envio, com o mesmo número.', 'de', _from, 'para', _to));
  RETURN true;
END $$;
REVOKE ALL ON FUNCTION public.replace_invoice_dps_base(uuid, uuid, uuid, jsonb, text, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.replace_invoice_dps_base(uuid, uuid, uuid, jsonb, text, text) TO service_role;