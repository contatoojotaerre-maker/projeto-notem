import { describe, expect, it } from 'vitest';
import { notesDonut, sharePercents, hourlyWindows, hourBr, busiestHourLine } from '@/lib/home-metrics';

describe('Início: rosca das notas sem contar a mesma nota duas vezes', () => {
  it('emitidas já incluem as canceladas: 2 emitidas com 1 cancelada = 1 + 1', () => {
    const d = notesDonut({ emitted: 2, cancelled: 1, rejected: 0 });
    expect(d.slices.map(s => [s.key, s.value, s.pct])).toEqual([['vigentes', 1, 50], ['canceladas', 1, 50], ['rejeitadas', 0, 0]]);
    expect(d.total).toBe(2);
  });
  it('centro soma emitidas e rejeitadas', () => expect(notesDonut({ emitted: 5, cancelled: 2, rejected: 3 }).total).toBe(8));
  it('nomes das fatias', () => expect(notesDonut({ emitted: 1, cancelled: 0, rejected: 0 }).slices.map(s => s.label)).toEqual(['Emitidas sem cancelamento', 'Canceladas', 'Rejeitadas pelo governo']));
  it('período sem notas: tudo zero', () => { const d = notesDonut({ emitted: 0, cancelled: 0, rejected: 0 }); expect(d.total).toBe(0); expect(d.slices.every(s => s.value === 0 && s.pct === 0)).toBe(true); });
  it('porcentagens sempre somam 100', () => { expect(sharePercents([1, 1, 1])).toEqual([34, 33, 33]); expect(sharePercents([2, 1, 0]).reduce((a, b) => a + b)).toBe(100); });
});

describe('Início: barras de chamadas por hora', () => {
  const now = Date.parse('2026-11-17T22:41:30Z');
  const w = hourlyWindows(now);
  it('24 janelas de uma hora, seguidas, sem buraco', () => { expect(w).toHaveLength(24); for (let i = 1; i < 24; i++) expect(w[i]!.from).toBe(w[i - 1]!.to); });
  it('cobrem exatamente o período do cartão Chamadas à API', () => { expect(w[0]!.from).toBe(new Date(now - 86_400_000).toISOString()); expect(w[23]!.to).toBe(new Date(now + 1).toISOString()); });
  it('horário de Brasília', () => expect(hourBr(w[23]!.from)).toBe('18:41'));
  it('resumo da hora de maior volume', () => {
    const b = w.map((x, i) => ({ ...x, calls: i === 20 ? 32 : 1 }));
    expect(busiestHourLine(b)).toBe('Maior volume: entre 15:41 e 16:41, 32 chamadas.');
    expect(busiestHourLine(w.map(x => ({ ...x, calls: 0 })))).toBe('Nenhuma chamada nas últimas 24 horas.');
  });
});
