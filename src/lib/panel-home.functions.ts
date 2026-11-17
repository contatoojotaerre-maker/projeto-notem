import { createServerFn } from '@tanstack/react-start';
import { requireSupabaseAuth } from '@/integrations/supabase/auth-middleware';
import { z } from './validation';
import { requireOrgMember } from './panel-access';
import { PERIODS, dayRange } from './br-format';
import { comparisonPeriods, comparisonLabels, companySituation, hourlyWindows } from './home-metrics';

const scope = z.object({ organization_id: z.string().uuid(), environment: z.enum(['sandbox', 'production']) });
const failed = 'Não foi possível carregar o painel. Tente novamente.';

/** Início: companies by situation, notes of the period against the previous period of the same size (counted in
 *  the database), integration calls of the last 24 hours and the alerts per severity. Numbers only. */
export const getOrgDashboard = createServerFn({ method: 'POST' }).middleware([requireSupabaseAuth]).inputValidator(scope.extend({ period: z.enum(PERIODS).default('mes_atual') })).handler(async ({ context, data }) => {
  await requireOrgMember(context.supabase, data.organization_id);
  const org = data.organization_id, env = data.environment, now = Date.now();
  const { current, previous } = comparisonPeriods(data.period, now); const cur = dayRange(current.first, current.last), prev = dayRange(previous.first, previous.last);
  // Request logs follow the same row rule as the Requisições tab (owner, admin, developer, platform admin).
  const [summary, before, logRole, platform] = await Promise.all([
    context.supabase.rpc('org_notes_summary', { _org: org, _env: env, _from: cur.from, _to: cur.to }),
    context.supabase.rpc('org_notes_summary', { _org: org, _env: env, _from: prev.from, _to: prev.to }),
    context.supabase.rpc('has_org_role', { org_id: org, roles: ['owner', 'admin', 'developer'] }),
    context.supabase.rpc('is_platform_admin'),
  ]);
  if (summary.error || before.error || logRole.error || platform.error) throw new Error(failed);
  const canLogs = logRole.data === true || platform.data === true;
  const { supabaseAdmin } = await import('@/integrations/supabase/client.server'); const home = await import('./panel-home.server');
  const companies = await home.loadOrgReadiness(supabaseAdmin, org, env, now);
  const [alerts, calls, integrations] = await Promise.all([
    home.loadOrgAlerts(supabaseAdmin, org, env, now, companies),
    canLogs ? context.supabase.rpc('org_integration_summary', { _org: org, _env: env, _from: new Date(now - 86_400_000).toISOString(), _to: new Date(now + 1).toISOString() }) : Promise.resolve(null),
    canLogs ? supabaseAdmin.from('integrations').select('id').eq('organization_id', org) : Promise.resolve(null),
  ]);
  if (calls?.error || integrations?.error) throw new Error(failed);
  const by = (rows: { origin: string; emitted: number; cancelled: number; rejected: number }[] | null, o: string) => { const r = (rows ?? []).find(x => x.origin === o); return { emitted: Number(r?.emitted ?? 0), cancelled: Number(r?.cancelled ?? 0), rejected: Number(r?.rejected ?? 0) }; };
  const situations = companies.map(companySituation); const count = (s: string) => situations.filter(x => x === s).length;
  const webhookAlerts = alerts.filter(a => a.kind === 'webhook_falha'); const webhookIntegrations = [...new Set(webhookAlerts.flatMap(a => a.link.kind === 'integration' ? [a.link.integration_id] : []))];
  const ids = (integrations?.data ?? []).map(i => i.id); const c = calls?.data?.[0];
  return {
    period: { key: data.period, current, previous, label: comparisonLabels[data.period] },
    companies: { total: companies.length, ready: count('prontas'), pending: count('pendencia'), inactive: count('inativas') },
    notes: { current: { notem: by(summary.data, 'notem'), externa: by(summary.data, 'externa') }, previous: { notem: by(before.data, 'notem') } },
    integration: !canLogs ? null : { integrations: ids.length, single: ids.length === 1 ? ids[0]! : null, calls: Number(c?.calls ?? 0), client_errors: Number(c?.client_errors ?? 0), server_errors: Number(c?.server_errors ?? 0),
      webhooks_failing: webhookAlerts.length, webhook_integration: webhookIntegrations.length === 1 ? webhookIntegrations[0]! : ids.length === 1 ? ids[0]! : null },
    alerts: { impeditivo: alerts.filter(a => a.severity === 'impeditivo').length, atencao: alerts.filter(a => a.severity === 'atencao').length, informativo: alerts.filter(a => a.severity === 'informativo').length },
  };
});

/** Início: "Chamadas à API (24h)" bars. One browser call; the 24 hourly windows reuse org_integration_summary
 *  (same count as the card) in parallel. Same row rule as the card: owner, admin, developer or platform admin;
 *  anyone else gets null (the block is not shown to them). */
export const getOrgCallsByHour = createServerFn({ method: 'POST' }).middleware([requireSupabaseAuth]).inputValidator(scope).handler(async ({ context, data }) => {
  await requireOrgMember(context.supabase, data.organization_id);
  const [logRole, platform] = await Promise.all([
    context.supabase.rpc('has_org_role', { org_id: data.organization_id, roles: ['owner', 'admin', 'developer'] }),
    context.supabase.rpc('is_platform_admin'),
  ]);
  if (logRole.error || platform.error) throw new Error(failed);
  if (logRole.data !== true && platform.data !== true) return null;
  const windows = hourlyWindows(Date.now());
  const rows = await Promise.all(windows.map(w => context.supabase.rpc('org_integration_summary', { _org: data.organization_id, _env: data.environment, _from: w.from, _to: w.to })));
  if (rows.some(r => r.error)) throw new Error(failed);
  return { buckets: windows.map((w, i) => { const c = rows[i]!.data?.[0]; return { from: w.from, to: w.to, calls: Number(c?.calls ?? 0), errors: Number(c?.client_errors ?? 0) + Number(c?.server_errors ?? 0) }; }) };
});

export const getOrgAlerts = createServerFn({ method: 'POST' }).middleware([requireSupabaseAuth]).inputValidator(scope).handler(async ({ context, data }) => {
  await requireOrgMember(context.supabase, data.organization_id);
  const { supabaseAdmin } = await import('@/integrations/supabase/client.server'); const { loadOrgAlerts } = await import('./panel-home.server');
  const r = await supabaseAdmin.from('companies').select('id,legal_name').eq('organization_id', data.organization_id).order('legal_name'); if (r.error) throw new Error(failed);
  return { alerts: await loadOrgAlerts(supabaseAdmin, data.organization_id, data.environment), companies: r.data ?? [] };
});

/** Ajuda: support contact only (platform_settings stays without user read access). */
export const getSupportContact = createServerFn({ method: 'POST' }).middleware([requireSupabaseAuth]).handler(async () => {
  const { supabaseAdmin } = await import('@/integrations/supabase/client.server');
  const r = await supabaseAdmin.rpc('platform_support_contact'); if (r.error) return { email: null, whatsapp: null };
  const row = (r.data ?? [])[0]; return { email: row?.support_email ?? null, whatsapp: row?.support_whatsapp ?? null };
});
