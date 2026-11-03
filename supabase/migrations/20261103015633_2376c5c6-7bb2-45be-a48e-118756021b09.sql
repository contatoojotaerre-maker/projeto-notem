REVOKE ALL ON public.service_codes,public.nbs_codes,public.ibscbs_operation_indicators,public.dps_sequences FROM PUBLIC,anon,authenticated;
GRANT SELECT ON public.service_codes,public.nbs_codes,public.ibscbs_operation_indicators,public.dps_sequences TO authenticated;
REVOKE ALL ON public.company_fiscal_settings,public.company_service_profiles FROM PUBLIC,anon,authenticated;
GRANT SELECT,INSERT,UPDATE ON public.company_fiscal_settings,public.company_service_profiles TO authenticated;
CREATE OR REPLACE FUNCTION public.guard_dps_sequence() RETURNS trigger LANGUAGE plpgsql SET search_path='' AS $$
BEGIN
 IF TG_OP='DELETE' THEN RAISE EXCEPTION 'Uma sequência DPS atribuída não pode ser apagada.'; END IF;
 IF NEW.company_id IS DISTINCT FROM OLD.company_id OR NEW.organization_id IS DISTINCT FROM OLD.organization_id OR NEW.cnpj IS DISTINCT FROM OLD.cnpj OR NEW.series IS DISTINCT FROM OLD.series OR NEW.environment IS DISTINCT FROM OLD.environment THEN RAISE EXCEPTION 'A associação da sequência DPS é imutável.'; END IF;
 IF NEW.next_number<OLD.next_number OR (OLD.exhausted AND NOT NEW.exhausted) THEN RAISE EXCEPTION 'Um número reservado é definitivo e nunca pode ser devolvido ou reutilizado.'; END IF;
 RETURN NEW;
END $$;
REVOKE ALL ON FUNCTION public.guard_dps_sequence() FROM PUBLIC,anon,authenticated;
CREATE TRIGGER sequences_guard BEFORE UPDATE OR DELETE ON public.dps_sequences FOR EACH ROW EXECUTE FUNCTION public.guard_dps_sequence();