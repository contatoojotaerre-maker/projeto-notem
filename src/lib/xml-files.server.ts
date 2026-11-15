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
/** The file when it exists; otherwise the text still kept in the table (operation in progress or before migration). */
export async function xmlOf(db: DB, table: XmlTable, id: string, kind: string, text?: string | null): Promise<string | null> {
  const refs = await xmlRefs(db, table, [id]); const ref = refs[id]?.[kind];
  if (ref) return readXml(db, ref);
  return text ?? null;
}

type Candidate = { owner_table: XmlTable; owner_id: string; kind: string; environment: Env; xml: string };
/** Moves XML text left in tables to files (clear=true) or copies it keeping the text (clear=false, migration before approval). */
export async function offloadXml(db: DB, opts: { limit?: number; clear: boolean; maxRounds?: number } ) {
  let moved = 0, failed = 0; const seen = new Set<string>(); const report: { owner_table: string; owner_id: string; kind: string; size: number; stored_size: number; sha256: string; path: string }[] = [];
  for (let round = 0; round < (opts.maxRounds ?? 1); round++) {
    const r = await db.rpc('xml_offload_candidates', { _limit: opts.limit ?? 20 });
    if (r.error) throw new Error('XML_CANDIDATES_FAILED');
    const rows = (r.data ?? []) as Candidate[]; const fresh = rows.filter(c => !seen.has(`${c.owner_table}:${c.owner_id}:${c.kind}`));
    if (!fresh.length) break;
    for (const c of fresh) {
      seen.add(`${c.owner_table}:${c.owner_id}:${c.kind}`);
      try {
        const bytes = new TextEncoder().encode(c.xml); const sha = await sha256Hex(bytes);
        const ref = await storeXml(db, xmlPath(c.environment, ownerFolder(c.owner_table, c.owner_id), c.kind, sha), c.xml);
        const a = await db.rpc('attach_xml_file', { _table: c.owner_table, _id: c.owner_id, _kind: c.kind, _file: ref, _clear: opts.clear });
        if (a.error) throw new Error('XML_ATTACH_FAILED');
        moved++; report.push({ owner_table: c.owner_table, owner_id: c.owner_id, kind: c.kind, ...ref });
      } catch (e) { failed++; console.error('XML_OFFLOAD_FAILED', c.owner_table, c.kind, e instanceof Error ? e.message : ''); }
    }
  }
  return { moved, failed, report };
}
