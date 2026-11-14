REVOKE ALL ON public.invoice_fiscal_events FROM anon;
REVOKE INSERT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER ON public.invoice_fiscal_events FROM authenticated;
GRANT SELECT ON public.invoice_fiscal_events TO authenticated;