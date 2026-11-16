// Filters of the notes list shared by the list, the CSV and the ZIP (same rules, same database function).
import { z } from './validation';
import { BR_OFFSET } from './br-format';

const day = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);
export const noteFilterShape = {
  company_id: z.string().uuid().optional(), status: z.string().max(40).optional(), origin: z.enum(['notem', 'externa']).optional(),
  from: day.optional(), to: day.optional(), date_field: z.enum(['emissao', 'competencia']).default('emissao'), search: z.string().trim().max(100).optional(),
};
export const noteFilters = z.object(noteFilterShape);
export type NoteFilters = z.input<typeof noteFilters>;
/** Arguments of list_org_notes / org_notes_count (dates are whole Brasília days, inclusive). */
export function noteRpcArgs(f: NoteFilters) {
  const out: Record<string, string> = {};
  if (f.company_id) out['_company'] = f.company_id; if (f.status) out['_status'] = f.status; if (f.origin) out['_origin'] = f.origin;
  if (f.from) out['_from'] = `${f.from}T00:00:00${BR_OFFSET}`; if (f.to) out['_to'] = `${f.to}T23:59:59.999${BR_OFFSET}`;
  out['_date_field'] = f.date_field ?? 'emissao'; if (f.search && f.search.trim()) out['_search'] = f.search.trim();
  return out;
}
