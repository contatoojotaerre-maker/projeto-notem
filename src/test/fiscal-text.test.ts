import { describe, it, expect, vi } from 'vitest';
import { FISCAL_TEXT_MESSAGE, fiscalTextAccepted, normalizeCustomerText, normalizeFiscalText } from '../lib/fiscal-text';
import { buildDps } from '../lib/dps';
import { buildFiscalEvent } from '../lib/fiscal-events';
import { createInvoice } from '../lib/api-invoices.server';
import { fixture } from './dps-fixtures';
import { eventFixture } from './fiscal-event-fixtures';
import { tableDb, apiCtx, company, settings, profile, ids } from './fake-db';
vi.mock('../lib/transmissor.server', () => ({ callTransmissor: vi.fn(), TransmissorError: class extends Error { constructor(public code: string, public status?: number) { super(code); } } }));
vi.mock('../lib/readiness.server', () => ({ refreshReadiness: vi.fn(), loadReadiness: vi.fn(async () => ({ readiness: { pronta_para_emitir: true, itens: [] } })) }));

// Text as pasted from Word/Google Docs/WhatsApp.
const pasted = '  “Vistoria” veicular — completa…\r\nSegunda\u00A0\u00A0linha –  revisão  ';
describe('Normalização de texto colado de editores', () => {
  it('aspas curvas viram aspas retas', () => { expect(normalizeFiscalText('“Serviço” ‘A’')).toBe('"Serviço" \'A\''); });
  it('travessões viram hífen', () => { expect(normalizeFiscalText('Revisão — completa – parcial')).toBe('Revisão - completa - parcial'); });
  it('reticências viram três pontos', () => { expect(normalizeFiscalText('Aguardando…')).toBe('Aguardando...'); });
  it('espaços especiais, repetidos e nas pontas são ajustados', () => { expect(normalizeFiscalText('  Rua\u00A0das   Flores\u2009 10  ')).toBe('Rua das Flores 10'); });
  it('quebra de linha vira espaço em campo de uma linha', () => { expect(normalizeFiscalText('Linha 1\r\nLinha 2\nLinha 3')).toBe('Linha 1 Linha 2 Linha 3'); });
  it('descrição do serviço mantém quebras de linha', () => { expect(normalizeFiscalText(pasted, true)).toBe('"Vistoria" veicular - completa...\nSegunda linha - revisão'); });
  it('acentos decompostos (macOS) viram caracteres aceitos', () => { const v = normalizeFiscalText('Servic\u0327o'); expect(v).toBe('Serviço'); expect(fiscalTextAccepted(v)).toBe(true); });
  it('emoji não tem equivalente e é recusado', () => { const v = normalizeFiscalText('Obrigado 🙏'); expect(v).toBe('Obrigado 🙏'); expect(fiscalTextAccepted(v)).toBe(false); });
  it('tomador: normaliza no lugar e aponta o campo recusado', () => {
    const c = { tipo: 'pj', nome: ' Tomador ‘A’ – LTDA ', endereco: { logradouro: 'Rua “Central”', bairro: 'Centro 🏠' } };
    expect(normalizeCustomerText(c)).toEqual([{ campo: 'tomador.endereco.bairro', mensagem: FISCAL_TEXT_MESSAGE }]);
    expect(c.nome).toBe("Tomador 'A' - LTDA"); expect(c.endereco.logradouro).toBe('Rua "Central"');
  });
  it('montador da DPS recusa texto não aceito como última barreira', () => { const v = fixture(); v.service.description = 'Serviço 🚗'; expect(() => buildDps(v,'nt009r1')).toThrow(FISCAL_TEXT_MESSAGE); });
  it('montador do evento recusa justificativa com emoji', () => { const v = eventFixture(); v.justification = 'Cancelamento solicitado pelo cliente 😀'; expect(() => buildFiscalEvent(v)).toThrow(); });
});

function issuanceDb() {
  return tableDb({ invoices: null, companies: company, company_fiscal_settings: settings, company_service_profiles: profile, municipalities: { ibge_code: '4212254' }, countries: { iso2: 'US' } }, name => name === 'create_invoice_request' ? { data: null, error: { message: 'IDEMPOTENCIA_CONFLITO' } } : { data: null, error: null });
}
const body = (over: Record<string, unknown> = {}) => ({ empresa_id: ids.company_id, servico_id: ids.profile_id, valores: { servico: '150.00' }, tomador: { tipo: 'pj', documento: '11444777000161', nome: 'Tomador LTDA', endereco: { cep: '88980000', logradouro: 'Rua Exemplo', numero: '10', bairro: 'Centro', codigo_municipio: '4212254' } }, ...over });
describe('Emissão pela API com texto colado', () => {
  it('emoji no nome do tomador: 422 com o campo, antes de numerar', async () => {
    const f = issuanceDb();
    await expect(createInvoice(apiCtx(f.db, body({ tomador: { ...body().tomador, nome: 'Tomador 🚀 LTDA' } })))).rejects.toMatchObject({ status: 422, code: 'REGRA_DE_NEGOCIO', details: [{ campo: 'tomador.nome', mensagem: FISCAL_TEXT_MESSAGE }] });
    expect(f.calls.some(c => c.name === 'create_invoice_request')).toBe(false);
  });
  it('emoji na descrição: 422 no campo descricao', async () => {
    const f = issuanceDb();
    await expect(createInvoice(apiCtx(f.db, body({ descricao: 'Vistoria ✅' })))).rejects.toMatchObject({ status: 422, details: [{ campo: 'descricao', mensagem: FISCAL_TEXT_MESSAGE }] });
  });
  it('texto normalizado é o que fica na nota e vai na DPS', async () => {
    const f = issuanceDb();
    await expect(createInvoice(apiCtx(f.db, body({ descricao: pasted, informacoes_complementares: 'Pedido nº 10\nentregue…', tomador: { ...body().tomador, nome: ' Tomador ‘A’ – LTDA ' } })))).rejects.toMatchObject({ status: 409 });
    const payload = f.calls.find(c => c.name === 'create_invoice_request')?.args['_payload'] as Record<string, unknown>;
    expect(payload['description']).toBe('"Vistoria" veicular - completa...\nSegunda linha - revisão');
    expect(payload['complementary_information']).toBe('Pedido nº 10 entregue...');
    expect((payload['customer_snapshot'] as { nome: string }).nome).toBe("Tomador 'A' - LTDA");
    expect(payload['unsigned_dps_xml']).toContain('<xNome>Tomador &apos;A&apos; - LTDA</xNome>');
    expect(payload['unsigned_dps_xml']).toContain('<xInfComp>Pedido nº 10 entregue...</xInfComp>');
  });
});
