import { describe, expect, it, vi } from 'vitest';
import { issueInvoice, apiIssueCtx } from '../lib/api-invoices.server';
import { putFiscal, getFiscal } from '../lib/api-companies.server';
import { buildDps, type DpsInput } from '../lib/dps';
import type { Invoice } from '../lib/invoices';
import { apiCtx, tableDb, company, settings, profile, ids } from './fake-db';

vi.mock('../lib/readiness.server', () => ({ refreshReadiness: vi.fn(), loadReadiness: vi.fn(async () => ({ readiness: { pronta_para_emitir: true, itens: [] } })) }));
vi.mock('../lib/invoices.server', () => ({ sendInvoice: vi.fn(async (_db: unknown, invoice: Invoice) => invoice) }));

const pair = { cst: '99', tipo_retencao: '0' } as const;
const fiscalBody = { simples_nacional: 'me_epp', regime_apuracao_simples: 'tudo_fora_do_simples', regime_especial: 'nenhum', tributos_aproximados: { modo: 'percentual_simples', percentual_simples: '8.30' } };

/** Table-aware double exercises the real PUT/GET handlers, not the fiscal converter alone. */
function putDb() {
  let row: Record<string, unknown> = { ...settings, pis_cofins_cst: null, pis_cofins_withholding_type: null };
  const from = (table: string) => {
    const q = {
      select: (_columns?: string) => q,
      eq: (_column: string, _value: unknown) => q,
      update: (fields: Record<string, unknown>) => { row = { ...row, ...fields }; return q; },
      maybeSingle: async () => ({ data: table === 'companies' ? company : row, error: null }),
      single: async () => ({ data: row, error: null }),
      then: (resolve: (value: { data: unknown[]; error: null }) => unknown) => Promise.resolve({ data: [], error: null }).then(resolve),
    };
    return q;
  };
  return { db: { from } as never, row: () => row };
}

describe('PIS/COFINS: gravação e leitura na API', () => {
  it('PUT/GET mantém quando reenviado e remove quando omitido ou null', async () => {
    const f = putDb(); const path = `/api/v1/empresas/${ids.company_id}/configuracao-fiscal`;
    for (const removal of [fiscalBody, { ...fiscalBody, pis_cofins: null }]) {
      const created = await putFiscal(apiCtx(f.db, { ...fiscalBody, pis_cofins: pair }, path, { id: ids.company_id }));
      expect(created.status).toBe(200); expect(created.body).toMatchObject({ pis_cofins: pair });
      expect((await getFiscal(apiCtx(f.db, {}, path, { id: ids.company_id }))).body).toMatchObject({ pis_cofins: pair });
      await putFiscal(apiCtx(f.db, { ...fiscalBody, regime_apuracao_simples: 'iss_fora_do_simples', pis_cofins: pair }, path, { id: ids.company_id }));
      expect(f.row()).toMatchObject({ pis_cofins_cst: '99', pis_cofins_withholding_type: '0', simples_nacional_regime: 2 });
      await putFiscal(apiCtx(f.db, removal, path, { id: ids.company_id }));
      expect((await getFiscal(apiCtx(f.db, {}, path, { id: ids.company_id }))).body).toMatchObject({ pis_cofins: null });
    }
  });
  it('PUT inválido recusa 422 sem modificar a configuração existente', async () => {
    const f = putDb(); const before = structuredClone(f.row());
    await expect(putFiscal(apiCtx(f.db, { ...fiscalBody, pis_cofins: { cst: '99', tipo_retencao: '3' } }, `/api/v1/empresas/${ids.company_id}/configuracao-fiscal`, { id: ids.company_id }))).rejects.toMatchObject({ status: 422, code: 'REGRA_DE_NEGOCIO', details: [{ campo: 'pis_cofins', mensagem: 'combinação de PIS/COFINS ainda não suportada' }] });
    expect(f.row()).toEqual(before);
  });
});

describe('PIS/COFINS: retrato fiscal da nota', () => {
  it('montagem e persistência carregam 99/0; edição posterior não altera o retrato ou a DPS', async () => {
    const fiscal = { ...settings, simples_nacional_regime: 3, approx_simples_percent: 8.3, pis_cofins_cst: '99', pis_cofins_withholding_type: '0' };
    let persisted: Record<string, unknown> | null = null;
    const f = tableDb({ companies: company, company_fiscal_settings: fiscal, company_service_profiles: { ...profile, service_code: '170901', nbs_code: '114044900' }, platform_settings: { nt009r1_production_starts_at: '2026-12-01T03:00:00Z', ibscbs_required_sandbox_from: '2027-01-01' } }, (name, args) => {
      if (name !== 'create_invoice_request') throw new Error(`RPC inesperada: ${name}`);
      const payload = structuredClone(args['_payload']) as Record<string, unknown>; persisted = payload;
      return { data: { ...payload, id: ids.invoice_id, status: 'processing', dps_series: 900, dps_number: 1, dps_id: payload['placeholder_id'], created_at: '2026-11-26T01:00:00Z', updated_at: '2026-11-26T01:00:00Z' }, error: null };
    });
    const result = await issueInvoice(apiIssueCtx(apiCtx(f.db, {})), { empresa_id: ids.company_id, servico_id: ids.profile_id, competencia: '2026-11-06', descricao: 'VISTORIA', valores: { servico: '130.00' }, tomador: { tipo: 'pf', documento: '52998224725', nome: 'Cliente fictício' } }, 'pis-1', 'hash', []);
    expect(result.status).toBe(202);
    const saved = persisted as Record<string, unknown> | null;
    if (!saved) throw new Error('O retrato da nota não foi persistido.');
    expect(saved['fiscal_snapshot']).toMatchObject({ pis_cofins_cst: '99', pis_cofins_withholding_type: '0' });
    const input = saved['dps_input'] as DpsInput;
    expect(input.fiscal.pisCofins).toEqual(pair);
    const before = buildDps({ ...input, number: '1' }, 'nt009r1').xml;
    const file = saved['unsigned_dps_file'] as { path: string; sha256: string };
    expect(await f.read(file)).toBe(before);
    fiscal.pis_cofins_cst = ''; fiscal.pis_cofins_withholding_type = '';
    expect(saved['fiscal_snapshot']).toMatchObject({ pis_cofins_cst: '99', pis_cofins_withholding_type: '0' });
    expect(buildDps({ ...input, number: '1' }, 'nt009r1').xml).toBe(before);
    expect(before).toContain('<tribFed><piscofins><CST>99</CST><tpRetPisCofins>0</tpRetPisCofins></piscofins></tribFed>');
  });
});