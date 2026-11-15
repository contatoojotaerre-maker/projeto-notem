// Manual ADN synchronization: who may start it, checked on the server with the caller's own session
// before any service-role work (the database repeats the check in request_adn_sync).
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { startCompanySync, SYNC_DENIED } from '../lib/adn-sync-request.server';

const requestAdnSync = vi.fn(async () => ({ imported: 3, failed: 0 }));
vi.mock('@/integrations/supabase/client.server', () => ({ supabaseAdmin: { service: true } }));
vi.mock('../lib/notes.server', () => ({ proven: vi.fn(async () => true) }));
vi.mock('../lib/adn-sync.server', () => ({ requestAdnSync: (...a: unknown[]) => requestAdnSync(...(a as [])), SyncRequestError: class extends Error { userMessage = ''; } }));

const ORG_A = '20000000-0000-4000-8000-00000000000a';
const ORG_B = '20000000-0000-4000-8000-00000000000b';
const COMPANY_A = '10000000-0000-4000-8000-00000000000a';
const USER = '30000000-0000-4000-8000-000000000001';
type Role = 'owner' | 'admin' | 'operator' | 'developer' | 'viewer';

/** Caller session double with the same semantics as is_platform_admin, has_org_role and the companies RLS policy. */
function session(member: { org: string; role: Role } | null, platformAdmin = false) {
  const isMember = (org: string) => member?.org === org;
  const rpc = vi.fn(async (name: string, args: { org_id?: string; roles?: string[] } = {}) => {
    if (name === 'is_platform_admin') return { data: platformAdmin, error: null };
    if (name === 'has_org_role') return { data: isMember(args.org_id ?? '') && (args.roles ?? []).includes(member!.role), error: null };
    return { data: null, error: { message: 'unexpected rpc' } };
  });
  const filters: Record<string, string> = {};
  const q: Record<string, unknown> = {};
  q['select'] = () => q; q['eq'] = (k: string, v: string) => { filters[k] = v; return q; };
  q['maybeSingle'] = async () => {
    const visible = platformAdmin || isMember(ORG_A);
    return { data: visible && filters['id'] === COMPANY_A && filters['organization_id'] === ORG_A ? { id: COMPANY_A, cnpj: '11.222.333/0001-81' } : null, error: null };
  };
  return { rpc, from: vi.fn(() => q) } as never;
}
const run = (caller: never) => startCompanySync(caller, USER, { organization_id: ORG_A, company_id: COMPANY_A, environment: 'production', option: 'period:1' });

beforeEach(() => requestAdnSync.mockClear());

describe('Permissão da sincronização manual (servidor)', () => {
  for (const role of ['operator', 'developer', 'viewer'] as const) it(`${role} é recusado antes de qualquer consulta ao ADN`, async () => {
    const r = await run(session({ org: ORG_A, role }));
    expect(r).toEqual({ ok: false, mensagem: SYNC_DENIED });
    expect(requestAdnSync).not.toHaveBeenCalled();
  });
  it('membro de outra organização (mesmo proprietário lá) é recusado', async () => {
    const r = await run(session({ org: ORG_B, role: 'owner' }));
    expect(r).toEqual({ ok: false, mensagem: SYNC_DENIED });
    expect(requestAdnSync).not.toHaveBeenCalled();
  });
  for (const role of ['owner', 'admin'] as const) it(`${role} da organização é aceito`, async () => {
    const r = await run(session({ org: ORG_A, role }));
    expect(r).toEqual({ ok: true, imported: 3, failed: false });
    expect(requestAdnSync).toHaveBeenCalledTimes(1);
    expect(requestAdnSync).toHaveBeenCalledWith({ service: true }, { cnpj: '11222333000181', environment: 'production', mode: 'period', months: 1, actor: USER, organization_id: ORG_A });
  });
  it('administrador da plataforma (sem ser membro) é aceito', async () => {
    const r = await run(session(null, true));
    expect(r).toEqual({ ok: true, imported: 3, failed: false });
    expect(requestAdnSync).toHaveBeenCalledTimes(1);
  });
});
