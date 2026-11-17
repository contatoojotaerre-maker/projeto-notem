// Início: pure rules for the comparison periods, the variation indicator, the "fora da notem" line, the
// alerts line and the company situation used by the Empresas filter. No I/O, shared by server and panel.
import { addDays, periodDays, type Period } from './br-format';
import type { AlertSeverity } from './alerts';

export type DayPeriod = { first: string; last: string };
const lastDayOfMonth = (monthStart: string) => addDays(`${addDays(monthStart, 31).slice(0, 8)}01`, -1);

/** Selected period and the previous period of the same size (whole Brasília days, inclusive):
 *  mês atual (1..hoje) × mês anterior (1..mesmo dia, limitado ao último dia daquele mês);
 *  mês anterior × mês retrasado inteiro; últimos 30 dias × os 30 dias antes deles. */
export function comparisonPeriods(period: Period, now = Date.now()): { current: DayPeriod; previous: DayPeriod } {
  const current = periodDays(period, now);
  if (period === 'ultimos_30') return { current, previous: { first: addDays(current.first, -30), last: addDays(current.first, -1) } };
  const prevStart = `${addDays(current.first, -1).slice(0, 8)}01`; const prevEnd = addDays(current.first, -1);
  if (period === 'mes_anterior') return { current, previous: { first: prevStart, last: prevEnd } };
  const day = Number(current.last.slice(8, 10)); const sameDay = `${prevStart.slice(0, 8)}${String(day).padStart(2, '0')}`;
  return { current, previous: { first: prevStart, last: sameDay > lastDayOfMonth(prevStart) ? prevEnd : sameDay } };
}
export const comparisonLabels: Record<Period, string> = { mes_atual: 'vs. mês anterior', mes_anterior: 'vs. mês retrasado', ultimos_30: 'vs. 30 dias anteriores' };

export type Trend = { text: string; tone: 'good' | 'bad' | 'neutral' };
/** "↑ 12%" / "↓ 5%" / "0%"; previous zero shows "—" (never an infinite percentage). For cancelled and
 *  rejected notes going up is bad; for issued notes going up is good and going down is neutral. */
export function variation(current: number, previous: number, upIs: 'good' | 'bad'): Trend {
  if (!previous) return { text: '—', tone: 'neutral' };
  const pct = Math.round(Math.abs(current - previous) / previous * 100);
  if (current === previous || pct === 0) return { text: '0%', tone: 'neutral' };
  const up = current > previous;
  return { text: `${up ? '↑' : '↓'} ${pct}%`, tone: up ? upIs : (upIs === 'bad' ? 'good' : 'neutral') };
}

/** "+10 emitidas fora da notem" / "+1 cancelada fora da notem"; empty when zero. */
export function externalLine(kind: 'emitida' | 'cancelada', n: number) { return n > 0 ? `+${n} ${n === 1 ? kind : `${kind}s`} fora da notem` : ''; }

/** "2 impeditivos · 3 de atenção · 1 informativo", only severities with alerts; "Tudo em dia" when none. */
export function alertsLine(c: Record<AlertSeverity, number>) {
  const parts = [c.impeditivo ? `${c.impeditivo} ${c.impeditivo === 1 ? 'impeditivo' : 'impeditivos'}` : '', c.atencao ? `${c.atencao} de atenção` : '', c.informativo ? `${c.informativo} ${c.informativo === 1 ? 'informativo' : 'informativos'}` : ''].filter(Boolean);
  return parts.length ? parts.join(' · ') : 'Tudo em dia';
}

export const COMPANY_SITUATIONS = ['prontas', 'pendencia', 'inativas'] as const;
export type CompanySituation = typeof COMPANY_SITUATIONS[number];
export const situationLabels: Record<CompanySituation, string> = { prontas: 'Prontas para emitir', pendencia: 'Com pendência', inativas: 'Inativas' };
export const situationBadge: Record<CompanySituation, { label: string; tone: string }> = { prontas: { label: 'Pronta para emitir', tone: 'active' }, pendencia: { label: 'Com pendência', tone: 'warning' }, inativas: { label: 'Inativa', tone: 'inactive' } };
/** Same split as the Início: inactive first; active ones are ready or pending by the readiness rule. */
export const companySituation = (c: { active: boolean; readiness: { pronta_para_emitir: boolean } }): CompanySituation => !c.active ? 'inativas' : c.readiness.pronta_para_emitir ? 'prontas' : 'pendencia';
export const parseSituation = (v: unknown): CompanySituation | '' => (COMPANY_SITUATIONS as readonly unknown[]).includes(v) ? v as CompanySituation : '';

/** Whole-number percentages that always add up to 100 (largest remainder); all zeros when the total is zero. */
export function sharePercents(values: number[]): number[] {
  const total = values.reduce((s, v) => s + v, 0); if (!total) return values.map(() => 0);
  const raw = values.map(v => v / total * 100); const out = raw.map(Math.floor); let left = 100 - out.reduce((s, v) => s + v, 0);
  const order = raw.map((v, i) => ({ i, r: v - Math.floor(v) })).sort((a, b) => b.r - a.r || a.i - b.i);
  for (const { i } of order) { if (left <= 0) break; out[i]! += 1; left -= 1; }
  return out;
}

export type DonutSlice = { key: 'vigentes' | 'canceladas' | 'rejeitadas'; label: string; value: number; pct: number };
/** Notes donut of the Início. "Emitidas" already includes the cancelled ones (org_notes_summary), so the slices
 *  never overlap: issued and not cancelled, cancelled, rejected by the government. Centre = issued + rejected. */
export function notesDonut(n: { emitted: number; cancelled: number; rejected: number }): { total: number; slices: DonutSlice[] } {
  const cancelled = Math.min(Math.max(0, n.cancelled), Math.max(0, n.emitted)); const values = [Math.max(0, n.emitted - cancelled), cancelled, Math.max(0, n.rejected)];
  const pct = sharePercents(values); const labels = ['Emitidas sem cancelamento', 'Canceladas', 'Rejeitadas pelo governo'] as const; const keys = ['vigentes', 'canceladas', 'rejeitadas'] as const;
  return { total: values[0]! + values[1]! + values[2]!, slices: values.map((value, i) => ({ key: keys[i]!, label: labels[i]!, value, pct: pct[i]! })) };
}

const HOUR = 3_600_000;
/** 24 one-hour windows ending now. Together they cover exactly the 24 hours of the "Chamadas à API" card
 *  (from now − 24 h to now + 1 ms), so the bars add up to the card. */
export function hourlyWindows(now = Date.now()): { from: string; to: string }[] {
  return Array.from({ length: 24 }, (_, i) => ({ from: new Date(now - (24 - i) * HOUR).toISOString(), to: new Date(i === 23 ? now + 1 : now - (23 - i) * HOUR).toISOString() }));
}
/** "14:05" in Brasília (UTC-3, no daylight saving). */
export const hourBr = (iso: string) => new Date(Date.parse(iso) - 3 * HOUR).toISOString().slice(11, 16);
/** Readable summary of the hourly bars (also the text alternative of the chart). */
export function busiestHourLine(buckets: { from: string; to: string; calls: number }[]): string {
  const top = buckets.reduce<{ from: string; to: string; calls: number } | null>((best, b) => !best || b.calls > best.calls ? b : best, null);
  if (!top || !top.calls) return 'Nenhuma chamada nas últimas 24 horas.';
  return `Maior volume: entre ${hourBr(top.from)} e ${hourBr(top.to)}, ${top.calls} ${top.calls === 1 ? 'chamada' : 'chamadas'}.`;
}
