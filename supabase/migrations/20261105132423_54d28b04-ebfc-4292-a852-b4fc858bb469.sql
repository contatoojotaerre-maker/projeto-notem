CREATE OR REPLACE FUNCTION public.create_default_integration() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
BEGIN
  INSERT INTO public.integrations(organization_id,name,description,active,company_scope,created_by)
  VALUES (NEW.id, NEW.name, '', true, 'all', NEW.created_by);
  RETURN NEW;
END $$;
REVOKE ALL ON FUNCTION public.create_default_integration() FROM PUBLIC, anon, authenticated;
CREATE TRIGGER organization_default_integration AFTER INSERT ON public.organizations FOR EACH ROW EXECUTE FUNCTION public.create_default_integration();