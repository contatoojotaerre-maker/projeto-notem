import { vi } from 'vitest';
type Ref = { owner_table: string; owner_id: string; kind: string; path: string; size: number; stored_size: number; sha256: string };
/** In-memory private bucket plus fiscal_xml_files: seeds are stored lazily (gzip + SHA-256) before the first reference read. */
export function xmlStore() {
  const files = new Map<string, Uint8Array>(); const refs: Ref[] = [];
  const storage = { from: () => ({
    upload: vi.fn(async (path: string, body: Uint8Array) => { files.set(path, new Uint8Array(body)); return { data: { path }, error: null }; }),
    download: vi.fn(async (path: string) => { const b = files.get(path); return b ? { data: { arrayBuffer: async () => b.slice().buffer }, error: null } : { data: null, error: { message: 'not found' } }; }),
  }) };
  const seeds: { owner_table: string; owner_id: string; kind: string; xml: string }[] = [];
  async function flush() { const { storeXml, xmlPath, sha256Hex } = await import('../lib/xml-files.server'); while (seeds.length) { const s = seeds.shift()!; const ref = await storeXml({ storage } as never, xmlPath('sandbox', `teste/${s.owner_table}/${s.owner_id}`, s.kind, await sha256Hex(new TextEncoder().encode(s.xml))), s.xml); refs.push({ owner_table: s.owner_table, owner_id: s.owner_id, kind: s.kind, ...ref }); } }
  const refsQuery = () => {
    const f: [string, (v: unknown) => boolean][] = []; const q: Record<string, unknown> = {};
    q['select'] = () => q; q['eq'] = (k: string, v: unknown) => { f.push([k, x => x === v]); return q; }; q['in'] = (k: string, vs: unknown[]) => { f.push([k, x => vs.includes(x)]); return q; };
    q['then'] = (ok: (v: unknown) => unknown, ko?: (e: unknown) => unknown) => flush().then(() => ({ data: refs.filter(r => f.every(([k, t]) => t((r as Record<string, unknown>)[k]))), error: null })).then(ok, ko);
    return q;
  };
  const seed = (owner_table: string, owner_id: string, kind: string, xml: string) => { seeds.push({ owner_table, owner_id, kind, xml }); };
  const read = async (ref: { path: string; sha256: string }) => { const { readXml } = await import('../lib/xml-files.server'); return readXml({ storage } as never, ref); };
  return { storage, files, refs, refsQuery, seed, read };
}
/** Minimal table-aware Supabase double: each table returns a fixed row (or a function result). */
export function tableDb(tables: Record<string, unknown>, rpc: (name: string, args: Record<string, unknown>) => { data: unknown; error: unknown } = () => ({ data: null, error: null })) {
  const calls: { name: string; args: Record<string, unknown> }[] = []; const inserts: { table: string; row: unknown }[] = [];
  const builder = (table: string) => {
    const b: Record<string, unknown> = {};
    for (const m of ['select', 'eq', 'is', 'in', 'or', 'not', 'order', 'limit', 'range', 'gte', 'lte', 'lt', 'match', 'ilike', 'update', 'upsert']) b[m] = () => b;
    const value = () => { const v = tables[table]; return typeof v === 'function' ? (v as () => unknown)() : v ?? null; };
    b['maybeSingle'] = async () => ({ data: value(), error: null }); b['single'] = b['maybeSingle'];
    b['insert'] = async (row: unknown) => { inserts.push({ table, row }); return { error: null }; };
    return b;
  };
  const x = xmlStore();
  const db = { from: vi.fn((t: string) => t === 'fiscal_xml_files' ? x.refsQuery() : builder(t)), rpc: vi.fn(async (name: string, args: Record<string, unknown>) => { calls.push({ name, args }); return rpc(name, args); }), storage: x.storage };
  return { db: db as never, calls, inserts, rpc: db.rpc, files: x.files, seed: x.seed, read: x.read };
}
export const ids = { organization_id: '20000000-0000-4000-8000-000000000001', company_id: '10000000-0000-4000-8000-000000000001', integration_id: '10000000-0000-4000-8000-000000000008', profile_id: '10000000-0000-4000-8000-000000000007', invoice_id: '10000000-0000-4000-8000-000000000009' };
export const company = { id: ids.company_id, organization_id: ids.organization_id, cnpj: '11222333000181', municipality_ibge_code: '4212254', municipal_registration: '', phone: '', email: '', active: true };
export const settings = { company_id: ids.company_id, organization_id: ids.organization_id, cnpj: '11222333000181', simples_nacional_option: 3, simples_nacional_regime: 1, special_tax_regime: 0, dps_series: 900, approx_taxes_mode: 'percent_simples', approx_simples_percent: 6, approx_federal_percent: null, approx_state_percent: null, approx_municipal_percent: null, simples_iss_withholding_percent: null, print_danfse_receipt: false };
export const profile = { id: ids.profile_id, company_id: ids.company_id, organization_id: ids.organization_id, name: 'Vistoria', active: true, service_code: '140101', municipal_tax_code: null, nbs_code: null, default_description: 'Vistoria de demonstração', iss_taxation: 1, immunity_type: null, iss_withholding: 1 };
export function apiCtx(db: unknown, body: unknown, path = '/api/v1/notas', params: Record<string, string> = {}) {
  const url = new URL('https://app.notemfiscal.com.br' + path);
  return { db, body, url, params, env: 'sandbox', organization_id: ids.organization_id, integration_id: ids.integration_id, integration_name: 'Teste', actor: '30000000-0000-4000-8000-000000000001', requestId: 'req_test', background: () => {}, setCompany: () => {}, request: new Request(url, { method: 'POST', headers: { 'Idempotency-Key': 'chave-teste-1' } }) } as never;
}
