import { describe, expect, it } from 'vitest';
import { comparisonPeriods, variation, externalLine, alertsLine, companySituation, parseSituation } from '@/lib/home-metrics';

// Instants in UTC; Brasília is UTC-3.
const at = (iso: string) => Date.parse(iso);

describe('Início: comparação com o período anterior do mesmo tamanho', () => {
  it('mês atual (1 até hoje) × mês anterior do dia 1 até o mesmo dia', () =>
    expect(comparisonPeriods('mes_atual', at('2026-11-16T15:00:00Z'))).toEqual({ current: { first: '2026-11-01', last: '2026-11-16' }, previous: { first: '2026-10-01', last: '2026-10-16' } }));
  it('mesmo dia inexistente no mês anterior fica no último dia dele (31/03 × 01–28/02)', () =>
    expect(comparisonPeriods('mes_atual', at('2027-03-31T15:00:00Z')).previous).toEqual({ first: '2027-02-01', last: '2027-02-28' }));
  it('ano bissexto: 30/03/2028 × 01–29/02/2028', () =>
    expect(comparisonPeriods('mes_atual', at('2028-03-30T15:00:00Z')).previous).toEqual({ first: '2028-02-01', last: '2028-02-29' }));
  it('virada de ano: janeiro × dezembro do ano anterior', () =>
    expect(comparisonPeriods('mes_atual', at('2027-01-10T15:00:00Z'))).toEqual({ current: { first: '2027-01-01', last: '2027-01-10' }, previous: { first: '2026-12-01', last: '2026-12-10' } }));
  it('dia de Brasília: 01/01 00:30 UTC ainda é 31/12', () =>
    expect(comparisonPeriods('mes_atual', at('2027-01-01T00:30:00Z')).current).toEqual({ first: '2026-12-01', last: '2026-12-31' }));
  it('mês anterior × mês retrasado inteiro', () =>
    expect(comparisonPeriods('mes_anterior', at('2026-11-16T15:00:00Z'))).toEqual({ current: { first: '2026-10-01', last: '2026-10-31' }, previous: { first: '2026-09-01', last: '2026-09-30' } }));
  it('mês anterior na virada de ano: dezembro × novembro', () =>
    expect(comparisonPeriods('mes_anterior', at('2027-01-05T15:00:00Z'))).toEqual({ current: { first: '2026-12-01', last: '2026-12-31' }, previous: { first: '2026-11-01', last: '2026-11-30' } }));
  it('mês anterior em fevereiro: janeiro × dezembro', () =>
    expect(comparisonPeriods('mes_anterior', at('2027-02-10T15:00:00Z')).previous).toEqual({ first: '2026-12-01', last: '2026-12-31' }));
  it('últimos 30 dias × os 30 dias anteriores, sem sobreposição', () =>
    expect(comparisonPeriods('ultimos_30', at('2027-01-10T15:00:00Z'))).toEqual({ current: { first: '2026-12-12', last: '2027-01-10' }, previous: { first: '2026-11-12', last: '2026-12-11' } }));
  it('os dois períodos têm o mesmo número de dias (mês atual e últimos 30)', () => {
    const days = (p: { first: string; last: string }) => (Date.parse(p.last) - Date.parse(p.first)) / 86_400_000 + 1;
    for (const iso of ['2026-11-16T15:00:00Z', '2027-01-10T15:00:00Z', '2026-12-28T15:00:00Z']) {
      for (const k of ['mes_atual', 'ultimos_30'] as const) { const r = comparisonPeriods(k, at(iso)); expect(days(r.previous)).toBe(days(r.current)); }
    }
  });
});

describe('Início: indicador de variação', () => {
  it('sobe 12%', () => expect(variation(112, 100, 'good')).toEqual({ text: '↑ 12%', tone: 'good' }));
  it('anterior zero mostra "—", nunca porcentagem infinita', () => { expect(variation(5, 0, 'good')).toEqual({ text: '—', tone: 'neutral' }); expect(variation(0, 0, 'bad')).toEqual({ text: '—', tone: 'neutral' }); });
  it('rejeitadas e canceladas: subir é alerta', () => expect(variation(3, 2, 'bad')).toEqual({ text: '↑ 50%', tone: 'bad' }));
  it('rejeitadas e canceladas: cair é bom', () => expect(variation(1, 2, 'bad')).toEqual({ text: '↓ 50%', tone: 'good' }));
  it('emitidas: cair é neutro', () => expect(variation(90, 100, 'good')).toEqual({ text: '↓ 10%', tone: 'neutral' }));
  it('sem variação', () => expect(variation(7, 7, 'good')).toEqual({ text: '0%', tone: 'neutral' }));
  it('queda total', () => expect(variation(0, 4, 'good')).toEqual({ text: '↓ 100%', tone: 'neutral' }));
});

describe('Início: linhas de fora da notem e alertas', () => {
  it('emitidas fora da notem', () => { expect(externalLine('emitida', 10)).toBe('+10 emitidas fora da notem'); expect(externalLine('emitida', 1)).toBe('+1 emitida fora da notem'); });
  it('canceladas fora da notem', () => { expect(externalLine('cancelada', 1)).toBe('+1 cancelada fora da notem'); expect(externalLine('cancelada', 2)).toBe('+2 canceladas fora da notem'); });
  it('não aparece quando zero', () => expect(externalLine('emitida', 0)).toBe(''));
  it('só gravidades com alertas', () => { expect(alertsLine({ impeditivo: 2, atencao: 3, informativo: 1 })).toBe('2 impeditivos · 3 de atenção · 1 informativo'); expect(alertsLine({ impeditivo: 0, atencao: 1, informativo: 0 })).toBe('1 de atenção'); expect(alertsLine({ impeditivo: 1, atencao: 0, informativo: 2 })).toBe('1 impeditivo · 2 informativos'); });
  it('sem alertas: Tudo em dia', () => expect(alertsLine({ impeditivo: 0, atencao: 0, informativo: 0 })).toBe('Tudo em dia'));
});

describe('Empresas: situação usada no Início e no filtro', () => {
  it('inativa vence a prontidão', () => expect(companySituation({ active: false, readiness: { pronta_para_emitir: true } })).toBe('inativas'));
  it('ativa e pronta', () => expect(companySituation({ active: true, readiness: { pronta_para_emitir: true } })).toBe('prontas'));
  it('ativa com pendência', () => expect(companySituation({ active: true, readiness: { pronta_para_emitir: false } })).toBe('pendencia'));
  it('valor desconhecido no endereço mostra todas', () => { expect(parseSituation('arquivadas')).toBe(''); expect(parseSituation('prontas')).toBe('prontas'); });
});
