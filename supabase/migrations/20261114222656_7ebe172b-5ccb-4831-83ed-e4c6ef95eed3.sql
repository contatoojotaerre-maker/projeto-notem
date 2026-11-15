
DROP POLICY adn_cursor_read ON public.adn_sync_cursors;
DROP POLICY nfse_document_events_read ON public.nfse_document_events;
DROP POLICY nfse_documents_read ON public.nfse_documents;
DROP FUNCTION public.can_view_cnpj(text);
DROP FUNCTION public.can_view_nfse_document(text,text,text,uuid);

-- Caller-scoped proof of possession evaluated under the caller's own RLS (own memberships, companies and certificates).
CREATE POLICY adn_cursor_read ON public.adn_sync_cursors FOR SELECT TO authenticated USING (
  public.is_platform_admin() OR EXISTS (SELECT 1 FROM public.organization_members m JOIN public.companies c ON c.organization_id=m.organization_id
    JOIN public.company_certificates cc ON cc.company_id=c.id AND cc.organization_id=c.organization_id
    WHERE m.user_id=auth.uid() AND c.cnpj=adn_sync_cursors.cnpj AND regexp_replace(cc.cnpj,'\D','','g')=adn_sync_cursors.cnpj));

CREATE POLICY nfse_documents_read ON public.nfse_documents FOR SELECT TO authenticated USING (
  public.is_platform_admin() OR EXISTS (SELECT 1 FROM public.organization_members m JOIN public.companies c ON c.organization_id=m.organization_id
    JOIN public.company_certificates cc ON cc.company_id=c.id AND cc.organization_id=c.organization_id
    WHERE m.user_id=auth.uid() AND regexp_replace(cc.cnpj,'\D','','g')=c.cnpj
      AND ((nfse_documents.invoice_id IS NULL AND c.cnpj=nfse_documents.provider_cnpj) OR c.cnpj=nfse_documents.taker_document OR c.cnpj=nfse_documents.intermediary_document)));

CREATE POLICY nfse_document_events_read ON public.nfse_document_events FOR SELECT TO authenticated USING (
  (invoice_id IS NOT NULL AND EXISTS (SELECT 1 FROM public.invoices i WHERE i.id=nfse_document_events.invoice_id))
  OR EXISTS (SELECT 1 FROM public.nfse_documents d WHERE d.environment=nfse_document_events.environment AND d.access_key=nfse_document_events.access_key));
