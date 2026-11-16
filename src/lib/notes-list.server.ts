// Display rows for ids returned by list_org_notes, read with the caller's own client (row rules apply).
import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database } from '@/integrations/supabase/types';

type Caller = SupabaseClient<Database>;
type Listed = { origin: string; id: string; company_id: string; issued_at: string };
const str = (v: unknown) => v == null || v === '' ? null : String(v);
const obj = (v: unknown): Record<string, unknown> => v && typeof v === 'object' && !Array.isArray(v) ? v as Record<string, unknown> : {};
export type NoteRow = { id: string; origin: 'notem' | 'externa'; status: string; company_id: string; number: string | null; external_id: string | null; customer: { nome: string | null; documento: string | null }; value: string | null; emitted_at: string };

export async function enrichNotes(db: Caller, org: string, rows: Listed[]): Promise<NoteRow[]> {
  const own = rows.filter(x => x.origin === 'notem').map(x => x.id), ext = rows.filter(x => x.origin === 'externa').map(x => x.id);
  const [inv, docs] = await Promise.all([
    own.length ? db.from('invoices').select('id,status,company_id,nfse_number,external_id,customer_snapshot,sent_values,emitted_at').eq('organization_id', org).in('id', own) : Promise.resolve({ data: [], error: null }),
    ext.length ? db.from('nfse_documents').select('id,status,nfse_number,taker_name,taker_document,summary,issued_at,authorized_at,created_at').in('id', ext) : Promise.resolve({ data: [], error: null }),
  ]);
  if (inv.error || docs.error) throw new Error('Não foi possível carregar as notas.');
  return rows.map((x): NoteRow | null => {
    if (x.origin === 'notem') {
      const i = (inv.data ?? []).find(v => v.id === x.id); if (!i) return null; const c = obj(i.customer_snapshot);
      return { id: i.id, origin: 'notem', status: i.status, company_id: i.company_id, number: i.nfse_number, external_id: i.external_id, customer: { nome: str(c['nome']), documento: str(c['documento'] ?? c['nif']) }, value: typeof obj(i.sent_values)['servico'] === 'string' ? obj(i.sent_values)['servico'] as string : null, emitted_at: i.emitted_at };
    }
    const d = (docs.data ?? []).find(v => v.id === x.id); if (!d) return null; const v = obj(obj(d.summary)['valores'])['valor_servico'];
    return { id: d.id, origin: 'externa', status: d.status, company_id: x.company_id, number: d.nfse_number, external_id: null, customer: { nome: d.taker_name, documento: d.taker_document }, value: typeof v === 'string' ? v : null, emitted_at: d.issued_at ?? d.authorized_at ?? d.created_at };
  }).filter((x): x is NoteRow => x !== null);
}
