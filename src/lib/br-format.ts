// Brazilian formatting shared by the panel and exports: exact money from decimal strings (never float
// arithmetic), Brasília dates (UTC-3, no daylight saving since 2019) and the Início periods.
export const BR_OFFSET = '-03:00';
const BR_MS = 3 * 3_600_000;

/** Exact decimal string with 2 places ("1749" -> "1749.00", 249.9 -> "249.90"); null when not a number. */
export function decimal2(value: unknown): string | null {
  if (value == null || value === '') return null;
  const s = typeof value === 'number' ? (Number.isFinite(value) ? value.toFixed(2) : '') : String(value).trim();
  const m = /^(-?)(\d+)(?:\.(\d+))?$/.exec(s); if (!m) return null;
  const [, sign = '', int = '0', frac = ''] = m;
  let cents = BigInt(int + (frac + '00').slice(0, 2));
  if (frac.length > 2 && Number(frac[2]) >= 5) cents += 1n; // half-up on the third decimal
  const t = cents.toString().padStart(3, '0');
  const out = `${t.slice(0, -2)}.${t.slice(-2)}`.replace(/^0+(?=\d)/, '');
  return cents === 0n ? '0.00' : `${sign}${out}`;
}
/** "1234.56" -> "1234,56" (CSV, no thousands separator). */
export const decimalBr = (value: unknown) => { const d = decimal2(value); return d ? d.replace('.', ',') : ''; };
/** "1749.00" -> "R$ 1.749,00". */
export function moneyBr(value: unknown) {
  const d = decimal2(value) ?? '0.00'; const neg = d.startsWith('-'); const [int = '0', frac = '00'] = d.replace('-', '').split('.');
  return `${neg ? '-' : ''}R$ ${int.replace(/\B(?=(\d{3})+(?!\d))/g, '.')},${frac}`;
}
const shift = (v: string | number) => new Date((typeof v === 'number' ? v : Date.parse(v)) - BR_MS);
const pad = (n: number) => String(n).padStart(2, '0');
/** dd/mm/aaaa in Brasília; plain dates (YYYY-MM-DD) are kept as they are. */
export function dateBr(value: string | null | undefined) {
  if (!value) return ''; const plain = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value); if (plain) return `${plain[3]}/${plain[2]}/${plain[1]}`;
  if (!Number.isFinite(Date.parse(value))) return ''; const d = shift(value); return `${pad(d.getUTCDate())}/${pad(d.getUTCMonth() + 1)}/${d.getUTCFullYear()}`;
}
/** dd/mm/aaaa hh:mm in Brasília. */
export function dateTimeBr(value: string | null | undefined) {
  if (!value || !Number.isFinite(Date.parse(value))) return ''; const d = shift(value); return `${dateBr(value)} ${pad(d.getUTCHours())}:${pad(d.getUTCMinutes())}`;
}
/** Brasília calendar day (YYYY-MM-DD) of an instant. */
export function dayBr(now = Date.now()) { const d = shift(now); return `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())}`; }
const addDays = (day: string, n: number) => { const d = new Date(`${day}T00:00:00Z`); d.setUTCDate(d.getUTCDate() + n); return d.toISOString().slice(0, 10); };

export const PERIODS = ['mes_atual', 'mes_anterior', 'ultimos_30'] as const;
export type Period = typeof PERIODS[number];
export const periodLabels: Record<Period, string> = { mes_atual: 'Mês atual', mes_anterior: 'Mês anterior', ultimos_30: 'Últimos 30 dias' };
/** Whole Brasília days: first and last day (inclusive) of the period. */
export function periodDays(period: Period, now = Date.now()): { first: string; last: string } {
  const today = dayBr(now); const monthStart = `${today.slice(0, 8)}01`;
  if (period === 'mes_atual') return { first: monthStart, last: today };
  if (period === 'mes_anterior') { const last = addDays(monthStart, -1); return { first: `${last.slice(0, 8)}01`, last }; }
  return { first: addDays(today, -29), last: today };
}
/** Half-open instant range [from, to) of whole Brasília days. */
export function dayRange(first: string, last: string) { return { from: `${first}T00:00:00${BR_OFFSET}`, to: `${addDays(last, 1)}T00:00:00${BR_OFFSET}` }; }
