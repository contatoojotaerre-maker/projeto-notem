// Display rows for ids returned by list_org_notes, read with the caller's own client (row rules apply).
import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database } from '@/integrations/supabase/types';
import { normalizeCnpj } from './notem';

type Caller = SupabaseClient<Database>;
type Listed = { origin: string; id: string; company_id: string; issued_at: string };
const str = (v: unknown) => v == null || v === '' ? null : String(v);
const obj = (v: unknown): Record<string, unknown> => v && typeof v === 'object' && !Array.isArray(v) ? v as Record<string, unknown> : {};
/** origin: notem / externa (Emitidas) or recebida (Recebidas: the company is taker or intermediary). */
export type NoteRow = { id: string; origin: 'notem' | 'externa' | 'recebida'; status: string; company_id: string; number: string | null; external_id: string | null; customer: { nome: string | null; documento: string | null }; provider: { nome: string | null; cnpj: string | null } | null; role: 'tomador' | 'intermediario' | null; value: string | null; emitted_at: string };

export async function enrichNotes(db: Caller, org: string, rows: Listed[]): Promise<NoteRow[]> {
  const own = rows.filter(x => x.origin === 'notem').map(x => x.id), docIds = rows.filter(x => x.origin !== 'notem').map(x => x.id);
  const received = rows.some(x => x.origin === 'recebida');
  const [inv, docs, companies] = await Promise.all([
    own.length ? db.from('invoices').select('id,status,company_id,nfse_number,external_id,customer_snapshot,sent_values,emitted_at').eq('organization_id', org).in('id', own) : Promise.resolve({ data: [], error: null }),
    docIds.length ? db.from('nfse_documents').select('id,status,nfse_number,taker_name,taker_document,provider_name,provider_cnpj,summary,issued_at,authorized_at,created_at').in('id', docIds) : Promise.resolve({ data: [], error: null }),
    received ? db.from('companies').select('id,cnpj').eq('organization_id', org) : Promise.resolve({ data: [], error: null }),
  ]);
  if (inv.error || docs.error || companies.error) throw new Error('Não foi possível carregar as notas.');
  const cnpjOf = new Map((companies.data ?? []).map(c => [c.id, normalizeCnpj(c.cnpj)]));
  return rows.map((x): NoteRow | null => {
    if (x.origin === 'notem') {
      const i = (inv.data ?? []).find(v => v.id === x.id); if (!i) return null; const c = obj(i.customer_snapshot);
      return { id: i.id, origin: 'notem', status: i.status, company_id: i.company_id, number: i.nfse_number, external_id: i.external_id, customer: { nome: str(c['nome']), documento: str(c['documento'] ?? c['nif']) }, provider: null, role: null, value: typeof obj(i.sent_values)['servico'] === 'string' ? obj(i.sent_values)['servico'] as string : null, emitted_at: i.emitted_at };
    }
    const d = (docs.data ?? []).find(v => v.id === x.id); if (!d) return null; const v = obj(obj(d.summary)['valores'])['valor_servico'];
    const base = { id: d.id, status: d.status, company_id: x.company_id, number: d.nfse_number, external_id: null, customer: { nome: d.taker_name, documento: d.taker_document }, value: typeof v === 'string' ? v : null, emitted_at: d.issued_at ?? d.authorized_at ?? d.created_at };
    if (x.origin === 'recebida') return { ...base, origin: 'recebida', provider: { nome: d.provider_name, cnpj: d.provider_cnpj }, role: cnpjOf.get(x.company_id) === d.taker_document ? 'tomador' : 'intermediario' };
    return { ...base, origin: 'externa', provider: null, role: null };
  }).filter((x): x is NoteRow => x !== null);
}
