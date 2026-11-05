// Shared runtime for /api/v1 business routes: key auth, request id, idempotency, error envelope,
// sanitized request log (with company) and background work through the request-scoped waitUntil.
import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database, Json } from '@/integrations/supabase/types';
import { hashKey, keyEnvironment, sanitizeBody } from './integrations';
import { ApiFailure, bodyHash, defaultMessages, fail, idempotencyKey, type Env } from './api-contract';

export type DB = SupabaseClient<Database>;
export type ApiCtx = { db: DB; requestId: string; request: Request; url: URL; params: Record<string, string>; body: unknown; env: Env; organization_id: string; integration_id: string; integration_name: string; actor: string; background: (p: Promise<unknown>) => void; setCompany: (id: string | null) => void };
export type ApiResult = { status: number; body?: unknown; headers?: Record<string, string> };
type Handler = (ctx: ApiCtx) => Promise<ApiResult>;
const MAX_BODY = 200 * 1024;
const MUTATING = new Set(['POST', 'PATCH', 'PUT', 'DELETE']);

export function errorBody(id: string, e: ApiFailure) { return { erro: { codigo: e.code, mensagem: e.userMessage, detalhes: e.details, codigo_governo: null, mensagem_governo: null }, id_requisicao: id }; }
/** Strips certificate payloads before anything is logged; the generic sanitizer handles other secrets. */
export function logBody(path: string, body: unknown): Json | null {
  if (body === undefined || body === null) return null;
  if (/\/certificado$/.test(path) && typeof body === 'object') return { arquivo_base64: '[REMOVIDO]', senha: '[REMOVIDO]' };
  return sanitizeBody(body);
}

async function authenticate(db: DB, request: Request) {
  const bearer = request.headers.get('authorization') ?? ''; const key = bearer.startsWith('Bearer ') ? bearer.slice(7) : ''; const env = keyEnvironment(key);
  if (!env) return { error: fail(401, 'AUTENTICACAO_INVALIDA') };
  const found = await db.from('integration_keys').select('id,integration_id,organization_id,environment,revoked_at,last_used_at').eq('key_hash', await hashKey(key)).maybeSingle();
  if (found.error) throw new Error('KEY_READ_FAILED');
  const k = found.data; if (!k) return { error: fail(401, 'AUTENTICACAO_INVALIDA') };
  const identity = { organization_id: k.organization_id, integration_id: k.integration_id, key_id: k.id, environment: k.environment };
  if (k.revoked_at || k.environment !== env) return { identity, error: fail(401, 'AUTENTICACAO_INVALIDA') };
  const integration = await db.from('integrations').select('id,name,active,created_by').eq('id', k.integration_id).eq('organization_id', k.organization_id).single();
  if (integration.error) throw new Error('INTEGRATION_READ_FAILED');
  if (!integration.data.active) return { identity, error: fail(401, 'AUTENTICACAO_INVALIDA') };
  if (!k.last_used_at || Date.now() - Date.parse(k.last_used_at) >= 60000) { const u = await db.from('integration_keys').update({ last_used_at: new Date().toISOString() }).eq('id', k.id); if (u.error) console.error('API_LAST_USED_FAILED'); }
  return { identity, integration: integration.data, env: env as Env };
}

export function apiRoute(handlers: Partial<Record<'GET' | 'POST' | 'PATCH' | 'PUT' | 'DELETE', Handler>>) {
  const run = async ({ request, params }: { request: Request; params: Record<string, string> }) => {
    const started = performance.now(); const requestId = `req_${crypto.randomUUID().replaceAll('-', '')}`; const url = new URL(request.url);
    const { supabaseAdmin: db } = await import('@/integrations/supabase/client.server');
    const waitUntil = (request as Request & { waitUntil?: (p: Promise<unknown>) => void }).waitUntil;
    const pending: Promise<unknown>[] = [];
    const background = (p: Promise<unknown>) => { const safe = p.catch(() => console.error('API_BACKGROUND_FAILED', requestId)); if (typeof waitUntil === 'function') { try { waitUntil.call(request, safe); return; } catch { /* fall through */ } } pending.push(safe); };
    let identity: { organization_id: string; integration_id: string; key_id: string; environment: Env } | undefined;
    let companyId: string | null = params['id'] && /^[0-9a-f-]{36}$/i.test(params['id']) ? params['id'] : null;
    let status = 500; let body: unknown; let headers: Record<string, string> = {}; let requestBody: unknown = null; let replayed = false;
    try {
      const auth = await authenticate(db, request); identity = auth.identity as typeof identity;
      if (auth.error) throw auth.error;
      const handler = handlers[request.method as keyof typeof handlers]; if (!handler) throw fail(405, 'REQUISICAO_INVALIDA', [], defaultMessages['METODO_NAO_PERMITIDO']);
      let raw = '';
      if (request.method !== 'GET' && request.method !== 'DELETE') {
        raw = await request.text(); if (new TextEncoder().encode(raw).length > MAX_BODY) throw fail(400, 'REQUISICAO_INVALIDA', [{ campo: 'corpo', mensagem: 'Corpo maior que 200 KB.' }]);
        try { requestBody = raw ? JSON.parse(raw) : {}; } catch { throw fail(400, 'REQUISICAO_INVALIDA', [{ campo: 'corpo', mensagem: 'JSON inválido.' }]); }
      }
      const key = MUTATING.has(request.method) ? idempotencyKey(request.headers.get('idempotency-key')) : null;
      const hash = key ? await bodyHash(request.method, url.pathname, raw) : '';
      if (key) {
        const scope = { integration_id: auth.integration!.id, environment: auth.env!, key };
        await db.from('api_idempotency_keys').delete().match(scope).lt('expires_at', new Date().toISOString());
        const claim = await db.from('api_idempotency_keys').insert({ ...scope, method: request.method, path: url.pathname, body_hash: hash });
        if (claim.error) {
          if (claim.error.code !== '23505') throw new Error('IDEMPOTENCY_FAILED');
          const prior = await db.from('api_idempotency_keys').select('body_hash,status_code,response_body').match(scope).single();
          if (prior.error) throw new Error('IDEMPOTENCY_FAILED');
          if (prior.data.body_hash !== hash) throw fail(409, 'IDEMPOTENCIA_CONFLITO');
          if (prior.data.status_code === null) throw fail(409, 'CONFLITO', [], 'Uma requisição com esta Idempotency-Key ainda está em andamento.');
          status = prior.data.status_code; body = prior.data.response_body ?? undefined; replayed = true;
        }
      }
      if (!replayed) {
        const ctx: ApiCtx = { db, requestId, request, url, params, body: requestBody, env: auth.env!, organization_id: identity!.organization_id, integration_id: auth.integration!.id, integration_name: auth.integration!.name, actor: auth.integration!.created_by, background, setCompany: id => { companyId = id; } };
        try { const r = await handler(ctx); status = r.status; body = r.body; headers = r.headers ?? {}; }
        catch (e) { if (e instanceof ApiFailure) { status = e.status; body = errorBody(requestId, e); headers = e.headers; } else throw e; }
        if (key) { const scope = { integration_id: auth.integration!.id, environment: auth.env!, key }; if (status >= 500) await db.from('api_idempotency_keys').delete().match(scope); else await db.from('api_idempotency_keys').update({ status_code: status, response_body: (body ?? null) as Json }).match(scope); }
      }
    } catch (e) {
      if (e instanceof ApiFailure) { status = e.status; body = errorBody(requestId, e); headers = e.headers; }
      else { status = 500; body = errorBody(requestId, fail(500, 'ERRO_INTERNO')); console.error('API_FAILED', requestId, e instanceof Error ? e.message : 'unknown'); }
    }
    const out = new Headers({ 'X-Request-Id': requestId, 'Cache-Control': 'no-store', ...headers });
    if (replayed) out.set('Idempotent-Replayed', 'true');
    const persist = async () => { try { const errorCode = status >= 400 ? (body as { erro?: { codigo?: string } })?.erro?.codigo ?? null : null; const r = await db.from('api_request_logs').insert({ id: requestId, ...(identity ?? {}), company_id: companyId, method: request.method, path: url.pathname, status_code: status, error_code: errorCode, duration_ms: Math.round(performance.now() - started), request_body: logBody(url.pathname, requestBody), response_body: body === undefined ? null : sanitizeBody(body) }); if (r.error) console.error('API_LOG_FAILED', requestId); } catch { console.error('API_LOG_FAILED', requestId); } };
    background(persist());
    if (pending.length) await Promise.all(pending);
    if (body === undefined || status === 204) return new Response(null, { status, headers: out });
    out.set('Content-Type', 'application/json; charset=utf-8');
    return new Response(JSON.stringify(body), { status, headers: out });
  };
  const methods = ['GET', 'POST', 'PATCH', 'PUT', 'DELETE'] as const;
  return Object.fromEntries(methods.map(m => [m, run])) as Record<typeof methods[number], typeof run>;
}

/** Loads a company of the key's organization or fails with 404 (never reveals other organizations). */
export async function loadCompany(ctx: ApiCtx, id = ctx.params['id'] ?? '') {
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id ?? '')) throw fail(404, 'NAO_ENCONTRADO');
  const r = await ctx.db.from('companies').select('*, municipalities(name)').eq('id', id).eq('organization_id', ctx.organization_id).maybeSingle();
  if (r.error) throw new Error('COMPANY_READ_FAILED'); if (!r.data) throw fail(404, 'NAO_ENCONTRADO');
  ctx.setCompany(r.data.id); return r.data;
}
export const apiAudit = (ctx: ApiCtx) => ({ updated_by: ctx.actor, change_origin: 'api' as const, changed_by_integration_id: ctx.integration_id });
