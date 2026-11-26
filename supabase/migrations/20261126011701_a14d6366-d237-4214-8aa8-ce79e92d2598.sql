ALTER TABLE public.company_fiscal_settings
  ADD COLUMN pis_cofins_cst text,
  ADD COLUMN pis_cofins_withholding_type text;

ALTER TABLE public.company_fiscal_settings
  ADD CONSTRAINT company_fiscal_settings_pis_cofins_check CHECK (
    (pis_cofins_cst IS NULL AND pis_cofins_withholding_type IS NULL)
    OR (pis_cofins_cst IS NOT NULL AND pis_cofins_withholding_type IS NOT NULL
        AND pis_cofins_cst = '99' AND pis_cofins_withholding_type = '0')
  );

-- Existing organization-scoped SELECT/INSERT/UPDATE policies continue to apply.
-- Grant only the new fiscal columns; never widen the existing role matrix.
GRANT SELECT (pis_cofins_cst, pis_cofins_withholding_type),
      INSERT (pis_cofins_cst, pis_cofins_withholding_type),
      UPDATE (pis_cofins_cst, pis_cofins_withholding_type)
ON public.company_fiscal_settings TO authenticated;
GRANT ALL ON public.company_fiscal_settings TO service_role;

COMMENT ON COLUMN public.company_fiscal_settings.pis_cofins_cst IS 'Optional company PIS/COFINS CST. Initial support: 99 paired with retention type 0; NULL omits tribFed. No automatic backfill.';
COMMENT ON COLUMN public.company_fiscal_settings.pis_cofins_withholding_type IS 'Optional company PIS/COFINS/CSLL retention type. Initial support: 0 paired with CST 99; fiscal snapshots preserve the issuance configuration.';