import { describe, expect, it } from 'vitest';
import { COMPANY_TABS, INTEGRATION_TABS, companyTab, integrationTab, isCompanyReceivedTab } from '@/lib/panel-tabs';

describe('códigos fixos de ?aba=', () => {
  it.each([
    ['Pronta para emitir', 'resumo'], ['Pronta%20para%20emitir', 'resumo'], ['pronta para emitir', 'resumo'],
    ['Dados', 'cadastro'], ['Configuração fiscal', 'fiscal'], ['Configura%C3%A7%C3%A3o%20fiscal', 'fiscal'], ['Configuracao fiscal', 'fiscal'],
    ['Certificado', 'certificado'], ['Serviços', 'servicos'], ['Servi%C3%A7os', 'servicos'], ['Tomadores', 'tomadores'],
    ['Sincronização', 'sincronizacao'], ['Sincroniza%C3%A7%C3%A3o', 'sincronizacao'],
  ])('empresa: %s → %s', (raw, code) => { expect(companyTab(raw)).toBe(code); });
  it.each(['recebidas', 'Notas recebidas', 'Notas%20recebidas'])('empresa: aba antiga %s não é mais aba (vai para Notas › Recebidas)', raw => { expect(companyTab(raw)).toBeNull(); expect(isCompanyReceivedTab(raw)).toBe(true); });
  it('empresa: códigos novos ficam como estão', () => { for (const t of COMPANY_TABS) expect(companyTab(t)).toBe(t); });
  it.each([
    ['requisicoes', 'chamadas'], ['Requisições', 'chamadas'], ['logs', 'chamadas'], ['webhooks', 'webhooks'], ['Webhooks', 'webhooks'],
    ['Dados', 'configuracoes'], ['Chaves', 'chaves'], ['keys', 'chaves'], ['Como testar', 'como-testar'], ['test', 'como-testar'],
  ])('integração: %s → %s', (raw, code) => { expect(integrationTab(raw)).toBe(code); });
  it('integração: códigos novos ficam como estão', () => { for (const t of INTEGRATION_TABS) expect(integrationTab(t)).toBe(t); });
  it('valores desconhecidos não viram aba', () => {
    for (const v of ['', 'xyz', '<script>', 'a'.repeat(61), null, 3]) { expect(companyTab(v)).toBeNull(); expect(integrationTab(v)).toBeNull(); }
  });
});
