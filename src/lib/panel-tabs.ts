// Stable tab codes used in ?aba= (independent of the visible labels). Old addresses that used the
// visible name (with or without accents) or older technical names keep working and are converted.
export const COMPANY_TABS = ['cadastro', 'fiscal', 'certificado', 'servicos', 'tomadores', 'recebidas', 'resumo', 'sincronizacao'] as const;
export type CompanyTab = typeof COMPANY_TABS[number];
export const companyTabLabels: Record<CompanyTab, string> = { cadastro: 'Dados', fiscal: 'Configuração fiscal', certificado: 'Certificado', servicos: 'Serviços', tomadores: 'Tomadores', recebidas: 'Notas recebidas', resumo: 'Pronta para emitir', sincronizacao: 'Sincronização' };

export const INTEGRATION_TABS = ['chaves', 'configuracoes', 'webhooks', 'chamadas', 'como-testar'] as const;
export type IntegrationTab = typeof INTEGRATION_TABS[number];
export const integrationTabLabels: Record<IntegrationTab, string> = { chaves: 'Chaves', configuracoes: 'Dados', webhooks: 'Webhooks', chamadas: 'Requisições', 'como-testar': 'Como testar' };

/** Lower case, no accents, single hyphens: "Pronta%20para emitir" -> "pronta-para-emitir". */
export function tabKey(raw: string) {
  let v = raw; try { v = decodeURIComponent(raw); } catch { /* keep as is */ }
  return v.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().trim().replace(/[\s_+]+/g, '-').replace(/-+/g, '-');
}
const companyLegacy: Record<string, CompanyTab> = { dados: 'cadastro', 'configuracao-fiscal': 'fiscal', 'notas-recebidas': 'recebidas', 'pronta-para-emitir': 'resumo', situacao: 'resumo' };
const integrationLegacy: Record<string, IntegrationTab> = { requisicoes: 'chamadas', logs: 'chamadas', registros: 'chamadas', keys: 'chaves', dados: 'configuracoes', companies: 'configuracoes', test: 'como-testar', 'como-testar': 'como-testar' };

/** Code of a company tab from any accepted spelling; null when unknown. */
export function companyTab(raw: unknown): CompanyTab | null {
  if (typeof raw !== 'string' || !raw || raw.length > 60) return null; const k = tabKey(raw);
  return (COMPANY_TABS as readonly string[]).includes(k) ? k as CompanyTab : companyLegacy[k] ?? null;
}
/** Code of an integration tab from any accepted spelling; null when unknown. */
export function integrationTab(raw: unknown): IntegrationTab | null {
  if (typeof raw !== 'string' || !raw || raw.length > 60) return null; const k = tabKey(raw);
  return (INTEGRATION_TABS as readonly string[]).includes(k) ? k as IntegrationTab : integrationLegacy[k] ?? null;
}
