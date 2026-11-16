// Início and Alertas: current state of one organization and environment, read with the service client after
// the caller's membership was checked (requireOrgMember). Every query is scoped by the organization.
import type { DB } from './api.server';
import { computeReadiness, type Env } from './api-contract';
import { buildAlerts, type PanelAlert } from './alerts';
import { normalizeCnpj } from './notem';

type Readiness = ReturnType<typeof computeReadiness>;
export type OrgCompanyState = { id: string; legal_name: string; cnpj: string; active: boolean; readiness: Readiness; certificate: { valid_until: string } | null; hasCertificate: boolean };

/** Readiness of every company of the organization with batched reads and the same pure rule as the company tab. */
export async function loadOrgReadiness(db: DB, org: string, env: Env, now = Date.now()): Promise<OrgCompanyState[]> {
  const [companies, certs, settings, services, queries] = await Promise.all([
    db.from('companies').select('id,organization_id,cnpj,active,external_id,legal_name').eq('organization_id', org).order('legal_name'),
    db.from('company_certificates').select('company_id,status,cnpj,valid_from,valid_until').eq('organization_id', org),
    db.from('company_fiscal_settings').select('*').eq('organization_id', org),
    db.from('company_service_profiles').select('company_id,active,iss_taxation,service_code,nbs_code,ibscbs_classification,ibscbs_operation_indicator,simples_activity_code,ibscbs_classifications(*),ibscbs_operation_indicators(code,active,incidence_location)').eq('organization_id', org),
    db.from('municipality_agreement_queries').select('company_id,created_at,http_status,response_body,error_code').eq('organization_id', org).eq('environment', env).order('created_at', { ascending: false }).limit(2000),
  ]);
  if (companies.error || certs.error || settings.error || services.error || queries.error) throw new Error('READINESS_READ_FAILED');
  const { ibsCbsRequiredFrom } = await import('./platform-settings.server'); const requiredFrom = await ibsCbsRequiredFrom(db, env);
  const last = new Map<string, NonNullable<typeof queries.data>[number]>(); for (const q of queries.data ?? []) if (!last.has(q.company_id)) last.set(q.company_id, q);
  return (companies.data ?? []).map(c => {
    const own = (certs.data ?? []).filter(x => x.company_id === c.id); const s = (settings.data ?? []).find(x => x.company_id === c.id) ?? null;
    const list = (services.data ?? []).filter(x => x.company_id === c.id).map(({ ibscbs_classifications, ibscbs_operation_indicators, company_id: _c, ...x }) => ({ ...x, classification: ibscbs_classifications, indicator: ibscbs_operation_indicators }));
    const q = last.get(c.id); const active = own.filter(x => x.status === 'active').sort((a, b) => b.valid_until.localeCompare(a.valid_until))[0];
    const readiness = computeReadiness(env, { company: c, certificates: own, settings: s ? { ...s, company_id: c.id, organization_id: org } : null, services: list as never, ibsCbsRequiredFrom: requiredFrom, lastQuery: q ? { created_at: q.created_at, http_status: q.http_status, response_body: q.response_body, error_code: q.error_code } : null }, now);
    return { id: c.id, legal_name: c.legal_name, cnpj: c.cnpj, active: c.active, readiness, certificate: active ? { valid_until: active.valid_until } : null, hasCertificate: own.some(x => normalizeCnpj(x.cnpj) === normalizeCnpj(c.cnpj)) };
  });
}

/** Current alerts. Computed from the present state, so they disappear once the problem is solved; webhook
 *  failures are stored episodes, open while the endpoint has had no successful delivery after them. */
export async function loadOrgAlerts(db: DB, org: string, env: Env, now = Date.now(), companies?: OrgCompanyState[]): Promise<PanelAlert[]> {
  const states = companies ?? await loadOrgReadiness(db, org, env, now);
  const [verifying, events, alerts] = await Promise.all([
    db.from('invoices').select('id,company_id,nfse_number,dps_number,verification_started_at,updated_at').eq('organization_id', org).eq('environment', env).eq('status', 'verifying').limit(500),
    db.from('invoice_fiscal_events').select('invoice_id,company_id,created_at').eq('organization_id', org).eq('environment', env).eq('code', '101101').in('status', ['sending', 'verifying']).limit(500),
    db.from('webhook_alerts').select('id,integration_id,endpoint_id,created_at,message,webhook_endpoints(url,last_success_at,deleted_at)').eq('organization_id', org).eq('environment', env).gte('created_at', new Date(now - 90 * 86_400_000).toISOString()).order('created_at', { ascending: false }).limit(200),
  ]);
  if (verifying.error || events.error || alerts.error) throw new Error('ALERTS_READ_FAILED');
  const cnpjs = [...new Set(states.filter(c => c.hasCertificate).map(c => normalizeCnpj(c.cnpj)))];
  const cursors = cnpjs.length ? await db.from('adn_sync_cursors').select('cnpj,status,last_error,last_request,updated_at').eq('environment', env).in('cnpj', cnpjs) : { data: [], error: null };
  if (cursors.error) throw new Error('ALERTS_READ_FAILED');
  const numbers = new Map((await (events.data?.length ? db.from('invoices').select('id,nfse_number').eq('organization_id', org).in('id', events.data.map(e => e.invoice_id)) : Promise.resolve({ data: [] as { id: string; nfse_number: string | null }[] }))).data?.map(i => [i.id, i.nfse_number]) ?? []);
  const syncErrors = (cursors.data ?? []).flatMap(k => {
    const last = (k.last_request && typeof k.last_request === 'object' && !Array.isArray(k.last_request) ? k.last_request : {}) as Record<string, unknown>;
    const failed = k.status === 'error' || last['outcome'] === 'error'; if (!failed) return [];
    const message = k.status === 'error' ? k.last_error : typeof last['message'] === 'string' ? last['message'] : null;
    return states.filter(c => normalizeCnpj(c.cnpj) === k.cnpj).slice(0, 1).map(c => ({ company_id: c.id, at: typeof last['finished_at'] === 'string' ? last['finished_at'] : k.updated_at, message }));
  });
  const seen = new Set<string>(); const webhooks = (alerts.data ?? []).filter(a => {
    const e = a.webhook_endpoints as { url: string; last_success_at: string | null; deleted_at: string | null } | null;
    if (!e || e.deleted_at || seen.has(a.endpoint_id)) return false; seen.add(a.endpoint_id);
    return !e.last_success_at || Date.parse(e.last_success_at) < Date.parse(a.created_at);
  }).map(a => ({ id: a.id, integration_id: a.integration_id, created_at: a.created_at, message: a.message, url: (a.webhook_endpoints as { url: string } | null)?.url ?? null }));
  return buildAlerts({ now, companies: states,
    verifying: (verifying.data ?? []).map(v => ({ id: v.id, company_id: v.company_id, nfse_number: v.nfse_number, dps_number: v.dps_number, since: v.verification_started_at ?? v.updated_at })),
    cancellations: (events.data ?? []).map(e => ({ invoice_id: e.invoice_id, company_id: e.company_id, nfse_number: numbers.get(e.invoice_id) ?? null, since: e.created_at })),
    syncErrors, webhooks });
}
