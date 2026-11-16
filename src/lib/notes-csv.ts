// CSV of the notes list for Brazilian Excel: UTF-8 with BOM, ";" separator, decimal comma, dd/mm/aaaa dates
// and protection against formulas (cells starting with = + - @ tab or carriage return get a leading ').
import { dateBr, decimalBr } from './br-format';

export const CSV_LIMIT = 10_000;
export const csvTooLarge = (count: number) => `O filtro tem ${count.toLocaleString('pt-BR')} notas; o limite por planilha é ${CSV_LIMIT.toLocaleString('pt-BR')}. Reduza o período.`;
export type CsvNote = {
  empresa: string; cnpj: string; numero: string | null; serie: string | null; chave: string | null; emitida_em: string | null; competencia: string | null;
  tomador: string | null; documento_tomador: string | null; codigo_servico: string | null; valor_servico: string | null; valor_liquido: string | null; iss: string | null;
  situacao: string; origem: 'notem' | 'externa'; cancelada_em: string | null;
};
export const CSV_HEADER = ['Empresa', 'CNPJ da empresa', 'Número', 'Série', 'Chave de acesso', 'Data de emissão', 'Competência', 'Tomador', 'Documento do tomador', 'Código do serviço', 'Valor do serviço', 'Valor líquido', 'ISS', 'Situação', 'Origem', 'Data do cancelamento'];

/** One cell: formula protection first, then quoting when the text has ; " or line breaks. */
export function csvCell(value: string | null | undefined) {
  let v = value ?? '';
  if (/^[=+\-@\t\r]/.test(v)) v = `'${v}`;
  return /[;"\r\n]/.test(v) ? `"${v.replace(/"/g, '""')}"` : v;
}
export function csvLine(note: CsvNote) {
  return [note.empresa, note.cnpj, note.numero, note.serie, note.chave, dateBr(note.emitida_em), dateBr(note.competencia), note.tomador, note.documento_tomador, note.codigo_servico,
    decimalBr(note.valor_servico), decimalBr(note.valor_liquido), decimalBr(note.iss), note.situacao, note.origem === 'notem' ? 'Emitida pela notem' : 'Emitida fora da notem', dateBr(note.cancelada_em)].map(csvCell).join(';');
}
export function buildNotesCsv(notes: CsvNote[]) { return '\uFEFF' + [CSV_HEADER.map(csvCell).join(';'), ...notes.map(csvLine)].join('\r\n') + '\r\n'; }
