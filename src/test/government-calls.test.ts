import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { exportPKCS8, generateKeyPair } from 'jose';
import { governmentSample } from '../lib/government-calls';
import { recordGovernmentCall } from '../lib/government-calls.server';
import { sendInvoice } from '../lib/invoices.server';
import { buildDps } from '../lib/dps';
import { fixture } from './dps-fixtures';
import { xmlStore } from './fake-db';
import type { Invoice } from '../lib/invoices';

vi.mock('../lib/government-calls.server', () => ({ recordGovernmentCall: vi.fn() }));
vi.mock('../lib/readiness.server', () => ({ refreshReadiness: vi.fn(async () => {}) }));

describe('Classificação das chamadas ao governo', () => {
  const p = { ambiente: 'producao' };
  it('resposta abaixo de 500 conta como resposta (inclusive recusa e 404)', () => {
    expect(governmentSample('/v1/nfse/emitir', p, { resposta: { status: 400, ms: 900 } })).toEqual({ system: 'sefin', service: 'emissao', environment: 'production', outcome: 'respondeu', http_status: 400, duration_ms: 900 });
    expect(governmentSample('/v1/dps/consultar', { ambiente: 'homologacao' }, { resposta: { status: 404, ms: 10 } })?.outcome).toBe('respondeu');
  });
  it('5xx, conexão e tempo esgotado são falhas', () => {
    expect(governmentSample('/v1/nfse/evento', p, { resposta: { status: 503, ms: 10 } })?.outcome).toBe('erro_governo');
    expect(governmentSample('/v1/adn/dfe', p, { resposta: { erro: 'CONEXAO', ms: 10 } })).toMatchObject({ system: 'adn', service: 'distribuicao', outcome: 'conexao' });
    expect(governmentSample('/v1/adn/eventos', p, { resposta: { erro: 'TLS' } })?.outcome).toBe('conexao');
    expect(governmentSample('/v1/nfse/consultar', p, { resposta: { erro: 'TEMPO_ESGOTADO', ms: 20000 } })?.outcome).toBe('tempo_esgotado');
  });
  it('certificado e respostas sem dados do governo não são medidos', () => {
    expect(governmentSample('/v1/certificados/preparar', p, { resposta: { status: 200 } })).toBeNull();
    expect(governmentSample('/v1/nfse/emitir', p, {})).toBeNull();
    expect(governmentSample('/v1/nfse/emitir', {}, { resposta: { status: 201 } })).toBeNull();
  });
});

// Real transmissor client with fetch stubbed: the government-call recording is the only thing that fails.
const ids = { company_id: '10000000-0000-4000-8000-000000000001', organization_id: '20000000-0000-4000-8000-000000000001' };
const invoice = () => ({ id: '10000000-0000-4000-8000-000000000009', ...ids, integration_id: '10000000-0000-4000-8000-000000000008', environment: 'sandbox', status: 'processing', dispatch_state: 'sending', claim_token: 'token', dps_id: buildDps(fixture(), 'nt009r1').id, dps_number: 1, dps_series: 1, created_by: 'actor', sent_values: { servico: '150.00' }, service_snapshot: { withholding: 1 }, provider_snapshot: { cnpj: '11222333000181' }, verification_started_at: '2026-11-14T18:00:00Z', emitted_at: '2026-11-14T18:00:00Z', request_hash: 'hash' }) as unknown as Invoice;
const xml = `<NFSe xmlns="http://www.sped.fazenda.gov.br/nfse"><infNFSe Id="NFS${'1'.repeat(50)}"><nNFSe>123</nNFSe><dhProc>2026-11-14T15:00:00-03:00</dhProc><valores><vBC>150.00</vBC><pAliqAplic>2.00</pAliqAplic><vISSQN>3.00</vISSQN><vLiq>147.00</vLiq></valores>${buildDps(fixture(), 'nt009r1').xml.replace('<?xml version="1.0" encoding="UTF-8"?>', '')}</infNFSe></NFSe>`;
function fakeDb(i = invoice()) {
  const x = xmlStore(); x.seed('invoices', i.id, 'unsigned_dps', buildDps(fixture(), 'nt009r1').xml);
  const builder = { select: () => builder, eq: () => builder, single: async () => ({ data: i, error: null }), maybeSingle: async () => ({ data: { key_version: '1', nonce: 'opaque', data: 'opaque' }, error: null }), insert: async () => ({ error: null }) };
  const db = { storage: x.storage, from: vi.fn((t: string) => t === 'fiscal_xml_files' ? x.refsQuery() : builder), rpc: vi.fn(async (name: string, args: Record<string, unknown>) => { if (name === 'claim_invoice_dispatch') return { data: [i], error: null }; return { data: { ...i, ...(args['_patch'] as object) }, error: null }; }) };
  return db as never;
}
const reply = { dps_assinada: 'signed', resposta: { status: 201, ms: 850, corpo_json: { chaveAcesso: '1'.repeat(50), nfseXml: xml } } };
let errors: ReturnType<typeof vi.spyOn>;
beforeEach(async () => {
  const keys = await generateKeyPair('RS256', { extractable: true });
  vi.stubEnv('TRANSMISSOR_URL', 'https://transmissor.test');
  vi.stubEnv('GOOGLE_SERVICE_ACCOUNT_JSON', JSON.stringify({ client_email: 'panel@notem-test.iam.gserviceaccount.com', private_key: await exportPKCS8(keys.privateKey) }));
  const claims = btoa(JSON.stringify({ exp: Math.floor(Date.now() / 1000) + 3600 })).replace(/=+$/, '');
  vi.stubGlobal('fetch', vi.fn(async (url: string) => String(url).startsWith('https://oauth2.googleapis.com') ? Response.json({ id_token: `h.${claims}.s` }) : Response.json(reply)));
  vi.mocked(recordGovernmentCall).mockReset();
  errors = vi.spyOn(console, 'error').mockImplementation(() => {});
});
afterEach(() => { vi.unstubAllEnvs(); vi.unstubAllGlobals(); errors.mockRestore(); });
const flush = () => new Promise(r => setTimeout(r, 0));

describe('Gravação da medição nunca atrapalha a emissão', () => {
  it('falha síncrona na gravação: a nota é autorizada normalmente e o erro é só registrado', async () => {
    vi.mocked(recordGovernmentCall).mockImplementation(() => { throw new Error('banco fora'); });
    const r = await sendInvoice(fakeDb(), invoice());
    expect(r.status).toBe('authorized');
    await flush();
    expect(recordGovernmentCall).toHaveBeenCalledWith({ system: 'sefin', service: 'emissao', environment: 'sandbox', outcome: 'respondeu', http_status: 201, duration_ms: 850 });
    expect(errors).toHaveBeenCalledWith('GOV_CALL_RECORD_FAILED');
  });
  it('gravação recusada pelo banco: a nota segue autorizada', async () => {
    vi.mocked(recordGovernmentCall).mockRejectedValue(new Error('GOV_CALL_RECORD_FAILED'));
    expect((await sendInvoice(fakeDb(), invoice())).status).toBe('authorized');
    await flush(); expect(errors).toHaveBeenCalledWith('GOV_CALL_RECORD_FAILED');
  });
  it('gravação que nunca termina não atrasa a emissão', async () => {
    vi.mocked(recordGovernmentCall).mockImplementation(() => new Promise(() => {}));
    expect((await sendInvoice(fakeDb(), invoice())).status).toBe('authorized');
  });
});
