
REVOKE EXECUTE ON FUNCTION public.org_proven_cnpj(uuid,text) FROM authenticated;
CREATE OR REPLACE FUNCTION public.can_view_cnpj(_cnpj text) RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public AS $$
  select public.is_platform_admin() or exists(select 1 from public.organization_members m where m.user_id=auth.uid() and public.org_proven_cnpj(m.organization_id,_cnpj)) $$;
REVOKE ALL ON FUNCTION public.can_view_cnpj(text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.can_view_cnpj(text) TO authenticated, service_role;
DROP POLICY adn_cursor_read ON public.adn_sync_cursors;
CREATE POLICY adn_cursor_read ON public.adn_sync_cursors FOR SELECT TO authenticated USING (public.can_view_cnpj(cnpj));
