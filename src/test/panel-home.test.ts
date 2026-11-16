import { describe, expect, it } from 'vitest';
import { decimal2, moneyBr, periodDays, dayRange } from '@/lib/br-format';
import { buildNotesCsv, csvCell, CSV_LIMIT, type CsvNote } from '@/lib/notes-csv';
import { buildAlerts, type AlertInput } from '@/lib/alerts';
import { batchAllowed, noteRpcArgs } from '@/lib/note-filters';
import { WHATSAPP_PATTERN } from '@/lib/platform-settings.functions';
import { zipName } from '@/lib/notes-export.server';
import { ZIP_BATCH, ZIP_LIMIT } from '@/lib/notes-export.functions';
import { PANEL_FILE_LIMITS } from '@/lib/api-policy';

const ready = (ok: boolean, itens: { item: string; ok: boolean; mensagem: string }[] = [], avisos: { item: string; mensagem: string }[] = []) => ({ pronta_para_emitir: ok, itens, avisos }) as never;
const base = (over: Partial<AlertInput> = {}): AlertInput => ({ now: Date.parse('2026-11-16T12:00:00Z'), companies: [], verifying: [], cancellations: [], syncErrors: [], webhooks: [], ...over });
const company = (valid_until: string | null, readiness = ready(true)) => ({ id: 'c1', legal_name: 'Group Jota', active: true, readiness, certificate: valid_until ? { valid_until } : null });

describe('valores exatos (centavos)', () => {
  it('converte texto decimal sem float', () => { expect(decimal2('249.9')).toBe('249.90'); expect(decimal2('0.1')).toBe('0.10'); expect(decimal2(1749)).toBe('1749.00'); expect(decimal2('abc')).toBeNull(); });
  it('formata em reais', () => { expect(moneyBr('1750.34')).toBe('R$ 1.750,34'); expect(moneyBr('1234567.8')).toBe('R$ 1.234.567,80'); });
});

describe('períodos em dias de Brasília', () => {
  const now = Date.parse('2026-11-01T02:00:00Z'); // 31/10 23:00 em Brasília
  it('mês atual usa o dia de Brasília', () => expect(periodDays('mes_atual', now)).toEqual({ first: '2026-10-01', last: '2026-10-31' }));
  it('mês anterior', () => expect(periodDays('mes_anterior', now)).toEqual({ first: '2026-09-01', last: '2026-09-30' }));
  it('últimos 30 dias incluem hoje', () => expect(periodDays('ultimos_30', now)).toEqual({ first: '2026-10-02', last: '2026-10-31' }));
  it('intervalo do resumo termina no início do dia seguinte', () => expect(dayRange('2026-10-01', '2026-10-31')).toEqual({ from: '2026-10-01T00:00:00-03:00', to: '2026-11-01T00:00:00-03:00' }));
  it('filtro da lista cobre o dia final inteiro', () => expect(noteRpcArgs({ from: '2026-10-01', to: '2026-10-31' })).toMatchObject({ _from: '2026-10-01T00:00:00-03:00', _to: '2026-10-31T23:59:59.999-03:00', _date_field: 'emissao' }));
});

describe('planilha CSV', () => {
  it('protege células que começam com = + - @ tab ou retorno', () => {
    for (const v of ['=1+1', '+5511', '-2', '@SOMA', '\tx', '\rx']) expect(csvCell(v).replace(/^"|"$/g, '').startsWith(`'`)).toBe(true);
    expect(csvCell('Ação')).toBe('Ação');
  });
  it('usa BOM, ponto e vírgula, vírgula decimal e data dd/mm/aaaa', () => {
    const n: CsvNote = { empresa: 'A; B', cnpj: '12345678000195', numero: '11', serie: '900', chave: null, emitida_em: '2026-11-10T15:00:00Z', competencia: '2026-11-10', tomador: 'X', documento_tomador: '1', codigo_servico: '010101', valor_servico: '249.9', valor_liquido: '249.90', iss: null, situacao: 'Autorizada', origem: 'externa', cancelada_em: null };
    const csv = buildNotesCsv([n]);
    expect(csv.startsWith('\uFEFFEmpresa;')).toBe(true);
    expect(csv).toContain('"A; B";12345678000195;11;900;;10/11/2026;10/11/2026;X;1;010101;249,90;249,90;;Autorizada;Emitida fora da notem;');
  });
  it('limite de 10.000 notas', () => expect(CSV_LIMIT).toBe(10_000));
});

describe('ZIP', () => {
  it('limites aprovados', () => { expect(ZIP_LIMIT).toBe(500); expect(ZIP_BATCH).toBe(20); expect(PANEL_FILE_LIMITS.concurrent).toBe(1); expect(PANEL_FILE_LIMITS.rate).toEqual({ max: 30, window: 60 }); });
  it('lote com uma nota fora do filtro é recusado inteiro', () => {
    const allowed = new Set(['a', 'b', 'c']);
    expect(batchAllowed(allowed, ['a', 'b'])).toBe(true);
    expect(batchAllowed(allowed, ['a', 'z'])).toBe(false);
    expect(batchAllowed(allowed, ['a', 'a'])).toBe(false);
    expect(batchAllowed(allowed, [])).toBe(false);
  });
  it('pasta por CNPJ e nome com número e chave', () => expect(zipName('12.345.678/0001-95', 'NFSe', '11', '42054071234567800019500000000000011260000000001', 'xml')).toBe('12345678000195/NFSe_11_42054071234567800019500000000000011260000000001.xml'));
});

describe('alertas', () => {
  it('certificado vencido é impeditivo', () => expect(buildAlerts(base({ companies: [company('2026-11-15T00:00:00Z')] }))[0]).toMatchObject({ kind: 'certificado_vencido', severity: 'impeditivo' }));
  it('certificado a 7 dias é atenção; a 20 dias é informativo; a 40 dias não alerta', () => {
    expect(buildAlerts(base({ companies: [company('2026-11-23T00:00:00Z')] }))[0]).toMatchObject({ kind: 'certificado_vencendo', severity: 'atencao' });
    expect(buildAlerts(base({ companies: [company('2026-12-06T00:00:00Z')] }))[0]).toMatchObject({ severity: 'informativo' });
    expect(buildAlerts(base({ companies: [company('2026-12-26T00:00:00Z')] }))).toHaveLength(0);
  });
  it('nota em verificação só depois de 30 minutos; cancelamento só depois de 24 horas', () => {
    const v = (since: string) => buildAlerts(base({ companies: [company(null)], verifying: [{ id: 'i', company_id: 'c1', nfse_number: null, dps_number: 1, since }] }));
    expect(v('2026-11-16T11:40:00Z')).toHaveLength(0); expect(v('2026-11-16T11:20:00Z')[0]).toMatchObject({ kind: 'nota_em_verificacao', link: { kind: 'invoice', id: 'i' } });
    const c = (since: string) => buildAlerts(base({ companies: [company(null)], cancellations: [{ invoice_id: 'i', company_id: 'c1', nfse_number: '11', since }] }));
    expect(c('2026-11-15T13:00:00Z')).toHaveLength(0); expect(c('2026-11-15T11:00:00Z')[0]).toMatchObject({ kind: 'cancelamento_aguardando' });
  });
  it('empresa inativa não gera alerta e impeditivo vem primeiro', () => {
    const inactive = { ...company('2026-11-15T00:00:00Z'), active: false };
    expect(buildAlerts(base({ companies: [inactive] }))).toHaveLength(0);
    const out = buildAlerts(base({ companies: [company('2026-11-15T00:00:00Z')], webhooks: [{ id: 'w', integration_id: 'g', created_at: '2026-11-16T11:00:00Z', message: 'Falha', url: null }] }));
    expect(out.map(a => a.severity)).toEqual(['impeditivo', 'atencao']);
  });
});

describe('WhatsApp do suporte', () => {
  it('aceita só dígitos com 55', () => { expect(WHATSAPP_PATTERN.test('5548999990000')).toBe(true); expect(WHATSAPP_PATTERN.test('48999990000')).toBe(false); expect(WHATSAPP_PATTERN.test('+55 48 99999-0000')).toBe(false); });
});
