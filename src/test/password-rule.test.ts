import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { PASSWORD_MIN, PASSWORD_REQUIREMENTS, newPasswordError, newPasswordSchema, passwordChecklist, passwordRuleError, passwordRuleMessages } from '@/lib/password-rule';
import { authErrorMessage, authMessages, finishSignInMessage } from '@/lib/auth-messages';

describe('regra única de senha', () => {
  it('lista os cinco requisitos na ordem e com os textos combinados', () => {
    expect(PASSWORD_MIN).toBe(10);
    expect(PASSWORD_REQUIREMENTS.map(r => r.label)).toEqual(['10 caracteres ou mais', 'Uma letra maiúscula', 'Uma letra minúscula', 'Um número', 'Um caractere especial']);
  });
  it.each([
    ['Senha#123', 'length', passwordRuleMessages.length], // 9 caracteres
    ['senha#12345', 'upper', passwordRuleMessages.upper],
    ['SENHA#12345', 'lower', passwordRuleMessages.lower],
    ['Senha#abcde', 'digit', passwordRuleMessages.digit],
    ['Senha123456', 'special', passwordRuleMessages.special],
    ['Senha 123456', 'special', passwordRuleMessages.special], // espaço não conta como especial
  ])('%j falha só em %s', (password, failing, message) => {
    expect(passwordChecklist(password).filter(i => !i.ok).map(i => i.id)).toEqual([failing]);
    expect(passwordRuleError(password)).toBe(message);
    expect(newPasswordSchema.safeParse(password).success).toBe(false);
  });
  it.each(['Senha#12345', 'Ação!2026xy', 'Notem.Fiscal9'])('%j passa', password => {
    expect(passwordChecklist(password).every(i => i.ok)).toBe(true);
    expect(passwordRuleError(password)).toBeNull();
    expect(newPasswordSchema.safeParse(password).success).toBe(true);
  });
  it('lista vazia: nada cumprido', () => { expect(passwordChecklist('').some(i => i.ok)).toBe(false); });
  it('confirmação precisa ser igual para liberar o botão', () => {
    expect(newPasswordError('Senha#12345', 'Senha#12346')).toBe(passwordRuleMessages.confirm);
    expect(newPasswordError('Senha#12345', '')).toBe(passwordRuleMessages.confirm);
    expect(newPasswordError('Senha#12345', 'Senha#12345')).toBeNull();
  });
  it('recusa acima de 72 bytes (limite do serviço de login)', () => {
    expect(passwordRuleError(`Aa1!${'x'.repeat(68)}`)).toBeNull();
    expect(passwordRuleError(`Aa1!${'x'.repeat(69)}`)).toBe(passwordRuleMessages.tooLong);
    expect(passwordRuleError(`Aa1!${'é'.repeat(35)}`)).toBe(passwordRuleMessages.tooLong);
  });
  it('as três telas usam o mesmo módulo', () => {
    expect(readFileSync('src/lib/account.ts', 'utf8')).toMatch(/from '\.\/password-rule'/);
    const screen = readFileSync('src/components/notem/auth-screen.tsx', 'utf8');
    expect(screen).toMatch(/newPasswordError\(password,confirm\)/);
    expect(screen).toMatch(/<PasswordRequirements/);
    expect(readFileSync('src/routes/_authenticated/conta.tsx', 'utf8')).toMatch(/<PasswordRequirements/);
    for (const f of ['src/routes/definir-senha.tsx', 'src/routes/redefinir-senha.tsx']) expect(readFileSync(f, 'utf8')).toMatch(/<AuthScreen mode="(invite|reset)"/);
  });
});

describe('mensagens do serviço de login em português', () => {
  it('senha encontrada em vazamentos', () => {
    expect(authErrorMessage({ name: 'AuthWeakPasswordError', code: 'weak_password', status: 422, reasons: ['pwned'], message: 'Password is known to be weak and easy to guess, please choose a different one.' }, 'link')).toBe('Esta senha apareceu em vazamentos de dados. Escolha outra.');
    expect(authErrorMessage({ code: 'weak_password', message: 'Password is known to be weak and easy to guess' }, 'password')).toBe(authMessages.pwned);
  });
  it('senha fraca', () => {
    expect(authErrorMessage({ code: 'weak_password', reasons: ['length'], message: 'Password should be at least 10 characters.' }, 'link')).toBe(passwordRuleMessages.length);
    expect(authErrorMessage({ code: 'weak_password', reasons: ['characters'], message: 'Password should contain at least one character of each' }, 'link')).toBe(authMessages.weakCharacters);
    expect(authErrorMessage({ code: 'weak_password', reasons: [] }, 'password')).toBe(authMessages.weak);
  });
  it.each([
    [{ code: 'invalid_credentials', message: 'Invalid login credentials' }, 'login', authMessages.invalidLogin],
    [{ message: 'Invalid login credentials', status: 400 }, 'login', authMessages.invalidLogin],
    [{ code: 'same_password', message: 'New password should be different from the old password.' }, 'link', authMessages.same],
    [{ code: 'over_email_send_rate_limit', message: 'email rate limit exceeded' }, 'forgot', authMessages.rateLimit],
    [{ code: 'over_request_rate_limit', status: 429 }, 'login', authMessages.rateLimit],
    [{ code: 'email_not_confirmed', message: 'Email not confirmed' }, 'login', authMessages.emailNotConfirmed],
    [{ code: 'user_banned', message: 'User is banned' }, 'login', authMessages.blocked],
    [{ code: 'session_not_found', message: 'Session from session_id claim in JWT does not exist' }, 'link', authMessages.linkExpired],
    [{ name: 'AuthSessionMissingError', message: 'Auth session missing!' }, 'login', authMessages.sessionEnded],
    [{ code: 'otp_expired', message: 'Email link is invalid or has expired' }, 'link', authMessages.linkExpired],
    [{ code: 'reauthentication_needed', message: 'Password update requires reauthentication.' }, 'password', authMessages.reauth],
    [{ code: 'signup_disabled', message: 'Signups not allowed for this instance' }, 'login', authMessages.notAuthorized],
    [{ code: 'email_address_invalid', message: 'Email address is invalid' }, 'forgot', authMessages.invalidEmail],
    [{ name: 'AuthRetryableFetchError', status: 0, message: 'Failed to fetch' }, 'login', authMessages.unavailable],
    [{ message: 'Password cannot be longer than 72 characters' }, 'link', authMessages.tooLong],
    [{ code: 'novo_codigo_desconhecido', message: 'Some new English text' }, 'forgot', authMessages.genericForgot],
  ] as const)('%j em %s', (error, context, expected) => { expect(authErrorMessage(error, context)).toBe(expected); });
  it('nunca devolve o texto do serviço', () => {
    const english = /\b(password|invalid|email|session|rate|limit|failed|user|please|should)\b/i;
    for (const context of ['login', 'forgot', 'password', 'link'] as const) for (const error of [{ message: 'Invalid login credentials' }, { code: 'x', message: 'Whatever happened' }, new Error('Unexpected failure'), 'texto', null])
      expect(authErrorMessage(error, context)).not.toMatch(english);
  });
  it('etapa final do login só repassa mensagens da notem', () => {
    expect(finishSignInMessage(new Error('Unauthorized: Invalid token'))).toBe(authMessages.sessionEnded);
    expect(finishSignInMessage(new Error(authMessages.notAuthorized))).toBe(authMessages.notAuthorized);
    expect(finishSignInMessage(new Error('boom'))).toBe(authMessages.genericLogin);
  });
  it('telas de senha não mostram o texto do erro do serviço', () => {
    const screen = readFileSync('src/components/notem/auth-screen.tsx', 'utf8');
    expect(screen).not.toMatch(/throw result\.error/);
    expect(screen).not.toMatch(/setError\(err instanceof Error\?err\.message/);
    expect(readFileSync('src/lib/account.functions.ts', 'utf8')).toMatch(/authErrorMessage\(updated\.error, 'password'\)/);
  });
});
