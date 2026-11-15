// Server helpers shared by the API and the panel for notes issued outside notem, received notes,
// XML files and the synchronization status. Callers authorize first; every query is scoped by organization.
import type { DB } from './api.server';
import type { Env } from './api-contract';
import type { Invoice } from './invoices';
import { syncStatusOut, type NfseDocument, type SyncCursor } from './nfse-documents';
import { xmlOf } from './xml-files.server';

const digits = (v: string) => v.replace(/\D/g, '');
export async function proven(db: DB, org: string, cnpj: string | null) {
  if (!cnpj) return false; const r = await db.rpc('org_proven_cnpj', { _org: org, _cnpj: cnpj }); if (r.error) throw new Error('PROOF_READ_FAILED'); return r.data === true;
}
/** Company of the organization with this CNPJ (oldest first). */
export async function orgCompanyForCnpj(db: DB, org: string, cnpj: string) {
  const r = await db.from('companies').select('id,cnpj,created_at').eq('organization_id', org).order('created_at').order('id');
  if (r.error) throw new Error('COMPANY_READ_FAILED');
  return (r.data ?? []).find(c => digits(c.cnpj) === cnpj)?.id ?? null;
}
/** External note (issued outside notem) visible to the organization: proven CNPJ of one of its companies. */
export async function loadExternalNote(db: DB, org: string, env: Env, id: string): Promise<{ doc: NfseDocument; companyId: string } | null> {
  const r = await db.from('nfse_documents').select('*').eq('id', id).eq('environment', env).is('invoice_id', null).maybeSingle();
  if (r.error) throw new Error('DOCUMENT_READ_FAILED'); const doc = r.data; if (!doc?.provider_cnpj) return null;
  const companyId = await orgCompanyForCnpj(db, org, doc.provider_cnpj); if (!companyId) return null;
  return await proven(db, org, doc.provider_cnpj) ? { doc, companyId } : null;
}
/** Received note of one company of the organization (taker or intermediary), with proof of possession. */
export async function loadReceivedNote(db: DB, org: string, env: Env, companyId: string, id: string) {
  const c = await db.from('companies').select('id,cnpj').eq('id', companyId).eq('organization_id', org).maybeSingle();
  if (c.error) throw new Error('COMPANY_READ_FAILED'); if (!c.data) return null; const cnpj = digits(c.data.cnpj);
  if (!await proven(db, org, cnpj)) return null;
  const r = await db.from('nfse_documents').select('*').eq('id', id).eq('environment', env).or(`taker_document.eq.${cnpj},intermediary_document.eq.${cnpj}`).maybeSingle();
  if (r.error) throw new Error('DOCUMENT_READ_FAILED'); return r.data ? { doc: r.data, cnpj } : null;
}
export type ReceivedFilters = { status?: string | null | undefined; from?: string | null | undefined; to?: string | null | undefined; provider?: string | null | undefined };
export async function listReceivedNotes(db: DB, org: string, env: Env, companyId: string, f: ReceivedFilters, limit: number, offset: number) {
  const c = await db.from('companies').select('id,cnpj').eq('id', companyId).eq('organization_id', org).maybeSingle();
  if (c.error) throw new Error('COMPANY_READ_FAILED'); if (!c.data) return null; const cnpj = digits(c.data.cnpj);
  if (!await proven(db, org, cnpj)) return { cnpj, rows: [] as NfseDocument[] };
  let q = db.from('nfse_documents').select('*').eq('environment', env).or(`taker_document.eq.${cnpj},intermediary_document.eq.${cnpj}`);
  if (f.status) q = q.eq('status', f.status); if (f.provider) q = q.eq('provider_cnpj', f.provider);
  if (f.from) q = q.gte('issued_at', f.from); if (f.to) q = q.lte('issued_at', f.to);
  const r = await q.order('issued_at', { ascending: false, nullsFirst: false }).order('id').range(offset, offset + limit);
  if (r.error) throw new Error('RECEIVED_LIST_FAILED'); return { cnpj, rows: r.data ?? [] };
}

export const invoiceXml = (db: DB, i: Pick<Invoice, 'id'>) => xmlOf(db, 'invoices', i.id, 'authorized_nfse');
export const documentXml = (db: DB, d: Pick<NfseDocument, 'id'>) => xmlOf(db, 'nfse_documents', d.id, 'xml');
/** Official XML of the latest event of a key and code received from the government (ADN/Sefin). */
export async function documentEventXml(db: DB, env: Env, key: string, code: string) {
  const r = await db.from('nfse_document_events').select('id').eq('environment', env).eq('access_key', key).eq('code', code).order('sequence', { ascending: false }).limit(1).maybeSingle();
  if (r.error) throw new Error('EVENT_READ_FAILED'); return r.data ? xmlOf(db, 'nfse_document_events', r.data.id, 'xml') : null;
}
/** Official XML of a notem invoice event: the request's own copy, else the copy received from the government. */
export async function invoiceEventXml(db: DB, inv: Pick<Invoice, 'id' | 'organization_id' | 'environment' | 'access_key'>, code: string) {
  const r = await db.from('invoice_fiscal_events').select('id').eq('invoice_id', inv.id).eq('organization_id', inv.organization_id).eq('code', code).eq('status', 'registered').order('registered_at', { ascending: false }).limit(1).maybeSingle();
  if (r.error) throw new Error('EVENT_READ_FAILED');
  const own = r.data ? await xmlOf(db, 'invoice_fiscal_events', r.data.id, 'event') : null;
  return own ?? (inv.access_key ? documentEventXml(db, inv.environment as Env, inv.access_key, code) : null);
}

/** Synchronization status of a company in one environment, with the daily verification summary. */
export async function companySyncStatus(db: DB, org: string, companyId: string, env: Env) {
  const c = await db.from('companies').select('id,cnpj').eq('id', companyId).eq('organization_id', org).maybeSingle();
  if (c.error) throw new Error('COMPANY_READ_FAILED'); if (!c.data) return null; const cnpj = digits(c.data.cnpj);
  const [cursor, beat] = await Promise.all([
    db.from('adn_sync_cursors').select('next_nsu,status,last_query_at,next_query_at,last_error,last_error_code,documents_imported,first_completed_at,last_request,request').eq('cnpj', cnpj).eq('environment', env).maybeSingle(),
    db.from('system_heartbeats').select('last_success_at').eq('name', 'nfse_daily_check').maybeSingle(),
  ]);
  if (cursor.error || beat.error) throw new Error('SYNC_READ_FAILED');
  const lastRun = beat.data?.last_success_at ?? null;
  const day = lastRun ? new Date(Date.parse(lastRun) - 3 * 3_600_000).toISOString().slice(0, 10) : null;
  const d = day ? await db.from('nfse_daily_checks').select('checked,updated').eq('run_date', day).eq('company_id', companyId).eq('environment', env).maybeSingle() : null;
  if (d?.error) throw new Error('SYNC_READ_FAILED');
  const status = syncStatusOut(env, (cursor.data as SyncCursor | null) ?? null, { last_run_at: lastRun, checked: d?.data?.checked ?? 0, updated: d?.data?.updated ?? 0 });
  return { cnpj, status, proven: await proven(db, org, cnpj), next_query_at: cursor.data?.next_query_at ?? null, first_completed_at: cursor.data?.first_completed_at ?? null };
}
