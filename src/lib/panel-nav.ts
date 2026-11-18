// Panel navigation rules (pure): old addresses that now redirect, the section kept when switching
// organization and which screens follow the environment selector. Routes and the shell use these.
import { companyTab, DEFAULT_COMPANY_TAB, DEFAULT_INTEGRATION_TAB, integrationTab, isCompanyReceivedTab, organizationTab, type CompanyTab, type IntegrationTab, type OrganizationTab } from './panel-tabs';

/** Sections served by /o/{org}/{section}. */
export const ORG_SECTIONS = ['inicio', 'alertas', 'organizacao'] as const;
export type OrgSection = typeof ORG_SECTIONS[number];
/** /o/{org}/{section} for old sections → where they live now (null: keep). */
export function sectionRedirect(section: string): { to: 'section'; section: OrgSection; aba?: OrganizationTab } | { to: 'notas' } | null {
  if (section === 'ajuda' || section === 'modelos-de-servico') return { to: 'section', section: 'inicio' };
  if (section === 'equipe') return { to: 'section', section: 'organizacao', aba: 'equipe' };
  if (section === 'notas') return { to: 'notas' };
  return null;
}
/** Roles that see Organização (Dados and Equipe). */
export const sectionNeedsManager = (section: string) => section === 'organizacao';

/** Administration screens that were placeholders ("em breve"): their addresses go to Organizações. */
export const ADMIN_HIDDEN_SECTIONS = ['empresas-e-notas', 'municipios', 'cobranca'] as const;
export const isHiddenAdminSection = (s: string) => (ADMIN_HIDDEN_SECTIONS as readonly string[]).includes(s);

/** Company ?aba= → canonical search, or the Notas › Recebidas list for the old "Notas recebidas" tab. */
export function companyTabRedirect(aba: string | undefined): { kind: 'keep' } | { kind: 'tab'; search: { aba?: CompanyTab } } | { kind: 'received' } {
  if (aba === undefined) return { kind: 'keep' };
  if (isCompanyReceivedTab(aba)) return { kind: 'received' };
  const code = companyTab(aba);
  if (code === aba && code !== DEFAULT_COMPANY_TAB) return { kind: 'keep' };
  return { kind: 'tab', search: code && code !== DEFAULT_COMPANY_TAB ? { aba: code } : {} };
}
/** Integration ?aba= → canonical code (undefined: default tab), or 'keep' when it is already canonical. */
export function integrationTabRedirect(aba: string | undefined): { kind: 'keep' } | { kind: 'tab'; aba: IntegrationTab | undefined } {
  if (aba === undefined) return { kind: 'keep' };
  const code = integrationTab(aba);
  if (code === aba && code !== DEFAULT_INTEGRATION_TAB) return { kind: 'keep' };
  return { kind: 'tab', aba: code && code !== DEFAULT_INTEGRATION_TAB ? code : undefined };
}
/** Organização ?aba= → canonical code (undefined: Dados). */
export function organizationTabRedirect(aba: string | undefined): { kind: 'keep' } | { kind: 'tab'; aba: OrganizationTab | undefined } {
  if (aba === undefined) return { kind: 'keep' };
  const code = organizationTab(aba);
  if (code === aba && code !== 'dados') return { kind: 'keep' };
  return { kind: 'tab', aba: code && code !== 'dados' ? code : undefined };
}

export type SwitchTarget = { to: 'section'; section: OrgSection; aba?: OrganizationTab } | { to: 'notas' } | { to: 'recebidas' } | { to: 'empresas' } | { to: 'integracoes' };
/** Switching organization keeps the section (a detail goes to the list of its section). A section the role
 *  cannot open in the new organization (Organização / Equipe) goes to Início — never to a "sem acesso" page. */
export function orgSwitchTarget(pathname: string, canManage: boolean, search = ''): SwitchTarget {
  const parts = pathname.split('/').filter(Boolean); if (parts[0] !== 'o') return { to: 'section', section: 'inicio' };
  const section = parts[2] ?? 'inicio';
  if (section === 'notas') return parts[3] === 'recebidas' ? { to: 'recebidas' } : { to: 'notas' };
  if (section === 'empresas') return { to: 'empresas' };
  if (section === 'integracoes') return { to: 'integracoes' };
  if (section === 'alertas') return { to: 'section', section: 'alertas' };
  if (section === 'organizacao' || section === 'equipe') {
    if (!canManage) return { to: 'section', section: 'inicio' };
    const team = section === 'equipe' || organizationTab(new URLSearchParams(search).get('aba')) === 'equipe';
    return team ? { to: 'section', section: 'organizacao', aba: 'equipe' } : { to: 'section', section: 'organizacao' };
  }
  return { to: 'section', section: 'inicio' };
}

/** Single environment rule: these screens show only the environment chosen in the selector… */
export const FOLLOWS_SELECTOR = ['Início', 'Notas emitidas', 'Notas recebidas', 'Alertas', 'Histórico de falhas de webhook', 'Chaves', 'Webhooks', 'Chamadas', 'Sincronização', 'Resumo da empresa'] as const;
/** …and these are the same in both environments (they show the shared-registry notice). */
export const SHARED_REGISTRY = ['Cadastro', 'Configuração fiscal', 'Serviços', 'Certificado', 'Tomadores', 'Organização'] as const;
export const SHARED_REGISTRY_NOTICE = 'Cadastro compartilhado entre produção e homologação.';
export const environmentLabel = (env: string) => env === 'sandbox' ? 'homologação' : 'produção';

/** /dashboard: with a single organization (and not a platform administrator) the panel opens straight on its Início. */
export function dashboardTarget(w: { isAdmin: boolean; organizations: { slug: string }[] }) { return !w.isAdmin && w.organizations.length === 1 ? w.organizations[0]!.slug : null; }
