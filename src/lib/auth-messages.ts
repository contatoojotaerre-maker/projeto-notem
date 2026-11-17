// Every refusal of the login service becomes a Portuguese message here. The service's own text (English) is never
// shown: only its stable code, status and weak-password reasons are read; anything unknown gets the screen's generic message.
import { PASSWORD_MAX_BYTES, passwordRuleMessages } from './password-rule';

export type AuthScreenContext = 'login' | 'forgot' | 'password' | 'link';

export const authMessages = {
  pwned: 'Esta senha apareceu em vazamentos de dados. Escolha outra.',
  weak: 'Esta senha é fraca. Escolha outra.',
  weakCharacters: 'A senha precisa ter letra maiúscula, letra minúscula, número e caractere especial.',
  same: 'A nova senha precisa ser diferente da atual.',
  invalidLogin: 'E-mail ou senha inválidos. O acesso é permitido apenas por convite.',
  notAuthorized: 'Acesso não autorizado. Solicite um convite ao administrador da sua organização.',
  emailNotConfirmed: 'Confirme seu e-mail pelo link que enviamos antes de entrar.',
  blocked: 'Este acesso está bloqueado. Fale com o administrador da sua organização.',
  rateLimit: 'Muitas tentativas em pouco tempo. Aguarde alguns minutos e tente novamente.',
  linkExpired: 'Este link é inválido ou expirou. Solicite um novo e-mail.',
  sessionEnded: 'Sua sessão terminou. Entre novamente.',
  reauth: 'Por segurança, confirme a senha atual e tente novamente.',
  providerOff: 'Esta forma de entrar está desligada. Fale com o administrador da sua organização.',
  invalidEmail: 'Informe um e-mail válido.',
  invalidData: 'Confira os dados informados e tente novamente.',
  captcha: 'Não foi possível confirmar a verificação de segurança. Tente novamente.',
  unavailable: 'Não foi possível falar com o serviço de login. Verifique sua conexão e tente novamente.',
  tooLong: passwordRuleMessages.tooLong,
  genericLogin: 'Não foi possível entrar agora. Tente novamente.',
  genericForgot: 'Não foi possível enviar o e-mail agora. Tente novamente.',
  genericPassword: 'Não foi possível salvar a senha agora. Tente novamente.',
} as const;

const generic: Record<AuthScreenContext, string> = { login: authMessages.genericLogin, forgot: authMessages.genericForgot, password: authMessages.genericPassword, link: authMessages.genericPassword };

type AuthLike = { code?: unknown; status?: unknown; name?: unknown; message?: unknown; reasons?: unknown };

/** Code of an error from the login service, also for older services that only send the English text. */
function codeOf(e: AuthLike): string {
  if (typeof e.code === 'string' && e.code) return e.code;
  const name = typeof e.name === 'string' ? e.name : '', text = typeof e.message === 'string' ? e.message.toLowerCase() : '';
  if (name === 'AuthWeakPasswordError') return 'weak_password';
  if (name === 'AuthRetryableFetchError' || e.status === 0) return 'network';
  if (name === 'AuthSessionMissingError') return 'session_not_found';
  if (text.includes('invalid login credentials')) return 'invalid_credentials';
  if (text.includes('should be different')) return 'same_password';
  if (text.includes('pwned') || text.includes('leak') || text.includes('breach')) return 'weak_password';
  if (text.includes('password') && (text.includes('weak') || text.includes('at least') || text.includes('should contain'))) return 'weak_password';
  if (text.includes(`${PASSWORD_MAX_BYTES} characters`)) return 'password_too_long';
  if (text.includes('rate limit') || e.status === 429) return 'over_request_rate_limit';
  if (text.includes('email not confirmed')) return 'email_not_confirmed';
  if (text.includes('signups not allowed') || text.includes('signup')) return 'signup_disabled';
  if (text.includes('expired') || text.includes('invalid jwt') || text.includes('invalid token')) return 'session_expired';
  if (text.includes('failed to fetch') || text.includes('network')) return 'network';
  return '';
}

function weakMessage(e: AuthLike): string {
  const reasons = Array.isArray(e.reasons) ? e.reasons.map(String) : [];
  const text = typeof e.message === 'string' ? e.message.toLowerCase() : '';
  if (reasons.includes('pwned') || text.includes('pwned') || text.includes('leak') || text.includes('breach') || text.includes('known to be')) return authMessages.pwned;
  if (reasons.includes('length')) return passwordRuleMessages.length;
  if (reasons.includes('characters')) return authMessages.weakCharacters;
  return authMessages.weak;
}

/** Portuguese message for any error from the login service on the given screen. */
export function authErrorMessage(error: unknown, context: AuthScreenContext): string {
  if (!error || typeof error !== 'object') return generic[context];
  const e = error as AuthLike;
  switch (codeOf(e)) {
    case 'weak_password': return weakMessage(e);
    case 'password_too_long': return authMessages.tooLong;
    case 'same_password': return authMessages.same;
    case 'invalid_credentials': return context === 'login' ? authMessages.invalidLogin : context === 'password' ? authMessages.reauth : generic[context];
    case 'email_not_confirmed': return authMessages.emailNotConfirmed;
    case 'user_banned': return authMessages.blocked;
    case 'over_request_rate_limit': case 'over_email_send_rate_limit': case 'over_sms_send_rate_limit': return authMessages.rateLimit;
    case 'signup_disabled': case 'email_address_not_authorized': case 'user_not_found': case 'identity_not_found': return context === 'link' ? authMessages.linkExpired : authMessages.notAuthorized;
    case 'session_not_found': case 'session_expired': case 'refresh_token_not_found': case 'refresh_token_already_used': case 'bad_jwt': case 'no_authorization':
      return context === 'link' ? authMessages.linkExpired : authMessages.sessionEnded;
    case 'otp_expired': case 'otp_disabled': case 'flow_state_expired': case 'flow_state_not_found': case 'bad_code_verifier': case 'bad_oauth_state': return authMessages.linkExpired;
    case 'reauthentication_needed': case 'reauthentication_not_valid': case 'current_password_required': case 'current_password_mismatch': return authMessages.reauth;
    case 'provider_disabled': case 'email_provider_disabled': case 'oauth_provider_not_supported': return authMessages.providerOff;
    case 'email_address_invalid': return authMessages.invalidEmail;
    case 'validation_failed': case 'bad_json': return authMessages.invalidData;
    case 'captcha_failed': return authMessages.captcha;
    case 'network': case 'request_timeout': case 'unexpected_failure': case 'hook_timeout': return authMessages.unavailable;
    default: return generic[context];
  }
}

/** Errors of the notem sign-in completion step: our Portuguese messages pass, anything else (e.g. "Unauthorized: …") does not. */
const FINISH_MESSAGES = new Set([authMessages.notAuthorized, 'Não foi possível carregar ou salvar os dados. Tente novamente.']);
export function finishSignInMessage(error: unknown): string {
  const text = error instanceof Error ? error.message : '';
  if (FINISH_MESSAGES.has(text)) return text;
  return text.startsWith('Unauthorized') ? authMessages.sessionEnded : authMessages.genericLogin;
}
