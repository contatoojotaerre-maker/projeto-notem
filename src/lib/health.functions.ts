import { createServerFn } from '@tanstack/react-start';
import { z } from './validation';
import { requireSupabaseAuth } from '@/integrations/supabase/auth-middleware';
import type { HealthResult } from './health-policy';

export const HEALTH_DENIED = 'Somente o administrador da plataforma pode ver a Saúde do sistema.';
export type HealthView = {
  ok: true;
  latest: { at: string; trigger: 'agendada' | 'manual'; result: HealthResult } | null;
  settings: { recipients: string[]; enabled: boolean };
  email: { failedAt: string | null; error: string | null; configured: boolean };
  alerts: { key: string; title: string; since: string; notifiedAt: string | null; sendError: string | null }[];
} | { ok: false; mensagem: string };

async function admin(caller: Parameters<typeof import('./platform-settings-admin.server')['isPlatformAdmin']>[0]) {
  const { isPlatformAdmin } = await import('./platform-settings-admin.server');
  if (!await isPlatformAdmin(caller)) return null;
  const { supabaseAdmin } = await import('@/integrations/supabase/client.server');
  return supabaseAdmin;
}

export const getSystemHealth = createServerFn({ method: 'POST' }).middleware([requireSupabaseAuth]).handler(async ({ context }): Promise<HealthView> => {
  const db = await admin(context.supabase); if (!db) return { ok: false, mensagem: HEALTH_DENIED };
  const [latest, settings, runtime, alerts] = await Promise.all([
    db.from('health_checks').select('created_at,trigger,result').order('created_at', { ascending: false }).limit(1).maybeSingle(),
    db.from('platform_settings').select('health_alert_recipients,health_alerts_enabled').eq('id', true).maybeSingle(),
    db.from('health_runtime').select('last_email_failed_at,last_email_error').eq('id', true).maybeSingle(),
    db.from('health_alerts').select('key,title,since,last_notified_at,send_error').eq('state', 'problema').order('since'),
  ]);
  if (latest.error || settings.error || runtime.error || alerts.error) return { ok: false, mensagem: 'Não foi possível carregar a Saúde do sistema. Tente novamente.' };
  return {
    ok: true,
    latest: latest.data ? { at: latest.data.created_at, trigger: latest.data.trigger as 'agendada' | 'manual', result: latest.data.result as unknown as HealthResult } : null,
    settings: { recipients: settings.data?.health_alert_recipients ?? [], enabled: settings.data?.health_alerts_enabled === true },
    email: { failedAt: runtime.data?.last_email_failed_at ?? null, error: runtime.data?.last_email_error ?? null, configured: !!process.env['RESEND_API_KEY'] },
    alerts: (alerts.data ?? []).map(a => ({ key: a.key, title: a.title, since: a.since, notifiedAt: a.last_notified_at, sendError: a.send_error })),
  };
});

export const runHealthNow = createServerFn({ method: 'POST' }).middleware([requireSupabaseAuth]).handler(async ({ context }): Promise<{ ok: true } | { ok: false; mensagem: string }> => {
  const db = await admin(context.supabase); if (!db) return { ok: false, mensagem: HEALTH_DENIED };
  const { runHealthCheck } = await import('./health.server');
  try {
    const r = await runHealthCheck(db, 'manual', context.userId);
    if (r.status === 'limite') return { ok: false, mensagem: 'Aguarde 1 minuto entre verificações manuais.' };
    if (r.status === 'ocupado') return { ok: false, mensagem: 'Uma verificação já está em andamento. Tente de novo em instantes.' };
    return { ok: true };
  } catch { console.error('HEALTH_MANUAL_FAILED'); return { ok: false, mensagem: 'Não foi possível concluir a verificação. Tente novamente.' }; }
});

export const saveHealthAlertSettings = createServerFn({ method: 'POST' }).middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ recipients: z.array(z.string().max(254)).max(20), enabled: z.boolean() }).parse(d))
  .handler(async ({ context, data }): Promise<{ ok: true; recipients: string[]; enabled: boolean } | { ok: false; mensagem: string }> => {
    const { normalizeRecipients } = await import('./health-policy');
    const n = normalizeRecipients(data.recipients); if (!n.ok) return n;
    if (data.enabled && !n.recipients.length) return { ok: false, mensagem: 'Cadastre pelo menos um e-mail antes de ligar os avisos.' };
    const db = await admin(context.supabase); if (!db) return { ok: false, mensagem: 'Somente o administrador da plataforma pode alterar os avisos.' };
    const r = await db.rpc('set_health_alert_settings', { _recipients: n.recipients, _enabled: data.enabled, _actor: context.userId });
    if (r.error) { const m = r.error.message; return { ok: false, mensagem: m.includes('SEM_PERMISSAO') ? 'Somente o administrador da plataforma pode alterar os avisos.' : m.includes('EMAIL_INVALIDO') ? 'E-mail inválido.' : m.includes('MAXIMO_DESTINATARIOS') ? 'Cadastre no máximo 5 e-mails.' : m.includes('SEM_DESTINATARIOS') ? 'Cadastre pelo menos um e-mail antes de ligar os avisos.' : 'Não foi possível salvar. Tente novamente.' }; }
    const row = (r.data ?? [])[0];
    return { ok: true, recipients: row?.recipients ?? n.recipients, enabled: row?.enabled ?? data.enabled };
  });

export const sendHealthTestEmail = createServerFn({ method: 'POST' }).middleware([requireSupabaseAuth]).handler(async ({ context }): Promise<{ ok: true } | { ok: false; mensagem: string }> => {
  const db = await admin(context.supabase); if (!db) return { ok: false, mensagem: HEALTH_DENIED };
  const s = await db.from('platform_settings').select('health_alert_recipients').eq('id', true).maybeSingle();
  const to = s.data?.health_alert_recipients ?? [];
  if (!to.length) return { ok: false, mensagem: 'Cadastre e salve pelo menos um e-mail antes do teste.' };
  const claim = await db.rpc('claim_health_test_email'); if (claim.error) return { ok: false, mensagem: 'Não foi possível enviar agora. Tente novamente.' };
  if (!claim.data) return { ok: false, mensagem: 'Aguarde 1 minuto entre e-mails de teste.' };
  const [{ buildAlertEmail }, { sendHealthEmail }, { HEALTH_SCREEN }] = await Promise.all([import('./health-policy'), import('./health-email.server'), import('./health.server')]);
  const r = await sendHealthEmail(to, buildAlertEmail('teste', [], HEALTH_SCREEN), `notem-saude-teste-${Date.now()}`);
  const at = new Date().toISOString();
  await db.from('health_runtime').update(r.ok ? { last_email_failed_at: null, last_email_error: null } : { last_email_failed_at: at, last_email_error: r.error }).eq('id', true);
  if (!r.ok) return { ok: false, mensagem: r.error === 'CHAVE_RESEND_AUSENTE' ? 'A chave do Resend ainda não foi cadastrada.' : 'O e-mail de teste não foi enviado. Confira a chave e o domínio no Resend.' };
  return { ok: true };
});
