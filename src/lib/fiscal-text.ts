// NFS-e text fields (TSString and its 24 derived types) accept only U+0020–U+00FF;
// xDescServ (TSStringComQuebraDeLinha) also accepts line breaks. Text pasted from editors is
// normalized to the equivalent Latin-1 characters first; only characters with no equivalent
// (emojis, symbols, other alphabets) are refused, before any DPS number is reserved or event sent.

export const FISCAL_TEXT_MESSAGE = 'contém caracteres não aceitos pela NFS-e';

const replacements: [RegExp, string][] = [
  [/[\u2010-\u2015\u2212\uFE58\uFE63\uFF0D]/g, '-'], // hyphens, en/em dashes, minus
  [/[\u2018\u2019\u201A\u201B\u2032\u2035\uFF07]/g, "'"],
  [/[\u201C\u201D\u201E\u201F\u2033\u2036\uFF02]/g, '"'],
  [/\u2026/g, '...'],
  [/[\u2022\u2023\u2043\u2219]/g, '-'], // bullets pasted from lists
  [/[\u200B-\u200D\u2060\uFEFF]/g, ''], // invisible zero-width characters
  [/[\t\u000B\u000C\u00A0\u1680\u2000-\u200A\u202F\u205F\u3000]/g, ' '],
];

/** Normalizes pasted text; `multiline` keeps line breaks (service description only). */
export function normalizeFiscalText(value: string, multiline = false): string {
  let v = value.normalize('NFC').replace(/\r\n?|[\u0085\u2028\u2029]/g, '\n');
  for (const [pattern, to] of replacements) v = v.replace(pattern, to);
  if (!multiline) return v.replace(/\n/g, ' ').replace(/ {2,}/g, ' ').trim();
  return v.split('\n').map(line => line.replace(/ {2,}/g, ' ').trim()).join('\n').replace(/\n{3,}/g, '\n\n').trim();
}
/** True when the (already normalized) text has only characters the NFS-e accepts. */
export function fiscalTextAccepted(value: string, multiline = false) {
  return (multiline ? /^[\n\u0020-\u00FF]*$/ : /^[\u0020-\u00FF]*$/).test(value);
}
export const normalizeOptional = <T>(v: T, multiline = false): T => (typeof v === 'string' ? normalizeFiscalText(v, multiline) as T : v);

type Issue = { campo: string; mensagem: string };
/** Normalizes the given text fields in place and returns those still containing refused characters. */
export function normalizeFields(target: Record<string, unknown> | null | undefined, fields: readonly string[], prefix: string, multiline: readonly string[] = []): Issue[] {
  if (!target) return [];
  const issues: Issue[] = [];
  for (const f of fields) {
    const v = target[f]; if (typeof v !== 'string') continue;
    const m = multiline.includes(f); const n = normalizeFiscalText(v, m);
    target[f] = n;
    if (!fiscalTextAccepted(n, m)) issues.push({ campo: prefix + f, mensagem: FISCAL_TEXT_MESSAGE });
  }
  return issues;
}
export const customerTextFields = ['nome', 'email', 'inscricao_municipal', 'nif', 'documento'] as const;
export const addressTextFields = ['logradouro', 'numero', 'complemento', 'bairro', 'cidade', 'endereco_livre', 'codigo_postal', 'estado_provincia_regiao'] as const;
/** Normalizes a raw customer object (API or stored) and reports refused characters per field. */
export function normalizeCustomerText(c: unknown, prefix = 'tomador.'): Issue[] {
  if (!c || typeof c !== 'object' || Array.isArray(c)) return [];
  const o = c as Record<string, unknown>;
  const issues = normalizeFields(o, customerTextFields, prefix);
  const e = o['endereco'];
  if (e && typeof e === 'object' && !Array.isArray(e)) issues.push(...normalizeFields(e as Record<string, unknown>, addressTextFields, prefix + 'endereco.'));
  return issues;
}
