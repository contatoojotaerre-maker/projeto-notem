// Layout start administration. Authorization uses the caller's own session (is_platform_admin) before any
// service-role work; the database repeats the check in set_nt009_production_start and writes the audit row.
import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database } from '@/integrations/supabase/types';
import { chooseDpsLayout, DPS_LAYOUTS, DEFAULT_NT009R1_PRODUCTION_START } from './dps-layout';

type Caller = SupabaseClient<Database>;
export const LAYOUT_DENIED = 'Somente o administrador da plataforma pode alterar o leiaute fiscal.';
export type LayoutStatus = { productionStart: string; defaultStart: string; updatedAt: string | null; current: { sandbox: { layout: string; label: string }; production: { layout: string; label: string } } };

export async function isPlatformAdmin(caller: Caller) { const r = await caller.rpc('is_platform_admin'); return r.error ? false : r.data === true; }

function status(start: string, updatedAt: string | null, now: number): LayoutStatus {
  const of = (env: 'sandbox' | 'production') => { const l = chooseDpsLayout(env, now, start); return { layout: l, label: DPS_LAYOUTS[l].label }; };
  return { productionStart: start, defaultStart: DEFAULT_NT009R1_PRODUCTION_START, updatedAt, current: { sandbox: of('sandbox'), production: of('production') } };
}

export async function readLayoutStatus(caller: Caller, now = Date.now()): Promise<{ ok: true; status: LayoutStatus } | { ok: false; mensagem: string }> {
  if (!await isPlatformAdmin(caller)) return { ok: false, mensagem: LAYOUT_DENIED };
  const { supabaseAdmin } = await import('@/integrations/supabase/client.server');
  const r = await supabaseAdmin.from('platform_settings').select('nt009r1_production_starts_at,updated_at,updated_by').eq('id', true).maybeSingle();
  if (r.error) return { ok: false, mensagem: 'Não foi possível carregar o leiaute fiscal. Tente novamente.' };
  return { ok: true, status: status(r.data?.nt009r1_production_starts_at ?? DEFAULT_NT009R1_PRODUCTION_START, r.data?.updated_by ? r.data.updated_at : null, now) };
}

export async function changeNt009Start(caller: Caller, userId: string, value: string, now = Date.now()): Promise<{ ok: true; status: LayoutStatus } | { ok: false; mensagem: string }> {
  if (!await isPlatformAdmin(caller)) return { ok: false, mensagem: LAYOUT_DENIED };
  const parsed = Date.parse(value);
  if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(:\d{2})?(\.\d{3})?(Z|[+-]\d{2}:\d{2})$/.test(value) || !Number.isFinite(parsed)) return { ok: false, mensagem: 'Informe uma data e hora válidas.' };
  const { supabaseAdmin } = await import('@/integrations/supabase/client.server');
  const r = await supabaseAdmin.rpc('set_nt009_production_start', { _value: new Date(parsed).toISOString(), _actor: userId });
  if (r.error) return { ok: false, mensagem: r.error.message.includes('SEM_PERMISSAO') ? LAYOUT_DENIED : r.error.message.includes('DATA_INVALIDA') ? 'A data deve estar entre 2026 e 2035.' : 'Não foi possível salvar. Tente novamente.' };
  const row = r.data as { nt009r1_production_starts_at: string; updated_at: string } | null;
  return { ok: true, status: status(row?.nt009r1_production_starts_at ?? new Date(parsed).toISOString(), row?.updated_at ?? null, now) };
}
