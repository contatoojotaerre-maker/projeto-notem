// Layout start administration. Authorization uses the caller's own session (is_platform_admin) before any
// service-role work; the database repeats the check in set_nt009_production_start and writes the audit row.
import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database } from '@/integrations/supabase/types';
import { chooseDpsLayout, DPS_LAYOUTS, DEFAULT_NT009R1_PRODUCTION_START } from './dps-layout';
import { DEFAULT_IBSCBS_REQUIRED_FROM } from './ibscbs';

type Caller = SupabaseClient<Database>;
export const LAYOUT_DENIED = 'Somente o administrador da plataforma pode alterar o leiaute fiscal.';
export type FiscalDates = { ibsCbsRequiredFrom: { sandbox: string; production: string }; nt009r2Start: { sandbox: string | null; production: string | null } };
export type LayoutStatus = { productionStart: string; defaultStart: string; defaultIbsCbsFrom: string; updatedAt: string | null; dates: FiscalDates; current: { sandbox: { layout: string; label: string }; production: { layout: string; label: string } } };
export const FISCAL_SETTINGS = ['ibscbs_required_sandbox_from', 'ibscbs_required_production_from', 'nt009r2_sandbox_starts_at', 'nt009r2_production_starts_at'] as const;
export type FiscalSetting = typeof FISCAL_SETTINGS[number];
type Row = { nt009r1_production_starts_at?: string | null; ibscbs_required_sandbox_from?: string | null; ibscbs_required_production_from?: string | null; nt009r2_sandbox_starts_at?: string | null; nt009r2_production_starts_at?: string | null; updated_at?: string | null; updated_by?: string | null } | null;
const SELECT = 'nt009r1_production_starts_at,ibscbs_required_sandbox_from,ibscbs_required_production_from,nt009r2_sandbox_starts_at,nt009r2_production_starts_at,updated_at,updated_by';

export async function isPlatformAdmin(caller: Caller) { const r = await caller.rpc('is_platform_admin'); return r.error ? false : r.data === true; }

function status(row: Row, now: number): LayoutStatus {
  const start = row?.nt009r1_production_starts_at ?? DEFAULT_NT009R1_PRODUCTION_START;
  const dates: FiscalDates = { ibsCbsRequiredFrom: { sandbox: (row?.ibscbs_required_sandbox_from ?? DEFAULT_IBSCBS_REQUIRED_FROM).slice(0, 10), production: (row?.ibscbs_required_production_from ?? DEFAULT_IBSCBS_REQUIRED_FROM).slice(0, 10) }, nt009r2Start: { sandbox: row?.nt009r2_sandbox_starts_at ?? null, production: row?.nt009r2_production_starts_at ?? null } };
  const of = (env: 'sandbox' | 'production') => { const l = chooseDpsLayout(env, now, start, dates.nt009r2Start[env]); return { layout: l, label: DPS_LAYOUTS[l].label }; };
  return { productionStart: start, defaultStart: DEFAULT_NT009R1_PRODUCTION_START, defaultIbsCbsFrom: DEFAULT_IBSCBS_REQUIRED_FROM, updatedAt: row?.updated_by ? row.updated_at ?? null : null, dates, current: { sandbox: of('sandbox'), production: of('production') } };
}

export async function readLayoutStatus(caller: Caller, now = Date.now()): Promise<{ ok: true; status: LayoutStatus } | { ok: false; mensagem: string }> {
  if (!await isPlatformAdmin(caller)) return { ok: false, mensagem: LAYOUT_DENIED };
  const { supabaseAdmin } = await import('@/integrations/supabase/client.server');
  const r = await supabaseAdmin.from('platform_settings').select(SELECT).eq('id', true).maybeSingle();
  if (r.error) return { ok: false, mensagem: 'Não foi possível carregar o leiaute fiscal. Tente novamente.' };
  return { ok: true, status: status(r.data, now) };
}

export async function changeNt009Start(caller: Caller, userId: string, value: string, now = Date.now()): Promise<{ ok: true; status: LayoutStatus } | { ok: false; mensagem: string }> {
  if (!await isPlatformAdmin(caller)) return { ok: false, mensagem: LAYOUT_DENIED };
  const parsed = Date.parse(value);
  if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(:\d{2})?(\.\d{3})?(Z|[+-]\d{2}:\d{2})$/.test(value) || !Number.isFinite(parsed)) return { ok: false, mensagem: 'Informe uma data e hora válidas.' };
  const { supabaseAdmin } = await import('@/integrations/supabase/client.server');
  const r = await supabaseAdmin.rpc('set_nt009_production_start', { _value: new Date(parsed).toISOString(), _actor: userId });
  if (r.error) return { ok: false, mensagem: r.error.message.includes('SEM_PERMISSAO') ? LAYOUT_DENIED : r.error.message.includes('DATA_INVALIDA') ? 'A data deve estar entre 2026 e 2035.' : 'Não foi possível salvar. Tente novamente.' };
  return { ok: true, status: status(r.data as Row, now) };
}
/** IBS/CBS obligation dates (YYYY-MM-DD) and nt009r2 starts (ISO with offset, or empty to switch off), audited in the database. */
export async function changeFiscalSetting(caller: Caller, userId: string, setting: FiscalSetting, value: string, now = Date.now()): Promise<{ ok: true; status: LayoutStatus } | { ok: false; mensagem: string }> {
  if (!await isPlatformAdmin(caller)) return { ok: false, mensagem: LAYOUT_DENIED };
  const isDate = setting.startsWith('ibscbs_');
  if (isDate ? !/^\d{4}-\d{2}-\d{2}$/.test(value) || !Number.isFinite(Date.parse(value)) : value !== '' && (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(:\d{2})?(Z|[+-]\d{2}:\d{2})$/.test(value) || !Number.isFinite(Date.parse(value)))) return { ok: false, mensagem: isDate ? 'Informe uma data válida.' : 'Informe uma data e hora válidas ou deixe vazio para desligar.' };
  const { supabaseAdmin } = await import('@/integrations/supabase/client.server');
  const r = await supabaseAdmin.rpc('set_fiscal_platform_setting', { _setting: setting, _value: isDate || value === '' ? value : new Date(Date.parse(value)).toISOString(), _actor: userId });
  if (r.error) return { ok: false, mensagem: r.error.message.includes('SEM_PERMISSAO') ? LAYOUT_DENIED : r.error.message.includes('DATA_INVALIDA') ? 'A data deve estar entre 2026 e 2035.' : 'Não foi possível salvar. Tente novamente.' };
  return { ok: true, status: status(r.data as Row, now) };
}
