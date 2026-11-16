import { createServerFn } from '@tanstack/react-start';
import { requireSupabaseAuth } from '@/integrations/supabase/auth-middleware';
import { z } from './validation';
import { requireOrgMember } from './panel-access';
import { PERIODS, periodDays, dayRange } from './br-format';

const scope = z.object({ organization_id: z.string().uuid(), environment: z.enum(['sandbox', 'production']) });
const failed = 'Não foi possível carregar o painel. Tente novamente.';

/** Início: companies, notes of the period (counted and summed in the database), pendências and the last 10 notes. */
export const getOrgDashboard = createServerFn({ method: 'POST' }).middleware([requireSupabaseAuth]).inputValidator(scope.extend({ period: z.enum(PERIODS).default('mes_atual') })).handler(async ({ context, data }) => {
  await requireOrgMember(context.supabase, data.organization_id);
  const days = periodDays(data.period); const range = dayRange(days.first, days.last);
  const [summary, latest] = await Promise.all([
    context.supabase.rpc('org_notes_summary', { _org: data.organization_id, _env: data.environment, _from: range.from, _to: range.to }),
    context.supabase.rpc('list_org_notes', { _org: data.organization_id, _env: data.environment, _limit: 10, _offset: 0 }),
  ]);
  if (summary.error || latest.error) throw new Error(failed);
  const { supabaseAdmin } = await import('@/integrations/supabase/client.server'); const home = await import('./panel-home.server'); const { enrichNotes } = await import('./notes-list.server');
  const companies = await home.loadOrgReadiness(supabaseAdmin, data.organization_id, data.environment);
  const [alerts, notes] = await Promise.all([home.loadOrgAlerts(supabaseAdmin, data.organization_id, data.environment, Date.now(), companies), enrichNotes(context.supabase, data.organization_id, latest.data ?? [])]);
  const by = (o: string) => (summary.data ?? []).find(r => r.origin === o) ?? { emitted: 0, amount: '0.00', cancelled: 0, rejected: 0 };
  return {
    period: { key: data.period, ...days },
    companies: { total: companies.length, active: companies.filter(c => c.active).length, inactive: companies.filter(c => !c.active).length, ready: companies.filter(c => c.active && c.readiness.pronta_para_emitir).length, pending: companies.filter(c => c.active && !c.readiness.pronta_para_emitir).length },
    notes: { notem: by('notem'), externa: by('externa') },
    alerts: alerts.slice(0, 5), alertCount: alerts.length,
    latest: notes.map(n => ({ ...n, company_name: companies.find(c => c.id === n.company_id)?.legal_name ?? null })),
  };
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
