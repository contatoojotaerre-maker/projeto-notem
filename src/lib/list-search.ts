// Filters kept in the address (?busca=…&pagina=…) for Notas, Empresas and Requisições, so going back
// from a detail keeps them. Values read from the address are validated here; anything invalid is ignored.
import type { NoteFilters } from './note-filters';
import { dayRange } from './br-format';

const DAY = /^\d{4}-\d{2}-\d{2}$/;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const str = (v: unknown, max = 100) => typeof v === 'string' && v.trim() && v.length <= max ? v : undefined;
const day = (v: unknown) => typeof v === 'string' && DAY.test(v) && Number.isFinite(Date.parse(`${v}T00:00:00Z`)) ? v : undefined;
const page = (v: unknown) => { const n = typeof v === 'number' ? v : typeof v === 'string' ? Number(v) : NaN; return Number.isInteger(n) && n > 1 && n <= 100000 ? n : undefined; };
const pick = <T extends string>(v: unknown, options: readonly T[]) => typeof v === 'string' && (options as readonly string[]).includes(v) ? v as T : undefined;
const clean = <T extends Record<string, unknown>>(o: T) => Object.fromEntries(Object.entries(o).filter(([, v]) => v !== undefined)) as Partial<T>;

export const NOTE_STATUSES = ['processing', 'verifying', 'authorized', 'rejected', 'cancellation_pending', 'cancelled', 'substituted', 'cancelled_by_authority'] as const;
export type NotesSearch = { busca?: string | undefined; empresa?: string | undefined; situacao?: string | undefined; origem?: 'notem' | 'externa' | undefined; data?: 'competencia' | undefined; de?: string | undefined; ate?: string | undefined; pagina?: number | undefined};
/** ?busca, empresa, situacao, origem, data (competencia), de, ate, pagina — validated. */
export function parseNotesSearch(s: Record<string, unknown>): NotesSearch {
  const de = day(s['de']), ate = day(s['ate']);
  return clean({ busca: str(s['busca']), empresa: typeof s['empresa'] === 'string' && UUID.test(s['empresa']) ? s['empresa'] : undefined, situacao: pick(s['situacao'], NOTE_STATUSES), origem: pick(s['origem'], ['notem', 'externa'] as const), data: pick(s['data'], ['competencia'] as const), de, ate: ate && (!de || ate >= de) ? ate : undefined, pagina: page(s['pagina']) });
}
export const NOTES_PAGE = 50;
export const hasNoteFilters = (s: NotesSearch) => Boolean(s.busca || s.empresa || s.situacao || s.origem || s.de || s.ate);
export type NotesDirection = 'emitidas' | 'recebidas';
/** Filters of list_org_notes for the list, the CSV and the ZIP (Recebidas ignore the origin filter). */
export function notesFilters(s: NotesSearch, direction: NotesDirection = 'emitidas'): NoteFilters {
  const received = direction === 'recebidas';
  return { ...s.empresa ? { company_id: s.empresa } : {}, ...s.situacao ? { status: s.situacao } : {}, ...s.origem && !received ? { origin: s.origem } : {}, ...s.de ? { from: s.de } : {}, ...s.ate ? { to: s.ate } : {}, date_field: s.data === 'competencia' ? 'competencia' : 'emissao', ...s.busca ? { search: s.busca.trim() } : {}, direction };
}
/** Situations a received note can have (it is always authorized when it reaches the ADN). */
export const RECEIVED_STATUSES = ['authorized', 'cancellation_pending', 'cancelled', 'substituted', 'cancelled_by_authority'] as const;
/** Recebidas: same address filters without the origin. */
export function parseReceivedSearch(s: Record<string, unknown>): NotesSearch { const { origem: _o, ...rest } = parseNotesSearch(s); return rest; }
export const pageOffset = (pagina: number | undefined, size: number) => ((pagina ?? 1) - 1) * size;

export const COMPANY_SEARCH_SITUATIONS = ['prontas', 'pendencia', 'inativas'] as const;
export type CompaniesSearch = { busca?: string | undefined; situacao?: typeof COMPANY_SEARCH_SITUATIONS[number] | undefined; pagina?: number | undefined};
export function parseCompaniesSearch(s: Record<string, unknown>): CompaniesSearch {
  return clean({ busca: str(s['busca']), situacao: pick(s['situacao'], COMPANY_SEARCH_SITUATIONS), pagina: page(s['pagina']) });
}

export const LOG_STATUSES = [200, 400, 401, 403, 404, 409, 413, 422, 429, 500, 502, 503] as const;
export type LogsSearch = { de?: string | undefined; ate?: string | undefined; ultimas?: '24h' | undefined; status?: number | undefined; empresa?: string | undefined; erros?: 1 | undefined; pagina?: number | undefined};
/** Chamadas filters (also used by the Início shortcut: ?erros=1&ultimas=24h). The environment is always the one of the
 *  selector at the top, so an old ?ambiente= is dropped. */
export function parseLogsSearch(s: Record<string, unknown>): LogsSearch {
  const status = Number(s['status']); const de = day(s['de']), ate = day(s['ate']);
  return clean({ de, ate: ate && (!de || ate >= de) ? ate : undefined, ultimas: pick(s['ultimas'], ['24h'] as const), status: (LOG_STATUSES as readonly number[]).includes(status) ? status : undefined, empresa: typeof s['empresa'] === 'string' && UUID.test(s['empresa']) ? s['empresa'] : undefined, erros: s['erros'] === 1 || s['erros'] === '1' || s['erros'] === true ? 1 as const : undefined, pagina: page(s['pagina']) });
}
/** Instant range of the Chamadas filters (Brasília days; "últimas 24 horas" wins over the days). */
export function logsRange(s: LogsSearch, now = Date.now()): { from?: string; until?: string } {
  if (s.ultimas === '24h') return { from: new Date(now - 86_400_000).toISOString() };
  const out: { from?: string; until?: string } = {};
  if (s.de) out.from = new Date(dayRange(s.de, s.de).from).toISOString();
  if (s.ate) out.until = new Date(Date.parse(dayRange(s.ate, s.ate).to) - 1).toISOString();
  return out;
}

/** Last list address per organization in this tab, so "voltar" from a detail restores the filters. */
export function rememberList(key: string, search: object) { try { window.sessionStorage.setItem(`notem-lista:${key}`, JSON.stringify(search)); } catch { /* ignore */ } }
export function recallList(key: string): Record<string, unknown> { try { const v = JSON.parse(window.sessionStorage.getItem(`notem-lista:${key}`) ?? '{}'); return v && typeof v === 'object' && !Array.isArray(v) ? v : {}; } catch { return {}; } }
