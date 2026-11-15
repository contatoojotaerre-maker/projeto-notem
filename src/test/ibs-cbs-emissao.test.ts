// IBS/CBS before the obligation date (default 01/01/2027): the pending classification is only a warning;
// the note is issued normally (one reservation, the note's own) and the DPS goes without the group.
// From the date on, the same request is refused before numbering (create_invoice_request is never called).
import { describe, it, expect, vi, afterEach } from 'vitest';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createInvoice } from '../lib/api-invoices.server';
import { loadReadiness } from '../lib/readiness.server';
import { tableDb, apiCtx, company, settings, profile, ids } from './fake-db';
vi.mock('../lib/transmissor.server', () => ({ callTransmissor: vi.fn(), TransmissorError: class extends Error { constructor(public code: string, public status?: number) { super(code); } } }));

const service = { ...profile, service_code: '010501', nbs_code: '111032100', ibscbs_classification: null, ibscbs_operation_indicator: null, ibscbs_final_consumer: false, simples_activity_code: null, ibscbs_classifications: null, ibscbs_operation_indicators: null };
const cert = { status: 'active', cnpj: company.cnpj, valid_from: '2026-01-01T00:00:00Z', valid_until: '2028-12-31T00:00:00Z' };
const lists: Record<string, unknown[]> = { company_service_profiles: [service], company_certificates: [cert] };
function issuanceDb(queriedAt: string) {
  lists['municipality_agreement_queries'] = [{ created_at: queriedAt, http_status: 200, response_body: '{}', error_code: null }];
  // Stops right after the atomic reservation call so the test can count it and read the DPS sent to it.
  const f = tableDb({ invoices: null, platform_settings: null, companies: { ...company, external_id: null }, company_fiscal_settings: settings, company_service_profiles: service, municipalities: { ibge_code: '4212254' }, countries: { iso2: 'US' } },
    name => name === 'create_invoice_request' ? { data: null, error: { message: 'IDEMPOTENCIA_CONFLITO' } } : { data: null, error: null });
  const from = (f.db as { from: (t: string) => Record<string, unknown> }).from;
  (f.db as { from: unknown }).from = vi.fn((t: string) => { const b = from(t); if (lists[t]) b['then'] = (ok: (v: unknown) => unknown, ko?: (e: unknown) => unknown) => Promise.resolve({ data: lists[t], error: null }).then(ok, ko); return b; });
  return f;
}
const body = { empresa_id: ids.company_id, servico_id: ids.profile_id, valores: { servico: '150.00' }, tomador: { tipo: 'pj', documento: '11444777000161', nome: 'Tomador LTDA', endereco: { cep: '88980000', logradouro: 'Rua Exemplo', numero: '10', bairro: 'Centro', codigo_municipio: '4212254' } } };
afterEach(() => { vi.useRealTimers(); });

describe('Classificação IBS/CBS pendente antes de 01/01/2027', () => {
  it('aviso aparece, empresa continua pronta, emissão segue com uma única reserva e DPS sem o grupo (XSD release 1)', async () => {
    vi.useFakeTimers({ now: Date.parse('2026-11-15T15:00:00Z'), toFake: ['Date'] });
    const f = issuanceDb('2026-11-15T12:00:00Z');
    const { readiness } = await loadReadiness(f.db, ids.company_id, 'sandbox');
    expect(readiness.pronta_para_emitir).toBe(true);
    expect(readiness.pendencias).not.toContain('classificacao_ibscbs');
    expect(readiness.avisos).toContainEqual({ item: 'classificacao_ibscbs', mensagem: 'Classificação IBS/CBS pendente — obrigatória a partir de 01/01/2027.' });
    await expect(createInvoice(apiCtx(f.db, body))).rejects.toMatchObject({ status: 409 });
    const reservations = f.calls.filter(c => c.name === 'create_invoice_request' || c.name === 'reserve_dps_number');
    expect(reservations.map(c => c.name)).toEqual(['create_invoice_request']);
    const xml = (reservations[0]!.args['_payload'] as { unsigned_dps_xml: string }).unsigned_dps_xml;
    expect(xml).toContain('<dCompet>2026-11-15</dCompet>'); expect(xml).not.toContain('IBSCBS');
    const dir = mkdtempSync(join(tmpdir(), 'ibscbs-antes-')); try { const p = join(dir, 'dps.xml'); writeFileSync(p, xml); expect(execFileSync('python3', ['src/test/validate-dps-xsd.py', '--layout=nt009r1', p], { encoding: 'utf8' })).toContain('NT 009 release 1, oficial'); } finally { rmSync(dir, { recursive: true, force: true }); }
  });
  it('a partir de 01/01/2027 a mesma emissão é recusada com 422 antes de numerar', async () => {
    vi.useFakeTimers({ now: Date.parse('2027-01-04T15:00:00Z'), toFake: ['Date'] });
    const f = issuanceDb('2027-01-04T12:00:00Z');
    const { readiness } = await loadReadiness(f.db, ids.company_id, 'sandbox');
    expect(readiness.pronta_para_emitir).toBe(false); expect(readiness.pendencias).toContain('classificacao_ibscbs');
    await expect(createInvoice(apiCtx(f.db, body))).rejects.toMatchObject({ status: 422, code: 'REGRA_DE_NEGOCIO', details: [{ campo: 'servico.classificacao_ibscbs' }] });
    expect(f.calls.some(c => c.name === 'create_invoice_request' || c.name === 'reserve_dps_number')).toBe(false);
  });
});
