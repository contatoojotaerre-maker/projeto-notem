// Panel: manual ADN synchronization per company/environment and "Atualizar com o governo" per note.
// Roles are checked here with the caller's session before any service-role work; the database checks intervals and open requests.
import { createServerFn } from '@tanstack/react-start';
import { requireSupabaseAuth } from '@/integrations/supabase/auth-middleware';
import { z } from './validation';
import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database } from '@/integrations/supabase/types';
type Rpc = SupabaseClient<Database>;
const envs = ['production', 'sandbox'] as const;
async function hasRole(supabase: Rpc, org: string, roles: ('owner' | 'admin' | 'operator')[]) {
  const [admin, role] = await Promise.all([supabase.rpc('is_platform_admin'), supabase.rpc('has_org_role', { org_id: org, roles })]);
  return admin.data === true || role.data === true;
}
const companyScope = z.object({ organization_id: z.string().uuid(), company_id: z.string().uuid() });

export const getCompanySync = createServerFn({ method: 'POST' }).middleware([requireSupabaseAuth]).inputValidator(companyScope).handler(async ({ context, data }) => {
  const c = await context.supabase.from('companies').select('id').eq('id', data.company_id).eq('organization_id', data.organization_id).maybeSingle();
  if (c.error || !c.data) throw new Error('Empresa não encontrada ou acesso não autorizado.');
  const [{ supabaseAdmin }, { companySyncStatus }, { canRequestSync }] = await Promise.all([import('@/integrations/supabase/client.server'), import('./notes.server'), import('./adn-sync-request.server')]);
  const canSync = await canRequestSync(context.supabase, data.organization_id);
  const out = await Promise.all(envs.map(async environment => { const r = await companySyncStatus(supabaseAdmin, data.organization_id, data.company_id, environment); if (!r) throw new Error('Empresa não encontrada.'); return { environment, ...r }; }));
  return { canSync, environments: out };
});

export const requestCompanySync = createServerFn({ method: 'POST' }).middleware([requireSupabaseAuth]).inputValidator(companyScope.extend({ environment: z.enum(envs), option: z.string().regex(/^(news|period:(1|3|6|12|24))$/) })).handler(async ({ context, data }) => {
  const { startCompanySync } = await import('./adn-sync-request.server');
  return startCompanySync(context.supabase, context.userId, data);
});

/** "Atualizar com o governo": every official event of the key, at most once every 5 minutes per note. */
export const refreshNoteFromGovernment = createServerFn({ method: 'POST' }).middleware([requireSupabaseAuth]).inputValidator(z.object({ organization_id: z.string().uuid(), environment: z.enum(envs), id: z.string().uuid(), company_id: z.string().uuid().optional() })).handler(async ({ context, data }) => {
  if (!await hasRole(context.supabase, data.organization_id, ['owner', 'admin', 'operator'])) return { ok: false as const, mensagem: 'Seu papel permite apenas visualizar esta nota.' };
  const { supabaseAdmin } = await import('@/integrations/supabase/client.server'); const notes = await import('./notes.server');
  let target: { id: string; company_id: string; organization_id: string; created_by: string; environment: 'production' | 'sandbox'; access_key: string | null } | null = null;
  const own = await context.supabase.from('invoices').select('id,company_id,organization_id,environment,access_key').eq('id', data.id).eq('organization_id', data.organization_id).eq('environment', data.environment).maybeSingle();
  if (own.error) return { ok: false as const, mensagem: 'Não foi possível carregar a nota.' };
  if (own.data) target = { ...own.data, created_by: context.userId };
  else {
    const ext = await notes.loadExternalNote(supabaseAdmin, data.organization_id, data.environment, data.id);
    const rec = ext ? null : data.company_id ? await notes.loadReceivedNote(supabaseAdmin, data.organization_id, data.environment, data.company_id, data.id).then(r => r && { doc: r.doc, companyId: data.company_id! }) : await notes.findReceivedNote(supabaseAdmin, data.organization_id, data.environment, data.id);
    const doc = ext?.doc ?? rec?.doc; const company = ext?.companyId ?? rec?.companyId ?? null;
    if (doc && company) target = { id: '', company_id: company, organization_id: data.organization_id, created_by: context.userId, environment: data.environment, access_key: doc.access_key };
  }
  if (!target?.access_key) return { ok: false as const, mensagem: 'Nota não encontrada ou ainda sem chave de acesso.' };
  const t = await supabaseAdmin.rpc('touch_nfse_refresh', { _env: data.environment, _key: target.access_key, _purpose: 'atualizar_com_governo', _interval: '5 minutes' });
  if (t.error) return { ok: false as const, mensagem: 'Não foi possível consultar o governo agora.' };
  if (t.data) return { ok: false as const, mensagem: 'Esta nota foi atualizada há pouco. Aguarde para consultar novamente.', retryAt: t.data };
  const { refreshInvoiceEvents, flushNfseEventWebhooks } = await import('./adn-sync.server');
  try { const r = await refreshInvoiceEvents(supabaseAdmin, target, 'atualização da nota com o governo pelo painel', context.userId); try { await flushNfseEventWebhooks(supabaseAdmin); } catch { /* scheduler retries */ } return { ok: true as const, total: r.total, changed: r.changed }; }
  catch { return { ok: false as const, mensagem: 'O governo não respondeu agora. Tente novamente em alguns minutos.' }; }
});
