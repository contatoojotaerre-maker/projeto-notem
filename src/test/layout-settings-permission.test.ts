// Who may move the NT 009 production start: only the platform administrator, checked on the server with the
// caller's own session before any service-role work (the database repeats the check and writes the audit row).
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { changeNt009Start, readLayoutStatus, LAYOUT_DENIED } from '../lib/platform-settings-admin.server';

const adminRpc = vi.fn(async (_name: string, args: { _value: string }) => ({ data: { nt009r1_production_starts_at: args._value, updated_at: '2026-11-15T19:00:00Z' }, error: null }));
const adminFrom = vi.fn(() => { const q: any = { select: () => q, eq: () => q, maybeSingle: async () => ({ data: { nt009r1_production_starts_at: '2026-12-01T03:00:00+00:00', updated_at: '2026-11-15T19:00:00Z', updated_by: null }, error: null }) }; return q; });
vi.mock('@/integrations/supabase/client.server', () => ({ supabaseAdmin: { rpc: (...a: unknown[]) => adminRpc(...(a as [string, { _value: string }])), from: () => adminFrom() } }));
const USER = '30000000-0000-4000-8000-000000000001';
const session = (platformAdmin: boolean) => ({ rpc: vi.fn(async (name: string) => name === 'is_platform_admin' ? { data: platformAdmin, error: null } : { data: true, error: null }) }) as never;

beforeEach(() => { adminRpc.mockClear(); adminFrom.mockClear(); });
describe('Permissão para alterar a vigência do leiaute', () => {
  for (const role of ['owner', 'admin', 'operator', 'developer', 'viewer'] as const) it(`${role} de organização (sem ser admin da plataforma) é recusado antes do banco`, async () => {
    // has_org_role would answer true for this caller; only is_platform_admin matters.
    expect(await changeNt009Start(session(false), USER, '2027-01-01T00:00:00-03:00')).toEqual({ ok: false, mensagem: LAYOUT_DENIED });
    expect(await readLayoutStatus(session(false))).toEqual({ ok: false, mensagem: LAYOUT_DENIED });
    expect(adminRpc).not.toHaveBeenCalled(); expect(adminFrom).not.toHaveBeenCalled();
  });
  it('administrador da plataforma altera; a data vai em UTC com o autor para auditoria', async () => {
    const r = await changeNt009Start(session(true), USER, '2027-01-01T00:00:00-03:00', Date.parse('2026-12-15T12:00:00Z'));
    expect(adminRpc).toHaveBeenCalledWith('set_nt009_production_start', { _value: '2027-01-01T03:00:00.000Z', _actor: USER });
    expect(r.ok && r.status.current.production.layout).toBe('nt004');
    expect(r.ok && r.status.current.sandbox.layout).toBe('nt009r1');
  });
  it('data inválida é recusada sem chamar o banco', async () => {
    expect(await changeNt009Start(session(true), USER, 'amanhã')).toEqual({ ok: false, mensagem: 'Informe uma data e hora válidas.' });
    expect(adminRpc).not.toHaveBeenCalled();
  });
  it('a recusa do banco é traduzida', async () => {
    adminRpc.mockResolvedValueOnce({ data: null, error: { message: 'SEM_PERMISSAO' } } as never);
    expect(await changeNt009Start(session(true), USER, '2027-01-01T00:00:00-03:00')).toEqual({ ok: false, mensagem: LAYOUT_DENIED });
  });
  it('leitura mostra o leiaute vigente por ambiente', async () => {
    const r = await readLayoutStatus(session(true), Date.parse('2026-11-20T12:00:00Z'));
    expect(r.ok && r.status.current).toEqual({ sandbox: { layout: 'nt009r1', label: 'NT 009 (release 1)' }, production: { layout: 'nt004', label: 'Leiaute atual (XSD de 09/02/2026)' } });
  });
});
