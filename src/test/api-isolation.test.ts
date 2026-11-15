import { describe, expect, it } from 'vitest';
import { ApiFailure } from '@/lib/api-contract';

// Every /api/v1 handler runs with a key of organization A against identifiers of organization B.
// The double below applies the same filters PostgREST would; any row of B that reaches a handler, or any
// write that would touch B, is recorded as a leak. GET routes must answer 404 (never reveal B).
const A = '20000000-0000-4000-8000-00000000000a', B = '20000000-0000-4000-8000-00000000000b';
const id = (n: number) => `30000000-0000-4000-8000-${String(n).padStart(12, '0')}`;
const CNPJ_A = '11222333000181', CNPJ_B = '11444777000161';
const ids = { companyA: id(1), companyB: id(2), serviceB: id(3), customerB: id(4), invoiceB: id(5), extDocB: id(6), recDocB: id(7), eventB: id(8), invoiceBs: id(9) };
type Row = Record<string, unknown>;
const base = (env: string) => ({ environment: env, created_at: '2026-11-01T12:00:00Z', updated_at: '2026-11-01T12:00:00Z' });
function data(): Record<string, Row[]> {
  const company = (cid: string, org: string, cnpj: string) => ({ id: cid, organization_id: org, cnpj, legal_name: 'Empresa', trade_name: '', municipal_registration: '', email: '', phone: '', postal_code: '88980000', street: 'Rua', number: '1', complement: '', district: 'Centro', municipality_ibge_code: '4212254', state: 'SC', active: true, external_id: org === B ? 'ext-b' : 'ext-a', created_at: '2026-11-01T12:00:00Z', updated_at: '2026-11-01T12:00:00Z' });
  const invoice = (iid: string, env: string) => ({ id: iid, organization_id: B, company_id: ids.companyB, ...base(env), status: 'authorized', access_key: '4'.repeat(50), nfse_number: '1', dps_series: 900, dps_number: 1, dps_id: 'DPS', external_id: 'nota-b', customer_snapshot: { documento: '00000000191' }, provider_snapshot: { cnpj: CNPJ_B }, sent_values: {}, service_snapshot: {}, service_location: {}, government_errors: [], restrictions: [], fiscal_snapshot: {}, emitted_at: '2026-11-01T12:00:00Z' });
  return {
    organizations: [{ id: A, name: 'A' }, { id: B, name: 'B' }],
    companies: [company(ids.companyA, A, CNPJ_A), company(ids.companyB, B, CNPJ_B)],
    company_fiscal_settings: [{ company_id: ids.companyB, organization_id: B, cnpj: CNPJ_B, simples_nacional_option: 1, simples_nacional_regime: null, special_tax_regime: 0, dps_series: 900, approx_taxes_mode: 'none', print_danfse_receipt: false }],
    company_service_profiles: [{ id: ids.serviceB, company_id: ids.companyB, organization_id: B, name: 'S', active: true, service_code: '140101', default_description: 'x', iss_taxation: 1, iss_withholding: 1, external_id: 'serv-b' }],
    company_customers: [{ id: ids.customerB, company_id: ids.companyB, organization_id: B, external_id: 'tom-b', customer_data: { tipo: 'pf', documento: '00000000191', nome: 'Pessoa' }, created_at: '2026-11-01T12:00:00Z', updated_at: '2026-11-01T12:00:00Z' }],
    company_certificates: [{ id: id(20), company_id: ids.companyB, organization_id: B, cnpj: CNPJ_B, status: 'active', holder: 'B', issuer: 'AC', serial_number: '1', valid_from: '2026-01-01T00:00:00Z', valid_until: '2027-01-01T00:00:00Z' }],
    company_certificate_material: [{ company_id: ids.companyB, organization_id: B, key_version: 'v1', nonce: 'n', data: 'd' }],
    municipality_agreement_queries: [{ id: id(21), company_id: ids.companyB, organization_id: B, environment: 'production', created_at: '2026-11-01T12:00:00Z' }],
    invoices: [invoice(ids.invoiceB, 'production'), invoice(ids.invoiceBs, 'sandbox')],
    invoice_fiscal_events: [{ id: ids.eventB, invoice_id: ids.invoiceB, organization_id: B, company_id: ids.companyB, code: '101101', status: 'registered', environment: 'production' }],
    invoice_events: [{ id: id(22), invoice_id: ids.invoiceB, organization_id: B, type: 'x', details: {} }],
    nfse_documents: [
      { id: ids.extDocB, ...base('production'), access_key: '5'.repeat(50), invoice_id: null, provider_cnpj: CNPJ_B, taker_document: '00000000191', status: 'authorized', summary: {}, restrictions: [] },
      { id: ids.recDocB, ...base('production'), access_key: '6'.repeat(50), invoice_id: null, provider_cnpj: '99888777000155', taker_document: CNPJ_B, status: 'authorized', summary: {}, restrictions: [] },
    ],
    nfse_document_events: [{ id: id(23), environment: 'production', access_key: '5'.repeat(50), code: '101101', sequence: 1 }],
    adn_sync_cursors: [{ cnpj: CNPJ_B, environment: 'production', next_nsu: 1, status: 'up_to_date', next_query_at: '2026-11-01T12:00:00Z', documents_imported: 0, last_error: null, last_error_code: null, last_query_at: null, first_completed_at: null, last_request: null, request: null }],
    nfse_daily_checks: [], fiscal_xml_files: [], company_readiness_state: [], webhook_endpoints: [], integrations: [{ id: id(30), organization_id: A, name: 'A', active: true }],
    municipalities: [{ ibge_code: '4212254', name: 'Passo de Torres', state: 'SC' }], service_codes: [{ code: '140101', description: 'x' }], nbs_codes: [], countries: [{ iso2: 'BR' }],
  };
}
const belongsToB = (table: string, r: Row) => r['organization_id'] === B || (table === 'companies' && r['id'] === ids.companyB)
  || ((table === 'nfse_documents' || table === 'nfse_document_events') && (r['provider_cnpj'] === CNPJ_B || r['taker_document'] === CNPJ_B || r['access_key'] === '5'.repeat(50) || r['access_key'] === '6'.repeat(50)))
  || (table === 'adn_sync_cursors' && r['cnpj'] === CNPJ_B);

function fakeDb(leaks: string[]) {
  const t = data();
  const builder = (table: string) => {
    const filters: ((r: Row) => boolean)[] = []; let op: 'select' | 'update' | 'delete' | 'insert' | 'upsert' = 'select'; let payload: unknown; let limit = Infinity; let single: 'one' | 'maybe' | null = null; let head = false;
    const rows = () => t[table] ?? [];
    const b: Record<string, unknown> = {};
    const add = (f: (r: Row) => boolean) => { filters.push(f); return b; };
    b['select'] = (_c?: string, o?: { head?: boolean }) => { if (o?.head) head = true; return b; };
    b['eq'] = (k: string, v: unknown) => add(r => r[k] === v); b['neq'] = (k: string, v: unknown) => add(r => r[k] !== v);
    b['is'] = (k: string, v: unknown) => add(r => (r[k] ?? null) === v); b['in'] = (k: string, vs: unknown[]) => add(r => vs.includes(r[k]));
    b['lt'] = (k: string, v: string) => add(r => String(r[k]) < v); b['lte'] = (k: string, v: string) => add(r => String(r[k]) <= v);
    b['gt'] = (k: string, v: string) => add(r => String(r[k]) > v); b['gte'] = (k: string, v: string) => add(r => String(r[k]) >= v);
    b['ilike'] = () => b; b['not'] = () => b; b['order'] = () => b; b['filter'] = (k: string, o: string, v: unknown) => o === 'eq' ? add(r => r[k] === v) : b;
    b['match'] = (m: Row) => add(r => Object.entries(m).every(([k, v]) => r[k] === v));
    b['or'] = (expr: string) => { const parts = expr.split(',').map(p => p.split('.')).filter(p => p[1] === 'eq'); return parts.length ? add(r => parts.some(([k, , ...v]) => String(r[k!]) === v.join('.'))) : b; };
    b['limit'] = (n: number) => { limit = n; return b; }; b['range'] = (a: number, z: number) => { limit = z - a + 1; return b; };
    b['update'] = (v: unknown) => { op = 'update'; payload = v; return b; }; b['delete'] = () => { op = 'delete'; return b; };
    b['insert'] = (v: unknown) => { op = 'insert'; payload = v; return b; }; b['upsert'] = (v: unknown) => { op = 'upsert'; payload = v; return b; };
    b['maybeSingle'] = () => { single = 'maybe'; return b; }; b['single'] = () => { single = 'one'; return b; };
    b['then'] = (ok: (v: unknown) => unknown, ko?: (e: unknown) => unknown) => Promise.resolve().then(() => {
      if (op === 'insert' || op === 'upsert') { for (const r of ([] as Row[]).concat(payload as Row)) if (belongsToB(table, r)) leaks.push(`${op} ${table} de B`); return { data: single ? null : [], error: null, count: 0 }; }
      const hit = rows().filter(r => filters.every(f => f(r)));
      for (const r of hit) if (belongsToB(table, r)) leaks.push(`${op} ${table} ${String(r['id'] ?? r['company_id'] ?? r['cnpj'])}`);
      const out = hit.slice(0, limit);
      if (head) return { data: null, error: null, count: out.length };
      if (single === 'one') return out[0] ? { data: out[0], error: null } : { data: null, error: { code: 'PGRST116', message: 'no rows' } };
      if (single === 'maybe') return { data: out[0] ?? null, error: null };
      return { data: out, error: null, count: out.length };
    }).then(ok, ko);
    return b;
  };
  const rpc = (name: string, args: Record<string, unknown>) => {
    const res = (() => {
      if (name === 'org_proven_cnpj') return t['companies']!.some(c => c['organization_id'] === args['_org'] && c['cnpj'] === args['_cnpj']) && t['company_certificates']!.some(c => c['organization_id'] === args['_org']);
      if (name === 'list_org_notes') return t['invoices']!.filter(i => i['organization_id'] === args['_org'] && i['environment'] === args['_env']).map(i => ({ origin: 'notem', id: i['id'], company_id: i['company_id'], issued_at: i['emitted_at'] }));
      if (name === 'delete_company_if_unused') { const c = t['companies']!.find(x => x['id'] === args['_company'] && x['organization_id'] === args['_org']); if (!c) return 'not_found'; leaks.push('delete_company_if_unused de B'); return 'deleted'; }
      if (['create_invoice_request', 'create_fiscal_event_request', 'replace_company_certificate', 'reserve_dps_number'].includes(name)) { leaks.push(`rpc ${name} chamado`); return null; }
      return null;
    })();
    const p: Record<string, unknown> = { then: (ok: (v: unknown) => unknown, ko?: (e: unknown) => unknown) => Promise.resolve({ data: res, error: null }).then(ok, ko) };
    p['range'] = () => p; return p;
  };
  const storage = { from: () => ({ download: async () => ({ data: null, error: { message: 'not found' } }), upload: async () => ({ data: null, error: null }) }) };
  return { from: (table: string) => builder(table), rpc, storage };
}
function ctx(leaks: string[], method: string, path: string, params: Record<string, string>, body: unknown = {}, env: 'production' | 'sandbox' = 'production') {
  const url = new URL('https://app.notemfiscal.com.br' + path);
  return { db: fakeDb(leaks), requestId: 'req_isolamento', request: new Request(url, { method, headers: { 'Idempotency-Key': 'isolamento-1' } }), url, params, body, env, organization_id: A, integration_id: id(30), integration_name: 'A', actor: id(31), background: () => {}, setCompany: () => {} } as never;
}
async function run(fn: (c: never) => Promise<{ status: number }>, c: never) {
  try { const r = await fn(c); return r.status; } catch (e) { if (e instanceof ApiFailure) return e.status; throw e; }
}

const C = ids.companyB;
type Case = [string, string, string, Record<string, string>, () => Promise<(c: never) => Promise<{ status: number }>>, unknown?];
const companies = () => import('@/lib/api-companies.server'), customers = () => import('@/lib/api-customers.server'), received = () => import('@/lib/api-received.server'), invoices = () => import('@/lib/api-invoices.server');
const cases: Case[] = [
  ['GET', `/api/v1/empresas/${C}`, 'getCompany', { id: C }, async () => (await companies()).getCompany],
  ['PATCH', `/api/v1/empresas/${C}`, 'patchCompany', { id: C }, async () => (await companies()).patchCompany, { razao_social: 'Outra' }],
  ['DELETE', `/api/v1/empresas/${C}`, 'deleteCompany', { id: C }, async () => (await companies()).deleteCompany],
  ['GET', `/api/v1/empresas/${C}/configuracao-fiscal`, 'getFiscal', { id: C }, async () => (await companies()).getFiscal],
  ['PUT', `/api/v1/empresas/${C}/configuracao-fiscal`, 'putFiscal', { id: C }, async () => (await companies()).putFiscal, { simples_nacional: 'mei' }],
  ['GET', `/api/v1/empresas/${C}/certificado`, 'getCertificate', { id: C }, async () => (await companies()).getCertificate],
  ['POST', `/api/v1/empresas/${C}/certificado`, 'postCertificate', { id: C }, async () => (await companies()).postCertificate, { arquivo_base64: 'AAAA', senha: 'x' }],
  ['GET', `/api/v1/empresas/${C}/servicos`, 'listServices', { id: C }, async () => (await companies()).listServices],
  ['POST', `/api/v1/empresas/${C}/servicos`, 'createService', { id: C }, async () => (await companies()).createService, { nome: 'S' }],
  ['GET', `/api/v1/empresas/${C}/servicos/${ids.serviceB}`, 'getService', { id: C, servicoId: ids.serviceB }, async () => (await companies()).getService],
  ['PATCH', `/api/v1/empresas/${C}/servicos/${ids.serviceB}`, 'patchService', { id: C, servicoId: ids.serviceB }, async () => (await companies()).patchService, { nome: 'S2' }],
  ['GET', `/api/v1/empresas/${C}/situacao`, 'getSituation', { id: C }, async () => (await companies()).getSituation],
  ['POST', `/api/v1/empresas/${C}/situacao/verificar-municipio`, 'verifyMunicipality', { id: C }, async () => (await companies()).verifyMunicipality],
  ['GET', `/api/v1/empresas/${C}/tomadores`, 'listCustomers', { id: C }, async () => (await customers()).listCustomers],
  ['POST', `/api/v1/empresas/${C}/tomadores`, 'saveCustomer', { id: C }, async () => (await customers()).saveCustomer, { tipo: 'pf', documento: '00000000191', nome: 'Pessoa' }],
  ['GET', `/api/v1/empresas/${C}/tomadores/${ids.customerB}`, 'getCustomer', { id: C, customerId: ids.customerB }, async () => (await customers()).getCustomer],
  ['PATCH', `/api/v1/empresas/${C}/tomadores/${ids.customerB}`, 'saveCustomer', { id: C, customerId: ids.customerB }, async () => (await customers()).saveCustomer, { nome: 'Outra' }],
  ['GET', `/api/v1/empresas/${C}/sincronizacao`, 'getSync', { id: C }, async () => (await received()).getSync],
  ['GET', `/api/v1/empresas/${C}/notas-recebidas`, 'listReceived', { id: C }, async () => (await received()).listReceived],
  ['GET', `/api/v1/empresas/${C}/notas-recebidas/${ids.recDocB}`, 'getReceived', { id: C, notaId: ids.recDocB }, async () => (await received()).getReceived],
  ['GET', `/api/v1/empresas/${C}/notas-recebidas/${ids.recDocB}/xml`, 'getReceivedXml', { id: C, notaId: ids.recDocB }, async () => (await received()).getReceivedXml],
  ['GET', `/api/v1/empresas/${C}/notas-recebidas/${ids.recDocB}/pdf`, 'getReceivedPdf', { id: C, notaId: ids.recDocB }, async () => (await received()).getReceivedPdf],
  ...[ids.invoiceB, ids.extDocB].flatMap((n): Case[] => [
    ['GET', `/api/v1/notas/${n}`, 'getInvoice', { invoiceId: n }, async () => (await invoices()).getInvoice],
    ['GET', `/api/v1/notas/${n}/xml`, 'getInvoiceXml', { invoiceId: n }, async () => (await invoices()).getInvoiceXml],
    ['GET', `/api/v1/notas/${n}/pdf`, 'getInvoicePdf', { invoiceId: n }, async () => (await invoices()).getInvoicePdf],
    ['GET', `/api/v1/notas/${n}/eventos/101101/xml`, 'getInvoiceEventXml', { invoiceId: n, codigo: '101101' }, async () => (await invoices()).getInvoiceEventXml],
  ]),
  ['POST', `/api/v1/notas/${ids.invoiceB}/cancelar`, 'cancelInvoice', { invoiceId: ids.invoiceB }, async () => (await invoices()).cancelInvoice, { motivo: 'servico_nao_prestado', justificativa: 'Teste de isolamento entre organizações.' }],
  ['POST', `/api/v1/notas/${ids.invoiceB}/solicitar-analise-cancelamento`, 'requestCancellationAnalysis', { invoiceId: ids.invoiceB }, async () => (await invoices()).requestCancellationAnalysis, { motivo: 'servico_nao_prestado', justificativa: 'Teste de isolamento entre organizações.' }],
  ['POST', `/api/v1/notas/${ids.invoiceB}/substituir`, 'substituteInvoice', { invoiceId: ids.invoiceB }, async () => (await invoices()).substituteInvoice, { motivo: 'outros', justificativa: 'Teste de isolamento entre organizações.', competencia: '2026-11-01', servico_id: ids.serviceB, valores: { servico: '10.00' } }],
  ['POST', '/api/v1/notas', 'createInvoice', {}, async () => (await invoices()).createInvoice, { empresa_id: C, servico_id: ids.serviceB, competencia: '2026-11-01', valores: { servico: '10.00' }, tomador_id: ids.customerB }],
];

describe('isolamento entre organizações na API v1 (chave da organização A, IDs da B)', () => {
  for (const env of ['production', 'sandbox'] as const) for (const [method, path, name, params, load, body] of cases) {
    it(`${env} ${method} ${path.replace(/[0-9a-f-]{36}/g, ':id')} (${name}) não alcança dados da B`, async () => {
      const leaks: string[] = []; const status = await run(await load(), ctx(leaks, method, path, params, body ?? {}, env));
      expect(leaks).toEqual([]);
      expect(status >= 200 && status < 300).toBe(false);
      if (method === 'GET') expect(status).toBe(404);
    });
  }
  it('listagens com filtro da B não devolvem nada da B', async () => {
    const leaks: string[] = []; const fns = await invoices();
    const r = await fns.listInvoices(ctx(leaks, 'GET', `/api/v1/notas?empresa_id=${C}`, {}));
    expect(leaks).toEqual([]); expect((r.body as { dados: unknown[] }).dados).toEqual([]);
    const list = await (await companies()).listCompanies(ctx(leaks, 'GET', '/api/v1/empresas?id_externo=ext-b', {}));
    expect(leaks).toEqual([]); expect((list.body as { dados: unknown[] }).dados).toEqual([]);
  });
  it('controle: o mesmo detector acusa uma consulta sem filtro de organização', async () => {
    const leaks: string[] = []; const db = fakeDb(leaks);
    await db.from('companies').select('*').eq('id', C).maybeSingle();
    expect(leaks.length).toBe(1);
  });
});
