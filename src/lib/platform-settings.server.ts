// Platform-wide fiscal settings (single row, service role only). Read just before choosing the DPS layout.
import type { DB } from './api.server';
import { chooseDpsLayout, DEFAULT_NT009R1_PRODUCTION_START, type DpsLayout } from './dps-layout';
import { DEFAULT_IBSCBS_REQUIRED_FROM } from './ibscbs';

/** Configured production start of NT 009 release 1; a read failure throws so no DPS is sent in a guessed layout. */
export async function nt009ProductionStart(db: DB): Promise<string> {
  const r = await db.from('platform_settings').select('nt009r1_production_starts_at').eq('id', true).maybeSingle();
  if (r.error) throw new Error('PLATFORM_SETTINGS_READ_FAILED');
  const v = (r.data as { nt009r1_production_starts_at?: unknown } | null)?.nt009r1_production_starts_at;
  return typeof v === 'string' && Number.isFinite(Date.parse(v)) ? v : DEFAULT_NT009R1_PRODUCTION_START;
}
export type FiscalPlatformSettings = { nt009r1ProductionStart: string; nt009r2Start: { sandbox: string | null; production: string | null }; ibsCbsRequiredFrom: { sandbox: string; production: string } };
/** Every fiscal platform date; a read failure throws so no DPS is built or sent with a guessed rule. */
export async function fiscalPlatformSettings(db: DB): Promise<FiscalPlatformSettings> {
  const r = await db.from('platform_settings').select('nt009r1_production_starts_at,nt009r2_sandbox_starts_at,nt009r2_production_starts_at,ibscbs_required_sandbox_from,ibscbs_required_production_from').eq('id', true).maybeSingle();
  if (r.error) throw new Error('PLATFORM_SETTINGS_READ_FAILED');
  const d = (r.data ?? {}) as Record<string, unknown>; const ts = (v: unknown) => typeof v === 'string' && Number.isFinite(Date.parse(v)) ? v : null; const day = (v: unknown) => typeof v === 'string' && /^\d{4}-\d{2}-\d{2}/.test(v) ? v.slice(0, 10) : DEFAULT_IBSCBS_REQUIRED_FROM;
  return { nt009r1ProductionStart: ts(d['nt009r1_production_starts_at']) ?? DEFAULT_NT009R1_PRODUCTION_START, nt009r2Start: { sandbox: ts(d['nt009r2_sandbox_starts_at']), production: ts(d['nt009r2_production_starts_at']) }, ibsCbsRequiredFrom: { sandbox: day(d['ibscbs_required_sandbox_from']), production: day(d['ibscbs_required_production_from']) } };
}
/** Layout in force now for the environment (sandbox is always NT 009; nt009r2 only after its configured start). */
export async function currentDpsLayout(db: DB, environment: 'sandbox' | 'production', now = Date.now()): Promise<DpsLayout> {
  const s = await fiscalPlatformSettings(db);
  return chooseDpsLayout(environment, now, s.nt009r1ProductionStart, s.nt009r2Start[environment]);
}
/** First competence (YYYY-MM-DD) that must carry the IBSCBS group in the environment. */
export async function ibsCbsRequiredFrom(db: DB, environment: 'sandbox' | 'production'): Promise<string> { return (await fiscalPlatformSettings(db)).ibsCbsRequiredFrom[environment]; }
