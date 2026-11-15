import { describe, expect, it } from 'vitest';
import { LIMITS, SLOTS, anonymousRules, limitRules, routeKind, sandboxChange, sandboxChangeMessage } from '@/lib/api-policy';

// Initial values approved for the partner API (per key and environment unless stated otherwise).
const ids = { org: '10000000-0000-4000-8000-000000000001', key: '10000000-0000-4000-8000-000000000002', company: '10000000-0000-4000-8000-000000000003' };
const rules = (method: string, path: string, env: 'production' | 'sandbox' = 'production', params: Record<string, string> = {}, body?: unknown) =>
  limitRules({ method, path, env, organization_id: ids.org, key_id: ids.key, params, body });
const find = (r: ReturnType<typeof rules>, bucket: string) => r.rules.find(x => x.bucket === bucket);

describe('limites de uso da API', () => {
  it('geral: 120 por minuto e 30 em 10 segundos por chave; 240 por minuto por organização', () => {
    const r = rules('GET', '/api/v1/status');
    expect(find(r, 'geral')).toMatchObject({ max: 120, window: 60, scope: `chave:${ids.key}:production` });
    expect(find(r, 'geral_rajada')).toMatchObject({ max: 30, window: 10 });
    expect(find(r, 'geral_organizacao')).toMatchObject({ max: 240, window: 60, scope: `org:${ids.org}:production` });
  });
  it('produção e homologação contam separadamente', () => {
    expect(find(rules('GET', '/api/v1/status', 'sandbox'), 'geral')!.scope).toBe(`chave:${ids.key}:sandbox`);
  });
  it('listagens: 60 por minuto', () => { expect(find(rules('GET', '/api/v1/notas'), 'listagem')).toMatchObject({ max: 60, window: 60 }); });
  it('emissão: 20 por minuto em produção, 10 em homologação, no máximo 2 simultâneas por empresa', () => {
    const p = rules('POST', '/api/v1/notas', 'production', {}, { empresa_id: ids.company });
    expect(find(p, 'emissao_producao')).toMatchObject({ max: 20, window: 60 });
    expect(p.slot).toMatchObject({ max: 2, scope: `emissao:${ids.org}:production:${ids.company}` });
    expect(find(rules('POST', '/api/v1/notas', 'sandbox', {}, { empresa_id: ids.company }), 'emissao_homologacao')).toMatchObject({ max: 10, window: 60 });
    expect(routeKind('POST', '/api/v1/notas/x/substituir')).toBe('emissao');
  });
  it('cancelamento e análise: 10 por minuto e 1 por nota ao mesmo tempo', () => {
    const r = rules('POST', '/api/v1/notas/n1/cancelar', 'production', { invoiceId: 'n1' });
    expect(find(r, 'evento')).toMatchObject({ max: 10, window: 60 }); expect(r.slot).toMatchObject({ max: 1, scope: `evento:${ids.org}:production:n1` });
    expect(routeKind('POST', '/api/v1/notas/n1/solicitar-analise-cancelamento')).toBe('evento');
  });
  it('certificado: 3 a cada 10 minutos por chave e 10 por dia por empresa', () => {
    const r = rules('POST', `/api/v1/empresas/${ids.company}/certificado`, 'production', { id: ids.company });
    expect(find(r, 'certificado')).toMatchObject({ max: 3, window: 600 });
    expect(find(r, 'certificado_empresa_dia')).toMatchObject({ max: 10, window: 86400, scope: `empresa:${ids.company}` });
  });
  it('verificação de município: 1 por minuto por empresa e ambiente', () => {
    expect(find(rules('POST', `/api/v1/empresas/${ids.company}/situacao/verificar-municipio`, 'sandbox', { id: ids.company }), 'municipio')).toMatchObject({ max: 1, window: 60, scope: `empresa:${ids.company}:sandbox` });
  });
  it('PDF 20/min com 2 simultâneos, XML 60/min, sincronização 30/min', () => {
    const pdf = rules('GET', '/api/v1/notas/n1/pdf'); expect(find(pdf, 'pdf')).toMatchObject({ max: 20, window: 60 }); expect(pdf.slot?.max).toBe(2);
    expect(find(rules('GET', '/api/v1/notas/n1/xml'), 'xml')).toMatchObject({ max: 60, window: 60 });
    expect(find(rules('GET', `/api/v1/empresas/${ids.company}/sincronizacao`, 'production', { id: ids.company }), 'sincronizacao')).toMatchObject({ max: 30, window: 60 });
  });
  it('sem chave válida: 30 por minuto por endereço', () => { expect(anonymousRules('abc')[0]).toMatchObject({ max: 30, window: 60, scope: 'ip:abc' }); });
  it('valores iniciais publicados', () => {
    expect(LIMITS.geral.max).toBe(120); expect(LIMITS.emissao_producao.max).toBe(20); expect(SLOTS).toEqual({ emissao: 2, evento: 1, pdf: 2 });
  });
});

describe('alterações de cadastro por chave de homologação', () => {
  it.each([
    ['POST', '/api/v1/empresas', 'empresa', 'criado'], ['PATCH', '/api/v1/empresas/e1', 'empresa', 'alterado'], ['DELETE', '/api/v1/empresas/e1', 'empresa', 'excluido'],
    ['PUT', '/api/v1/empresas/e1/configuracao-fiscal', 'configuracao_fiscal', 'alterado'], ['POST', '/api/v1/empresas/e1/servicos', 'servico', 'criado'],
    ['PATCH', '/api/v1/empresas/e1/servicos/s1', 'servico', 'alterado'], ['POST', '/api/v1/empresas/e1/tomadores', 'tomador', 'criado'],
    ['PATCH', '/api/v1/empresas/e1/tomadores/t1', 'tomador', 'alterado'], ['POST', '/api/v1/empresas/e1/certificado', 'certificado', 'alterado'],
  ])('%s %s é registrado', (m, p, item, action) => { expect(sandboxChange(m, p)).toEqual({ item, action }); });
  it('leituras e notas não entram no aviso', () => {
    expect(sandboxChange('GET', '/api/v1/empresas/e1')).toBeNull(); expect(sandboxChange('POST', '/api/v1/notas')).toBeNull();
  });
  it('mensagem do painel', () => {
    expect(sandboxChangeMessage('servico', 'alterado', 'ERP')).toBe('Serviço alterado pela chave de homologação da integração ERP');
    expect(sandboxChangeMessage('configuracao_fiscal', 'alterado', 'ERP')).toBe('Configuração fiscal alterada pela chave de homologação da integração ERP');
  });
});
