// Display of a note in the panel: one set of labels for notes issued by notem and outside it, people
// types in words and addresses in lines. Pure, shared by the note detail and Empresa › Tomadores.
import { moneyBr } from './br-format';
import { formatCnpj, normalizeCnpj } from './notem';

/** Order and labels of the values block (keys of the API "valores" object). */
export const VALUE_LABELS: [key: string, label: string][] = [
  ['servico', 'Valor do serviço'], ['desconto_incondicionado', 'Desconto incondicionado'], ['desconto_condicionado', 'Desconto condicionado'],
  ['base_calculo', 'Base de cálculo'], ['aliquota_iss', 'Alíquota do ISS'], ['valor_iss', 'ISS'], ['valor_liquido', 'Valor líquido'], ['iss_retido', 'ISS retido'],
];
export const percentBr = (v: unknown) => { const n = Number(v); return v == null || v === '' || !Number.isFinite(n) ? '—' : `${n.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 4 })}%`; };
/** [label, text] rows of the values block; amounts not informed by the government read "Não destacado". */
export function valueRows(valores: Record<string, unknown>): [string, string][] {
  return VALUE_LABELS.filter(([k]) => k in valores && !(k.startsWith('desconto') && (valores[k] == null || valores[k] === ''))).map(([k, label]) => {
    const v = valores[k];
    if (k === 'iss_retido') return [label, v ? 'Sim' : 'Não'];
    if (v == null || v === '') return [label, 'Não destacado'];
    return [label, k === 'aliquota_iss' ? percentBr(v) : moneyBr(v)];
  });
}

export const takerTypeLabels: Record<string, string> = { pj: 'Pessoa jurídica', pf: 'Pessoa física', estrangeiro: 'Estrangeiro' };
const onlyDigits = (v: string) => v.replace(/\D/g, '');
/** CPF or CNPJ (numeric or alphanumeric) with mask; other values unchanged. */
export function formatDocument(value: unknown): string {
  if (value == null || value === '') return '—';
  const raw = String(value); const cnpj = normalizeCnpj(raw);
  if (cnpj.length === 14) return formatCnpj(cnpj);
  const d = onlyDigits(raw); if (d.length === 11 && d === raw.replace(/[.\-\s]/g, '')) return `${d.slice(0, 3)}.${d.slice(3, 6)}.${d.slice(6, 9)}-${d.slice(9)}`;
  return raw;
}
export const formatCep = (v: unknown) => { const d = onlyDigits(String(v ?? '')); return d.length === 8 ? `${d.slice(0, 5)}-${d.slice(5)}` : String(v ?? ''); };
const phoneBr = (v: string) => { const d = onlyDigits(v); return d.length === 11 ? `(${d.slice(0, 2)}) ${d.slice(2, 7)}-${d.slice(7)}` : d.length === 10 ? `(${d.slice(0, 2)}) ${d.slice(2, 6)}-${d.slice(6)}` : v; };
const text = (v: unknown) => v == null ? '' : String(v).trim();
const obj = (v: unknown): Record<string, unknown> => v && typeof v === 'object' && !Array.isArray(v) ? v as Record<string, unknown> : {};

/** Address lines: street, number and complement · district · city/UF or municipality code · CEP · country. */
export function addressLines(address: unknown, municipality?: string | null): string[] {
  const a = obj(address); if (!Object.keys(a).length) return [];
  const street = [text(a['logradouro']), text(a['numero'])].filter(Boolean).join(', ');
  const first = [street, text(a['complemento'])].filter(Boolean).join(' — ');
  const city = municipality || text(a['cidade']) || (text(a['codigo_municipio']) ? `Município IBGE ${text(a['codigo_municipio'])}` : '');
  const region = [city, text(a['estado_provincia_regiao'])].filter(Boolean).join(' — ');
  const cep = text(a['cep']) ? `CEP ${formatCep(a['cep'])}` : text(a['codigo_postal']) ? `Código postal ${text(a['codigo_postal'])}` : '';
  return [first, text(a['endereco_livre']), text(a['bairro']), region, cep, text(a['pais']) && text(a['pais']) !== 'BR' ? `País: ${text(a['pais'])}` : ''].filter(Boolean);
}
const motiveLabels: Record<string, string> = { dispensado: 'Dispensado', nao_exigido: 'Não exigido' };
/** [label, text] rows of a taker (API "tomador" object); the address comes separately as lines. */
export function takerRows(taker: unknown): [string, string][] {
  const t = obj(taker); const rows: [string, string][] = [];
  const add = (label: string, v: string) => { if (v) rows.push([label, v]); };
  add('Nome', text(t['nome']));
  add('Tipo', takerTypeLabels[text(t['tipo'])] ?? '');
  if (t['documento']) add(t['tipo'] === 'pf' || onlyDigits(String(t['documento'])).length === 11 ? 'CPF' : 'CNPJ', formatDocument(t['documento']));
  add('NIF', text(t['nif'])); add('Motivo sem NIF', motiveLabels[text(t['motivo_sem_nif'])] ?? '');
  add('Inscrição municipal', text(t['inscricao_municipal'])); add('E-mail', text(t['email'])); add('Telefone', text(t['telefone']) ? phoneBr(text(t['telefone'])) : '');
  return rows;
}
export const takerMunicipalityCode = (taker: unknown) => { const c = text(obj(obj(taker)['endereco'])['codigo_municipio']); return /^\d{7}$/.test(c) ? c : null; };
