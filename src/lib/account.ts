// Minha conta: rules shared by the form (browser) and the server functions.
import { z } from './validation';
import { newPasswordError, newPasswordSchema } from './password-rule';
import { authMessages } from './auth-messages';

export const DISPLAY_NAME_MESSAGE = 'Informe seu nome com 2 a 80 caracteres.';
/** Name: required, 2 to 80 characters after trimming, never only spaces. */
export const displayNameSchema = z.string({ message: DISPLAY_NAME_MESSAGE }).trim().min(2, DISPLAY_NAME_MESSAGE).max(80, DISPLAY_NAME_MESSAGE);
export function displayNameError(value: string) { const r = displayNameSchema.safeParse(value); return r.success ? null : DISPLAY_NAME_MESSAGE; }

/** The password rule itself lives in password-rule.ts (shared with convite and redefinição). */
export const PASSWORD_INPUT_MAX = 128;
export const passwordMessages = {
  current: 'Informe a senha atual.',
  same: authMessages.same,
  /** One message for every failure of the current-password check (wrong, blocked, service unavailable). */
  notConfirmed: 'Não foi possível confirmar a senha atual. Confira e tente novamente.',
  failed: authMessages.genericPassword,
} as const;
export const passwordChangeSchema = z.object({ current: z.string().min(1, passwordMessages.current).max(PASSWORD_INPUT_MAX, passwordMessages.notConfirmed), next: newPasswordSchema });
/** Form check before calling the server: the first problem, or null (the save button stays off while not null). */
export function passwordChangeError(f: { current: string; next: string; confirm: string }) {
  if (!f.current) return passwordMessages.current;
  const problem = newPasswordError(f.next, f.confirm); if (problem) return problem;
  if (f.next === f.current) return passwordMessages.same;
  return null;
}
/** Accounts that only sign in with Google have no password: they set one through the recovery e-mail. */
export function hasPasswordLogin(providers: unknown) { return Array.isArray(providers) && providers.includes('email'); }
