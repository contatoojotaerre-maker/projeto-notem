// Platform-wide fiscal settings (single row, service role only). Read just before choosing the DPS layout.
import type { DB } from './api.server';
import { chooseDpsLayout, DEFAULT_NT009R1_PRODUCTION_START, type DpsLayout } from './dps-layout';

/** Configured production start of NT 009 release 1; a read failure throws so no DPS is sent in a guessed layout. */
export async function nt009ProductionStart(db: DB): Promise<string> {
  const r = await db.from('platform_settings').select('nt009r1_production_starts_at').eq('id', true).maybeSingle();
  if (r.error) throw new Error('PLATFORM_SETTINGS_READ_FAILED');
  const v = (r.data as { nt009r1_production_starts_at?: unknown } | null)?.nt009r1_production_starts_at;
  return typeof v === 'string' && Number.isFinite(Date.parse(v)) ? v : DEFAULT_NT009R1_PRODUCTION_START;
}
/** Layout in force now for the environment (sandbox never reads the setting: it is always NT 009). */
export async function currentDpsLayout(db: DB, environment: 'sandbox' | 'production', now = Date.now()): Promise<DpsLayout> {
  return chooseDpsLayout(environment, now, environment === 'production' ? await nt009ProductionStart(db) : null);
}
