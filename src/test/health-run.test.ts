import { describe, it, expect, vi, beforeEach } from 'vitest';
import { generateKeyPair, SignJWT } from 'jose';
import { runHealthCheck, type HealthDeps } from '../lib/health.server';
import type { HealthSnapshot } from '../lib/health-policy';

const NOW = Date.parse('2026-11-18T12:00:00Z');
const snap = (): HealthSnapshot => ({ now: new Date(NOW).toISOString(), heartbeats: { webhook_scheduler: new Date(NOW - 60_000).toISOString(), nfse_daily_check: new Date(NOW - 3_600_000).toISOString(), daily_routine: new Date(NOW - 3_600_000).toISOString() }, last_scheduler_run: null, daily_today: null, queue: {}, api_5xx: {}, stuck_invoices: [], stuck_events: [], certificates: [], government: [] });

/** Minimal chainable fake: records every write and answers reads from `tables`. */
function fakeDb(opts: { claim?: string; alerts?: unknown[]; enabled?: boolean; recipients?: string[] } = {}) {
  const writes: { table: string; op: string; value: unknown }[] = []; const rpcs: string[] = [];
  const reads: Record<string, unknown> = { health_checks: null, health_alerts: opts.alerts ?? [], platform_settings: { health_alert_recipients: opts.recipients ?? ['a@ex.com'], health_alerts_enabled: opts.enabled ?? true } };
  const from = (table: string) => {
    const q: Record<string, unknown> = {};
    const chain = () => q;
    Object.assign(q, { select: chain, order: chain, limit: chain, eq: chain, in: chain,
      maybeSingle: async () => ({ data: reads[table] ?? null, error: null }),
      then: (ok: (v: unknown) => unknown) => Promise.resolve({ data: reads[table] ?? [], error: null }).then(ok),
      insert: (value: unknown) => { writes.push({ table, op: 'insert', value }); return Promise.resolve({ error: null }); },
      upsert: (value: unknown) => { writes.push({ table, op: 'upsert', value }); return Promise.resolve({ error: null }); },
      update: (value: unknown) => { writes.push({ table, op: 'update', value }); return { eq: async () => ({ error: null }), in: async () => ({ error: null }) }; } });
    return q;
  };
  const rpc = vi.fn(async (name: string) => { rpcs.push(name); if (name === 'claim_health_run') return { data: opts.claim ?? 'ok', error: null }; if (name === 'health_snapshot') return { data: snap(), error: null }; return { data: null, error: null }; });
  return { db: { from, rpc } as never, writes, rpcs };
}
const deps = (over: Partial<HealthDeps> = {}): HealthDeps => ({ ping: async () => ({ ok: false, ms: null, version: null }), send: vi.fn(async () => ({ ok: true as const })), now: () => NOW, ...over });

describe('Verificação da saúde', () => {
  beforeEach(() => vi.spyOn(console, 'error').mockImplementation(() => {}));
  it('"Verificar agora" dentro de 1 minuto é recusado sem rodar nada', async () => {
    const f = fakeDb({ claim: 'limite' }); const d = deps();
    expect(await runHealthCheck(f.db, 'manual', 'u1', d)).toEqual({ status: 'limite' });
    expect(f.rpcs).toEqual(['claim_health_run']); expect(d.send).not.toHaveBeenCalled();
  });
  it('agendada: guarda o resultado, marca o batimento usado pelo ping e libera a vez', async () => {
    const f = fakeDb();
    const r = await runHealthCheck(f.db, 'agendada', null, deps({ ping: async () => ({ ok: true, ms: 80, version: '5' }) }));
    expect(r).toEqual({ status: 'ok', overall: 'ok' });
    expect(f.writes.find(w => w.table === 'health_checks')?.value).toMatchObject({ trigger: 'agendada', overall: 'ok' });
    expect(f.writes.find(w => w.table === 'system_heartbeats')?.value).toMatchObject({ name: 'health_check' });
    expect(f.rpcs).toEqual(expect.arrayContaining(['cleanup_health_data', 'release_health_run']));
  });
  it('falha do Resend é registrada na tela e a verificação termina normalmente', async () => {
    const send = vi.fn(async () => ({ ok: false as const, error: 'RESEND_HTTP_500' }));
    // Second failure in a row → Problema → e-mail attempt fails.
    const prev = { result: { memory: { transmissorFailures: 1, exhausted24h: {} } } };
    const f3 = fakeDb(); const origFrom = (f3.db as unknown as { from: (t: string) => Record<string, unknown> }).from;
    (f3.db as unknown as { from: (t: string) => unknown }).from = (t: string) => { const q = origFrom(t); if (t === 'health_checks') q['maybeSingle'] = async () => ({ data: prev, error: null }); return q; };
    const r3 = await runHealthCheck(f3.db, 'agendada', null, deps({ send }));
    expect(r3).toEqual({ status: 'ok', overall: 'problema' });
    expect(send).toHaveBeenCalledTimes(1);
    expect(f3.writes.filter(w => w.table === 'health_runtime').map(w => w.value)).toContainEqual(expect.objectContaining({ last_email_error: 'RESEND_HTTP_500' }));
    expect(f3.writes.filter(w => w.table === 'health_alerts' && w.op === 'update').map(w => w.value)).toContainEqual(expect.objectContaining({ send_error: 'RESEND_HTTP_500' }));
    expect(f3.rpcs).toContain('release_health_run');
  });
  it('avisos desligados: o problema é guardado, nenhum e-mail sai', async () => {
    const prev = { result: { memory: { transmissorFailures: 1, exhausted24h: {} } } };
    const f = fakeDb({ enabled: false }); const orig = (f.db as unknown as { from: (t: string) => Record<string, unknown> }).from;
    (f.db as unknown as { from: (t: string) => unknown }).from = (t: string) => { const q = orig(t); if (t === 'health_checks') q['maybeSingle'] = async () => ({ data: prev, error: null }); return q; };
    const d = deps(); await runHealthCheck(f.db, 'agendada', null, d);
    expect(d.send).not.toHaveBeenCalled();
    expect(f.writes.find(w => w.table === 'health_alerts' && w.op === 'upsert')?.value).toEqual([expect.objectContaining({ key: 'transmissor', state: 'problema' })]);
  });
});

// Routes: OIDC with the health audience; ping without details.
const signing = await generateKeyPair('RS256');
vi.mock('jose', async (original) => { const actual = await original<typeof import('jose')>(); return { ...actual, createRemoteJWKSet: () => async () => signing.publicKey }; });
const email = 'scheduler@notem-test.iam.gserviceaccount.com';
const token = (aud: string) => new SignJWT({ email, email_verified: true }).setProtectedHeader({ alg: 'RS256' }).setIssuer('https://accounts.google.com').setAudience(aud).setSubject('123456').setIssuedAt().setExpirationTime('5m').sign(signing.privateKey);
describe('Rota da verificação (OIDC)', async () => {
  const { verifyScheduler, healthAudience, schedulerAudience } = await import('../lib/webhook-scheduler.server');
  const account = JSON.stringify({ client_email: email, client_id: '123456' });
  it('aceita só a audiência da Saúde; o token da rotina de webhooks é recusado', async () => {
    expect(healthAudience).toBe('https://app.notemfiscal.com.br/api/public/saude/verificar');
    expect(await verifyScheduler(new Request(healthAudience, { headers: { Authorization: `Bearer ${await token(healthAudience)}` } }), account, healthAudience)).toBe(true);
    expect(await verifyScheduler(new Request(healthAudience, { headers: { Authorization: `Bearer ${await token(schedulerAudience)}` } }), account, healthAudience)).toBe(false);
    expect(await verifyScheduler(new Request(schedulerAudience, { headers: { Authorization: `Bearer ${await token(healthAudience)}` } }), account)).toBe(false);
  });
  it('sem token do Google: 401 sem rodar a verificação', async () => {
    vi.stubEnv('GOOGLE_SERVICE_ACCOUNT_JSON', account);
    const { Route } = await import('../routes/api/public/saude/verificar');
    const post = (Route.options as unknown as { server: { handlers: { POST: (a: { request: Request }) => Promise<Response> } } }).server.handlers.POST;
    const res = await post({ request: new Request(healthAudience, { method: 'POST' }) });
    expect(res.status).toBe(401); expect(await res.json()).toEqual({ erro: 'AUTENTICACAO_INVALIDA' }); expect(res.headers.get('Cache-Control')).toBe('no-store');
    vi.unstubAllEnvs();
  });
});
