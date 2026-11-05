CREATE OR REPLACE FUNCTION public.generate_organization_slug()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE base text; candidate text; alphabet constant text := 'abcdefghjkmnpqrstuvwxyz23456789'; suffix text; i int; tries int := 0;
BEGIN
  base := regexp_replace(public.normalize_municipality_name(coalesce(NEW.name,'')), '[^a-z0-9]+', '-', 'g');
  base := trim(both '-' from base);
  base := trim(both '-' from left(base, 30));
  LOOP
    suffix := '';
    FOR i IN 1..6 LOOP suffix := suffix || substr(alphabet, 1 + floor(random()*length(alphabet))::int, 1); END LOOP;
    candidate := CASE WHEN base = '' THEN suffix ELSE base || '-' || suffix END;
    EXIT WHEN NOT EXISTS (SELECT 1 FROM public.organizations WHERE slug = candidate);
    tries := tries + 1;
    IF tries > 20 THEN RAISE EXCEPTION 'SLUG_GENERATION_FAILED'; END IF;
  END LOOP;
  NEW.slug := candidate;
  RETURN NEW;
END $$;
REVOKE ALL ON FUNCTION public.generate_organization_slug() FROM PUBLIC, anon, authenticated;
ALTER TABLE public.organizations ALTER COLUMN slug SET DEFAULT '';
CREATE TRIGGER organizations_generate_slug BEFORE INSERT ON public.organizations FOR EACH ROW EXECUTE FUNCTION public.generate_organization_slug();