CREATE OR REPLACE FUNCTION public.assign_company_dps_series()
 RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path TO ''
AS $function$
DECLARE company public.companies; selected_series integer; is_service boolean := coalesce(auth.role(),'')='service_role';
BEGIN
 -- The /api/v1 runtime (service role) authorizes by integration key and always scopes by the key's organization.
 IF NOT is_service AND (auth.uid() IS NULL OR NOT(public.has_org_role(NEW.organization_id,ARRAY['owner','admin']::public.org_role[]) OR public.is_platform_admin())) THEN RAISE EXCEPTION 'Acesso não autorizado.'; END IF;
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
END $function$;