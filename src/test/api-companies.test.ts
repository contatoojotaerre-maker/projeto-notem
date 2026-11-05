import { describe, expect, it } from 'vitest';
import { ApiFailure, bodyHash, certificateOut, companyCreate, companyIn, computeReadiness, expiryMilestone, fiscalIn, fiscalOut, fiscalToDb, idempotencyKey, page, pageParams, serviceOut, serviceToDb } from '@/lib/api-contract';
import { logBody } from '@/lib/api.server';
import { sanitizeBody } from '@/lib/integrations';
import { decodeCertificate } from '@/lib/api-companies.server';

const ids = { company_id: '00000000-0000-4000-8000-000000000001', organization_id: '00000000-0000-4000-8000-000000000002' };
const code = (fn: () => unknown) => { try { fn(); } catch (e) { return e instanceof ApiFailure ? `${e.status} ${e.code}` : String(e); } return 'ok'; };

describe('configuração fiscal pela API', () => {
  it('converte valores legíveis para os códigos do banco', () => {
    const v = fiscalIn.parse({ simples_nacional: 'me_epp', regime_apuracao_simples: 'dentro_do_simples', regime_especial: 'outros', tributos_aproximados: { modo: 'percentual_simples', percentual_simples: '6.00' } });
    const db = fiscalToDb(v, ids, 1);
    expect([db.simples_nacional_option, db.simples_nacional_regime, db.special_tax_regime, db.approx_taxes_mode, db.approx_simples_percent]).toEqual([3, 1, 9, 'percent_simples', 6]);
    expect(fiscalOut({ ...db, dps_series: 1 }).serie_dps).toBe('00001');
  });
  it('E0713: não optante não pode usar nao_informar', () => {
    const v = fiscalIn.parse({ simples_nacional: 'nao_optante', regime_especial: 'nenhum', tributos_aproximados: { modo: 'nao_informar' } });
    expect(code(() => fiscalToDb(v, ids, null))).toBe('422 REGRA_DE_NEGOCIO');
  });
  it('alíquota do ISS no Simples abaixo de 1.80 é recusada', () => {
    const v = fiscalIn.parse({ simples_nacional: 'me_epp', regime_apuracao_simples: 'dentro_do_simples', regime_especial: 'nenhum', tributos_aproximados: { modo: 'nao_informar' }, aliquota_iss_simples: '1.50' });
    expect(code(() => fiscalToDb(v, ids, null))).toBe('422 REGRA_DE_NEGOCIO');
  });
});

describe('empresa e serviço', () => {
  it('CNPJ inválido é recusado e endereço é convertido', () => {
    expect(companyCreate.safeParse({ cnpj: '11222333000180', razao_social: 'X', endereco: { cep: '88980000', logradouro: 'R', numero: '1', bairro: 'C', codigo_municipio: '4212254' } }).success).toBe(false);
    expect(companyIn({ ativa: false, endereco: { codigo_municipio: '4212254' } })).toEqual({ active: false, municipality_ibge_code: '4212254' });
  });
  it('imunidade exige tipo de imunidade', () => {
    expect(code(() => serviceToDb({ nome: 'S', ativo: true, codigo_servico: '140101', tributacao_iss: 'imunidade', retencao_iss: 'nao_retido' }, {}))).toBe('422 REGRA_DE_NEGOCIO');
    expect(serviceOut({ id: 'i', external_id: null, name: 'S', active: true, service_code: '140101', municipal_tax_code: null, nbs_code: null, default_description: '', iss_taxation: 1, immunity_type: null, iss_withholding: 2, ibscbs_operation_indicator: null, municipal_benefit_number: null }).retencao_iss).toBe('retido_tomador');
  });
});

describe('certificado pela API', () => {
  it('arquivo acima de 100 KB é recusado e base64 inválido vira erro do contrato', () => {
    expect(code(() => decodeCertificate(btoa('x'.repeat(100 * 1024 + 1))))).toBe('400 REQUISICAO_INVALIDA');
    expect(code(() => decodeCertificate('@@@'))).toBe('422 CERTIFICADO_SENHA_OU_ARQUIVO_INVALIDO');
  });
  it('arquivo e senha nunca vão para o registro', () => {
    const body = { arquivo_base64: 'MIIKsegredo', senha: 'minhaSenha' };
    expect(JSON.stringify(logBody('/api/v1/empresas/x/certificado', body))).not.toMatch(/MIIK|minhaSenha/);
    expect(JSON.stringify(sanitizeBody(body))).not.toMatch(/MIIK|minhaSenha/);
  });
  it('situação vencendo com 30 dias ou menos', () => {
    const now = new Date('2026-11-05T12:00:00Z');
    expect(certificateOut({ holder: 'h', cnpj: '1', issuer: 'i', serial_number: 's', valid_from: '2026-01-01T00:00:00Z', valid_until: '2026-11-20T12:00:00Z', status: 'active' }, now).situacao).toBe('vencendo');
  });
  it('marcos de vencimento: 30, 15, 7, 1 e vencido', () => {
    const now = Date.parse('2026-11-05T12:00:00Z'); const at = (d: number) => new Date(now + d * 86_400_000).toISOString();
    expect([45, 30, 20, 15, 7, 1, -1].map(d => expiryMilestone(at(d), now))).toEqual([null, '30', '30', '15', '7', '1', 'vencido']);
  });
});

describe('situação da empresa', () => {
  const base = { company: { active: true, cnpj: '11222333000181' }, certificates: [{ status: 'active', cnpj: '11222333000181', valid_from: '2026-01-01T00:00:00Z', valid_until: '2027-01-01T00:00:00Z' }], settings: { ...ids, simples_nacional_option: 2, simples_nacional_regime: null, special_tax_regime: 0, dps_series: 1, approx_taxes_mode: 'none', approx_simples_percent: null, approx_federal_percent: null, approx_state_percent: null, approx_municipal_percent: null, simples_iss_withholding_percent: null }, services: [{ active: true }] };
  const now = Date.parse('2026-11-05T12:00:00Z');
  it('pronta somente com município verificado no ambiente', () => {
    expect(computeReadiness('sandbox', { ...base, lastQuery: null }, now).pendencias).toEqual(['municipio']);
    expect(computeReadiness('production', { ...base, lastQuery: { created_at: '2026-11-05T10:00:00Z', http_status: 200, response_body: '{}', error_code: null } }, now).pronta_para_emitir).toBe(true);
  });
  it('empresa desativada fica pendente', () => {
    expect(computeReadiness('production', { ...base, company: { ...base.company, active: false }, lastQuery: { created_at: '2026-11-05T10:00:00Z', http_status: 200, response_body: '{}', error_code: null } }, now).pendencias).toEqual(['empresa_ativa']);
  });
});

describe('idempotência e paginação', () => {
  it('mesmo conteúdo → mesmo hash; conteúdo diferente → hash diferente', async () => {
    expect(await bodyHash('POST', '/api/v1/empresas', '{"a":1}')).toBe(await bodyHash('POST', '/api/v1/empresas', '{"a":1}'));
    expect(await bodyHash('POST', '/api/v1/empresas', '{"a":1}')).not.toBe(await bodyHash('POST', '/api/v1/empresas', '{"a":2}'));
  });
  it('chave com mais de 100 caracteres é recusada', () => { expect(code(() => idempotencyKey('x'.repeat(101)))).toBe('400 REQUISICAO_INVALIDA'); });
  it('cursor avança e termina em null', () => {
    const p = page([1, 2, 3], 2, 0); expect(p.dados).toEqual([1, 2]);
    expect(pageParams(new URL(`https://x/?limite=2&cursor=${p.proximo_cursor}`)).offset).toBe(2);
    expect(page([3], 2, 2).proximo_cursor).toBeNull();
    expect(code(() => pageParams(new URL('https://x/?limite=101')))).toBe('400 REQUISICAO_INVALIDA');
  });
});
