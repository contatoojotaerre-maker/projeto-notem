// Minha conta: rules shared by the form (browser) and the server functions.
import { z } from './validation';

export const DISPLAY_NAME_MESSAGE = 'Informe seu nome com 2 a 80 caracteres.';
/** Name: required, 2 to 80 characters after trimming, never only spaces. */
export const displayNameSchema = z.string({ message: DISPLAY_NAME_MESSAGE }).trim().min(2, DISPLAY_NAME_MESSAGE).max(80, DISPLAY_NAME_MESSAGE);
export function displayNameError(value: string) { const r = displayNameSchema.safeParse(value); return r.success ? null : DISPLAY_NAME_MESSAGE; }

/** Same minimum as account setup (definir/redefinir senha). */
export const PASSWORD_MIN = 8;
export const PASSWORD_MAX = 72;
export const passwordMessages = {
  current: 'Informe a senha atual.',
  short: `Use pelo menos ${PASSWORD_MIN} caracteres.`,
  long: `Use no máximo ${PASSWORD_MAX} caracteres.`,
  confirm: 'As senhas não conferem.',
  same: 'A nova senha precisa ser diferente da atual.',
  /** One message for every failure of the current-password check (wrong, blocked, service unavailable). */
  notConfirmed: 'Não foi possível confirmar a senha atual. Confira e tente novamente.',
  weak: 'Escolha uma senha mais forte, que não seja fácil de adivinhar.',
  failed: 'Não foi possível trocar a senha agora. Tente novamente.',
} as const;
export const passwordChangeSchema = z.object({ current: z.string().min(1, passwordMessages.current).max(PASSWORD_MAX, passwordMessages.notConfirmed), next: z.string().min(PASSWORD_MIN, passwordMessages.short).max(PASSWORD_MAX, passwordMessages.long) });
/** Form check before calling the server: the first problem, or null. */
export function passwordChangeError(f: { current: string; next: string; confirm: string }) {
  if (!f.current) return passwordMessages.current;
  if (f.next.length < PASSWORD_MIN) return passwordMessages.short;
  if (f.next.length > PASSWORD_MAX) return passwordMessages.long;
  if (f.next !== f.confirm) return passwordMessages.confirm;
  if (f.next === f.current) return passwordMessages.same;
  return null;
}
/** Error from the login service when saving the new password → message for the user. */
export function passwordUpdateMessage(code: string | undefined) {
  return code === 'same_password' ? passwordMessages.same : code === 'weak_password' ? passwordMessages.weak : passwordMessages.failed;
}
/** Accounts that only sign in with Google have no password: they set one through the recovery e-mail. */
export function hasPasswordLogin(providers: unknown) { return Array.isArray(providers) && providers.includes('email'); }
