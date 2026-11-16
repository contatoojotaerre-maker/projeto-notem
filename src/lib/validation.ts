/**
 * The only entry point to zod. Every schema imports `z` from here so the notem error map is
 * always installed (server, browser and tests). Messages written on a field always win; this
 * map only fills issues that have no notem message, in Portuguese and never with zod's text.
 */
import { z } from 'zod';

const num = (n: number | bigint) => new Intl.NumberFormat('pt-BR').format(n);
const plural = (n: number | bigint, one: string, many: string) => `${num(n)} ${Number(n) === 1 ? one : many}`;
const list = (xs: string[]) => xs.length <= 1 ? xs.join('') : `${xs.slice(0, -1).join(', ')} ou ${xs[xs.length - 1]}`;
export const UNKNOWN_KEY_MAX_LENGTH = 60;
export const UNKNOWN_KEY_MAX_NAMES = 5;
const keyName = (k: string) => k.length > UNKNOWN_KEY_MAX_LENGTH ? `${k.slice(0, UNKNOWN_KEY_MAX_LENGTH - 1)}…` : k;

/** Version-independent description of an issue that has no notem message. */
export type IssueKind =
  | { kind: 'required' }
  | { kind: 'type'; expected: string }
  | { kind: 'keys'; keys: string[] }
  | { kind: 'value'; options: string[] }
  | { kind: 'size'; dir: 'min' | 'max'; origin: string; limit: number | bigint; inclusive: boolean }
  | { kind: 'format'; format: string }
  | { kind: 'other' };

const typeMessages: Record<string, string> = { string: 'Informe um texto.', number: 'Informe um número.', integer: 'Informe um número inteiro.', int: 'Informe um número inteiro.', boolean: 'Informe true ou false.', object: 'Informe um objeto JSON.', array: 'Informe uma lista.' };
const formatMessages: Record<string, string> = { uuid: 'Identificador inválido (UUID).', guid: 'Identificador inválido (UUID).', email: 'E-mail inválido.', datetime: 'Data e hora inválidas.', regex: 'Formato inválido.' };

export function notemMessage(i: IssueKind): string {
  switch (i.kind) {
    case 'required': return 'Campo obrigatório.';
    case 'type': return typeMessages[i.expected] ?? 'Valor inválido.';
    case 'keys': {
      const shown = i.keys.slice(0, UNKNOWN_KEY_MAX_NAMES).map(keyName); const rest = i.keys.length - shown.length;
      if (i.keys.length === 1) return `Campo não aceito: ${shown[0]}.`;
      return `Campos não aceitos: ${rest > 0 ? `${shown.join(', ')} e mais ${num(rest)}` : `${shown.slice(0, -1).join(', ')} e ${shown[shown.length - 1]}`}.`;
    }
    case 'value': return i.options.length ? `Valor inválido. Use: ${list(i.options)}.` : 'Valor inválido.';
    case 'size': {
      const n = i.limit;
      if (i.origin === 'string') return i.dir === 'min' ? (Number(n) === 1 ? 'Informe um valor.' : `Use pelo menos ${plural(n, 'caractere', 'caracteres')}.`) : `Use no máximo ${plural(n, 'caractere', 'caracteres')}.`;
      if (i.origin === 'array') return `Informe ${i.dir === 'min' ? 'pelo menos' : 'no máximo'} ${plural(n, 'item', 'itens')}.`;
      if (i.origin === 'number' || i.origin === 'bigint') return `Informe um valor ${i.dir === 'min' ? 'maior' : 'menor'} ${i.inclusive ? 'ou igual a' : 'que'} ${num(n)}.`;
      return 'Valor inválido.';
    }
    case 'format': return formatMessages[i.format] ?? 'Formato inválido.';
    default: return 'Valor inválido.';
  }
}

type Issue = z.core.$ZodRawIssue;
const values = (vs: readonly unknown[]) => vs.map(String);

/** zod 4 issue → IssueKind (the input travels on the issue). */
function kindOf(issue: Issue): IssueKind {
  const missing = issue.input === undefined;
  switch (issue.code) {
    case 'invalid_type': return missing ? { kind: 'required' } : { kind: 'type', expected: String(issue.expected) };
    case 'invalid_value': return missing ? { kind: 'required' } : { kind: 'value', options: values(issue.values) };
    case 'invalid_union': return missing ? { kind: 'required' } : { kind: 'other' };
    case 'unrecognized_keys': return { kind: 'keys', keys: issue.keys };
    case 'too_small': return { kind: 'size', dir: 'min', origin: String(issue.origin), limit: issue.minimum, inclusive: issue.inclusive ?? true };
    case 'too_big': return { kind: 'size', dir: 'max', origin: String(issue.origin), limit: issue.maximum, inclusive: issue.inclusive ?? true };
    case 'invalid_format': return { kind: 'format', format: issue.format };
    default: return { kind: 'other' };
  }
}

z.config({ customError: issue => notemMessage(kindOf(issue as Issue)) });

/** E-mail rule of notem (the zod 3 rule, kept explicitly so a zod update never changes it). */
export const EMAIL_PATTERN = /^(?!\.)(?!.*\.\.)([A-Z0-9_'+\-.]*)[A-Z0-9_+-]@([A-Z0-9][A-Z0-9-]*\.)+[A-Z]{2,}$/i;
export const email = (message?: string) => z.email({ pattern: EMAIL_PATTERN, ...(message ? { error: message } : {}) });

/** ISO date-time in UTC (Z required, seconds optional, any fraction): the criterion used before zod 4. */
export const DATETIME_PATTERN = /^((\d\d[2468][048]|\d\d[13579][26]|\d\d0[48]|[02468][048]00|[13579][26]00)-02-29|\d{4}-((0[13578]|1[02])-(0[1-9]|[12]\d|3[01])|(0[469]|11)-(0[1-9]|[12]\d|30)|(02)-(0[1-9]|1\d|2[0-8])))T([01]\d|2[0-3]):[0-5]\d(:[0-5]\d(\.\d+)?)?Z$/;
export const isoDateTime = () => z.string().regex(DATETIME_PATTERN, 'Data e hora inválidas.');

export { z };
