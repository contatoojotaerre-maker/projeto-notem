// XML of notes and events stored as gzip files in the private bucket "fiscal-xml" (server only).
// Tables keep only the reference (path, original size, stored size, SHA-256); reading checks the SHA-256 before returning.
import type { DB } from './api.server';

export const XML_BUCKET = 'fiscal-xml';
export type XmlTable = 'invoices' | 'invoice_dps_attempts' | 'invoice_fiscal_events' | 'nfse_documents' | 'nfse_document_events';
export type XmlRef = { path: string; size: number; stored_size: number; sha256: string };
type Env = 'sandbox' | 'production';

const hex = (b: ArrayBuffer) => [...new Uint8Array(b)].map(x => x.toString(16).padStart(2, '0')).join('');
export async function sha256Hex(bytes: Uint8Array) { return hex(await crypto.subtle.digest('SHA-256', bytes as BufferSource)); }

async function pipe(bytes: Uint8Array, stream: CompressionStream | DecompressionStream, limit = 50_000_000) {
  const writer = stream.writable.getWriter();
  void writer.write(bytes as BufferSource).then(() => writer.close()).catch(() => undefined);
  const reader = stream.readable.getReader(); const parts: Uint8Array[] = []; let size = 0;
  for (;;) { const { done, value } = await reader.read(); if (done) break; parts.push(value); size += value.length; if (size > limit) throw new Error('XML_TOO_LARGE'); }
  const out = new Uint8Array(size); let o = 0; for (const p of parts) { out.set(p, o); o += p.length; } return out;
}
export const gzip = (bytes: Uint8Array) => pipe(bytes, new CompressionStream('gzip'));
export const gunzip = (bytes: Uint8Array) => pipe(bytes, new DecompressionStream('gzip'));

const envDir = (env: Env) => env === 'sandbox' ? 'homologacao' : 'producao';
const safe = (v: string) => v.toLowerCase().replace(/[^a-z0-9_-]/g, '');
/** Deterministic, content-addressed path: storing the same XML twice writes the same file. */
export function xmlPath(env: Env, folder: string, name: string, sha: string) {
  return `${envDir(env)}/${folder.split('/').map(safe).join('/')}/${safe(name)}-${sha.slice(0, 16)}.xml.gz`;
}
export function ownerFolder(table: XmlTable, id: string, extra?: string) {
  const base = { invoices: 'notas', invoice_dps_attempts: 'tentativas-dps', invoice_fiscal_events: 'pedidos-evento', nfse_documents: 'adn/nfse', nfse_document_events: 'adn/eventos' }[table];
  return `${base}/${extra ?? id}`;
}

/** Compresses and uploads one XML; re-downloads it and compares byte by byte before returning the reference. */
export async function storeXml(db: DB, path: string, xml: string, verify = true): Promise<XmlRef> {
  const bytes = new TextEncoder().encode(xml); const sha = await sha256Hex(bytes); const packed = await gzip(bytes);
  const finalPath = path.includes('{sha}') ? path.replace('{sha}', sha.slice(0, 16)) : path;
  const up = await db.storage.from(XML_BUCKET).upload(finalPath, packed, { upsert: true, contentType: 'application/gzip', cacheControl: 'no-store' });
  if (up.error) throw new Error('XML_UPLOAD_FAILED');
  const ref = { path: finalPath, size: bytes.length, stored_size: packed.length, sha256: sha };
  if (verify) { const back = await readXmlBytes(db, ref); if (back.length !== bytes.length || back.some((b, i) => b !== bytes[i])) throw new Error('XML_VERIFY_FAILED'); }
  return ref;
}
export async function readXmlBytes(db: DB, ref: Pick<XmlRef, 'path' | 'sha256'>) {
  const r = await db.storage.from(XML_BUCKET).download(ref.path);
  if (r.error || !r.data) throw new Error('XML_DOWNLOAD_FAILED');
  const bytes = await gunzip(new Uint8Array(await r.data.arrayBuffer()));
  if (await sha256Hex(bytes) !== ref.sha256) throw new Error('XML_HASH_MISMATCH');
  return bytes;
}
export async function readXml(db: DB, ref: Pick<XmlRef, 'path' | 'sha256'>) { return new TextDecoder('utf-8').decode(await readXmlBytes(db, ref)); }

/** References of several owners at once: { [owner_id]: { [kind]: ref } }. */
export async function xmlRefs(db: DB, table: XmlTable, ids: string[]) {
  const out: Record<string, Record<string, XmlRef>> = {};
  if (!ids.length) return out;
  const r = await db.from('fiscal_xml_files').select('owner_id,kind,path,size,stored_size,sha256').eq('owner_table', table).in('owner_id', ids);
  if (r.error) throw new Error('XML_REFS_READ_FAILED');
  for (const f of r.data ?? []) (out[f.owner_id] ??= {})[f.kind] = { path: f.path, size: f.size, stored_size: f.stored_size, sha256: f.sha256 };
  return out;
}
/** XML of one owner and kind, read from its file (the only copy); null when the owner has no file of that kind. */
export async function xmlOf(db: DB, table: XmlTable, id: string, kind: string): Promise<string | null> {
  const refs = await xmlRefs(db, table, [id]); const ref = refs[id]?.[kind];
  return ref ? readXml(db, ref) : null;
}
/** Uploads (gzip, verified byte by byte) the XML of one owner and returns the reference to persist atomically in its RPC. */
export async function putXml(db: DB, env: Env, table: XmlTable, id: string, kind: string, xml: string) {
  return storeXml(db, xmlPath(env, ownerFolder(table, id), kind, await sha256Hex(new TextEncoder().encode(xml))), xml);
}
/** Same, logging instead of failing: for copies that are only kept for audit (signed DPS/event). */
export async function putXmlOptional(db: DB, env: Env, table: XmlTable, id: string, kind: string, xml: string | null | undefined) {
  if (!xml) return undefined;
  try { return await putXml(db, env, table, id, kind, xml); } catch (e) { console.error('XML_AUDIT_COPY_FAILED', table, kind, e instanceof Error ? e.message : ''); return undefined; }
}
/** The base DPS file is stored before numbering (number 1); the reserved Id/nDPS of the invoice are applied when sending. */
export function dpsWithNumber(base: string, dpsId: string, number: string | number) {
  const out = base.replace(/Id="DPS[0-9]+"/, `Id="${dpsId}"`).replace(/<nDPS>[0-9]+<\/nDPS>/, `<nDPS>${String(number)}</nDPS>`);
  if (!out.includes(`Id="${dpsId}"`) || !out.includes(`<nDPS>${String(number)}</nDPS>`)) throw new Error('DPS_BASE_INVALIDA');
  return out;
}
/** Unsigned DPS of the invoice with its current reserved number (after E0014 skips, the base keeps number 1 or the first number). */
export async function invoiceDpsXml(db: DB, i: { id: string; dps_id: string; dps_number: number | string }) {
  const base = await xmlOf(db, 'invoices', i.id, 'unsigned_dps'); if (!base) throw new Error('DPS_BASE_AUSENTE');
  return dpsWithNumber(base, i.dps_id, i.dps_number);
}
