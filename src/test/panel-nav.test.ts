import { describe, expect, it } from 'vitest';
import { companyTabRedirect, dashboardTarget, integrationTabRedirect, isHiddenAdminSection, orgSwitchTarget, organizationTabRedirect, sectionRedirect } from '@/lib/panel-nav';
import { parseReceivedSearch } from '@/lib/list-search';

describe('redirecionamentos de endereços antigos', () => {
  it('ajuda e modelos-de-servico vão para o Início; equipe vai para Organização › Equipe', () => {
    expect(sectionRedirect('ajuda')).toEqual({ to: 'section', section: 'inicio' });
    expect(sectionRedirect('modelos-de-servico')).toEqual({ to: 'section', section: 'inicio' });
    expect(sectionRedirect('equipe')).toEqual({ to: 'section', section: 'organizacao', aba: 'equipe' });
    expect(sectionRedirect('inicio')).toBeNull();
  });
  it('aba antiga "Notas recebidas" da empresa abre Notas › Recebidas', () => {
    for (const aba of ['recebidas', 'Notas recebidas', 'notas-recebidas']) expect(companyTabRedirect(aba)).toEqual({ kind: 'received' });
  });
  it('abas antigas da empresa viram códigos; Resumo é o padrão (sem ?aba=)', () => {
    expect(companyTabRedirect('Dados')).toEqual({ kind: 'tab', search: { aba: 'cadastro' } });
    expect(companyTabRedirect('Pronta para emitir')).toEqual({ kind: 'tab', search: {} });
    expect(companyTabRedirect('resumo')).toEqual({ kind: 'tab', search: {} });
    expect(companyTabRedirect('xyz')).toEqual({ kind: 'tab', search: {} });
    expect(companyTabRedirect('fiscal')).toEqual({ kind: 'keep' });
    expect(companyTabRedirect(undefined)).toEqual({ kind: 'keep' });
  });
  it('abas antigas da integração: requisicoes → chamadas; Chaves é o padrão', () => {
    expect(integrationTabRedirect('requisicoes')).toEqual({ kind: 'tab', aba: 'chamadas' });
    expect(integrationTabRedirect('Dados')).toEqual({ kind: 'tab', aba: 'configuracoes' });
    expect(integrationTabRedirect('chaves')).toEqual({ kind: 'tab', aba: undefined });
    expect(integrationTabRedirect('chamadas')).toEqual({ kind: 'keep' });
  });
  it('Organização: Dados é o padrão; equipe fica', () => {
    expect(organizationTabRedirect('dados')).toEqual({ kind: 'tab', aba: undefined });
    expect(organizationTabRedirect('equipe')).toEqual({ kind: 'keep' });
  });
  it('as 4 telas "em breve" da Administração saem do ar', () => {
    for (const s of ['empresas-e-notas', 'municipios', 'saude-do-sistema', 'cobranca']) expect(isHiddenAdminSection(s)).toBe(true);
    expect(isHiddenAdminSection('organizacoes')).toBe(false);
  });
  it('Recebidas não aceita filtro de origem', () => {
    expect(parseReceivedSearch({ origem: 'externa', situacao: 'cancelled' })).toEqual({ situacao: 'cancelled' });
  });
});

describe('troca de organização', () => {
  it('mantém a seção; um detalhe vai para a lista da seção', () => {
    expect(orgSwitchTarget('/o/a/notas/0b5d1c1e-8f7a-4a7e-9a1d-2f3e4d5c6b7a', false)).toEqual({ to: 'notas' });
    expect(orgSwitchTarget('/o/a/notas/recebidas/0b5d1c1e-8f7a-4a7e-9a1d-2f3e4d5c6b7a', false)).toEqual({ to: 'recebidas' });
    expect(orgSwitchTarget('/o/a/empresas/x', false)).toEqual({ to: 'empresas' });
    expect(orgSwitchTarget('/o/a/integracoes/x', false)).toEqual({ to: 'integracoes' });
    expect(orgSwitchTarget('/o/a/alertas', false)).toEqual({ to: 'section', section: 'alertas' });
  });
  it('seção não permitida ao papel na nova organização vai para o Início (sem tela de sem acesso)', () => {
    expect(orgSwitchTarget('/o/a/organizacao', false)).toEqual({ to: 'section', section: 'inicio' });
    expect(orgSwitchTarget('/o/a/organizacao', false, '?aba=equipe')).toEqual({ to: 'section', section: 'inicio' });
    expect(orgSwitchTarget('/o/a/organizacao', true, '?aba=equipe')).toEqual({ to: 'section', section: 'organizacao', aba: 'equipe' });
    expect(orgSwitchTarget('/o/a/organizacao', true)).toEqual({ to: 'section', section: 'organizacao' });
  });
  it('/dashboard vai direto ao Início com uma única organização (não para admin da plataforma)', () => {
    expect(dashboardTarget({ isAdmin: false, organizations: [{ slug: 'a' }] })).toBe('a');
    expect(dashboardTarget({ isAdmin: false, organizations: [{ slug: 'a' }, { slug: 'b' }] })).toBeNull();
    expect(dashboardTarget({ isAdmin: true, organizations: [{ slug: 'a' }] })).toBeNull();
  });
});
