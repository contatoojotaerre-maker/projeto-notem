// ADN synchronization: documents of each CNPJ by NSU, official events by key, and the webhook outbox of applied events.
// All state lives in PostgreSQL (cursor leases, one row per NSU/document/event); the transmissor keeps no state.
import type { Json } from '@/integrations/supabase/types';
import type { DB } from './api.server';
import { callTransmissor, TransmissorError } from './transmissor.server';
import { transmissorPayload } from './invoices.server';
import { invoiceOut, type GovernmentReply, type Invoice } from './invoices';
import { eventsFromReply, readDistributed, type DistributedItem, type ParsedEvent } from './adn-xml';

type Env = 'sandbox' | 'production';
type Cursor = { cnpj: string; environment: Env; next_nsu: number; failures: number; claim_token: string; company_id: string; organization_id: string; actor: string };
type Reply = { resposta?: GovernmentReply };
export const NO_DOCUMENTS_WAIT_MS = 60 * 60_000;
/** Growing wait after failures (5 min, 15 min, 1 h, 3 h, then 6 h); never a short loop. */
export const BACKOFF_MS = [5, 15, 60, 180, 360].map(m => m * 60_000);
export const backoff = (failures: number) => BACKOFF_MS[Math.min(Math.max(failures, 1), BACKOFF_MS.length) - 1]!;

const errorMessages: Record<string, string> = {
  INDISPONIVEL: 'Serviço de transmissão indisponível no momento.', CREDENCIAL: 'Falha de autorização com o serviço de transmissão.',
  ENVELOPE_INVALIDO: 'Certificado da empresa indisponível para a consulta.', AUDITORIA_INDISPONIVEL: 'Não foi possível registrar o uso do certificado.',
  TEMPO_ESGOTADO: 'O governo não respondeu a tempo.', CONEXAO: 'Falha de conexão com o governo.', TLS: 'Falha de conexão segura com o governo.',
  RESPOSTA_INVALIDA: 'Resposta do governo em formato inesperado.', REJEICAO: 'O ADN recusou a consulta.',
};
type Msg = { Codigo?: unknown; Descricao?: unknown; Complemento?: unknown; codigo?: unknown; descricao?: unknown };
const messages = (b: Record<string, unknown>) => [...(Array.isArray(b['Erros']) ? b['Erros'] : []), ...(Array.isArray(b['Alertas']) ? b['Alertas'] : []), ...(Array.isArray(b['erros']) ? b['erros'] : []), ...(Array.isArray(b['erro']) ? b['erro'] : [])] as Msg[];

export type Outcome =
  | { kind: 'documents'; items: Record<string, unknown>[] }
  | { kind: 'none' }
  | { kind: 'error'; code: string; message: string; minWaitMs?: number };

/** Classifies one /v1/adn/dfe reply by the official StatusProcessamento. */
export function classifyDfe(reply: GovernmentReply | undefined): Outcome {
  if (!reply) return { kind: 'error', code: 'RESPOSTA_INVALIDA', message: errorMessages['RESPOSTA_INVALIDA']! };
  if (reply.erro) return { kind: 'error', code: String(reply.erro), message: errorMessages[String(reply.erro)] ?? errorMessages['CONEXAO']! };
  const body = (reply.corpo_json ?? {}) as Record<string, unknown>;
  const status = String(body['StatusProcessamento'] ?? body['statusProcessamento'] ?? '');
  const lote = (Array.isArray(body['LoteDFe']) ? body['LoteDFe'] : Array.isArray(body['loteDFe']) ? body['loteDFe'] : []) as Record<string, unknown>[];
  if (status === 'DOCUMENTOS_LOCALIZADOS' && lote.length) return { kind: 'documents', items: lote };
  if (status === 'NENHUM_DOCUMENTO_LOCALIZADO' || (status === 'DOCUMENTOS_LOCALIZADOS' && !lote.length)) return { kind: 'none' };
  const msgs = messages(body);
  const first = msgs[0]; const text = [first?.Codigo ?? first?.codigo, first?.Descricao ?? first?.descricao, first?.Complemento].filter(Boolean).join(' - ');
  const all = msgs.map(m => `${m.Descricao ?? m.descricao ?? ''} ${m.Complemento ?? ''}`).join(' ');
  const misuse = /consumo indevido/i.test(all);
  const waited = all.match(/(\d+)\s*(minuto|hora)/i); const indicated = waited ? Number(waited[1]) * (/hora/i.test(waited[2]!) ? 3_600_000 : 60_000) : 0;
  if (status === 'REJEICAO' || msgs.length) return { kind: 'error', code: misuse ? 'CONSUMO_INDEVIDO' : String(first?.Codigo ?? first?.codigo ?? 'REJEICAO'), message: text ? `O ADN recusou a consulta: ${text}`.slice(0, 500) : errorMessages['REJEICAO']!, ...(misuse ? { minWaitMs: Math.max(indicated, NO_DOCUMENTS_WAIT_MS) } : {}) };
  return { kind: 'error', code: `HTTP_${reply.status ?? 0}`, message: `O ADN respondeu com situação inesperada (HTTP ${reply.status ?? 0}).` };
}

/** Cursor update for a classified reply. */
export function cursorPatch(o: Outcome, failures: number, now: number, nextNsu?: number) {
  if (o.kind === 'documents') return { status: 'syncing', next_nsu: nextNsu, next_query_at: new Date(now).toISOString(), failures: 0 };
  if (o.kind === 'none') return { status: 'up_to_date', next_query_at: new Date(now + NO_DOCUMENTS_WAIT_MS).toISOString(), failures: 0 };
  const f = failures + 1; const wait = Math.max(backoff(f), o.minWaitMs ?? 0);
  return { status: 'error', next_query_at: new Date(now + wait).toISOString(), failures: f, last_error: o.message, last_error_code: o.code };
}

const itemPayload = (d: DistributedItem) => ({ nsu: d.nsu, document_type: d.document_type, event_type: d.event_type, access_key: d.access_key, generated_at: d.generated_at, ...(d.nfse ? { nfse: d.nfse } : {}), ...(d.event ? { event: d.event } : {}) });

/** Replaces the XML text of official documents/events by a gzip file in the private bucket (the table keeps only the reference). */
export async function withXmlFiles<T extends { xml?: string | null }>(db: DB, env: Env, list: T[], place: (x: T) => { folder: string; name: string }) {
  const { storeXml, xmlPath, sha256Hex } = await import('./xml-files.server');
  const out: (Omit<T, 'xml'> & { xml_file?: unknown })[] = [];
  for (let i = 0; i < list.length; i += 8) {
    out.push(...await Promise.all(list.slice(i, i + 8).map(async x => {
      if (!x.xml) return x;
      const { xml, ...rest } = x; const where = place(x);
      const ref = await storeXml(db, xmlPath(env, where.folder, where.name, await sha256Hex(new TextEncoder().encode(xml))), xml, false);
      return { ...rest, xml_file: ref };
    })));
  }
  return out;
}
const nfsePlace = (n: { access_key: string }) => ({ folder: 'adn/nfse', name: n.access_key });
const eventPlace = (e: { access_key: string; code: string; sequence: number }) => ({ folder: `adn/eventos/${e.access_key}`, name: `${e.code}-${e.sequence}` });
export const eventsWithFiles = (db: DB, env: Env, events: ParsedEvent[]) => withXmlFiles(db, env, events, eventPlace);
async function itemsWithFiles(db: DB, env: Env, items: DistributedItem[]) {
  const nfse = await withXmlFiles(db, env, items.flatMap(i => i.nfse ? [i.nfse] : []), nfsePlace);
  const events = await withXmlFiles(db, env, items.flatMap(i => i.event ? [i.event] : []), eventPlace);
  let a = 0, b = 0;
  return items.map(i => ({ ...itemPayload(i), ...(i.nfse ? { nfse: nfse[a++] } : {}), ...(i.event ? { event: events[b++] } : {}) }));
}

async function certificateBase(db: DB, c: Pick<Cursor, 'company_id' | 'organization_id' | 'actor' | 'environment'>, purpose: string) {
  return transmissorPayload(db, { id: '', company_id: c.company_id, organization_id: c.organization_id, created_by: c.actor, environment: c.environment }, purpose, c.actor);
}

// ---------- Manual synchronization (requested in the panel; the scheduler only continues open requests) ----------
export const MAX_SEARCH_STEPS = 25;
export const SEARCH_GAP_MS = 2_000;
export const SYNC_MONTHS = [1, 3, 6, 12, 24] as const;
export type SyncRequest = { mode: 'news' | 'period'; months: number | null; phase: 'search' | 'download'; lo?: number; hi?: number | null; jump?: number; position?: number; start_nsu?: number; target?: string; steps: number; imported: number; requested_at: string; last_probe_at?: string; [k: string]: unknown };
type Probe = { nsu: number; generated_at: string | null }[];

/** NSU to consult in the next step of the search for the first NSU of the period (by DataHoraGeracao). */
export function searchProbe(r: Pick<SyncRequest, 'lo' | 'hi' | 'jump'>) {
  const lo = r.lo ?? 0;
  if (r.hi === null || r.hi === undefined) return lo + (r.jump ?? 0);
  return r.hi - lo <= 50 ? lo : Math.floor((lo + r.hi) / 2);
}
/** Applies one search answer. Dates grow with the NSU; a batch returns the NSUs from the consulted one onwards. The start NSU is set when known. */
export function applySearchStep(r: SyncRequest, p: number, items: Probe): { request: SyncRequest; start: number | null } {
  const target = Date.parse(r.target ?? ''); const n: SyncRequest = { ...r, steps: r.steps + 1 }; let lo = r.lo ?? 0; let hi = r.hi ?? null; let start: number | null = null;
  const sorted = [...items].sort((a, b) => a.nsu - b.nsu);
  if (!sorted.length) { if (p <= lo) start = lo; else hi = p; }
  else {
    const idx = sorted.findIndex(i => i.generated_at !== null && Date.parse(i.generated_at) >= target);
    if (idx > 0) start = sorted[idx]!.nsu;
    else if (idx === 0) { if (p <= lo) start = sorted[0]!.nsu; else hi = p; }
    else { lo = sorted[sorted.length - 1]!.nsu + 1; if (hi === null) n.jump = n.jump ? n.jump * 2 : 50; }
  }
  if (start === null && hi !== null && lo >= hi) start = lo;
  if (start === null && n.steps >= MAX_SEARCH_STEPS) start = lo;
  n.lo = lo; n.hi = hi;
  return { request: start === null ? n : { ...n, phase: 'download', start_nsu: start, position: start }, start };
}
/** "Novidades" exists only after the first completed synchronization; periods are always offered (default 1 month). */
export function syncOptions(firstCompletedAt: string | null) { return [...(firstCompletedAt ? ['news'] : []), ...SYNC_MONTHS.map(m => `period:${m}`)]; }
const stopMessage = (o: Extract<Outcome, { kind: 'error' }>, phase: string) => o.code === 'CONSUMO_INDEVIDO' ? `O ADN indicou consumo indevido e a sincronização foi interrompida. ${o.message}` : `${phase === 'search' ? 'A busca do início do período foi interrompida' : 'A sincronização foi interrompida'}. ${o.message}`;

const sleep = (ms: number) => new Promise(r => setTimeout(r, ms));
type Claimed = Cursor & { request: SyncRequest | null };
async function runCursor(db: DB, c: Claimed, opts: { deadline: number; now: () => number; wait: (ms: number) => Promise<unknown> }) {
  let req = c.request; let imported = 0;
  if (!req) return { imported, last: 'none' as const };
  const finish = async (items: unknown[], patch: Record<string, unknown>) => {
    const r = await db.rpc('finish_adn_batch', { _cnpj: c.cnpj, _env: c.environment, _token: c.claim_token, _items: items as Json, _patch: patch as Json });
    if (r.error) throw new Error('ADN_BATCH_FAILED');
    const n = Number((r.data as { inserted?: number } | null)?.inserted ?? 0); imported += n; return n;
  };
  const stop = async (o: Extract<Outcome, { kind: 'error' }>) => {
    const message = stopMessage(o, req!.phase);
    await finish([], { ...cursorPatch(o, c.failures, opts.now()), last_error: message, request: null, last_request: { ...req, finished_at: new Date(opts.now()).toISOString(), outcome: 'error', message } });
    return { imported, last: 'error' as const };
  };
  let base: Awaited<ReturnType<typeof certificateBase>>;
  try { base = await certificateBase(db, c, 'sincronização manual com o ADN'); }
  catch (err) { const code = err instanceof TransmissorError ? err.code : 'ENVELOPE_INVALIDO'; return stop({ kind: 'error', code, message: errorMessages[code] ?? errorMessages['ENVELOPE_INVALIDO']! }); }
  const call = async (nsu: number): Promise<Outcome> => {
    try { const r = await callTransmissor<Reply>('/v1/adn/dfe', { ...base, nsu, lote: true, cnpj_consulta: c.cnpj }); return classifyDfe(r.resposta); }
    catch (err) { const code = err instanceof TransmissorError ? err.code : 'INDISPONIVEL'; return { kind: 'error', code: err instanceof TransmissorError && err.status ? `${code}_${err.status}` : code, message: errorMessages[code] ?? errorMessages['INDISPONIVEL']! }; }
  };
  while (opts.now() < opts.deadline) {
    if (req.phase === 'search') {
      const since = req.last_probe_at ? opts.now() - Date.parse(req.last_probe_at) : SEARCH_GAP_MS;
      if (since < SEARCH_GAP_MS) { if (opts.now() + (SEARCH_GAP_MS - since) + 3_000 > opts.deadline) break; await opts.wait(SEARCH_GAP_MS - since); }
      const p = searchProbe(req); const o = await call(p);
      // Misuse or rejection stops the search at once, with a clear message.
      if (o.kind === 'error') return stop(o);
      const items = o.kind === 'documents' ? (await Promise.all(o.items.map(readDistributed))).filter(i => i.nsu !== null).map(i => ({ nsu: i.nsu!, generated_at: i.generated_at })) : [];
      req = { ...applySearchStep(req, p, items).request, last_probe_at: new Date(opts.now()).toISOString() };
      // Search steps without documents never start the 1-hour wait; steps stay at least 2 seconds apart.
      await finish([], { status: 'syncing', failures: 0, next_query_at: new Date(opts.now() + (req.phase === 'search' ? SEARCH_GAP_MS : 0)).toISOString(), request: req, continue: true });
      continue;
    }
    const missing = await db.rpc('adn_next_missing_nsu', { _cnpj: c.cnpj, _env: c.environment, _from: req.position ?? c.next_nsu });
    if (missing.error) throw new Error('ADN_NSU_READ_FAILED');
    const nsu = Number(missing.data ?? req.position ?? 0);
    const o = await call(nsu);
    if (o.kind === 'error') return stop(o);
    if (o.kind === 'none') {
      await finish([], { ...cursorPatch(o, 0, opts.now()), request: null, completed: true, last_request: { ...req, finished_at: new Date(opts.now()).toISOString(), outcome: 'completed' } });
      return { imported, last: 'none' as const };
    }
    const items = await Promise.all(o.items.map(readDistributed)); const valid = items.filter(i => i.nsu !== null);
    if (!valid.length) return stop({ kind: 'error', code: 'RESPOSTA_INVALIDA', message: errorMessages['RESPOSTA_INVALIDA']! });
    const next = Math.max(nsu, ...valid.map(i => i.nsu! + 1));
    req = { ...req, position: next };
    const n = await finish(await itemsWithFiles(db, c.environment, valid), { ...cursorPatch(o, 0, opts.now(), next), request: req, continue: true });
    req = { ...req, imported: req.imported + n };
  }
  await finish([], { status: 'syncing', failures: 0, next_query_at: new Date(opts.now() + (req.phase === 'search' ? SEARCH_GAP_MS : 0)).toISOString(), request: req, continue: false });
  return { imported, last: 'documents' as const };
}

/** Continues open manual requests (scheduler, or right after the click). Never starts a synchronization by itself. */
export async function processAdnSync(db: DB, opts: { maxCursors?: number; budgetMs?: number; now?: () => number; wait?: (ms: number) => Promise<unknown>; cnpj?: string; environment?: Env } = {}) {
  const now = opts.now ?? Date.now; const deadline = now() + (opts.budgetMs ?? 20_000);
  const claims = await db.rpc('claim_adn_cursors', { _limit: opts.maxCursors ?? 3, ...(opts.cnpj ? { _cnpj: opts.cnpj } : {}), ...(opts.environment ? { _env: opts.environment } : {}) });
  if (claims.error) throw new Error('ADN_CLAIM_FAILED');
  let imported = 0, failed = 0;
  for (const c of (claims.data ?? []) as unknown as Claimed[]) {
    try { const r = await runCursor(db, c, { deadline, now, wait: opts.wait ?? sleep }); imported += r.imported; if (r.last === 'error') failed++; }
    catch { failed++; console.error('ADN_SYNC_FAILED', c.environment); }
  }
  return { reserved: claims.data?.length ?? 0, imported, failed };
}

const requestErrors: Record<string, string> = {
  ADN_EM_ANDAMENTO: 'Já existe uma sincronização em andamento para este CNPJ e ambiente.',
  ADN_NOVIDADES_INDISPONIVEL: 'Faça primeiro uma sincronização por período.',
  ADN_PEDIDO_INVALIDO: 'Escolha uma opção de sincronização válida.',
  SEM_PERMISSAO: 'Somente proprietário, administrador da organização ou administrador da plataforma podem sincronizar.',
};
export class SyncRequestError extends Error { constructor(public userMessage: string, public retryAt?: string) { super('ADN_SYNC_REQUEST'); } }
/** Records the request (the database checks the 1-hour ADN interval and open requests) and runs the first steps right away. */
export async function requestAdnSync(db: DB, a: { cnpj: string; environment: Env; mode: 'news' | 'period'; months: number | null; actor: string; organization_id: string; budgetMs?: number }) {
  const r = await db.rpc('request_adn_sync', { _cnpj: a.cnpj, _env: a.environment, _mode: a.mode, _months: a.months as number, _actor: a.actor, _org: a.organization_id });
  if (r.error) {
    const m = r.error.message; const wait = m.match(/ADN_AGUARDE:(\S+)/);
    if (wait) throw new SyncRequestError('O ADN exige intervalo entre consultas. Aguarde para sincronizar novamente.', wait[1]);
    const code = Object.keys(requestErrors).find(k => m.includes(k)); throw new SyncRequestError(code ? requestErrors[code]! : 'Não foi possível iniciar a sincronização.');
  }
  return processAdnSync(db, { cnpj: a.cnpj, environment: a.environment, maxCursors: 1, budgetMs: a.budgetMs ?? 12_000 });
}

/** Applies every official event of a key (ADN by key), with the certificate of the given company. */
export async function refreshInvoiceEvents(db: DB, inv: Pick<Invoice, 'id' | 'company_id' | 'organization_id' | 'created_by' | 'environment' | 'access_key'>, purpose: string, actor = inv.created_by) {
  if (!inv.access_key) return { total: 0, changed: 0 };
  const base = await transmissorPayload(db, inv, purpose, actor);
  const r = await callTransmissor<Reply>('/v1/adn/eventos', { ...base, chave_acesso: inv.access_key });
  const reply = r.resposta ?? {};
  if (reply.status === 404) return { total: 0, changed: 0 };
  if (reply.erro || (reply.status ?? 0) >= 400 || !reply.corpo_json) throw new Error('ADN_EVENTS_FAILED');
  const events = (await eventsFromReply(reply.corpo_json)).filter(e => e.access_key === inv.access_key);
  const s = await db.rpc('store_nfse_events', { _env: inv.environment, _items: await eventsWithFiles(db, inv.environment, events) as unknown as Json, _source: 'adn_eventos' });
  if (s.error) throw new Error('ADN_EVENTS_STORE_FAILED');
  return (s.data as { total: number; changed: number } | null) ?? { total: 0, changed: 0 };
}

// ---------- Daily verification (notem invoices with a pending cancellation) ----------
const brDate = (ms: number) => new Date(ms - 3 * 3_600_000).toISOString().slice(0, 10);
const brHour = (ms: number) => new Date(ms - 3 * 3_600_000).getUTCHours();
export const DAILY_CHECK_HOUR = 6;
/** Once a day (from 06:00 Brasília), consults /v1/adn/eventos only for notem invoices with cancellation in analysis or in verification. */
export async function runDailyEventCheck(db: DB, now = Date.now(), limit = 10) {
  if (brHour(now) < DAILY_CHECK_HOUR) return { ran: false, checked: 0, updated: 0 };
  const beat = await db.from('system_heartbeats').select('last_success_at').eq('name', 'nfse_daily_check').maybeSingle();
  if (beat.data && brDate(Date.parse(beat.data.last_success_at)) === brDate(now)) return { ran: false, checked: 0, updated: 0 };
  const c = await db.rpc('daily_check_candidates', { _limit: limit });
  if (c.error) throw new Error('DAILY_CHECK_READ_FAILED');
  let checked = 0, updated = 0;
  for (const inv of c.data ?? []) {
    const t = await db.rpc('touch_nfse_refresh', { _env: inv.environment, _key: inv.access_key!, _purpose: 'verificacao_diaria', _interval: '20 hours' });
    if (t.error || t.data) continue;
    let changed = false, failed = false;
    try { changed = (await refreshInvoiceEvents(db, inv, 'verificação diária de eventos')).changed > 0; } catch { failed = true; console.error('DAILY_CHECK_FAILED', inv.id); }
    checked++; if (changed) updated++;
    const rec = await db.rpc('record_daily_check', { _date: brDate(now), _company: inv.company_id, _org: inv.organization_id, _env: inv.environment, _updated: changed, _failed: failed });
    if (rec.error) console.error('DAILY_CHECK_RECORD_FAILED');
  }
  if ((c.data?.length ?? 0) < limit) { const stamp = new Date(now).toISOString(); await db.from('system_heartbeats').upsert({ name: 'nfse_daily_check', last_success_at: stamp, updated_at: stamp }); }
  return { ran: true, checked, updated };
}

const refusedByExisting = ['E0840', 'E0802', 'E1805'];
/** Authorized notem invoices whose cancellation was refused because an event already exists: consult the key (at most hourly per invoice). */
export async function reconcileRefusedCancellations(db: DB, limit = 3) {
  const r = await db.from('invoices').select('*').eq('status', 'authorized').not('access_key', 'is', null).eq('cancellation->>situacao', 'recusado').limit(20);
  if (r.error) throw new Error('RECONCILE_READ_FAILED');
  const candidates = (r.data ?? []).filter(i => { const c = i.cancellation as { erros_governo?: { codigo_governo?: string }[] } | null; return (c?.erros_governo ?? []).some(x => refusedByExisting.includes(String(x.codigo_governo))); });
  let checked = 0, changed = 0;
  for (const inv of candidates) {
    if (checked >= limit) break;
    const t = await db.rpc('touch_nfse_refresh' as never, { _env: inv.environment, _key: inv.access_key, _purpose: 'reconciliacao_evento_existente', _interval: '1 hour' } as never) as { data: string | null; error: unknown };
    if (t.error || t.data) continue;
    checked++;
    try { changed += (await refreshInvoiceEvents(db, inv, 'reconciliação de cancelamento registrado fora da notem')).changed; continue; } catch { /* ADN unavailable: confirm the cancellation directly */ }
    try {
      const base = await transmissorPayload(db, inv, 'reconciliação de cancelamento registrado fora da notem');
      const c = await callTransmissor<Reply>('/v1/nfse/evento/consultar', { ...base, chave_acesso: inv.access_key, tipo_evento: '101101', num_seq_evento: '1' });
      if (c.resposta?.status !== 200) continue;
      const events = (await eventsFromReply(c.resposta.corpo_json)).filter(e => e.access_key === inv.access_key && e.code === '101101');
      if (!events.length) continue;
      const s = await db.rpc('store_nfse_events' as never, { _env: inv.environment, _items: await eventsWithFiles(db, inv.environment, events) as unknown as Json, _source: 'sefin_consulta' } as never) as { data: { changed: number } | null; error: unknown };
      if (!s.error) changed += s.data?.changed ?? 0;
    } catch { console.error('RECONCILE_CONSULT_FAILED', inv.id); }
  }
  return { checked, changed };
}

/** Outbox: emits the webhook of each applied event once (notem invoices only). */
export async function flushNfseEventWebhooks(db: DB, limit = 20) {
  const r = await db.from('nfse_document_events' as never).select('id,invoice_id').not('webhook_type', 'is', null).is('webhook_emitted_at', null).order('created_at').limit(limit) as unknown as { data: { id: string; invoice_id: string | null }[] | null; error: unknown };
  if (r.error) throw new Error('OUTBOX_READ_FAILED');
  let emitted = 0;
  for (const e of r.data ?? []) {
    if (!e.invoice_id) continue;
    const inv = await db.from('invoices').select('*').eq('id', e.invoice_id).maybeSingle();
    if (inv.error || !inv.data) continue;
    const w = await db.rpc('emit_nfse_event_webhook' as never, { _event: e.id, _nota: invoiceOut(inv.data) as Json } as never) as { data: number | null; error: unknown };
    if (w.error) { console.error('OUTBOX_EMIT_FAILED'); continue; }
    emitted += w.data ?? 0;
  }
  return { emitted };
}
