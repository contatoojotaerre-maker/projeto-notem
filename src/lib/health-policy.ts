// System health (platform administration): every limit lives here and is shown on the screen as text.
// Pure module — evaluation, alert planning and the e-mail content are unit-tested without the database.

export const HEALTH_LIMITS = {
  transmissor: { slowMs: 3000, failuresForProblem: 2, timeoutMs: 10_000 },
  government: { attentionSuccess: 0.9, attentionAvgMs: 10_000, problemSuccess: 0.5, problemMinCalls: 5, consecutiveFailures: 3 },
  scheduler: { attentionMinutes: 3, problemMinutes: 10 },
  daily: { attentionHours: 26, problemHours: 50 },
  queue: { lateAfterMinutes: 5, attentionLate: 20, problemLate: 100 },
  stuck: { verifyingMinutes: 30, verifyingProblemMinutes: 120, cancellationHours: 24 },
  api5xx: { attentionHour: 5, problemHour: 20 },
  certificates: { windowDays: 30, attentionDays: 15 },
  reminderHours: 6,
  pingMaxMinutes: 15,
  recipientsMax: 5,
} as const;

export type HealthState = 'ok' | 'atencao' | 'problema' | 'neutro';
export type Env = 'production' | 'sandbox';
export type GovSystem = 'sefin' | 'adn';
export type GovService = 'emissao' | 'consulta' | 'evento' | 'distribuicao';
export type GovOutcome = 'respondeu' | 'erro_governo' | 'conexao' | 'tempo_esgotado';
export type BlockId = 'transmissor' | 'governo' | 'rotina_webhooks' | 'verificacao_diaria' | 'fila_webhooks' | 'notas_paradas' | 'erros_api' | 'certificados';

type Named = { organization: string; organization_slug: string; company: string; company_id: string };
export type HealthSnapshot = {
  now: string;
  heartbeats: Record<string, string>;
  last_scheduler_run: { at: string; reserved: number; completed: number; failed: number; error: string | null } | null;
  daily_today: { checked: number; updated: number; failed: number; last_at: string | null } | null;
  queue: Partial<Record<Env, { pending: number; late: number; exhausted_24h: number }>>;
  api_5xx: Partial<Record<Env, { hour: number; day: number }>>;
  stuck_invoices: (Named & { id: string; environment: Env; since: string })[];
  stuck_events: (Named & { id: string; invoice_id: string; environment: Env; code: string; since: string })[];
  certificates: (Named & { id: string; cnpj: string; valid_until: string })[];
  government: { environment: Env; system: GovSystem; service: GovService; total: number; answered: number; avg_ms: number | null; last_at: string; last_outcomes: GovOutcome[] | null }[];
};
export type TransmissorPing = { ok: boolean; ms: number | null; version: string | null };

export type Problem = { key: string; title: string; detail: string; block: BlockId };
export type Line = { label: string; value: string; state?: HealthState };
export type Block = { id: BlockId; title: string; state: HealthState; lines: Line[]; lastInfoAt: string | null; limits: string; items: { text: string; state: HealthState; href?: string }[] };
export type HealthResult = {
  overall: 'ok' | 'atencao' | 'problema';
  checkedAt: string;
  blocks: Block[];
  attention: { block: BlockId; title: string; state: 'atencao' | 'problema'; text: string }[];
  problems: Problem[];
  /** Carried to the next verification ("2 seguidas", "crescendo"). */
  memory: { transmissorFailures: number; exhausted24h: Partial<Record<Env, number>> };
  transmissor: TransmissorPing;
};

export const ENV_LABEL: Record<Env, string> = { production: 'Produção', sandbox: 'Homologação' };
export const SERVICE_LABEL: Record<GovService, string> = { emissao: 'emissão', consulta: 'consulta', evento: 'evento', distribuicao: 'distribuição' };
export const SYSTEM_LABEL: Record<GovSystem, string> = { sefin: 'Sefin', adn: 'ADN' };
const rank: Record<HealthState, number> = { neutro: 0, ok: 0, atencao: 1, problema: 2 };
export const worst = (states: HealthState[]): HealthState => states.reduce<HealthState>((a, b) => (rank[b] > rank[a] ? b : a), 'ok');
const minutes = (from: string | null | undefined, now: number) => (from ? (now - Date.parse(from)) / 60_000 : null);
const pct = (n: number) => `${Math.round(n * 100)}%`;
const int = (n: number) => String(n).replace(/\B(?=(\d{3})+(?!\d))/g, '.');
/** Brasília (UTC-3, no daylight saving) — same fixed rule the rest of the panel uses. */
export const brDateTime = (iso: string | null | undefined) => {
  if (!iso) return '—';
  const d = new Date(Date.parse(iso) - 3 * 3_600_000);
  const p = (n: number) => String(n).padStart(2, '0');
  return `${p(d.getUTCDate())}/${p(d.getUTCMonth() + 1)}/${d.getUTCFullYear()} ${p(d.getUTCHours())}:${p(d.getUTCMinutes())}`;
};
const ago = (mins: number | null) => mins === null ? 'nunca' : mins < 60 ? `há ${Math.max(0, Math.floor(mins))} min` : mins < 48 * 60 ? `há ${Math.floor(mins / 60)} h` : `há ${Math.floor(mins / 1440)} dias`;
const L = HEALTH_LIMITS;

export function evaluateTransmissor(ping: TransmissorPing, previousFailures: number) {
  const failures = ping.ok ? 0 : previousFailures + 1;
  const state: HealthState = !ping.ok ? (failures >= L.transmissor.failuresForProblem ? 'problema' : 'atencao') : (ping.ms ?? 0) > L.transmissor.slowMs ? 'atencao' : 'ok';
  return { state, failures };
}

export type GovRow = HealthSnapshot['government'][number];
export function evaluateGovernmentRow(r: GovRow): HealthState {
  if (!r.total) return 'neutro';
  const rate = r.answered / r.total; const g = L.government;
  const last = r.last_outcomes ?? [];
  const streak = last.length >= g.consecutiveFailures && last.slice(0, g.consecutiveFailures).every(o => o === 'conexao' || o === 'tempo_esgotado');
  if ((r.total >= g.problemMinCalls && rate < g.problemSuccess) || streak) return 'problema';
  if (rate < g.attentionSuccess || (r.avg_ms ?? 0) > g.attentionAvgMs) return 'atencao';
  return 'ok';
}
export function evaluateAge(mins: number | null, attention: number, problem: number): HealthState {
  if (mins === null) return 'problema';
  return mins > problem ? 'problema' : mins > attention ? 'atencao' : 'ok';
}
export function evaluateQueue(q: { late: number; exhausted_24h: number }, previousExhausted: number | undefined): HealthState {
  const growing = previousExhausted !== undefined && q.exhausted_24h > previousExhausted;
  if (q.late > L.queue.problemLate || growing) return 'problema';
  return q.late > L.queue.attentionLate ? 'atencao' : 'ok';
}
const count = (n: number, one: string, many: string) => `${int(n)} ${n === 1 ? one : many}`;
export function evaluateApi5xx(hour: number): HealthState { return hour >= L.api5xx.problemHour ? 'problema' : hour >= L.api5xx.attentionHour ? 'atencao' : 'ok'; }
export function evaluateCertificate(validUntil: string, now: number): HealthState {
  const days = (Date.parse(validUntil) - now) / 86_400_000;
  return days <= 0 ? 'problema' : days <= L.certificates.attentionDays ? 'atencao' : 'neutro';
}
export function evaluateStuck(invoices: { since: string }[], events: { since: string }[], now: number): HealthState {
  if (invoices.some(i => (minutes(i.since, now) ?? 0) > L.stuck.verifyingProblemMinutes)) return 'problema';
  return invoices.length || events.length ? 'atencao' : 'ok';
}

const ENVS: Env[] = ['production', 'sandbox'];
const govKey = (r: Pick<GovRow, 'environment' | 'system' | 'service'>) => `governo:${r.environment}:${r.system}:${r.service}`;
const noteHref = (slug: string, id: string) => `/o/${slug}/notas/${id}`;

export function evaluateHealth(input: { snapshot: HealthSnapshot; ping: TransmissorPing; previous: HealthResult['memory'] | null; now?: number }): HealthResult {
  const s = input.snapshot; const now = input.now ?? Date.parse(s.now); const prev = input.previous;
  const blocks: Block[] = []; const problems: Problem[] = [];
  const push = (b: Block) => blocks.push(b);

  // Transmissor
  const t = evaluateTransmissor(input.ping, prev?.transmissorFailures ?? 0);
  push({ id: 'transmissor', title: 'Transmissor', state: t.state, lastInfoAt: new Date(now).toISOString(),
    limits: `Atenção: resposta acima de ${L.transmissor.slowMs / 1000} s ou uma falha. Problema: falha em ${L.transmissor.failuresForProblem} verificações seguidas.`,
    lines: [{ label: 'Situação', value: input.ping.ok ? 'Respondendo' : 'Não respondeu' }, { label: 'Versão', value: input.ping.version ?? '—' }, { label: 'Tempo de resposta', value: input.ping.ms === null ? '—' : `${int(input.ping.ms)} ms` }, { label: 'Falhas seguidas', value: String(t.failures) }], items: [] });
  if (t.state === 'problema') problems.push({ key: 'transmissor', block: 'transmissor', title: 'transmissor não responde', detail: `O transmissor falhou em ${t.failures} verificações seguidas.` });

  // Government (real calls only)
  const gov = [...s.government].sort((a, b) => (a.environment + a.system + a.service).localeCompare(b.environment + b.system + b.service));
  const govItems = gov.map(r => { const st = evaluateGovernmentRow(r); return { r, st }; });
  for (const { r, st } of govItems) if (st === 'problema') problems.push({ key: govKey(r), block: 'governo', title: `${SYSTEM_LABEL[r.system]} (${SERVICE_LABEL[r.service]}) com falhas em ${ENV_LABEL[r.environment].toLowerCase()}`, detail: `${int(r.answered)} de ${int(r.total)} chamadas responderam na última hora; tempo médio ${r.avg_ms === null ? '—' : `${int(r.avg_ms)} ms`}.` });
  push({ id: 'governo', title: 'Governo (Sefin e ADN)', state: govItems.length ? worst(govItems.map(g => g.st)) : 'neutro', lastInfoAt: gov.reduce<string | null>((a, r) => (!a || r.last_at > a ? r.last_at : a), null),
    limits: `Só chamadas reais da última hora. Atenção: sucesso abaixo de ${pct(L.government.attentionSuccess)} ou tempo médio acima de ${L.government.attentionAvgMs / 1000} s. Problema: sucesso abaixo de ${pct(L.government.problemSuccess)} com pelo menos ${L.government.problemMinCalls} chamadas, ou ${L.government.consecutiveFailures} erros de conexão/tempo esgotado seguidos. Recusas de regra contam como resposta do governo.`,
    lines: govItems.length ? [] : [{ label: 'Última hora', value: 'Sem chamadas recentes', state: 'neutro' }],
    items: govItems.map(({ r, st }) => ({ state: st, text: `${ENV_LABEL[r.environment]} · ${SYSTEM_LABEL[r.system]} · ${SERVICE_LABEL[r.service]}: ${pct(r.total ? r.answered / r.total : 0)} de sucesso em ${int(r.total)} chamadas, média ${r.avg_ms === null ? '—' : `${int(r.avg_ms)} ms`}` })) });

  // Webhook routine (Cloud Scheduler, every minute)
  const wh = s.heartbeats['webhook_scheduler'] ?? null; const whMin = minutes(wh, now);
  const whState = evaluateAge(whMin, L.scheduler.attentionMinutes, L.scheduler.problemMinutes); const run = s.last_scheduler_run;
  push({ id: 'rotina_webhooks', title: 'Rotina de webhooks', state: whState, lastInfoAt: wh,
    limits: `Roda a cada minuto. Atenção: mais de ${L.scheduler.attentionMinutes} min sem rodar. Problema: mais de ${L.scheduler.problemMinutes} min.`,
    lines: [{ label: 'Última execução', value: `${brDateTime(wh)} (${ago(whMin)})` }, { label: 'Último ciclo com trabalho', value: run ? `${brDateTime(run.at)} · ${count(run.reserved, 'reservado', 'reservados')}, ${count(run.completed, 'concluído', 'concluídos')}, ${count(run.failed, 'falha', 'falhas')}${run.error ? ' · com erro' : ''}` : '—' }], items: [] });
  if (whState === 'problema') problems.push({ key: 'rotina_webhooks', block: 'rotina_webhooks', title: 'rotina de webhooks parada', detail: wh ? `A rotina não roda desde ${brDateTime(wh)} (Brasília).` : 'A rotina nunca registrou execução.' });

  // Daily verification
  const daily = s.heartbeats['nfse_daily_check'] ?? null; const routine = s.heartbeats['daily_routine'] ?? null;
  const dState = worst([evaluateAge(minutes(daily, now), L.daily.attentionHours * 60, L.daily.problemHours * 60), evaluateAge(minutes(routine, now), L.daily.attentionHours * 60, L.daily.problemHours * 60)]);
  const dt = s.daily_today;
  push({ id: 'verificacao_diaria', title: 'Verificação diária', state: dState, lastInfoAt: daily,
    limits: `Roda uma vez por dia a partir das 06:00. Atenção: mais de ${L.daily.attentionHours} h sem rodar. Problema: mais de ${L.daily.problemHours} h.`,
    lines: [{ label: 'Cancelamentos e análises', value: `${brDateTime(daily)} (${ago(minutes(daily, now))})` }, { label: 'Resultado de hoje', value: dt ? `${count(dt.checked, 'nota consultada', 'notas consultadas')}, ${count(dt.updated, 'atualizada', 'atualizadas')}, ${count(dt.failed, 'falha', 'falhas')}` : '—' }, { label: 'Certificados e prontidão', value: `${brDateTime(routine)} (${ago(minutes(routine, now))})` }], items: [] });
  if (dState === 'problema') problems.push({ key: 'verificacao_diaria', block: 'verificacao_diaria', title: 'verificação diária parada', detail: `Última verificação de notas: ${brDateTime(daily)}; última rotina de certificados: ${brDateTime(routine)} (Brasília).` });

  // Webhook queue
  const exhausted: Partial<Record<Env, number>> = {}; const qItems: Block['items'] = [];
  for (const env of ENVS) {
    const q = s.queue[env] ?? { pending: 0, late: 0, exhausted_24h: 0 }; exhausted[env] = q.exhausted_24h;
    const st = evaluateQueue(q, prev?.exhausted24h?.[env]);
    qItems.push({ state: st, text: `${ENV_LABEL[env]}: ${count(q.pending, 'pendente', 'pendentes')}, ${count(q.late, 'atrasado', 'atrasados')}, ${count(q.exhausted_24h, 'esgotado', 'esgotados')} em 24 h` });
    if (st === 'problema') problems.push({ key: `fila_webhooks:${env}`, block: 'fila_webhooks', title: `fila de webhooks com atraso em ${ENV_LABEL[env].toLowerCase()}`, detail: `${int(q.late)} entregas atrasadas e ${int(q.exhausted_24h)} esgotadas nas últimas 24 h.` });
  }
  push({ id: 'fila_webhooks', title: 'Fila de webhooks', state: worst(qItems.map(i => i.state)), lastInfoAt: s.now, items: qItems, lines: [],
    limits: `Atrasado: vencido há mais de ${L.queue.lateAfterMinutes} min. Atenção: mais de ${L.queue.attentionLate} atrasados. Problema: mais de ${L.queue.problemLate} atrasados ou esgotados aumentando desde a verificação anterior.` });

  // Stuck notes (all organizations)
  const stState = evaluateStuck(s.stuck_invoices, s.stuck_events, now);
  push({ id: 'notas_paradas', title: 'Notas paradas', state: stState, lastInfoAt: s.now, lines: [{ label: 'Em verificação há mais de 30 min', value: int(s.stuck_invoices.length) }, { label: 'Cancelamentos sem resposta há mais de 24 h', value: int(s.stuck_events.length) }],
    limits: `Atenção: qualquer nota em verificação há mais de ${L.stuck.verifyingMinutes} min ou cancelamento sem resposta há mais de ${L.stuck.cancellationHours} h. Problema: nota em verificação há mais de ${L.stuck.verifyingProblemMinutes / 60} h.`,
    items: [...s.stuck_invoices.map(i => ({ state: ((minutes(i.since, now) ?? 0) > L.stuck.verifyingProblemMinutes ? 'problema' : 'atencao') as HealthState, href: noteHref(i.organization_slug, i.id), text: `${i.organization} · ${i.company} · ${ENV_LABEL[i.environment]} · em verificação ${ago(minutes(i.since, now))}` })),
      ...s.stuck_events.map(e => ({ state: 'atencao' as HealthState, href: noteHref(e.organization_slug, e.invoice_id), text: `${e.organization} · ${e.company} · ${ENV_LABEL[e.environment]} · ${e.code === '101103' ? 'análise fiscal' : 'cancelamento'} sem resposta ${ago(minutes(e.since, now))}` }))] });
  if (stState === 'problema') { const old = s.stuck_invoices.filter(i => (minutes(i.since, now) ?? 0) > L.stuck.verifyingProblemMinutes); problems.push({ key: 'notas_paradas', block: 'notas_paradas', title: 'notas paradas em verificação', detail: `${int(old.length)} nota(s) em verificação há mais de 2 h: ${old.slice(0, 5).map(i => `${i.organization} / ${i.company}`).join('; ')}${old.length > 5 ? '…' : ''}.` }); }

  // API 5xx
  const aItems: Block['items'] = [];
  for (const env of ENVS) {
    const a = s.api_5xx[env] ?? { hour: 0, day: 0 }; const st = evaluateApi5xx(a.hour);
    aItems.push({ state: st, text: `${ENV_LABEL[env]}: ${int(a.hour)} na última hora, ${int(a.day)} nas últimas 24 h` });
    if (st === 'problema') problems.push({ key: `erros_api:${env}`, block: 'erros_api', title: `erros da notem na API em ${ENV_LABEL[env].toLowerCase()}`, detail: `${int(a.hour)} respostas com erro interno (5xx) na última hora.` });
  }
  push({ id: 'erros_api', title: 'Erros da notem (5xx) na API', state: worst(aItems.map(i => i.state)), lastInfoAt: s.now, items: aItems, lines: [],
    limits: `Atenção: ${L.api5xx.attentionHour} ou mais na última hora. Problema: ${L.api5xx.problemHour} ou mais na última hora.` });

  // Certificates (active companies)
  const cItems = s.certificates.map(c => { const st = evaluateCertificate(c.valid_until, now); const days = Math.ceil((Date.parse(c.valid_until) - now) / 86_400_000); return { c, st, days }; });
  for (const { c, st } of cItems) if (st === 'problema') problems.push({ key: `certificado:${c.id}`, block: 'certificados', title: `certificado vencido de ${c.company}`, detail: `O certificado de ${c.company} (${c.organization}) venceu em ${brDateTime(c.valid_until)} e a empresa está ativa.` });
  push({ id: 'certificados', title: 'Certificados', state: cItems.length ? worst(cItems.map(i => i.st)) : 'ok', lastInfoAt: s.now, lines: [{ label: 'Vencidos', value: int(cItems.filter(i => i.st === 'problema').length) }, { label: `Vencendo em até ${L.certificates.windowDays} dias`, value: int(cItems.filter(i => i.st !== 'problema').length) }],
    limits: `Só empresas ativas. Atenção: vence em até ${L.certificates.attentionDays} dias. Problema: vencido.`,
    items: cItems.map(({ c, st, days }) => ({ state: st, href: `/o/${c.organization_slug}/empresas/${c.company_id}`, text: `${c.organization} · ${c.company} · ${st === 'problema' ? `venceu em ${brDateTime(c.valid_until).slice(0, 10)}` : `vence em ${days} dia${days === 1 ? '' : 's'} (${brDateTime(c.valid_until).slice(0, 10)})`}` })) });

  const attention = blocks.filter(b => b.state === 'atencao' || b.state === 'problema').map(b => ({ block: b.id, title: b.title, state: b.state as 'atencao' | 'problema', text: b.items.find(i => i.state === b.state)?.text ?? b.limits }));
  const o = worst(blocks.map(b => b.state));
  return { overall: o === 'neutro' ? 'ok' : o, checkedAt: new Date(now).toISOString(), blocks, attention, problems, memory: { transmissorFailures: t.failures, exhausted24h: exhausted }, transmissor: input.ping };
}

// ---------- Alert state and e-mails ----------
export type AlertRow = { key: string; title: string; state: 'problema' | 'ok'; since: string; details: { detail?: string }; last_notified_at: string | null; last_notified_kind: 'problema' | 'lembrete' | 'resolvido' | null; resolved_at: string | null };
export type EmailKind = 'problema' | 'lembrete' | 'resolvido';
export type AlertEmailItem = { key: string; title: string; detail: string; since: string };
export type AlertPlan = { upserts: AlertRow[]; emails: Partial<Record<EmailKind, AlertEmailItem[]>> };

/**
 * One e-mail when an alert enters "Problema", a reminder every 6 h while it stays there and "Resolvido"
 * when it leaves (only if a problem e-mail was delivered). Nothing is repeated between verifications;
 * with alerts switched off states are still tracked, and pending problems are e-mailed once switched on.
 */
export function planAlerts(existing: AlertRow[], problems: Problem[], nowMs: number, sending: boolean): AlertPlan {
  const now = new Date(nowMs).toISOString(); const byKey = new Map(existing.map(a => [a.key, a]));
  const upserts: AlertRow[] = []; const emails: AlertPlan['emails'] = {};
  const add = (k: EmailKind, i: AlertEmailItem) => { (emails[k] ??= []).push(i); };
  const current = new Set(problems.map(p => p.key));
  for (const p of problems) {
    const a = byKey.get(p.key);
    if (!a || a.state === 'ok') {
      const row: AlertRow = { key: p.key, title: p.title, state: 'problema', since: now, details: { detail: p.detail }, last_notified_at: null, last_notified_kind: null, resolved_at: null };
      upserts.push(row); if (sending) add('problema', { key: p.key, title: p.title, detail: p.detail, since: now });
      continue;
    }
    upserts.push({ ...a, title: p.title, details: { detail: p.detail } });
    if (!sending) continue;
    if (!a.last_notified_at) add('problema', { key: p.key, title: p.title, detail: p.detail, since: a.since });
    else if (nowMs - Date.parse(a.last_notified_at) >= HEALTH_LIMITS.reminderHours * 3_600_000) add('lembrete', { key: p.key, title: p.title, detail: p.detail, since: a.since });
  }
  for (const a of existing) {
    if (a.state !== 'problema' || current.has(a.key)) continue;
    upserts.push({ ...a, state: 'ok', resolved_at: now });
    if (sending && a.last_notified_at && a.last_notified_kind !== 'resolvido') add('resolvido', { key: a.key, title: a.title, detail: a.details?.detail ?? '', since: a.since });
  }
  return { upserts, emails };
}

const esc = (v: string) => v.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;');
export const EMAIL_LOGO = 'https://app.notemfiscal.com.br/brand/email/notem-logo-email.png';
const SUBJECT_PREFIX: Record<EmailKind | 'teste', string> = { problema: 'Problema', lembrete: 'Lembrete: problema continua', resolvido: 'Resolvido', teste: 'Teste' };
const INTRO: Record<EmailKind | 'teste', string> = {
  problema: 'A verificação automática da notem encontrou um problema.',
  lembrete: 'Este problema continua sem solução desde o último aviso.',
  resolvido: 'Este problema foi resolvido e a situação voltou ao normal.',
  teste: 'Este é um e-mail de teste dos avisos da Saúde do sistema. Se você recebeu, os avisos chegarão a este endereço.',
};
const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);

/** White background, fixed logo, Portuguese; carries only titles, times, organization/company names and the screen link. */
export function buildAlertEmail(kind: EmailKind | 'teste', items: AlertEmailItem[], screenUrl: string) {
  const first = items[0];
  const subject = kind === 'teste' ? '[notem] Teste dos avisos da Saúde do sistema' : `[notem] ${SUBJECT_PREFIX[kind]}: ${items.length === 1 && first ? first.title : `${items.length} avisos`}`;
  const rows = items.map(i => `<tr><td style="padding:12px 0;border-top:1px solid #e5e7eb"><p style="margin:0 0 4px;font-weight:700;color:#111827;font-size:15px">${esc(cap(i.title))}</p><p style="margin:0 0 4px;color:#374151;font-size:14px;line-height:1.5">${esc(i.detail)}</p><p style="margin:0;color:#6b7280;font-size:13px">Desde ${esc(brDateTime(i.since))} (Brasília)</p></td></tr>`).join('');
  const html = `<!doctype html><html lang="pt-BR"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width"><title>${esc(subject)}</title></head><body style="margin:0;padding:0;background:#ffffff;font-family:Arial,Helvetica,sans-serif"><table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#ffffff"><tr><td align="center" style="padding:32px 16px"><table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:560px"><tr><td style="padding-bottom:24px"><img src="${EMAIL_LOGO}" width="140" height="31" alt="notem" style="display:block;border:0"></td></tr><tr><td><p style="margin:0 0 16px;color:#111827;font-size:15px;line-height:1.5">${esc(INTRO[kind])}</p></td></tr>${rows ? `<tr><td><table role="presentation" width="100%" cellpadding="0" cellspacing="0">${rows}</table></td></tr>` : ''}<tr><td style="padding-top:24px"><a href="${esc(screenUrl)}" style="display:inline-block;background:#111827;color:#ffffff;text-decoration:none;padding:12px 20px;border-radius:8px;font-size:14px;font-weight:700">Abrir Saúde do sistema</a></td></tr><tr><td style="padding-top:24px;color:#6b7280;font-size:12px;line-height:1.5">Aviso automático da notem para os administradores da plataforma.</td></tr></table></td></tr></table></body></html>`;
  const text = [INTRO[kind], '', ...items.map(i => `- ${cap(i.title)}: ${i.detail} (desde ${brDateTime(i.since)}, Brasília)`), '', `Saúde do sistema: ${screenUrl}`].join('\n');
  return { subject, html, text };
}

/** Recipients: trimmed, lower case, unique, at most five valid addresses. */
export const RECIPIENT_PATTERN = /^[^@\s]+@[^@\s]+\.[^@\s]+$/;
export function normalizeRecipients(list: string[]): { ok: true; recipients: string[] } | { ok: false; mensagem: string } {
  const out: string[] = [];
  for (const raw of list) { const e = raw.trim().toLowerCase(); if (!e) continue; if (e.length > 254 || !RECIPIENT_PATTERN.test(e)) return { ok: false, mensagem: `E-mail inválido: ${raw.trim().slice(0, 60)}.` }; if (!out.includes(e)) out.push(e); }
  if (out.length > HEALTH_LIMITS.recipientsMax) return { ok: false, mensagem: `Cadastre no máximo ${HEALTH_LIMITS.recipientsMax} e-mails.` };
  return { ok: true, recipients: out };
}

/** /api/public/saude/ping: only says whether the last scheduled verification is recent. */
export function pingAnswer(lastScheduled: string | null, nowMs: number): { status: 200 | 503; body: { status: 'ok' | 'verificacao_atrasada' } } {
  const fresh = !!lastScheduled && nowMs - Date.parse(lastScheduled) < HEALTH_LIMITS.pingMaxMinutes * 60_000;
  return fresh ? { status: 200, body: { status: 'ok' } } : { status: 503, body: { status: 'verificacao_atrasada' } };
}
