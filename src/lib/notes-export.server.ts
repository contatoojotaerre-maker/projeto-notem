// CSV rows and ZIP files of the notes list (Emitidas and Recebidas). Callers check membership and pass ids already returned by
// list_org_notes for the organization, environment and filters; every read stays scoped by organization.
import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database } from '@/integrations/supabase/types';
import type { DB } from './api.server';
import type { Env } from './api-contract';
import type { CsvNote, ReceivedCsvNote } from './notes-csv';
import { invoiceLabels } from './invoices';
import { normalizeCnpj } from './notem';

type Caller = SupabaseClient<Database>;
type Listed = { origin: string; id: string };
const obj = (v: unknown): Record<string, unknown> => v && typeof v === 'object' && !Array.isArray(v) ? v as Record<string, unknown> : {};
const text = (v: unknown) => v == null || v === '' ? null : String(v);
const chunks = <T,>(a: T[], n: number) => Array.from({ length: Math.ceil(a.length / n) }, (_, i) => a.slice(i * n, i * n + n));
export const CANCEL_CODES = ['101101', '105102', '305101'] as const;
const cancelled = ['cancelled', 'cancelled_by_authority', 'substituted'];

/** CSV rows in the list order, read with the caller's client (row rules apply). */
export async function csvRows(db: Caller, org: string, env: Env, listed: (Listed & { company_id: string })[]): Promise<CsvNote[]> {
  const companies = await db.from('companies').select('id,legal_name,cnpj').eq('organization_id', org); if (companies.error) throw new Error('CSV_READ_FAILED');
  const company = new Map((companies.data ?? []).map(c => [c.id, c]));
  const out = new Map<string, CsvNote>();
  for (const part of chunks(listed, 300)) {
    const own = part.filter(x => x.origin === 'notem').map(x => x.id), ext = part.filter(x => x.origin === 'externa').map(x => x.id);
    const [inv, docs] = await Promise.all([
      own.length ? db.from('invoices').select('id,company_id,status,nfse_number,dps_series,access_key,emitted_at,competence,customer_snapshot,service_snapshot,sent_values,government_values,cancellation').eq('organization_id', org).eq('environment', env).in('id', own) : Promise.resolve({ data: [], error: null }),
      ext.length ? db.from('nfse_documents').select('id,status,nfse_number,dps_series,access_key,issued_at,authorized_at,competence,taker_name,taker_document,summary').eq('environment', env).in('id', ext) : Promise.resolve({ data: [], error: null }),
    ]);
    if (inv.error || docs.error) throw new Error('CSV_READ_FAILED');
    const keys = (docs.data ?? []).filter(d => cancelled.includes(d.status)).map(d => d.access_key);
    const ev = keys.length ? await db.from('nfse_document_events').select('access_key,code,processed_at,event_at').eq('environment', env).in('access_key', keys).in('code', [...CANCEL_CODES]) : { data: [], error: null };
    if (ev.error) throw new Error('CSV_READ_FAILED');
    for (const i of inv.data ?? []) {
      const c = company.get(i.company_id); const cu = obj(i.customer_snapshot), gv = obj(i.government_values), cn = obj(i.cancellation);
      out.set(i.id, { empresa: c?.legal_name ?? '', cnpj: c?.cnpj ?? '', numero: i.nfse_number, serie: text(i.dps_series), chave: i.access_key, emitida_em: i.emitted_at, competencia: i.competence, tomador: text(cu['nome']), documento_tomador: text(cu['documento'] ?? cu['nif']), codigo_servico: text(obj(i.service_snapshot)['service_code']), valor_servico: text(obj(i.sent_values)['servico']), valor_liquido: text(gv['net']), iss: text(gv['iss']), situacao: invoiceLabels[i.status] ?? i.status, origem: 'notem', cancelada_em: cancelled.includes(i.status) ? text(cn['registrado_em']) : null });
    }
    for (const d of docs.data ?? []) {
      const l = part.find(x => x.id === d.id); const c = l ? company.get(l.company_id) : undefined; const s = obj(d.summary), v = obj(s['valores']);
      const e = (ev.data ?? []).filter(x => x.access_key === d.access_key).sort((a, b) => String(a.processed_at ?? a.event_at).localeCompare(String(b.processed_at ?? b.event_at)))[0];
      out.set(d.id, { empresa: c?.legal_name ?? '', cnpj: c?.cnpj ?? '', numero: d.nfse_number, serie: d.dps_series, chave: d.access_key, emitida_em: d.issued_at ?? d.authorized_at, competencia: d.competence, tomador: d.taker_name, documento_tomador: d.taker_document, codigo_servico: text(obj(s['servico'])['codigo_servico']), valor_servico: text(v['valor_servico']), valor_liquido: text(v['valor_liquido']), iss: text(v['valor_iss']), situacao: invoiceLabels[d.status] ?? d.status, origem: 'externa', cancelada_em: e ? e.processed_at ?? e.event_at : null });
    }
  }
  return listed.map(x => out.get(x.id)).filter((x): x is CsvNote => Boolean(x));
}

/** CSV rows of Recebidas in the list order, read with the caller's client (row rules apply). */
export async function receivedCsvRows(db: Caller, org: string, env: Env, listed: (Listed & { company_id: string })[]): Promise<ReceivedCsvNote[]> {
  const companies = await db.from('companies').select('id,legal_name,cnpj').eq('organization_id', org); if (companies.error) throw new Error('CSV_READ_FAILED');
  const company = new Map((companies.data ?? []).map(c => [c.id, c]));
  const out = new Map<string, ReceivedCsvNote>();
  for (const part of chunks(listed, 300)) {
    const docs = await db.from('nfse_documents').select('id,status,nfse_number,dps_series,access_key,issued_at,authorized_at,competence,provider_name,provider_cnpj,taker_document,summary').eq('environment', env).in('id', part.map(x => x.id));
    if (docs.error) throw new Error('CSV_READ_FAILED');
    const keys = (docs.data ?? []).filter(d => cancelled.includes(d.status)).map(d => d.access_key);
    const ev = keys.length ? await db.from('nfse_document_events').select('access_key,code,processed_at,event_at').eq('environment', env).in('access_key', keys).in('code', [...CANCEL_CODES]) : { data: [], error: null };
    if (ev.error) throw new Error('CSV_READ_FAILED');
    for (const d of docs.data ?? []) {
      const l = part.find(x => x.id === d.id); const c = l ? company.get(l.company_id) : undefined; const s = obj(d.summary), v = obj(s['valores']);
      const e = (ev.data ?? []).filter(x => x.access_key === d.access_key).sort((a, b) => String(a.processed_at ?? a.event_at).localeCompare(String(b.processed_at ?? b.event_at)))[0];
      out.set(d.id, { empresa: c?.legal_name ?? '', cnpj: c?.cnpj ?? '', papel: c && normalizeCnpj(c.cnpj) === d.taker_document ? 'tomador' : 'intermediario', numero: d.nfse_number, serie: d.dps_series, chave: d.access_key, emitida_em: d.issued_at ?? d.authorized_at, competencia: d.competence, prestador: d.provider_name, cnpj_prestador: d.provider_cnpj, codigo_servico: text(obj(s['servico'])['codigo_servico']), valor_servico: text(v['valor_servico']), valor_liquido: text(v['valor_liquido']), iss: text(v['valor_iss']), situacao: invoiceLabels[d.status] ?? d.status, cancelada_em: e ? e.processed_at ?? e.event_at : null });
    }
  }
  return listed.map(x => out.get(x.id)).filter((x): x is ReceivedCsvNote => Boolean(x));
}

export type ZipFile = { path: string; text?: string; base64?: string };
const safe = (v: string | null | undefined) => (v ?? '').replace(/[^0-9A-Za-z_-]/g, '');
const eventPrefix: Record<string, string> = { '101101': 'Cancelamento', '105102': 'Cancelamento_substituicao', '305101': 'Cancelamento_oficio' };
const toBase64 = (b: Uint8Array) => { let s = ''; for (let i = 0; i < b.length; i += 0x8000) s += String.fromCharCode(...b.subarray(i, i + 0x8000)); return btoa(s); };
export const zipName = (cnpj: string, prefix: string, number: string | null, key: string | null, ext: 'xml' | 'pdf') => `${normalizeCnpj(cnpj)}/${prefix}_${safe(number) || 'sem-numero'}_${safe(key) || 'sem-chave'}.${ext}`;

/** Files of one batch: official NFS-e XML, DANFSe (official XML only) and the official cancellation event XML. */
export async function zipFiles(db: DB, org: string, env: Env, listed: (Listed & { company_id: string })[], kinds: { xml: boolean; pdf: boolean }) {
  const notes = await import('./notes.server'); const { pdfStatuses } = await import('./danfse');
  const companies = await db.from('companies').select('id,cnpj').eq('organization_id', org); if (companies.error) throw new Error('ZIP_READ_FAILED');
  const settings = await db.from('company_fiscal_settings').select('company_id,print_danfse_receipt').eq('organization_id', org); if (settings.error) throw new Error('ZIP_READ_FAILED');
  const cnpjOf = (id: string) => companies.data?.find(c => c.id === id)?.cnpj ?? 'empresa'; const receipt = (id: string) => settings.data?.find(s => s.company_id === id)?.print_danfse_receipt ?? false;
  const files: ZipFile[] = []; const missing: { numero: string | null; motivo: string }[] = [];
  for (const l of listed) {
    let xml: string | null = null, status = '', number: string | null = null, key: string | null = null; let events: { code: string; xml: string | null }[] = [];
    if (l.origin === 'notem') {
      const r = await db.from('invoices').select('id,organization_id,environment,status,nfse_number,access_key').eq('id', l.id).eq('organization_id', org).eq('environment', env).maybeSingle();
      if (r.error || !r.data) throw new Error('ZIP_NOTE_REFUSED'); const row = r.data;
      status = row.status; number = row.nfse_number; key = row.access_key; xml = await notes.invoiceXml(db, row);
      if (cancelled.includes(status)) events = await Promise.all(CANCEL_CODES.map(async code => ({ code, xml: code === '101101' ? await notes.invoiceEventXml(db, row, code) : key ? await notes.documentEventXml(db, env, key, code) : null })));
    } else if (l.origin === 'recebida') {
      // Received note: re-checked for the company the frozen filter resolved (taker or intermediary, with proof of possession).
      const rec = await notes.loadReceivedNote(db, org, env, l.company_id, l.id); if (!rec) throw new Error('ZIP_NOTE_REFUSED');
      status = rec.doc.status; number = rec.doc.nfse_number; key = rec.doc.access_key; xml = await notes.documentXml(db, rec.doc);
      if (cancelled.includes(status)) events = await Promise.all(CANCEL_CODES.map(async code => ({ code, xml: await notes.documentEventXml(db, env, rec.doc.access_key, code) })));
    } else {
      const ext = await notes.loadExternalNote(db, org, env, l.id); if (!ext) throw new Error('ZIP_NOTE_REFUSED');
      status = ext.doc.status; number = ext.doc.nfse_number; key = ext.doc.access_key; xml = await notes.documentXml(db, ext.doc);
      if (cancelled.includes(status)) events = await Promise.all(CANCEL_CODES.map(async code => ({ code, xml: await notes.documentEventXml(db, env, ext.doc.access_key, code) })));
    }
    const cnpj = cnpjOf(l.company_id);
    if (!xml) { missing.push({ numero: number, motivo: 'Nota sem XML oficial (ainda não autorizada ou rejeitada).' }); continue; }
    if (kinds.xml) files.push({ path: zipName(cnpj, 'NFSe', number, key, 'xml'), text: xml });
    if (kinds.pdf && pdfStatuses.includes(status)) { const { generateDanfse } = await import('./danfse.server'); files.push({ path: zipName(cnpj, 'NFSe', number, key, 'pdf'), base64: toBase64(await generateDanfse(xml, status, receipt(l.company_id))) }); }
    if (kinds.xml) for (const e of events) if (e.xml) files.push({ path: zipName(cnpj, eventPrefix[e.code] ?? `Evento_${e.code}`, number, key, 'xml'), text: e.xml });
  }
  return { files, missing };
}
