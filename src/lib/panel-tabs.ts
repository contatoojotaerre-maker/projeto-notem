// Stable tab codes used in ?aba= (independent of the visible labels). Old addresses that used the
// visible name (with or without accents) or older technical names keep working and are converted.
export const COMPANY_TABS = ['resumo', 'cadastro', 'fiscal', 'servicos', 'certificado', 'tomadores', 'sincronizacao'] as const;
export type CompanyTab = typeof COMPANY_TABS[number];
/** Tab shown when the address has no ?aba=. */
export const DEFAULT_COMPANY_TAB: CompanyTab = 'resumo';
export const companyTabLabels: Record<CompanyTab, string> = { resumo: 'Resumo', cadastro: 'Cadastro', fiscal: 'Configuração fiscal', servicos: 'Serviços', certificado: 'Certificado', tomadores: 'Tomadores', sincronizacao: 'Sincronização' };

export const INTEGRATION_TABS = ['chaves', 'webhooks', 'chamadas', 'configuracoes', 'como-testar'] as const;
export type IntegrationTab = typeof INTEGRATION_TABS[number];
export const DEFAULT_INTEGRATION_TAB: IntegrationTab = 'chaves';
export const integrationTabLabels: Record<IntegrationTab, string> = { chaves: 'Chaves', webhooks: 'Webhooks', chamadas: 'Chamadas', configuracoes: 'Configurações', 'como-testar': 'Como testar' };

export const ORGANIZATION_TABS = ['dados', 'equipe'] as const;
export type OrganizationTab = typeof ORGANIZATION_TABS[number];
export const organizationTabLabels: Record<OrganizationTab, string> = { dados: 'Dados', equipe: 'Equipe' };

/** Lower case, no accents, single hyphens: "Pronta%20para emitir" -> "pronta-para-emitir". */
export function tabKey(raw: string) {
  let v = raw; try { v = decodeURIComponent(raw); } catch { /* keep as is */ }
  return v.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().trim().replace(/[\s_+]+/g, '-').replace(/-+/g, '-');
}
const companyLegacy: Record<string, CompanyTab> = { dados: 'cadastro', 'configuracao-fiscal': 'fiscal', 'pronta-para-emitir': 'resumo', situacao: 'resumo', perfis: 'servicos', 'modelos-de-servico': 'servicos' };
const integrationLegacy: Record<string, IntegrationTab> = { requisicoes: 'chamadas', logs: 'chamadas', registros: 'chamadas', keys: 'chaves', dados: 'configuracoes', companies: 'configuracoes', test: 'como-testar', 'como-testar': 'como-testar' };
/** The company "Notas recebidas" tab moved to Notas › Recebidas (filtered by the company). */
const companyReceived = ['recebidas', 'notas-recebidas'];

/** Code of a company tab from any accepted spelling; null when unknown (or when it moved to Notas › Recebidas). */
export function companyTab(raw: unknown): CompanyTab | null {
  if (typeof raw !== 'string' || !raw || raw.length > 60) return null; const k = tabKey(raw);
  return (COMPANY_TABS as readonly string[]).includes(k) ? k as CompanyTab : companyLegacy[k] ?? null;
}
/** True for the old company tab "Notas recebidas" (any spelling). */
export function isCompanyReceivedTab(raw: unknown) { return typeof raw === 'string' && raw.length <= 60 && companyReceived.includes(tabKey(raw)); }
/** Code of an integration tab from any accepted spelling; null when unknown. */
export function integrationTab(raw: unknown): IntegrationTab | null {
  if (typeof raw !== 'string' || !raw || raw.length > 60) return null; const k = tabKey(raw);
  return (INTEGRATION_TABS as readonly string[]).includes(k) ? k as IntegrationTab : integrationLegacy[k] ?? null;
}
/** Code of an Organização tab; null when unknown. */
export function organizationTab(raw: unknown): OrganizationTab | null {
  if (typeof raw !== 'string' || !raw || raw.length > 60) return null; const k = tabKey(raw);
  return (ORGANIZATION_TABS as readonly string[]).includes(k) ? k as OrganizationTab : k === 'membros' ? 'equipe' : null;
}
