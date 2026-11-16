/**
 * Typical invalid inputs for the panel forms. Browser-safe on purpose: the same module runs
 * in Vitest and inside a real browser (through the dev server) to prove both produce the
 * notem-controlled messages. See docs/interno/validacao-mensagens.md.
 */
import { companySchema, organizationSchema } from '@/lib/notem';
import { fiscalSchema, serviceProfileSchema } from '@/lib/fiscal';
import { webhookInput } from '@/lib/webhooks';
import { integrationSchema } from '@/lib/integrations';
import { customerSchema } from '@/lib/customers';

type Schema = { safeParse: (v: unknown) => { success: boolean; error?: { issues: { path: PropertyKey[]; message: string }[] } } };
export type FormResult = 'OK' | { exibida: string; detalhes: { campo: string; mensagem: string }[] };

const ORG = '20000000-0000-4000-8000-000000000001', CO = '10000000-0000-4000-8000-000000000001';
const company = { organization_id: ORG, cnpj: '11222333000181', legal_name: 'Empresa', trade_name: '', municipal_registration: '', email: '', phone: '', postal_code: '', street: '', number: '', complement: '', district: '', municipality_ibge_code: '4205407' };
const fiscal = { company_id: CO, organization_id: ORG, simples_nacional_option: 2, simples_nacional_regime: null, special_tax_regime: 0, dps_series: 1, approx_taxes_mode: 'none', approx_simples_percent: null, approx_federal_percent: null, approx_state_percent: null, approx_municipal_percent: null, simples_iss_withholding_percent: null };
const service = { company_id: CO, organization_id: ORG, name: 'Serviço', active: true, service_code: '010501', municipal_tax_code: null, nbs_code: null, default_description: '', iss_taxation: 1, immunity_type: null, iss_withholding: 1, ibscbs_operation_indicator: null, municipal_benefit_number: null };
const webhook = { organization_id: ORG, integration_id: CO, environment: 'sandbox', url: 'https://8.8.8.8/r', events: ['webhook.teste'] };
const integration = { organization_id: ORG, name: 'Integração' };

export const formCases: [string, Schema, unknown][] = [
  ['empresa: formulário vazio', companySchema, {}],
  ['empresa: razão social vazia (mensagem da notem)', companySchema, { ...company, legal_name: ' ' }],
  ['empresa: e-mail inválido (mensagem da notem)', companySchema, { ...company, email: 'a@b' }],
  ['empresa: e-mail com + e .com.br', companySchema, { ...company, email: 'financeiro+notas@grupo.com.br' }],
  ['empresa: e-mail com subdomínio', companySchema, { ...company, email: 'contato@mail.empresa.gov.br' }],
  ['empresa: UUID inválido', companySchema, { ...company, organization_id: 'abc' }],
  ['empresa: UUID fora do padrão', companySchema, { ...company, organization_id: '00000000-0000-0000-0000-000000000001' }],
  ['empresa: município sem 7 dígitos (mensagem da notem)', companySchema, { ...company, municipality_ibge_code: '123' }],
  ['empresa: tipo errado', companySchema, { ...company, street: 5 }],
  ['organização: vazia', organizationSchema, {}],
  ['organização: tipo inválido (mensagem da notem)', organizationSchema, { name: 'X', type: 'outro' }],
  ['configuração fiscal: vazia', fiscalSchema, {}],
  ['configuração fiscal: inteiro com fração', fiscalSchema, { ...fiscal, simples_nacional_option: 1.5 }],
  ['configuração fiscal: número acima do limite', fiscalSchema, { ...fiscal, simples_nacional_option: 4 }],
  ['configuração fiscal: percentual acima de 100', fiscalSchema, { ...fiscal, approx_taxes_mode: 'percent_by_sphere', approx_federal_percent: 150, approx_state_percent: 1, approx_municipal_percent: 1 }],
  ['configuração fiscal: regime especial fora da lista', fiscalSchema, { ...fiscal, special_tax_regime: 7 }],
  ['configuração fiscal: série acima de 49999', fiscalSchema, { ...fiscal, dps_series: 50000 }],
  ['configuração fiscal: ISS do Simples abaixo do mínimo (mensagem da notem)', fiscalSchema, { ...fiscal, simples_nacional_option: 3, simples_nacional_regime: 1, approx_taxes_mode: 'percent_simples', approx_simples_percent: 6, simples_iss_withholding_percent: 1 }],
  ['configuração fiscal: modo inválido', fiscalSchema, { ...fiscal, approx_taxes_mode: 'x' }],
  ['serviço: nome vazio', serviceProfileSchema, { ...service, name: '' }],
  ['serviço: nome longo', serviceProfileSchema, { ...service, name: 'x'.repeat(201) }],
  ['serviço: código de serviço sem 6 dígitos', serviceProfileSchema, { ...service, service_code: '1' }],
  ['serviço: imunidade (regra da notem)', serviceProfileSchema, { ...service, iss_taxation: 2 }],
  ['webhook: vazio', webhookInput, {}],
  ['webhook: sem eventos (mensagem da notem)', webhookInput, { ...webhook, events: [] }],
  ['webhook: evento inválido', webhookInput, { ...webhook, events: ['x'] }],
  ['webhook: eventos demais', webhookInput, { ...webhook, events: Array(19).fill('webhook.teste') }],
  ['webhook: descrição longa', webhookInput, { ...webhook, description: 'x'.repeat(2001) }],
  ['webhook: endereço inválido (mensagem da notem)', webhookInput, { ...webhook, url: 'http://x' }],
  ['webhook: ambiente inválido', webhookInput, { ...webhook, environment: 'x' }],
  ['webhook: ativo como texto', webhookInput, { ...webhook, auth_clear: 'sim' }],
  ['integração: vazia', integrationSchema, {}],
  ['integração: escopo diferente de all', integrationSchema, { ...integration, company_scope: 'selected' }],
  ['integração: empresas selecionadas', integrationSchema, { ...integration, company_ids: [CO] }],
  ['integração: nome longo', integrationSchema, { ...integration, name: 'x'.repeat(101) }],
  ['tomador: tipo inválido', customerSchema, { tipo: 'z', nome: 'A' }],
  ['tomador: e-mail longo', customerSchema, { tipo: 'pf', documento: '52998224725', nome: 'A', email: `${'a'.repeat(80)}@x.com` }],
];

export function runFormCases(): Record<string, FormResult> {
  const out: Record<string, FormResult> = {};
  for (const [name, schema, value] of formCases) {
    const r = schema.safeParse(value);
    out[name] = r.success ? 'OK' : { exibida: r.error!.issues[0]?.message ?? '', detalhes: r.error!.issues.map(i => ({ campo: i.path.map(String).join('.'), mensagem: i.message })) };
  }
  return out;
}
