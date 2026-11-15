// API v1: received notes of a company (taker or intermediary) and the read-only synchronization status.
import type { ApiCtx, ApiResult } from './api.server';
import { fail, page, pageParams } from './api-contract';
import { invoiceStatuses } from './invoices';
import { pdfStatuses } from './danfse';
import { receivedOut } from './nfse-documents';
import { companySyncStatus, documentXml, listReceivedNotes, loadReceivedNote } from './notes.server';

const uuid = (v: string | undefined) => !!v && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(v);
function companyId(ctx: ApiCtx) { const id = ctx.params['id']; if (!uuid(id)) throw fail(404, 'NAO_ENCONTRADO'); ctx.setCompany(id!); return id!; }
async function received(ctx: ApiCtx) {
  const id = companyId(ctx); const nota = ctx.params['notaId']; if (!uuid(nota)) throw fail(404, 'NAO_ENCONTRADO');
  const r = await loadReceivedNote(ctx.db, ctx.organization_id, ctx.env, id, nota!); if (!r) throw fail(404, 'NAO_ENCONTRADO'); return { ...r, companyId: id };
}
export async function listReceived(ctx: ApiCtx): Promise<ApiResult> {
  const id = companyId(ctx); const { limite, offset } = pageParams(ctx.url); const p = ctx.url.searchParams;
  const status = p.get('situacao'); const dbStatus = status ? Object.entries(invoiceStatuses).find(([, l]) => l === status)?.[0] : null;
  if (status && !dbStatus) throw fail(400, 'REQUISICAO_INVALIDA', [{ campo: 'situacao', mensagem: 'Situação inválida.' }]);
  const provider = p.get('prestador_cnpj'); if (provider && !/^\d{14}$/.test(provider)) throw fail(400, 'REQUISICAO_INVALIDA', [{ campo: 'prestador_cnpj', mensagem: 'Informe o CNPJ com 14 números.' }]);
  const range: Record<string, string | null> = { emitida_de: null, emitida_ate: null };
  for (const f of ['emitida_de', 'emitida_ate'] as const) { const d = p.get(f); if (d) { if (!/^\d{4}-\d{2}-\d{2}$/.test(d) || !Number.isFinite(Date.parse(d))) throw fail(400, 'REQUISICAO_INVALIDA', [{ campo: f, mensagem: 'Informe data válida no formato AAAA-MM-DD.' }]); range[f] = f === 'emitida_de' ? `${d}T00:00:00-03:00` : `${d}T23:59:59.999-03:00`; } }
  const r = await listReceivedNotes(ctx.db, ctx.organization_id, ctx.env, id, { status: dbStatus ?? null, provider, from: range['emitida_de'], to: range['emitida_ate'] }, limite, offset);
  if (!r) throw fail(404, 'NAO_ENCONTRADO');
  return { status: 200, body: page(r.rows.map(d => receivedOut(d, id, r.cnpj)), limite, offset) };
}
export async function getReceived(ctx: ApiCtx): Promise<ApiResult> { const r = await received(ctx); return { status: 200, body: receivedOut(r.doc, r.companyId, r.cnpj) }; }
export async function getReceivedXml(ctx: ApiCtx): Promise<ApiResult> {
  const r = await received(ctx); const xml = await documentXml(ctx.db, r.doc); if (!xml) throw fail(404, 'NAO_ENCONTRADO');
  return { status: 200, body: xml, headers: { 'Content-Type': 'application/xml; charset=utf-8', 'Content-Disposition': `attachment; filename="nfse-recebida-${r.doc.id}.xml"` } };
}
export async function getReceivedPdf(ctx: ApiCtx): Promise<ApiResult> {
  const r = await received(ctx); const xml = pdfStatuses.includes(r.doc.status) ? await documentXml(ctx.db, r.doc) : null;
  if (!xml) throw fail(404, 'NAO_ENCONTRADO', [], 'DANFSe ainda não disponível.');
  const { generateDanfse } = await import('./danfse.server');
  return { status: 200, body: await generateDanfse(xml, r.doc.status, false), headers: { 'Content-Type': 'application/pdf', 'Content-Disposition': `attachment; filename="danfse-recebida-${r.doc.nfse_number ?? r.doc.id}.pdf"` } };
}
export async function getSync(ctx: ApiCtx): Promise<ApiResult> {
  const r = await companySyncStatus(ctx.db, ctx.organization_id, companyId(ctx), ctx.env); if (!r) throw fail(404, 'NAO_ENCONTRADO');
  return { status: 200, body: r.status };
}
