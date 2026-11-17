import { describe, expect, it } from 'vitest';
import { logsRange, notesFilters, parseCompaniesSearch, parseLogsSearch, parseNotesSearch } from '@/lib/list-search';

const id = '0b5d1c1e-8f7a-4a7e-9a1d-2f3e4d5c6b7a';
describe('filtros recuperados do endereço', () => {
  it('Notas: lê todos os filtros válidos', () => {
    const s = parseNotesSearch({ busca: 'João', empresa: id, situacao: 'cancelled', origem: 'externa', data: 'competencia', de: '2026-11-01', ate: '2026-11-16', pagina: '3' });
    expect(s).toEqual({ busca: 'João', empresa: id, situacao: 'cancelled', origem: 'externa', data: 'competencia', de: '2026-11-01', ate: '2026-11-16', pagina: 3 });
    expect(notesFilters(s)).toEqual({ company_id: id, status: 'cancelled', origin: 'externa', from: '2026-11-01', to: '2026-11-16', date_field: 'competencia', search: 'João', direction: 'emitidas' });
    // Recebidas: same filters, no origin (the provider is always someone else)
    expect(notesFilters(s, 'recebidas')).toEqual({ company_id: id, status: 'cancelled', from: '2026-11-01', to: '2026-11-16', date_field: 'competencia', search: 'João', direction: 'recebidas' });
  });
  it('Notas: ignora valores inválidos', () => {
    expect(parseNotesSearch({ empresa: 'abc', situacao: 'apagada', origem: 'x', data: 'emissao', de: '2026-13-45', ate: 'ontem', pagina: '-2', busca: 'x'.repeat(101) })).toEqual({});
    expect(parseNotesSearch({ de: '2026-11-10', ate: '2026-11-01' })).toEqual({ de: '2026-11-10' });
    expect(parseNotesSearch({ pagina: 1 })).toEqual({});
    expect(notesFilters({})).toEqual({ date_field: 'emissao', direction: 'emitidas' });
  });
  it('Empresas: busca, situação e página', () => {
    expect(parseCompaniesSearch({ busca: 'Group', situacao: 'pendencia', pagina: 2 })).toEqual({ busca: 'Group', situacao: 'pendencia', pagina: 2 });
    expect(parseCompaniesSearch({ situacao: 'todas', pagina: 'a' })).toEqual({});
  });
  it('Chamadas: atalho do Início (erros, 24 horas); o ambiente vem do seletor e ?ambiente= antigo é descartado', () => {
    const s = parseLogsSearch({ erros: '1', ultimas: '24h', ambiente: 'production', status: '422', empresa: id, pagina: 2 });
    expect(s).toEqual({ erros: 1, ultimas: '24h', status: 422, empresa: id, pagina: 2 });
    const now = Date.parse('2026-11-16T22:00:00Z');
    expect(logsRange(s, now)).toEqual({ from: '2026-11-15T22:00:00.000Z' });
    expect(parseLogsSearch({ erros: '0', ambiente: 'todos', status: '999' })).toEqual({});
  });
  it('Chamadas: dias inteiros no horário de Brasília', () => {
    expect(logsRange({ de: '2026-11-16', ate: '2026-11-16' })).toEqual({ from: '2026-11-16T03:00:00.000Z', until: '2026-11-17T02:59:59.999Z' });
  });
});
