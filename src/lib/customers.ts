import { z } from './validation';
import { CNPJ_PATTERN, isValidCnpj, normalizeCnpj } from './notem';

export function validCpf(value: string) {
  if (!/^\d{11}$/.test(value) || /^(\d)\1{10}$/.test(value)) return false;
  const digit = (size: number) => { const sum = [...value.slice(0, size)].reduce((s, n, i) => s + Number(n) * (size + 1 - i), 0); const v = (sum * 10) % 11; return v === 10 ? 0 : v; };
  return digit(9) === Number(value[9]) && digit(10) === Number(value[10]);
}
const nullableText = (max: number) => z.string().trim().max(max).nullable().optional();
export const customerAddress = z.strictObject({
  cep: z.string().regex(/^\d{8}$/, 'Informe CEP de 8 números.').optional(), logradouro: nullableText(255), numero: nullableText(60), complemento: nullableText(156), bairro: nullableText(60), codigo_municipio: z.string().regex(/^\d{7}$/, 'Informe código IBGE de 7 números.').optional(),
  pais: z.string().regex(/^[A-Z]{2}$/, 'Informe país ISO de duas letras.').optional(), cidade: nullableText(60), endereco_livre: nullableText(255), codigo_postal: nullableText(11), estado_provincia_regiao: nullableText(60),
});
export const customerSchema = z.strictObject({
  tipo: z.enum(['pj', 'pf', 'estrangeiro']), documento: z.string().trim().max(18).transform(v => normalizeCnpj(v) || null).nullable().optional(), nif: nullableText(40), motivo_sem_nif: z.enum(['dispensado', 'nao_exigido']).nullable().optional(), nome: z.string().trim().min(1, 'Informe o nome.').max(150), email: z.string().email('E-mail inválido.').max(80).nullable().optional(), telefone: z.string().regex(/^\d{6,20}$/, 'Telefone com 6 a 20 números.').nullable().optional(), inscricao_municipal: nullableText(15), endereco: customerAddress.nullable().optional(),
}).superRefine((c, ctx) => {
  const issue = (path: string[], message: string) => ctx.addIssue({ code: 'custom', path, message });
  if (c.tipo === 'pj' && (!c.documento || !CNPJ_PATTERN.test(c.documento) || !isValidCnpj(c.documento))) issue(['documento'], 'CNPJ inválido.');
  if (c.tipo === 'pf' && (!c.documento || !validCpf(c.documento))) issue(['documento'], 'CPF inválido.');
  if (c.tipo === 'estrangeiro') {
    if (c.documento) issue(['documento'], 'Estrangeiro não usa CPF/CNPJ.');
    if (Boolean(c.nif) === Boolean(c.motivo_sem_nif)) issue(['nif'], 'Informe NIF ou motivo da ausência, nunca ambos.');
  } else if (c.nif || c.motivo_sem_nif) issue(['nif'], 'NIF é exclusivo de tomador estrangeiro.');
  const e = c.endereco; if (!e) return;
  const required = c.tipo === 'estrangeiro' ? ['pais', 'cidade', 'codigo_postal', 'estado_provincia_regiao', 'numero', 'bairro'] : ['cep', 'codigo_municipio', 'logradouro', 'numero', 'bairro'];
  for (const k of required) if (!e[k as keyof typeof e]) issue(['endereco', k], 'Campo obrigatório quando o endereço é informado.');
  if (c.tipo === 'estrangeiro' && !e.logradouro && !e.endereco_livre) issue(['endereco', 'logradouro'], 'Informe logradouro ou endereço livre.');
  if (c.tipo === 'estrangeiro' && (e.cep || e.codigo_municipio)) issue(['endereco'], 'Use endereço exterior para estrangeiro.');
  if (c.tipo !== 'estrangeiro' && (e.pais || e.cidade || e.endereco_livre || e.codigo_postal || e.estado_provincia_regiao)) issue(['endereco'], 'Use endereço nacional para CPF/CNPJ.');
});
export type Customer = z.infer<typeof customerSchema>;
export const customerCreate = z.looseObject({ id_externo: z.string().trim().min(1).max(100).nullable().optional() });
export function customerOutput(row: { id: string; external_id: string | null; customer_data: unknown; created_at: string; updated_at: string }) {
  return { id: row.id, id_externo: row.external_id, ...customerSchema.parse(row.customer_data), criada_em: row.created_at, atualizada_em: row.updated_at };
}