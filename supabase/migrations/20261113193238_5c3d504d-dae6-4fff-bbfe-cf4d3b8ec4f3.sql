REVOKE ALL ON public.invoices,public.invoice_events,public.company_customers FROM anon,authenticated;
GRANT SELECT ON public.invoices,public.invoice_events,public.company_customers TO authenticated;
GRANT ALL ON public.invoices,public.invoice_events,public.company_customers TO service_role;