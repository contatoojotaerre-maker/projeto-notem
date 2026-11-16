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
