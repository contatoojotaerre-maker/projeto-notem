// Readiness ("pronta para emitir") per environment, change detection and the daily certificate routine.
import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database, Json } from '@/integrations/supabase/types';
import { computeReadiness, expiryMilestone, isoBr, type Env } from './api-contract';
import { webhookTypes } from './webhooks';

type DB = SupabaseClient<Database>;
const ENVS: Env[] = ['sandbox', 'production'];

export async function loadReadiness(db: DB, companyId: string, env: Env) {
  const [company, certs, settings, services, last] = await Promise.all([
    db.from('companies').select('id,organization_id,cnpj,active,external_id').eq('id', companyId).single(),
    db.from('company_certificates').select('status,cnpj,valid_from,valid_until').eq('company_id', companyId),
    db.from('company_fiscal_settings').select('*').eq('company_id', companyId).maybeSingle(),
    db.from('company_service_profiles').select('active').eq('company_id', companyId),
    db.from('municipality_agreement_queries').select('created_at,http_status,response_body,error_code').eq('company_id', companyId).eq('environment', env).order('created_at', { ascending: false }).limit(1),
  ]);
  if (company.error || certs.error || settings.error || services.error || last.error) throw new Error('READINESS_READ_FAILED');
  const s = settings.data ? { ...settings.data, company_id: companyId, organization_id: company.data.organization_id } : null;
  return { company: company.data, readiness: computeReadiness(env, { company: company.data, certificates: certs.data ?? [], settings: s, services: services.data ?? [], lastQuery: last.data?.[0] ?? null }) };
}

type Emit = { request?: Request };
async function emitToOrganization(db: DB, org: string, env: Env, type: typeof webhookTypes[number], data: Json, company_id: string, opts: Emit) {
  const endpoints = await db.from('webhook_endpoints').select('integration_id').eq('organization_id', org).eq('environment', env).eq('active', true).is('deleted_at', null);
  if (endpoints.error) throw new Error('WEBHOOK_READ_FAILED');
  const integrations = [...new Set((endpoints.data ?? []).map(e => e.integration_id))];
  const { emitWebhookEvent, dispatchWebhookEvent } = await import('./webhooks.server');
  for (const integration_id of integrations) {
    const input = { organization_id: org, integration_id, environment: env, type, data, company_id };
    if (opts.request) await dispatchWebhookEvent(opts.request, db, process.env['WEBHOOK_ENCRYPTION_KEY'], input); else await emitWebhookEvent(db, input);
  }
}

/** Recomputes both environments; emits empresa.situacao_alterada once per change of pronta_para_emitir. Never throws. */
export async function refreshReadiness(db: DB, companyId: string, opts: Emit = {}) {
  try {
    for (const env of ENVS) {
      const { company, readiness } = await loadReadiness(db, companyId, env);
      const prior = await db.from('company_readiness_state').select('ready').eq('company_id', companyId).eq('environment', env).maybeSingle();
      if (prior.error) throw new Error('READINESS_STATE_FAILED');
      const changed = prior.data ? prior.data.ready !== readiness.pronta_para_emitir : readiness.pronta_para_emitir;
      const up = await db.from('company_readiness_state').upsert({ company_id: companyId, environment: env, ready: readiness.pronta_para_emitir, pending: readiness.pendencias, updated_at: new Date().toISOString() });
      if (up.error) throw new Error('READINESS_STATE_FAILED');
      if (changed) await emitToOrganization(db, company.organization_id, env, 'empresa.situacao_alterada', { empresa_id: company.id, id_externo: company.external_id, cnpj: company.cnpj, ambiente: env === 'sandbox' ? 'homologacao' : 'producao', pronta_para_emitir: readiness.pronta_para_emitir, pendencias: readiness.pendencias }, company.id, opts);
    }
  } catch (e) { console.error('READINESS_REFRESH_FAILED', companyId, e instanceof Error ? e.message : ''); }
}

/** Runs at most once per day (heartbeat), from the scheduler callback. */
export async function runDailyRoutine(db: DB, now = Date.now()) {
  const beat = await db.from('system_heartbeats').select('last_success_at').eq('name', 'daily_routine').maybeSingle();
  if (beat.data && now - Date.parse(beat.data.last_success_at) < 23 * 3600_000) return { ran: false, notices: 0 };
  let notices = 0;
  const certs = await db.from('company_certificates').select('id,company_id,organization_id,cnpj,valid_until,companies(external_id)').eq('status', 'active').lt('valid_until', new Date(now + 31 * 86_400_000).toISOString());
  if (certs.error) throw new Error('DAILY_READ_FAILED');
  for (const c of certs.data ?? []) {
    const m = expiryMilestone(c.valid_until, now); if (!m) continue;
    const claim = await db.from('certificate_expiry_notices').insert({ certificate_id: c.id, milestone: m });
    if (claim.error) { if (claim.error.code === '23505') continue; throw new Error('DAILY_NOTICE_FAILED'); }
    const days = Math.max(0, Math.ceil((Date.parse(c.valid_until) - now) / 86_400_000));
    const data = { empresa_id: c.company_id, id_externo: (c.companies as { external_id: string | null } | null)?.external_id ?? null, cnpj: c.cnpj, valido_ate: isoBr(c.valid_until), dias_para_vencer: days };
    for (const env of ENVS) await emitToOrganization(db, c.organization_id, env, m === 'vencido' ? 'certificado.vencido' : 'certificado.vencendo', data, c.company_id, {});
    notices++;
  }
  const companies = await db.from('company_readiness_state').select('company_id');
  for (const id of new Set((companies.data ?? []).map(r => r.company_id))) await refreshReadiness(db, id);
  await db.from('api_idempotency_keys').delete().lt('expires_at', new Date(now).toISOString());
  const stamp = new Date(now).toISOString(); await db.from('system_heartbeats').upsert({ name: 'daily_routine', last_success_at: stamp, updated_at: stamp });
  return { ran: true, notices };
}

/** After panel changes: recompute readiness with the service client; webhook events stay queued for the scheduler. */
export async function panelRefreshReadiness(companyId: string) { const { supabaseAdmin } = await import('@/integrations/supabase/client.server'); await refreshReadiness(supabaseAdmin, companyId); }
