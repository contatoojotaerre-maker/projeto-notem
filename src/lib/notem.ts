import { z } from 'zod';

export const roles = ['owner', 'admin', 'operator', 'viewer', 'developer'] as const;
export const roleLabels = { owner: 'Proprietário', admin: 'Administrador', operator: 'Operador', viewer: 'Leitura', developer: 'Desenvolvedor' };
export function canManageOrganization(role?: string, platformAdmin = false) { return platformAdmin || role === 'owner' || role === 'admin'; }
export function canEditCompany(role?: string, platformAdmin = false) { return platformAdmin || ['owner','admin','operator','developer'].includes(role ?? ''); }
export const digits = (value: string) => value.replace(/\D/g, '');
export function isValidCnpj(value: string) {
  const cnpj = digits(value);
  if (cnpj.length !== 14 || /^(\d)\1{13}$/.test(cnpj)) return false;
  const check = (length: number) => {
    const weights = length === 12 ? [5,4,3,2,9,8,7,6,5,4,3,2] : [6,5,4,3,2,9,8,7,6,5,4,3,2];
    const remainder = weights.reduce((sum, weight, i) => sum + Number(cnpj[i]) * weight, 0) % 11;
    return remainder < 2 ? 0 : 11 - remainder;
  };
  return check(12) === Number(cnpj[12]) && check(13) === Number(cnpj[13]);
}
export const formatCnpj = (value: string) => digits(value).slice(0,14).replace(/^(\d{2})(\d)/,'$1.$2').replace(/^(\d{2})\.(\d{3})(\d)/,'$1.$2.$3').replace(/\.(\d{3})(\d)/,'.$1/$2').replace(/(\d{4})(\d)/,'$1-$2');
export const companySchema = z.object({
  id: z.string().uuid().optional(), organization_id: z.string().uuid(),
  cnpj: z.string().transform(digits).refine(isValidCnpj, 'CNPJ inválido.'),
  legal_name: z.string().trim().min(1, 'Informe a razão social.'), trade_name: z.string().default(''),
  municipal_registration: z.string().default(''), email: z.union([z.string().email('E-mail inválido.'),z.literal('')]),
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
export const slugify = (value: string) => value.normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase().replace(/[^a-z0-9]+/g,'-').replace(/^-+|-+$/g,'').slice(0,50).replace(/-+$/,'');
export const slugSchema = z.string().min(3,'Informe um endereço com pelo menos 3 caracteres').max(50,'O endereço pode ter no máximo 50 caracteres').regex(/^[a-z0-9]+(-[a-z0-9]+)*$/,'Use apenas letras minúsculas, números e hífen.');
export const organizationSchema = z.object({ name: z.string().trim().min(1,'Informe o nome.'), slug: slugSchema, type: z.enum(organizationTypes,{ message: 'Selecione o tipo de organização.' }) });
