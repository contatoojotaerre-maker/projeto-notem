import { describe, it, expect } from 'vitest';
import { buildAlertEmail, evaluateAge, evaluateApi5xx, evaluateCertificate, evaluateGovernmentRow, evaluateHealth, evaluateQueue, evaluateStuck, evaluateTransmissor, HEALTH_LIMITS, normalizeRecipients, pingAnswer, planAlerts, type AlertRow, type HealthSnapshot } from '@/lib/health-policy';

const NOW = Date.parse('2026-11-18T12:00:00Z');
const iso = (msAgo: number) => new Date(NOW - msAgo).toISOString();
const MIN = 60_000, H = 3_600_000, D = 86_400_000;
const snapshot = (over: Partial<HealthSnapshot> = {}): HealthSnapshot => ({
  now: new Date(NOW).toISOString(),
  heartbeats: { webhook_scheduler: iso(MIN), nfse_daily_check: iso(3 * H), daily_routine: iso(5 * H) },
  last_scheduler_run: null, daily_today: { checked: 2, updated: 1, failed: 0, last_at: iso(3 * H) },
  queue: { production: { pending: 1, late: 0, exhausted_24h: 0 }, sandbox: { pending: 0, late: 0, exhausted_24h: 0 } },
  api_5xx: { production: { hour: 0, day: 1 }, sandbox: { hour: 0, day: 0 } },
  stuck_invoices: [], stuck_events: [], certificates: [], government: [], ...over,
});
const named = { organization: 'Org A', organization_slug: 'org-a', company: 'Empresa A', company_id: 'c1' };
const gov = (total: number, answered: number, avg_ms: number | null = 500, last: ('respondeu' | 'conexao' | 'tempo_esgotado' | 'erro_governo')[] = ['respondeu']) =>
  ({ environment: 'production' as const, system: 'sefin' as const, service: 'emissao' as const, total, answered, avg_ms, last_at: iso(MIN), last_outcomes: last });

describe('Limites de cada bloco', () => {
  it('transmissor: lento é atenção, 1 falha é atenção, 2 seguidas é problema', () => {
    expect(evaluateTransmissor({ ok: true, ms: 3000, version: '5' }, 0).state).toBe('ok');
    expect(evaluateTransmissor({ ok: true, ms: 3001, version: '5' }, 0).state).toBe('atencao');
    expect(evaluateTransmissor({ ok: false, ms: null, version: null }, 0)).toEqual({ state: 'atencao', failures: 1 });
    expect(evaluateTransmissor({ ok: false, ms: null, version: null }, 1)).toEqual({ state: 'problema', failures: 2 });
    expect(evaluateTransmissor({ ok: true, ms: 100, version: '5' }, 3).failures).toBe(0);
  });
  it('governo: sem chamadas é neutro; 90% e 10 s; 50% com 5 chamadas; 3 erros de conexão seguidos', () => {
    expect(evaluateGovernmentRow(gov(0, 0, null, []))).toBe('neutro');
    expect(evaluateGovernmentRow(gov(10, 9))).toBe('ok');
    expect(evaluateGovernmentRow(gov(10, 8))).toBe('atencao');
    expect(evaluateGovernmentRow(gov(10, 10, 10_001))).toBe('atencao');
    expect(evaluateGovernmentRow(gov(4, 1))).toBe('atencao');
    expect(evaluateGovernmentRow(gov(5, 2))).toBe('problema');
    expect(evaluateGovernmentRow(gov(20, 17, 500, ['conexao', 'tempo_esgotado', 'conexao']))).toBe('problema');
    expect(evaluateGovernmentRow(gov(20, 18, 500, ['conexao', 'erro_governo', 'conexao']))).toBe('ok');
  });
  it('rotina de webhooks: 3 e 10 minutos; nunca rodou é problema', () => {
    expect(evaluateAge(3, 3, 10)).toBe('ok'); expect(evaluateAge(3.1, 3, 10)).toBe('atencao'); expect(evaluateAge(10.1, 3, 10)).toBe('problema'); expect(evaluateAge(null, 3, 10)).toBe('problema');
  });
  it('verificação diária: 26 h atenção e 50 h problema', () => {
    const at = (h: number) => evaluateHealth({ snapshot: snapshot({ heartbeats: { webhook_scheduler: iso(MIN), nfse_daily_check: iso(h * H), daily_routine: iso(H) } }), ping: { ok: true, ms: 50, version: '5' }, previous: null, now: NOW }).blocks.find(b => b.id === 'verificacao_diaria')!.state;
    expect(at(26)).toBe('ok'); expect(at(26.1)).toBe('atencao'); expect(at(50.1)).toBe('problema');
  });
  it('fila: atrasados 20/100 e esgotados aumentando', () => {
    expect(evaluateQueue({ late: 20, exhausted_24h: 3 }, 3)).toBe('ok');
    expect(evaluateQueue({ late: 21, exhausted_24h: 0 }, 0)).toBe('atencao');
    expect(evaluateQueue({ late: 101, exhausted_24h: 0 }, 0)).toBe('problema');
    expect(evaluateQueue({ late: 0, exhausted_24h: 4 }, 3)).toBe('problema');
    expect(evaluateQueue({ late: 0, exhausted_24h: 4 }, undefined)).toBe('ok');
  });
  it('notas paradas: qualquer uma é atenção; em verificação há mais de 2 h é problema', () => {
    expect(evaluateStuck([], [], NOW)).toBe('ok');
    expect(evaluateStuck([{ since: iso(31 * MIN) }], [], NOW)).toBe('atencao');
    expect(evaluateStuck([], [{ since: iso(25 * H) }], NOW)).toBe('atencao');
    expect(evaluateStuck([{ since: iso(121 * MIN) }], [], NOW)).toBe('problema');
  });
  it('erros 5xx: 5 e 20 na última hora', () => {
    expect(evaluateApi5xx(4)).toBe('ok'); expect(evaluateApi5xx(5)).toBe('atencao'); expect(evaluateApi5xx(19)).toBe('atencao'); expect(evaluateApi5xx(20)).toBe('problema');
  });
  it('certificados: até 15 dias atenção, vencido problema', () => {
    expect(evaluateCertificate(iso(-20 * D), NOW)).toBe('neutro'); expect(evaluateCertificate(iso(-15 * D), NOW)).toBe('atencao'); expect(evaluateCertificate(iso(1000), NOW)).toBe('problema');
  });
});

describe('Resultado geral', () => {
  it('tudo em dia: "Tudo funcionando" e governo "Sem chamadas recentes"', () => {
    const r = evaluateHealth({ snapshot: snapshot(), ping: { ok: true, ms: 120, version: '5' }, previous: null, now: NOW });
    expect(r.overall).toBe('ok'); expect(r.problems).toEqual([]);
    const g = r.blocks.find(b => b.id === 'governo')!; expect(g.state).toBe('neutro'); expect(g.lines[0]?.value).toBe('Sem chamadas recentes');
  });
  it('certificado vencido em empresa ativa vira problema com aviso próprio', () => {
    const r = evaluateHealth({ snapshot: snapshot({ certificates: [{ ...named, id: 'k1', cnpj: '11222333000181', valid_until: iso(D) }] }), ping: { ok: true, ms: 120, version: '5' }, previous: null, now: NOW });
    expect(r.overall).toBe('problema'); expect(r.problems.map(p => p.key)).toEqual(['certificado:k1']);
    expect(JSON.stringify(r.problems)).not.toContain('11222333000181');
  });
  it('limites aparecem como texto na tela', () => {
    const r = evaluateHealth({ snapshot: snapshot(), ping: { ok: true, ms: 1, version: '5' }, previous: null, now: NOW });
    expect(r.blocks.find(b => b.id === 'transmissor')!.limits).toContain('3 s');
    expect(r.blocks.find(b => b.id === 'erros_api')!.limits).toContain('20 ou mais');
  });
});

const problem = { key: 'transmissor', block: 'transmissor' as const, title: 'transmissor não responde', detail: 'Falhou 2 vezes.' };
const row = (over: Partial<AlertRow>): AlertRow => ({ key: 'transmissor', title: problem.title, state: 'problema', since: iso(H), details: { detail: 'x' }, last_notified_at: iso(H), last_notified_kind: 'problema', resolved_at: null, ...over });
describe('Avisos por e-mail', () => {
  it('um e-mail ao entrar em Problema', () => {
    const p = planAlerts([], [problem], NOW, true);
    expect(p.emails.problema?.map(i => i.key)).toEqual(['transmissor']); expect(p.upserts[0]?.state).toBe('problema');
  });
  it('nada repetido na verificação seguinte', () => {
    expect(planAlerts([row({ last_notified_at: iso(5 * MIN) })], [problem], NOW, true).emails).toEqual({});
  });
  it('lembrete depois de 6 h em Problema', () => {
    expect(planAlerts([row({ last_notified_at: iso(6 * H - 1000) })], [problem], NOW, true).emails).toEqual({});
    expect(planAlerts([row({ last_notified_at: iso(6 * H) })], [problem], NOW, true).emails.lembrete?.length).toBe(1);
  });
  it('"Resolvido" quando sai de Problema, só se houve aviso', () => {
    const p = planAlerts([row({})], [], NOW, true);
    expect(p.emails.resolvido?.map(i => i.key)).toEqual(['transmissor']); expect(p.upserts[0]).toMatchObject({ state: 'ok', resolved_at: new Date(NOW).toISOString() });
    expect(planAlerts([row({ last_notified_at: null, last_notified_kind: null })], [], NOW, true).emails).toEqual({});
  });
  it('desligados: estado guardado, nenhum e-mail; ao religar, problema em aberto é avisado', () => {
    const off = planAlerts([], [problem], NOW, false); expect(off.emails).toEqual({}); expect(off.upserts).toHaveLength(1);
    expect(planAlerts([row({ last_notified_at: null, last_notified_kind: null })], [problem], NOW, true).emails.problema?.length).toBe(1);
  });
  it('conteúdo: assunto curto, logo fixa, fundo branco, texto escapado', () => {
    const m = buildAlertEmail('problema', [{ key: 'k', title: 'transmissor não responde', detail: '<script>x</script>', since: iso(H) }], 'https://app.notemfiscal.com.br/admin/saude-do-sistema');
    expect(m.subject).toBe('[notem] Problema: transmissor não responde');
    expect(m.html).toContain('https://app.notemfiscal.com.br/brand/email/notem-logo-email.png'); expect(m.html).toContain('background:#ffffff');
    expect(m.html).not.toContain('<script>'); expect(m.html).toContain('&lt;script&gt;'); expect(m.html).toContain('/admin/saude-do-sistema');
  });
});

describe('Destinatários e vigia externo', () => {
  it('valida, normaliza e limita a 5', () => {
    expect(normalizeRecipients([' A@Ex.com ', 'a@ex.com', ''])).toEqual({ ok: true, recipients: ['a@ex.com'] });
    expect(normalizeRecipients(['sem-arroba']).ok).toBe(false);
    expect(normalizeRecipients(['1@a.co', '2@a.co', '3@a.co', '4@a.co', '5@a.co']).ok).toBe(true);
    expect(normalizeRecipients(['1@a.co', '2@a.co', '3@a.co', '4@a.co', '5@a.co', '6@a.co'])).toEqual({ ok: false, mensagem: 'Cadastre no máximo 5 e-mails.' });
  });
  it('ping: 200 abaixo de 15 min, 503 acima ou sem verificação', () => {
    expect(pingAnswer(iso(14 * MIN), NOW)).toEqual({ status: 200, body: { status: 'ok' } });
    expect(pingAnswer(iso(15 * MIN), NOW)).toEqual({ status: 503, body: { status: 'verificacao_atrasada' } });
    expect(pingAnswer(null, NOW).status).toBe(503);
    expect(HEALTH_LIMITS.pingMaxMinutes).toBe(15);
  });
});
