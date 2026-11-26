import { z } from './validation';
import { RuleError } from './rule-error';

export const PIS_COFINS_UNSUPPORTED = 'combinação de PIS/COFINS ainda não suportada';
export const pisCofinsSchema = z.strictObject({ cst: z.literal('99'), tipo_retencao: z.literal('0') });
export type PisCofins = z.infer<typeof pisCofinsSchema>;

/** No configuration is different from an explicit 99/0; never supply a default. */
export function parsePisCofins(value: unknown): PisCofins | null {
  if (value === null || value === undefined) return null;
  const result = pisCofinsSchema.safeParse(value);
  if (!result.success) throw new RuleError(PIS_COFINS_UNSUPPORTED);
  return result.data;
}

export function pisCofinsFromColumns(row: { pis_cofins_cst?: string | null; pis_cofins_withholding_type?: string | null }): PisCofins | null {
  if (row.pis_cofins_cst == null && row.pis_cofins_withholding_type == null) return null;
  return parsePisCofins({ cst: row.pis_cofins_cst, tipo_retencao: row.pis_cofins_withholding_type });
}