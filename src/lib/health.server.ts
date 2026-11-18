// System health check: shared by the 5-minute Cloud Scheduler callback and "Verificar agora".
// Service-role only; the caller (OIDC route or platform-admin server function) is verified before this runs.
import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database, Json } from '@/integrations/supabase/types';
import { appLink } from './app-url';
import { buildAlertEmail, evaluateHealth, planAlerts, type AlertRow, type EmailKind, type HealthResult, type HealthSnapshot, type TransmissorPing } from './health-policy';
import type { HealthMailer } from './health-email.server';

type DB = SupabaseClient<Database>;
export const HEALTH_SCREEN = appLink('/admin/saude-do-sistema');
export type HealthDeps = { ping: () => Promise<TransmissorPing>; send: HealthMailer; now: () => number };

async function defaultDeps(): Promise<HealthDeps> {
  const [{ pingTransmissor }, { sendHealthEmail }] = await Promise.all([import('./transmissor.server'), import('./health-email.server')]);
  return { ping: () => pingTransmissor(), send: sendHealthEmail, now: Date.now };
}

export type RunResult = { status: 'ok'; overall: HealthResult['overall'] } | { status: 'limite' | 'ocupado' };

export async function runHealthCheck(db: DB, trigger: 'agendada' | 'manual', actor: string | null, deps?: HealthDeps): Promise<RunResult> {
  const claim = await db.rpc('claim_health_run', { _manual: trigger === 'manual' });
  if (claim.error) throw new Error('HEALTH_CLAIM_FAILED');
  if (claim.data === 'limite' || claim.data === 'ocupado') return { status: claim.data };
  const d = deps ?? await defaultDeps();
  try {
    const [ping, snap, prev, alerts, settings] = await Promise.all([
      d.ping().catch(() => ({ ok: false, ms: null, version: null })),
      db.rpc('health_snapshot'),
      db.from('health_checks').select('result').order('created_at', { ascending: false }).limit(1).maybeSingle(),
      db.from('health_alerts').select('key,title,state,since,details,last_notified_at,last_notified_kind,resolved_at'),
      db.from('platform_settings').select('health_alert_recipients,health_alerts_enabled').eq('id', true).maybeSingle(),
    ]);
    if (snap.error || !snap.data) throw new Error('HEALTH_SNAPSHOT_FAILED');
    const now = d.now();
    const memory = (prev.data?.result as { memory?: HealthResult['memory'] } | null)?.memory ?? null;
    const result = evaluateHealth({ snapshot: snap.data as unknown as HealthSnapshot, ping, previous: memory, now });
    const ins = await db.from('health_checks').insert({ trigger, actor_id: actor, overall: result.overall, result: result as unknown as Json });
    if (ins.error) throw new Error('HEALTH_SAVE_FAILED');
    if (trigger === 'agendada') { const t = new Date(now).toISOString(); await db.from('system_heartbeats').upsert({ name: 'health_check', last_success_at: t, updated_at: t }); }
    await notify(db, d, result, (alerts.data ?? []) as AlertRow[], settings.data?.health_alert_recipients ?? [], settings.data?.health_alerts_enabled === true, now);
    const clean = await db.rpc('cleanup_health_data'); if (clean.error) console.error('HEALTH_CLEANUP_FAILED');
    return { status: 'ok', overall: result.overall };
  } finally {
    const r = await db.rpc('release_health_run'); if (r.error) console.error('HEALTH_RELEASE_FAILED');
  }
}

/** Alert states are saved before sending; an e-mail failure is recorded on the alerts and on the screen, never thrown. */
export async function notify(db: DB, d: HealthDeps, result: HealthResult, existing: AlertRow[], recipients: string[], enabled: boolean, now: number) {
  const sending = enabled && recipients.length > 0;
  const plan = planAlerts(existing, result.problems, now, sending);
  if (plan.upserts.length) {
    const up = await db.from('health_alerts').upsert(plan.upserts.map(a => ({ ...a, details: a.details as Json, updated_at: new Date(now).toISOString() })));
    if (up.error) { console.error('HEALTH_ALERTS_SAVE_FAILED'); return; }
  }
  const at = new Date(now).toISOString();
  for (const kind of ['problema', 'lembrete', 'resolvido'] as EmailKind[]) {
    const items = plan.emails[kind]; if (!items?.length) continue;
    const mail = buildAlertEmail(kind, items, HEALTH_SCREEN);
    const sent = await d.send(recipients, mail, `notem-saude-${kind}-${items.map(i => i.key).join(',')}-${Math.floor(now / 60_000)}`);
    const keys = items.map(i => i.key);
    if (sent.ok) {
      await db.from('health_alerts').update({ last_notified_at: at, last_notified_kind: kind, send_failed_at: null, send_error: null }).in('key', keys);
      await db.from('health_runtime').update({ last_email_failed_at: null, last_email_error: null }).eq('id', true);
    } else {
      console.error('HEALTH_ALERT_NOT_SENT', kind, sent.error);
      await db.from('health_alerts').update({ send_failed_at: at, send_error: sent.error.slice(0, 200) }).in('key', keys);
      await db.from('health_runtime').update({ last_email_failed_at: at, last_email_error: sent.error.slice(0, 200) }).eq('id', true);
    }
  }
}
