import { z, email as zEmail } from './validation';

export const roles = ['owner', 'admin', 'operator', 'viewer', 'developer'] as const;
export const roleLabels = { owner: 'Proprietário', admin: 'Administrador', operator: 'Operador', viewer: 'Leitura', developer: 'Desenvolvedor' };
export function canManageOrganization(role?: string, platformAdmin = false) { return platformAdmin || role === 'owner' || role === 'admin'; }
export function canEditCompany(role?: string, platformAdmin = false) { return platformAdmin || ['owner','admin','operator'].includes(role ?? ''); }
export const digits = (value: string) => value.replace(/\D/g, '');
/** CNPJ (numeric or alphanumeric, Receita Federal since jul/2026): mask removed, upper case. CPF/CEP/phone keep using digits(). */
export const normalizeCnpj = (value: string) => value.toUpperCase().replace(/[^0-9A-Z]/g, '');
/** TSCNPJ structure: 12 positions [0-9A-Z] + 2 numeric check digits. */
export const CNPJ_PATTERN = /^[0-9A-Z]{12}[0-9]{2}$/;
/** Check digits: each character is worth its ASCII code minus 48; weights and modulo 11 as in the numeric CNPJ. */
export function isValidCnpj(value: string) {
  const cnpj = normalizeCnpj(value);
  if (!CNPJ_PATTERN.test(cnpj) || /^(.)\1{13}$/.test(cnpj)) return false;
  const check = (length: number) => {
    const weights = length === 12 ? [5,4,3,2,9,8,7,6,5,4,3,2] : [6,5,4,3,2,9,8,7,6,5,4,3,2];
    const remainder = weights.reduce((sum, weight, i) => sum + (cnpj.charCodeAt(i) - 48) * weight, 0) % 11;
    return remainder < 2 ? 0 : 11 - remainder;
  };
  return check(12) === Number(cnpj[12]) && check(13) === Number(cnpj[13]);
}
/** True when the CNPJ carries letters (only accepted by the NT 009 layout). */
export const isAlphanumericCnpj = (value: string | null | undefined) => /[A-Z]/.test(normalizeCnpj(value ?? ''));
export const formatCnpj = (value: string) => normalizeCnpj(value).slice(0,14).replace(/^([0-9A-Z]{2})([0-9A-Z])/,'$1.$2').replace(/^([0-9A-Z]{2})\.([0-9A-Z]{3})([0-9A-Z])/,'$1.$2.$3').replace(/\.([0-9A-Z]{3})([0-9A-Z])/,'.$1/$2').replace(/([0-9A-Z]{4})([0-9A-Z])/,'$1-$2');
export const companySchema = z.object({
  id: z.string().uuid().optional(), organization_id: z.string().uuid(),
  cnpj: z.string().transform(normalizeCnpj).refine(isValidCnpj, 'CNPJ inválido.'),
  legal_name: z.string().trim().min(1, 'Informe a razão social.'), trade_name: z.string().default(''),
  municipal_registration: z.string().default(''), email: z.union([zEmail('E-mail inválido.'),z.literal('')]),
  phone: z.string().transform(digits), postal_code: z.string().transform(digits).refine(v => v === '' || v.length === 8, 'CEP inválido.'),
  street: z.string(), number: z.string(), complement: z.string(), district: z.string(),
  municipality_ibge_code: z.string().regex(/^\d{7}$/, 'Selecione um município.'),
});
export function pageHead(title: string, description = 'Gestão de organizações e empresas para NFS-e na notem.') {
  const fullTitle = `${title} · notem`;
  return { meta: [{ title: fullTitle }, { name: 'description', content: description }, { property: 'og:title', content: fullTitle }, { property: 'og:description', content: description }, { property: 'og:type', content: 'website' }, { name: 'twitter:card', content: 'summary_large_image' }] };
}export const organizationTypes = ['partner','company'] as const;
export type OrganizationType = typeof organizationTypes[number];
export const organizationTypeLabels: Record<OrganizationType,string> = { partner: 'Sistema parceiro', company: 'Empresa ou grupo' };
export const organizationTypeDescriptions: Record<OrganizationType,string> = { partner: 'Integra pela API e emite para as empresas clientes dele (ex.: OneDesp, VistoCash).', company: 'Emite notas para os próprios CNPJs (ex.: Grupo Jota).' };
export const organizationSchema = z.object({ name: z.string().trim().min(1,'Informe o nome.'), type: z.enum(organizationTypes,{ message: 'Selecione o tipo de organização.' }) });
