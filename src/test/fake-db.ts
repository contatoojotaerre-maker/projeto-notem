import { vi } from 'vitest';
/** Minimal table-aware Supabase double: each table returns a fixed row (or a function result). */
export function tableDb(tables: Record<string, unknown>, rpc: (name: string, args: Record<string, unknown>) => { data: unknown; error: unknown } = () => ({ data: null, error: null })) {
  const calls: { name: string; args: Record<string, unknown> }[] = []; const inserts: { table: string; row: unknown }[] = [];
  const builder = (table: string) => {
    const b: Record<string, unknown> = {};
    for (const m of ['select', 'eq', 'is', 'order', 'limit', 'range', 'gte', 'lte', 'lt', 'match', 'ilike', 'update']) b[m] = () => b;
    const value = () => { const v = tables[table]; return typeof v === 'function' ? (v as () => unknown)() : v ?? null; };
    b['maybeSingle'] = async () => ({ data: value(), error: null }); b['single'] = b['maybeSingle'];
    b['insert'] = async (row: unknown) => { inserts.push({ table, row }); return { error: null }; };
    return b;
  };
  const files = new Map<string, Uint8Array>();
  const storage = { from: () => ({
    upload: vi.fn(async (path: string, body: Blob) => { files.set(path, new Uint8Array(await body.arrayBuffer())); return { data: { path }, error: null }; }),
    download: vi.fn(async (path: string) => files.has(path) ? { data: new Blob([files.get(path)! as BlobPart]), error: null } : { data: null, error: { message: 'not found' } }),
  }) };
  const db = { from: vi.fn((t: string) => builder(t)), rpc: vi.fn(async (name: string, args: Record<string, unknown>) => { calls.push({ name, args }); return rpc(name, args); }), storage };
  return { db: db as never, calls, inserts, rpc: db.rpc, files };
}
export const ids = { organization_id: '20000000-0000-4000-8000-000000000001', company_id: '10000000-0000-4000-8000-000000000001', integration_id: '10000000-0000-4000-8000-000000000008', profile_id: '10000000-0000-4000-8000-000000000007', invoice_id: '10000000-0000-4000-8000-000000000009' };
export const company = { id: ids.company_id, organization_id: ids.organization_id, cnpj: '11222333000181', municipality_ibge_code: '4212254', municipal_registration: '', phone: '', email: '', active: true };
export const settings = { company_id: ids.company_id, organization_id: ids.organization_id, cnpj: '11222333000181', simples_nacional_option: 3, simples_nacional_regime: 1, special_tax_regime: 0, dps_series: 900, approx_taxes_mode: 'percent_simples', approx_simples_percent: 6, approx_federal_percent: null, approx_state_percent: null, approx_municipal_percent: null, simples_iss_withholding_percent: null, print_danfse_receipt: false };
export const profile = { id: ids.profile_id, company_id: ids.company_id, organization_id: ids.organization_id, name: 'Vistoria', active: true, service_code: '140101', municipal_tax_code: null, nbs_code: null, default_description: 'Vistoria de demonstração', iss_taxation: 1, immunity_type: null, iss_withholding: 1 };
export function apiCtx(db: unknown, body: unknown, path = '/api/v1/notas', params: Record<string, string> = {}) {
  const url = new URL('https://app.notemfiscal.com.br' + path);
  return { db, body, url, params, env: 'sandbox', organization_id: ids.organization_id, integration_id: ids.integration_id, integration_name: 'Teste', actor: '30000000-0000-4000-8000-000000000001', requestId: 'req_test', background: () => {}, setCompany: () => {}, request: new Request(url, { method: 'POST', headers: { 'Idempotency-Key': 'chave-teste-1' } }) } as never;
}
