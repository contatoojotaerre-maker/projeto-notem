// ADN synchronization: documents of each CNPJ by NSU, official events by key, and the webhook outbox of applied events.
// All state lives in PostgreSQL (cursor leases, one row per NSU/document/event); the transmissor keeps no state.
import type { Json } from '@/integrations/supabase/types';
import type { DB } from './api.server';
import { callTransmissor, TransmissorError } from './transmissor.server';
import { transmissorPayload } from './invoices.server';
import { invoiceOut, type GovernmentReply, type Invoice } from './invoices';
import { eventsFromReply, readDistributed, type DistributedItem } from './adn-xml';

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

async function certificateBase(db: DB, c: Pick<Cursor, 'company_id' | 'organization_id' | 'actor' | 'environment'>, purpose: string) {
  return transmissorPayload(db, { id: '', company_id: c.company_id, organization_id: c.organization_id, created_by: c.actor, environment: c.environment }, purpose, c.actor);
}

async function syncCursor(db: DB, c: Cursor, opts: { maxBatches: number; deadline: number; now: () => number }) {
  let nsu = Number(c.next_nsu); let imported = 0; let batches = 0; let last: Outcome['kind'] = 'none';
  const finish = async (items: unknown[], patch: Record<string, unknown>) => {
    const r = await db.rpc('finish_adn_batch' as never, { _cnpj: c.cnpj, _env: c.environment, _token: c.claim_token, _items: items as Json, _patch: patch as Json } as never);
    if ((r as { error: unknown }).error) throw new Error('ADN_BATCH_FAILED');
    imported += Number(((r as { data: { inserted?: number } | null }).data)?.inserted ?? 0);
  };
  let base: Awaited<ReturnType<typeof certificateBase>>;
  try { base = await certificateBase(db, c, 'sincronização automática com o ADN'); }
  catch (err) { const code = err instanceof TransmissorError ? err.code : 'ENVELOPE_INVALIDO'; await finish([], cursorPatch({ kind: 'error', code, message: errorMessages[code] ?? errorMessages['ENVELOPE_INVALIDO']! }, c.failures, opts.now())); return { imported, batches, last: 'error' as const }; }
  while (batches < opts.maxBatches) {
    batches++;
    let outcome: Outcome;
    try { const r = await callTransmissor<Reply>('/v1/adn/dfe', { ...base, nsu, lote: true, cnpj_consulta: c.cnpj }); outcome = classifyDfe(r.resposta); }
    catch (err) { const code = err instanceof TransmissorError ? err.code : 'INDISPONIVEL'; outcome = { kind: 'error', code: err instanceof TransmissorError && err.status ? `${code}_${err.status}` : code, message: errorMessages[code] ?? errorMessages['INDISPONIVEL']! }; }
    last = outcome.kind;
    if (outcome.kind !== 'documents') { await finish([], cursorPatch(outcome, c.failures, opts.now())); break; }
    const items = await Promise.all(outcome.items.map(readDistributed));
    const valid = items.filter(i => i.nsu !== null);
    if (!valid.length) { last = 'error'; await finish([], cursorPatch({ kind: 'error', code: 'RESPOSTA_INVALIDA', message: errorMessages['RESPOSTA_INVALIDA']! }, c.failures, opts.now())); break; }
    const next = Math.max(nsu, ...valid.map(i => i.nsu! + 1));
    const more = batches < opts.maxBatches && opts.now() < opts.deadline;
    await finish(valid.map(itemPayload), { ...cursorPatch(outcome, 0, opts.now(), next), continue: more });
    nsu = next;
    if (!more) break;
  }
  return { imported, batches, last };
}

/** Scheduler step: a few due CNPJs per cycle, a few batches each, within a time budget. */
export async function processAdnSync(db: DB, opts: { maxCursors?: number; maxBatches?: number; budgetMs?: number; now?: () => number; cnpj?: string } = {}) {
  const now = opts.now ?? Date.now; const deadline = now() + (opts.budgetMs ?? 20_000);
  const claims = await db.rpc('claim_adn_cursors' as never, { _limit: opts.maxCursors ?? 3, ...(opts.cnpj ? { _cnpj: opts.cnpj } : {}) } as never) as { data: Cursor[] | null; error: unknown };
  if (claims.error) throw new Error('ADN_CLAIM_FAILED');
  let imported = 0, failed = 0;
  for (const c of claims.data ?? []) {
    try { const r = await syncCursor(db, c, { maxBatches: opts.maxBatches ?? 4, deadline, now }); imported += r.imported; if (r.last === 'error') failed++; }
    catch { failed++; console.error('ADN_SYNC_FAILED', c.environment); }
  }
  return { reserved: claims.data?.length ?? 0, imported, failed };
}

/** Applies every official event of an invoice's key (ADN by key). */
export async function refreshInvoiceEvents(db: DB, inv: Pick<Invoice, 'id' | 'company_id' | 'organization_id' | 'created_by' | 'environment' | 'access_key'>, purpose: string, actor = inv.created_by) {
  if (!inv.access_key) return { total: 0, changed: 0 };
  const base = await transmissorPayload(db, inv, purpose, actor);
  const r = await callTransmissor<Reply>('/v1/adn/eventos', { ...base, chave_acesso: inv.access_key });
  const reply = r.resposta ?? {};
  if (reply.status === 404) return { total: 0, changed: 0 };
  if (reply.erro || (reply.status ?? 0) >= 400 || !reply.corpo_json) throw new Error('ADN_EVENTS_FAILED');
  const events = (await eventsFromReply(reply.corpo_json)).filter(e => e.access_key === inv.access_key);
  const s = await db.rpc('store_nfse_events' as never, { _env: inv.environment, _items: events as unknown as Json, _source: 'adn_eventos' } as never) as { data: { total: number; changed: number } | null; error: unknown };
  if (s.error) throw new Error('ADN_EVENTS_STORE_FAILED');
  return s.data ?? { total: 0, changed: 0 };
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
      const s = await db.rpc('store_nfse_events' as never, { _env: inv.environment, _items: events as unknown as Json, _source: 'sefin_consulta' } as never) as { data: { changed: number } | null; error: unknown };
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
