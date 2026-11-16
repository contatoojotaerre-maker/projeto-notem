CREATE OR REPLACE FUNCTION public.platform_support_contact() RETURNS TABLE(support_email text, support_whatsapp text)
LANGUAGE sql STABLE SECURITY INVOKER SET search_path TO ''
AS $$ SELECT s.support_email, s.support_whatsapp FROM public.platform_settings s WHERE s.id $$;
REVOKE ALL ON FUNCTION public.platform_support_contact() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.platform_support_contact() TO service_role;