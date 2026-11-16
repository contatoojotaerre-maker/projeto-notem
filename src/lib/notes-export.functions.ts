// Exports of the notes list (CSV and ZIP assembled in the browser), allowed to whoever sees the notes.
// Every export is audited (who, when, filters, quantity) without its content.
import { createServerFn } from '@tanstack/react-start';
import { requireSupabaseAuth } from '@/integrations/supabase/auth-middleware';
import { z, integer } from './validation';
import { requireOrgMember } from './panel-access';
import { batchAllowed, noteFilters, noteRpcArgs, type NoteFilters } from './note-filters';
import { CSV_LIMIT, csvTooLarge } from './notes-csv';
import { PANEL_FILE_LIMITS, limitMessages } from './api-policy';
import { dayBr } from './br-format';

export const ZIP_LIMIT = 500;
export const ZIP_BATCH = 20;
const scope = z.object({ organization_id: z.string().uuid(), environment: z.enum(['sandbox', 'production']) });
const kinds = z.object({ xml: z.boolean(), pdf: z.boolean() }).refine(k => k.xml || k.pdf, 'Escolha XML, PDF ou os dois.');
const refused = 'Lote recusado: há nota fora do filtro ou de outra organização.';
type Caller = Parameters<typeof requireOrgMember>[0];
const fileBase = (f: NoteFilters) => f.direction === 'recebidas' ? 'notas-recebidas' : 'notas';

async function audit(row: { action: string; actor: string; org: string; target: string | null; details: Record<string, unknown> }) {
  const { supabaseAdmin } = await import('@/integrations/supabase/client.server');
  const r = await supabaseAdmin.from('admin_audit_events').insert({ action: row.action, actor_id: row.actor, organization_id: row.org, target_type: 'exportacao_notas', target_id: row.target, details: row.details as never });
  if (r.error) throw new Error('Não foi possível registrar a exportação. Tente novamente.');
}
async function listed(db: Caller, org: string, env: 'sandbox' | 'production', f: NoteFilters, limit: number) {
  const r = await db.rpc('list_org_notes', { _org: org, _env: env, ...noteRpcArgs(f), _limit: limit, _offset: 0 });
  if (r.error) throw new Error('Não foi possível ler as notas do filtro.'); return r.data ?? [];
}
async function count(db: Caller, org: string, env: 'sandbox' | 'production', f: NoteFilters) {
  const r = await db.rpc('org_notes_count', { _org: org, _env: env, ...noteRpcArgs(f) });
  if (r.error) throw new Error('Não foi possível contar as notas do filtro.'); return Number(r.data ?? 0);
}

export const exportInvoicesCsv = createServerFn({ method: 'POST' }).middleware([requireSupabaseAuth]).inputValidator(scope.extend({ filters: noteFilters })).handler(async ({ context, data }) => {
  await requireOrgMember(context.supabase, data.organization_id);
  const total = await count(context.supabase, data.organization_id, data.environment, data.filters);
  if (total > CSV_LIMIT) return { ok: false as const, mensagem: csvTooLarge(total) };
  const rows = await listed(context.supabase, data.organization_id, data.environment, data.filters, CSV_LIMIT);
  const { csvRows, receivedCsvRows } = await import('./notes-export.server'); const { buildNotesCsv, buildReceivedCsv } = await import('./notes-csv');
  const received = data.filters.direction === 'recebidas';
  const csv = received ? buildReceivedCsv(await receivedCsvRows(context.supabase, data.organization_id, data.environment, rows)) : buildNotesCsv(await csvRows(context.supabase, data.organization_id, data.environment, rows));
  await audit({ action: 'notas.exportacao_csv', actor: context.userId, org: data.organization_id, target: null, details: { ambiente: data.environment, filtros: data.filters, quantidade: rows.length } });
  return { ok: true as const, csv, count: rows.length, filename: `${fileBase(data.filters)}-${data.environment === 'sandbox' ? 'homologacao' : 'producao'}-${dayBr()}.csv` };
});

/** Starts a ZIP: freezes the filters in the audit row and returns the ids the browser will request in batches. */
export const startZipExport = createServerFn({ method: 'POST' }).middleware([requireSupabaseAuth]).inputValidator(scope.extend({ filters: noteFilters, kinds })).handler(async ({ context, data }) => {
  await requireOrgMember(context.supabase, data.organization_id);
  const total = await count(context.supabase, data.organization_id, data.environment, data.filters);
  if (total > ZIP_LIMIT) return { ok: false as const, mensagem: `O filtro tem ${total.toLocaleString('pt-BR')} notas; o limite por ZIP é ${ZIP_LIMIT}. Reduza o período.` };
  if (total === 0) return { ok: false as const, mensagem: 'Nenhuma nota no filtro.' };
  const rows = await listed(context.supabase, data.organization_id, data.environment, data.filters, ZIP_LIMIT);
  const id = crypto.randomUUID();
  await audit({ action: 'notas.exportacao_zip_inicio', actor: context.userId, org: data.organization_id, target: id, details: { ambiente: data.environment, filtros: data.filters, formatos: data.kinds, quantidade: rows.length } });
  return { ok: true as const, export_id: id, ids: rows.map(r => r.id), filename: `${fileBase(data.filters)}-${data.environment === 'sandbox' ? 'homologacao' : 'producao'}-${dayBr()}.zip` };
});

/** One batch at a time per user, limited per minute; each id is checked against the frozen filter (organization,
 *  environment and proof of possession come from list_org_notes under the caller's own row rules). */
export const getExportFiles = createServerFn({ method: 'POST' }).middleware([requireSupabaseAuth]).inputValidator(z.object({ organization_id: z.string().uuid(), export_id: z.string().uuid(), ids: z.array(z.string().uuid()).min(1).max(ZIP_BATCH) })).handler(async ({ context, data }) => {
  await requireOrgMember(context.supabase, data.organization_id);
  const { supabaseAdmin } = await import('@/integrations/supabase/client.server');
  const start = await supabaseAdmin.from('admin_audit_events').select('details,created_at').eq('action', 'notas.exportacao_zip_inicio').eq('target_id', data.export_id).eq('actor_id', context.userId).eq('organization_id', data.organization_id).maybeSingle();
  if (start.error || !start.data || Date.now() - Date.parse(start.data.created_at) > 2 * 3_600_000) throw new Error('Exportação não encontrada ou expirada. Comece novamente.');
  const d = start.data.details as { ambiente: 'sandbox' | 'production'; filtros: NoteFilters; formatos: { xml: boolean; pdf: boolean } };
  const rate = await supabaseAdmin.rpc('api_rate_check', { _org: data.organization_id, _rules: [{ scope: `painel:${context.userId}`, bucket: 'painel_arquivos', ...PANEL_FILE_LIMITS.rate }] as never });
  if (rate.error) console.error('PANEL_RATE_CHECK_FAILED'); // counter outage: fail open, as in the API
  else if ((rate.data as { allowed?: boolean } | null)?.allowed === false) return { ok: false as const, retry: true, mensagem: limitMessages['painel_arquivos'] ?? '' };
  const slot = await supabaseAdmin.rpc('api_slot_acquire', { _scope: `painel-arquivos:${context.userId}`, _max: PANEL_FILE_LIMITS.concurrent, _ttl: 120 });
  if (slot.error) console.error('PANEL_SLOT_FAILED');
  else if (!slot.data) return { ok: false as const, retry: true, mensagem: limitMessages['painel_lote'] ?? '' };
  try {
    const allowed = new Map((await listed(context.supabase, data.organization_id, d.ambiente, d.filtros, ZIP_LIMIT + 1)).map(r => [r.id, r]));
    if (!batchAllowed(new Set(allowed.keys()), data.ids)) throw new Error(refused);
    const batch = data.ids.map(id => allowed.get(id));
    const { zipFiles } = await import('./notes-export.server');
    try { return { ok: true as const, ...await zipFiles(supabaseAdmin, data.organization_id, d.ambiente, batch as NonNullable<typeof batch[number]>[], d.formatos) }; }
    catch (e) { if (e instanceof Error && e.message === 'ZIP_NOTE_REFUSED') throw new Error(refused); console.error('PANEL_ZIP_FILES_FAILED'); throw new Error('Não foi possível preparar os arquivos deste lote. Tente novamente.'); }
  } finally { if (slot.data) { const r = await supabaseAdmin.rpc('api_slot_release', { _token: slot.data }); if (r.error) console.error('PANEL_SLOT_RELEASE_FAILED'); } }
});

export const finishZipExport = createServerFn({ method: 'POST' }).middleware([requireSupabaseAuth]).inputValidator(z.object({ organization_id: z.string().uuid(), export_id: z.string().uuid(), outcome: z.enum(['concluida', 'interrompida']), files: integer().min(0).max(5000), notes: integer().min(0).max(ZIP_LIMIT), without_file: integer().min(0).max(ZIP_LIMIT) })).handler(async ({ context, data }) => {
  await requireOrgMember(context.supabase, data.organization_id);
  const { supabaseAdmin } = await import('@/integrations/supabase/client.server');
  const start = await supabaseAdmin.from('admin_audit_events').select('id').eq('action', 'notas.exportacao_zip_inicio').eq('target_id', data.export_id).eq('actor_id', context.userId).eq('organization_id', data.organization_id).maybeSingle();
  if (start.error || !start.data) throw new Error('Exportação não encontrada.');
  await audit({ action: 'notas.exportacao_zip_fim', actor: context.userId, org: data.organization_id, target: data.export_id, details: { resultado: data.outcome, notas: data.notes, arquivos: data.files, notas_sem_arquivo: data.without_file } });
  return { ok: true as const };
});
