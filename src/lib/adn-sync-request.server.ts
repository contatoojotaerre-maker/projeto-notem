// Manual ADN synchronization requested from the panel. Authorization uses the caller's own session (RLS and
// role functions) before any service-role work; the database repeats the role check in request_adn_sync.
import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database } from '@/integrations/supabase/types';

type Caller = SupabaseClient<Database>;
/** Only these organization roles (plus the platform administrator) may start a synchronization. */
export const SYNC_ROLES = ['owner', 'admin'] as const;
export const SYNC_DENIED = 'Somente proprietário, administrador da organização ou administrador da plataforma podem sincronizar.';

export async function canRequestSync(caller: Caller, org: string) {
  const [admin, role] = await Promise.all([caller.rpc('is_platform_admin'), caller.rpc('has_org_role', { org_id: org, roles: [...SYNC_ROLES] })]);
  return admin.data === true || role.data === true;
}

export type SyncInput = { organization_id: string; company_id: string; environment: 'production' | 'sandbox'; option: string };
export type SyncResult = { ok: true; imported: number; failed: boolean } | { ok: false; mensagem: string; retryAt?: string | null };

export async function startCompanySync(caller: Caller, userId: string, data: SyncInput): Promise<SyncResult> {
  if (!await canRequestSync(caller, data.organization_id)) return { ok: false, mensagem: SYNC_DENIED };
  const c = await caller.from('companies').select('id,cnpj').eq('id', data.company_id).eq('organization_id', data.organization_id).maybeSingle();
  if (c.error || !c.data) return { ok: false, mensagem: 'Empresa não encontrada ou acesso não autorizado.' };
  const cnpj = c.data.cnpj.replace(/\D/g, '');
  const { supabaseAdmin } = await import('@/integrations/supabase/client.server'); const { proven } = await import('./notes.server');
  if (!await proven(supabaseAdmin, data.organization_id, cnpj)) return { ok: false, mensagem: 'Cadastre o certificado digital desta empresa antes de sincronizar.' };
  const { requestAdnSync, SyncRequestError } = await import('./adn-sync.server');
  const [mode, months] = data.option === 'news' ? ['news', null] as const : ['period', Number(data.option.split(':')[1])] as const;
  try { const r = await requestAdnSync(supabaseAdmin, { cnpj, environment: data.environment, mode, months, actor: userId, organization_id: data.organization_id }); return { ok: true, imported: r.imported, failed: r.failed > 0 }; }
  catch (e) { if (e instanceof SyncRequestError) return { ok: false, mensagem: e.userMessage, retryAt: e.retryAt ?? null }; console.error('PANEL_SYNC_FAILED'); return { ok: false, mensagem: 'Não foi possível iniciar a sincronização. Tente novamente.' }; }
}
