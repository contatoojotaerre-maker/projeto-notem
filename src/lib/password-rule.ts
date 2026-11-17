// Single password rule for every screen that creates a password: Minha conta (troca), convite (definir-senha)
// and recuperação (redefinir-senha). The checklist, the save button and the server-side check all read from here.
import { z } from './validation';

export const PASSWORD_MIN = 10;
/** The login service stores at most 72 bytes; accented letters take two. */
export const PASSWORD_MAX_BYTES = 72;

export type PasswordRequirementId = 'length' | 'upper' | 'lower' | 'digit' | 'special';
export type PasswordRequirement = { id: PasswordRequirementId; label: string; test: (password: string) => boolean };

export const PASSWORD_REQUIREMENTS: readonly PasswordRequirement[] = [
  { id: 'length', label: `${PASSWORD_MIN} caracteres ou mais`, test: p => [...p].length >= PASSWORD_MIN },
  { id: 'upper', label: 'Uma letra maiúscula', test: p => /\p{Lu}/u.test(p) },
  { id: 'lower', label: 'Uma letra minúscula', test: p => /\p{Ll}/u.test(p) },
  { id: 'digit', label: 'Um número', test: p => /\p{Nd}/u.test(p) },
  // Anything that is not a letter, a number or a blank space (e.g. ! @ # $ % & * - _ . ?).
  { id: 'special', label: 'Um caractere especial', test: p => /[^\p{L}\p{N}\s]/u.test(p) },
];

export const passwordRuleMessages = {
  length: `A senha precisa ter ${PASSWORD_MIN} caracteres ou mais.`,
  upper: 'A senha precisa ter uma letra maiúscula.',
  lower: 'A senha precisa ter uma letra minúscula.',
  digit: 'A senha precisa ter um número.',
  special: 'A senha precisa ter um caractere especial.',
  tooLong: `A senha é longa demais. Use no máximo ${PASSWORD_MAX_BYTES} caracteres (letras com acento contam como dois).`,
  confirm: 'As senhas não conferem.',
} as const satisfies Record<PasswordRequirementId | 'tooLong' | 'confirm', string>;

export function passwordTooLong(password: string) { return new TextEncoder().encode(password).length > PASSWORD_MAX_BYTES; }

/** Each requirement with its current state, in display order (for the live checklist). */
export function passwordChecklist(password: string) { return PASSWORD_REQUIREMENTS.map(r => ({ id: r.id, label: r.label, ok: r.test(password) })); }

/** First problem of a new password (requirements, then size), or null when it follows the rule. */
export function passwordRuleError(password: string): string | null {
  const missing = PASSWORD_REQUIREMENTS.find(r => !r.test(password));
  if (missing) return passwordRuleMessages[missing.id];
  return passwordTooLong(password) ? passwordRuleMessages.tooLong : null;
}

/** New password + confirmation: the save button is enabled only when this is null. */
export function newPasswordError(password: string, confirm: string): string | null {
  return passwordRuleError(password) ?? (password === confirm ? null : passwordRuleMessages.confirm);
}

/** Server-side guard for the same rule (zod through the shared validation module). */
export const newPasswordSchema = z.string().superRefine((value, ctx) => { const problem = passwordRuleError(value); if (problem) ctx.addIssue({ code: 'custom', message: problem }); });
