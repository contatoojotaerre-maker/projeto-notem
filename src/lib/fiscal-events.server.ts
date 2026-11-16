import { ruleMessage } from './rule-error';
// Cancellation (e101101) and fiscal analysis (e101103) requests: durable record before sending,
// ambiguous replies are confirmed by consulting the event and never re-sent blindly.
import { z } from './validation';
import type { Database, Json } from '@/integrations/supabase/types';
import type { DB, ApiResult } from './api.server';
import { callTransmissor } from './transmissor.server';
import { fail, parseBody } from './api-contract';
import { explainKeySchemaDefect, governmentErrors, invoiceOut, rejectionGuidance, type GovernmentReply, type Invoice } from './invoices';
import { transmissorPayload, definitelyNotSent } from './invoices.server';
import { brasiliaNow, buildFiscalEvent, cancelReasons, justificationError, type CancelReason } from './fiscal-events';
import { FISCAL_TEXT_MESSAGE, fiscalTextAccepted, normalizeFiscalText } from './fiscal-text';
import { eventsFromReply } from './adn-xml';
import { putXml, putXmlOptional, xmlOf } from './xml-files.server';
import { normalizeCnpj } from './notem';

/** After an "event already exists" refusal, applies every official event of the key (ADN); failures never block the reply. */
async function refreshOtherEvents(db: DB, inv: Invoice) {
  try { const { refreshInvoiceEvents } = await import('./adn-sync.server'); await refreshInvoiceEvents(db, inv, 'reconciliação após recusa por evento existente'); }
  catch { console.error('EVENT_KEY_REFRESH_FAILED', inv.id); }
}

export type FiscalEvent = Database['public']['Tables']['invoice_fiscal_events']['Row'];
export type EventKind = 'cancel' | 'analysis';
/** Rejections after which the municipality may still cancel through fiscal analysis. */
export const analysisCodes = ['E0822', 'E0823', 'E0824', 'E0827'];
/** Rejections meaning a cancellation event may already exist: consult 101101/1 before refusing. */
export const alreadyRegisteredCodes = ['E0840', 'E0802', 'E1805'];
export const eventBody = z.object({ motivo: z.enum(['erro_emissao', 'servico_nao_prestado', 'outros']), justificativa: z.string().max(2000) }).strict();
type EventReply = { evento_assinado?: string; resposta?: GovernmentReply };
type Outcome = { event: FiscalEvent; invoice: Invoice };
type Patch = { status: 'not_sent' | 'verifying' | 'registered' | 'rejected' | 'not_registered'; signed_xml?: string; event_xml?: string; government_response?: Json; government_errors?: Json; can_request_analysis?: boolean; registered_outside?: boolean; registered_at?: string | undefined };

const reasonByCode = Object.fromEntries(Object.entries(cancelReasons).map(([k, v]) => [v, k])) as Record<string, CancelReason>;
const tagValue = (xml: string, name: string) => xml.match(new RegExp(`<${name}>([^<]*)</${name}>`))?.[1] ?? null;
const unescape = (v: string) => v.replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&apos;/g, "'").replace(/&amp;/g, '&');
/** The official event must reference this invoice key and event type; anything else stays ambiguous. */
export function eventXmlMatches(xml: unknown, accessKey: string, code: string): xml is string {
  return typeof xml === 'string' && !/<!DOCTYPE|<!ENTITY/i.test(xml) && xml.includes(`<chNFSe>${accessKey}</chNFSe>`) && xml.includes(`<e${code}>`);
}
const replySummary = (r: GovernmentReply): Json => ({ status: r.status ?? null, erro: r.erro ?? null, ms: r.ms ?? null, corpo: (r.corpo_json ? Object.fromEntries(Object.entries(r.corpo_json).filter(([k]) => k !== 'eventoXml')) : r.corpo_texto?.slice(0, 2000) ?? null) as Json });

async function loadInvoice(db: DB, id: string, org: string) { const r = await db.from('invoices').select('*').eq('id', id).eq('organization_id', org).single(); if (r.error) throw new Error('INVOICE_READ_FAILED'); return r.data; }

export async function finishEvent(db: DB, e: FiscalEvent, inv: Invoice, patch: Patch, request?: Request): Promise<Outcome> {
  if (!e.claim_token) throw new Error('EVENT_LEASE_MISSING');
  // XML goes to private files; the RPC receives only references. Without the official file the event is not
  // confirmed yet: it stays in verification and the next consult stores it (never re-sent).
  const signedRef = await putXmlOptional(db, e.environment, 'invoice_fiscal_events', e.id, 'signed', patch.signed_xml);
  let eventRef: Awaited<ReturnType<typeof putXml>> | undefined;
  if (patch.event_xml) { try { eventRef = await putXml(db, e.environment, 'invoice_fiscal_events', e.id, 'event', patch.event_xml); } catch { console.error('EVENT_XML_STORE_FAILED', e.id); patch = { status: 'verifying', ...patch.government_response !== undefined ? { government_response: patch.government_response } : {} }; } }
  const { signed_xml: _s, event_xml: _x, ...rpcPatch } = patch; void _s; void _x;
  const cancel = e.code === '101101'; const tipo = cancel ? 'cancelamento' : 'analise_cancelamento';
  const official = patch.event_xml ?? null;
  const officialReason = official ? reasonByCode[tagValue(official, 'cMotivo') ?? ''] : undefined; const officialText = official ? tagValue(official, 'xMotivo') : null;
  const errors = Array.isArray(patch.government_errors) ? patch.government_errors : [];
  const previous = inv.cancellation && typeof inv.cancellation === 'object' && !Array.isArray(inv.cancellation) ? inv.cancellation as Record<string, unknown> : {};
  const situacao = { registered: cancel ? 'cancelado' : 'em_analise', verifying: 'em_verificacao', rejected: 'recusado', not_registered: 'nao_registrado', not_sent: 'nao_enviado' }[patch.status];
  const cancellation = { tipo, motivo: patch.registered_outside && officialReason ? officialReason : e.reason, justificativa: patch.registered_outside && officialText ? unescape(officialText) : e.justification, solicitado_em: e.created_at, registrado_em: patch.status === 'registered' ? patch.registered_at ?? new Date().toISOString() : null, situacao, pode_solicitar_analise: cancel ? patch.can_request_analysis === true : patch.status !== 'registered' && previous['pode_solicitar_analise'] === true, registrado_fora_da_notem: patch.registered_outside === true, erros_governo: errors, evento_id: e.id };
  const pending = patch.status === 'verifying' ? { tipo, estado: 'em_verificacao', desde: e.created_at } : null;
  const nextStatus = patch.status === 'registered' ? (cancel ? 'cancelled' : 'cancellation_pending') : inv.status;
  const next = { ...inv, status: nextStatus, pending_operation: pending as Json, cancellation: cancellation as Json, updated_at: new Date().toISOString() };
  const timeline = patch.status === 'registered' ? (cancel ? (patch.registered_outside ? 'cancellation_registered_outside' : 'cancellation_registered') : 'analysis_registered') : { verifying: 'event_verifying', rejected: 'event_rejected', not_registered: 'event_not_registered', not_sent: 'event_not_sent' }[patch.status];
  const firstError = errors[0] && typeof errors[0] === 'object' ? (errors[0] as Record<string, unknown>)['mensagem'] : null;
  const message = patch.status === 'registered' ? (cancel ? (patch.registered_outside ? 'Cancelamento registrado fora da notem.' : 'Cancelamento registrado pelo governo.') : 'Pedido de análise fiscal registrado; aguardando decisão da prefeitura.') : patch.status === 'verifying' ? 'Aguardando confirmação do governo; não repita o pedido com outra chave.' : patch.status === 'rejected' ? String(firstError ?? 'O governo recusou o pedido.') : patch.status === 'not_registered' ? 'O governo não registrou o pedido; a nota segue autorizada.' : 'Pedido não enviado. Tente novamente com a mesma chave.';
  const webhook = patch.status === 'registered' ? (cancel ? 'nota.cancelada' : 'nota.cancelamento_em_analise') : null;
  const r = await db.rpc('finish_fiscal_event', { _id: e.id, _token: e.claim_token, _patch: { ...rpcPatch, files: { ...signedRef ? { signed: signedRef } : {}, ...eventRef ? { event: eventRef } : {} } } as unknown as Json, _invoice: { pending_operation: pending, cancellation } as Json, _nota: invoiceOut(next) as Json, _timeline: timeline, _message: message, ...webhook ? { _webhook: webhook } : {} });
  if (r.error) throw new Error('EVENT_FINISH_FAILED');
  const current = r.data ?? (await db.from('invoice_fiscal_events').select('*').eq('id', e.id).single()).data;
  if (!current) throw new Error('EVENT_READ_FAILED');
  if (request && webhook && r.data) {
    const wait = (request as Request & { waitUntil?: (p: Promise<unknown>) => void }).waitUntil; const master = process.env['WEBHOOK_ENCRYPTION_KEY'];
    if (master && typeof wait === 'function') { const { processWebhookBatch } = await import('./webhooks.server'); try { wait.call(request, processWebhookBatch(db, master, { skipDisable: true }).catch(() => console.error('EVENT_WEBHOOK_FAILED'))); } catch { /* durable queue remains */ } }
  }
  return { event: current, invoice: await loadInvoice(db, inv.id, inv.organization_id) };
}

/** Transmissor v4 returns eventos[].xml (decoded) next to Sefin's eventos[].arquivoXml (base64 of base64-gzip); eventoXml is also accepted. */
export async function officialEventXml(body: unknown, accessKey: string, code: string): Promise<string | null> {
  const b = body && typeof body === 'object' ? body as Record<string, unknown> : {};
  if (eventXmlMatches(b['eventoXml'], accessKey, code)) return b['eventoXml'];
  const found = (await eventsFromReply(b)).find(x => x.access_key === accessKey && x.code === code);
  return found && eventXmlMatches(found.xml, accessKey, code) ? found.xml : null;
}
async function consultEvent(db: DB, inv: Invoice, e: FiscalEvent) {
  const base = await transmissorPayload(db, inv, `consulta do evento ${e.code} da nota ${inv.id}`, e.requested_by);
  // The transmissor accepts text or number; text is sent for compatibility with older versions.
  const r = await callTransmissor<EventReply>('/v1/nfse/evento/consultar', { ...base, chave_acesso: inv.access_key, tipo_evento: e.code, num_seq_evento: String(e.sequence) });
  const reply = r.resposta ?? {};
  return { reply, xml: reply.status === 200 ? await officialEventXml(reply.corpo_json, inv.access_key ?? '', e.code) : null };
}
const processedAt = (xml: string) => { const v = tagValue(xml, 'dhProc'); return v && Number.isFinite(Date.parse(v)) ? new Date(v).toISOString() : undefined; };

export async function applyEventReply(db: DB, e: FiscalEvent, inv: Invoice, res: EventReply, request?: Request): Promise<Outcome> {
  const reply = res.resposta ?? {}; const signed = res.evento_assinado ? { signed_xml: res.evento_assinado } : {};
  const xml = reply.corpo_json?.['eventoXml'];
  if ((reply.status === 200 || reply.status === 201) && eventXmlMatches(xml, inv.access_key ?? '', e.code)) return finishEvent(db, e, inv, { ...signed, status: 'registered', event_xml: xml, government_response: replySummary(reply), registered_at: processedAt(xml) }, request);
  if (reply.status === 400 || reply.status === 403 || reply.status === 409 || reply.status === 422) {
    let errors = governmentErrors(reply, inv.id).map(x => ({ ...x, campo: rejectionGuidance[x.codigo_governo]?.campo ?? (e.code === '101101' ? 'cancelamento' : 'analise_cancelamento'), mensagem: rejectionGuidance[x.codigo_governo]?.mensagem ?? 'O governo recusou o pedido. Confira a mensagem original nos detalhes.', ...(e.code === '101101' && analysisCodes.includes(x.codigo_governo) ? { pode_solicitar_analise: true } : {}) }));
    errors = explainKeySchemaDefect(errors, inv.access_key);
    if (errors.some(x => alreadyRegisteredCodes.includes(x.codigo_governo))) {
      try {
        const found = await consultEvent(db, inv, e);
        if (found.xml) {
          const done = await finishEvent(db, e, inv, { ...signed, status: 'registered', event_xml: found.xml, government_response: replySummary(reply), registered_outside: true, registered_at: processedAt(found.xml) }, request);
          await refreshOtherEvents(db, done.invoice);
          return done;
        }
      } catch { console.error('EVENT_RECONCILIATION_FAILED', e.id); }
      await refreshOtherEvents(db, inv);
    }
    if (!errors.length) errors = [{ campo: e.code === '101101' ? 'cancelamento' : 'analise_cancelamento', mensagem: reply.status === 403 ? 'O governo recusou o certificado da empresa. Confira sua validade e autorização.' : 'O governo recusou o pedido. Confira os detalhes originais.', codigo_governo: String(reply.status), mensagem_governo: 'Rejeição informada pelo governo.', complemento: null, nota_id: inv.id }];
    return finishEvent(db, e, inv, { ...signed, status: 'rejected', government_errors: errors as Json, government_response: replySummary(reply), can_request_analysis: e.code === '101101' && errors.some(x => analysisCodes.includes(x.codigo_governo)) }, request);
  }
  return finishEvent(db, e, inv, { ...signed, status: 'verifying', government_response: replySummary(reply) }, request);
}

export async function sendFiscalEvent(db: DB, e: FiscalEvent, inv: Invoice, request?: Request, unsigned?: string): Promise<Outcome> {
  // The request XML is read before sending: an unreadable file is a certain "not sent", never an ambiguity.
  let xml: string | null = unsigned ?? null;
  if (!xml) { try { xml = await xmlOf(db, 'invoice_fiscal_events', e.id, 'unsigned'); } catch { xml = null; } }
  if (!xml) { console.error('EVENT_XML_FILE_UNAVAILABLE', e.id); return finishEvent(db, e, inv, { status: 'not_sent' }, request); }
  let res: EventReply;
  try { const base = await transmissorPayload(db, inv, `evento ${e.code} da nota ${inv.id}`, e.requested_by); res = await callTransmissor<EventReply>('/v1/nfse/evento', { ...base, chave_acesso: inv.access_key, evento_xml: xml, tempo_limite_segundos: 18 }); }
  catch (err) { return finishEvent(db, e, inv, { status: definitelyNotSent(err) ? 'not_sent' : 'verifying' }, request); }
  return applyEventReply(db, e, inv, res, request);
}

export type EventRequest = { db: DB; organization_id: string; environment: 'sandbox' | 'production'; invoice_id: string; integration_id: string | null; origin: 'api' | 'panel'; actor: string; kind: EventKind; body: unknown; idempotency_key: string; request_hash: string; request?: Request };
const conflicts: Record<string, string> = { CONFLITO_SITUACAO: 'Somente notas autorizadas podem ter cancelamento ou análise solicitados.', CONFLITO_OPERACAO: 'Já existe um pedido de cancelamento ou análise em andamento para esta nota.', CONFLITO_SUBSTITUICAO: 'Há uma substituição em andamento para esta nota.' };

/** Validates, records and sends a cancellation/analysis request; the same key always returns the same request. */
export async function requestFiscalEvent(a: EventRequest): Promise<Outcome> {
  const { db } = a; const code = a.kind === 'cancel' ? '101101' as const : '101103' as const;
  let prior = db.from('invoice_fiscal_events').select('*').eq('organization_id', a.organization_id).eq('environment', a.environment).eq('origin', a.origin).eq('idempotency_key', a.idempotency_key);
  prior = a.integration_id ? prior.eq('integration_id', a.integration_id) : prior.is('integration_id', null);
  const p = await prior.maybeSingle(); if (p.error) throw new Error('EVENT_READ_FAILED');
  if (p.data) {
    if (p.data.request_hash !== a.request_hash || p.data.invoice_id !== a.invoice_id || p.data.code !== code) throw fail(409, 'IDEMPOTENCIA_CONFLITO');
    const inv = await loadInvoice(db, p.data.invoice_id, a.organization_id);
    if (p.data.status === 'not_sent') { const c = await db.rpc('claim_fiscal_event_dispatch', { _id: p.data.id, _org: a.organization_id }); if (c.error) throw new Error('EVENT_CLAIM_FAILED'); const claimed = c.data?.[0]; if (claimed) return sendFiscalEvent(db, claimed, inv, a.request); }
    return { event: p.data, invoice: inv };
  }
  const v = parseBody(eventBody, a.body);
  const justification = normalizeFiscalText(v.justificativa);
  if (!fiscalTextAccepted(justification)) throw fail(422, 'REGRA_DE_NEGOCIO', [{ campo: 'justificativa', mensagem: FISCAL_TEXT_MESSAGE }]);
  const lengthError = justificationError(justification); if (lengthError) throw fail(422, 'REGRA_DE_NEGOCIO', [{ campo: 'justificativa', mensagem: lengthError }]);
  const found = await db.from('invoices').select('*').eq('id', a.invoice_id).eq('organization_id', a.organization_id).eq('environment', a.environment).maybeSingle();
  if (found.error) throw new Error('INVOICE_READ_FAILED'); const inv = found.data; if (!inv) throw fail(404, 'NAO_ENCONTRADO');
  if (inv.status !== 'authorized' || !inv.access_key) throw fail(409, 'CONFLITO', [], conflicts['CONFLITO_SITUACAO']);
  const cnpj = String((inv.provider_snapshot as { cnpj?: string } | null)?.cnpj ?? '');
  const cert = await db.from('company_certificates').select('cnpj').eq('company_id', inv.company_id).eq('organization_id', a.organization_id).eq('status', 'active').maybeSingle();
  if (cert.error) throw new Error('CERTIFICATE_READ_FAILED');
  if (!cert.data) throw fail(422, 'EMPRESA_NAO_PRONTA', [{ campo: 'certificado', mensagem: 'A empresa não tem certificado digital ativo.' }]);
  if (normalizeCnpj(cert.data.cnpj).slice(0, 8) !== normalizeCnpj(cnpj).slice(0, 8)) throw fail(422, 'REGRA_DE_NEGOCIO', [{ campo: 'certificado', mensagem: rejectionGuidance['E0812']?.mensagem ?? 'Certificado não corresponde ao prestador.' }]);
  let built: { id: string; xml: string };
  try { built = buildFiscalEvent({ code, environment: inv.environment, accessKey: inv.access_key, authorCnpj: cnpj, occurredAt: brasiliaNow(), reason: v.motivo, justification }); }
  catch (err) { throw fail(422, 'REGRA_DE_NEGOCIO', [{ campo: 'nota', mensagem: ruleMessage(err, 'Pedido inválido.') }]); }
  let unsignedFile;
  try { unsignedFile = await putXml(db, a.environment, 'invoice_fiscal_events', inv.id, `unsigned-${code}`, built.xml); } catch { throw new Error('EVENT_XML_STORE_FAILED'); }
  const r = await db.rpc('create_fiscal_event_request', { _payload: { organization_id: a.organization_id, environment: a.environment, integration_id: a.integration_id, origin: a.origin, requested_by: a.actor, invoice_id: inv.id, code, reason: v.motivo, justification, idempotency_key: a.idempotency_key, request_hash: a.request_hash, request_id: built.id, unsigned_xml: built.xml, unsigned_file: unsignedFile } as Json });
  if (r.error) {
    const m = r.error.message;
    if (m.includes('IDEMPOTENCIA_CONFLITO')) throw fail(409, 'IDEMPOTENCIA_CONFLITO');
    const conflict = Object.keys(conflicts).find(k => m.includes(k)); if (conflict) throw fail(409, 'CONFLITO', [], conflicts[conflict]);
    if (m.includes('SEM_PERMISSAO')) throw fail(403, 'SEM_PERMISSAO');
    if (m.includes('NAO_ENCONTRADO')) throw fail(404, 'NAO_ENCONTRADO');
    if (r.error.code === '23505') throw fail(409, 'CONFLITO', [], conflicts['CONFLITO_OPERACAO']);
    throw new Error('EVENT_CREATE_FAILED');
  }
  const out = r.data as { created: boolean; event: FiscalEvent };
  if (!out.created) return { event: out.event, invoice: await loadInvoice(db, inv.id, a.organization_id) };
  return sendFiscalEvent(db, out.event, inv, a.request, built.xml);
}

/** API mapping: 200 registered, 202 awaiting confirmation, 422 refused, 503 not sent. */
export function eventResponse({ event, invoice }: Outcome): ApiResult {
  if (event.status === 'registered') return { status: 200, body: invoiceOut(invoice) };
  if (event.status === 'rejected') throw fail(422, 'REJEITADO_GOVERNO', (Array.isArray(event.government_errors) ? event.government_errors : []) as never, 'O governo recusou o pedido. Confira os motivos.');
  if (event.status === 'not_registered') throw fail(422, 'REJEITADO_GOVERNO', [{ campo: event.code === '101101' ? 'cancelamento' : 'analise_cancelamento', mensagem: 'O governo não registrou o pedido; a nota segue autorizada.' }], 'O governo não registrou o pedido.');
  if (event.status === 'not_sent') throw fail(503, 'GOVERNO_INDISPONIVEL', [], 'Pedido não enviado. Tente novamente com a mesma Idempotency-Key.');
  return { status: 202, body: invoiceOut(invoice) };
}

/** Scheduler: confirms ambiguous requests by consulting the event; 404 for 15 minutes means not registered. */
export async function processFiscalEventVerifications(db: DB, now = Date.now()) {
  const claims = await db.rpc('claim_fiscal_event_verifications', { _limit: 5 }); if (claims.error) throw new Error('EVENT_VERIFICATION_CLAIM_FAILED');
  let completed = 0, failed = 0;
  for (const e of claims.data ?? []) {
    let inv: Invoice;
    try { inv = await loadInvoice(db, e.invoice_id, e.organization_id); } catch { failed++; continue; }
    try {
      const { reply, xml } = await consultEvent(db, inv, e);
      if (xml) { await finishEvent(db, e, inv, { status: 'registered', event_xml: xml, government_response: replySummary(reply), registered_at: processedAt(xml) }); completed++; continue; }
      if (reply.status === 404 && now - Date.parse(e.verification_started_at ?? e.created_at) >= 15 * 60_000) { await finishEvent(db, e, inv, { status: 'not_registered', government_response: replySummary(reply) }); completed++; continue; }
      await finishEvent(db, e, inv, { status: 'verifying' });
    } catch { failed++; try { await finishEvent(db, e, inv, { status: 'verifying' }); } catch { /* lease expires and retries */ } }
  }
  return { reserved: claims.data?.length ?? 0, completed, failed };
}
