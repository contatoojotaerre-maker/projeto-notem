import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { DISPLAY_NAME_MESSAGE, PASSWORD_MIN, displayNameError, displayNameSchema, hasPasswordLogin, passwordChangeError, passwordChangeSchema, passwordMessages, passwordUpdateMessage } from '@/lib/account';

describe('Minha conta: nome', () => {
  it.each(['', '   ', 'A', ' A ', 'x'.repeat(81)])('recusa %j', v => { expect(displayNameError(v)).toBe(DISPLAY_NAME_MESSAGE); });
  it.each(['Jo', 'José Roberto', 'x'.repeat(80), '  Ana  '])('aceita %j', v => { expect(displayNameError(v)).toBeNull(); });
  it('guarda o nome sem espaços nas pontas', () => { expect(displayNameSchema.parse('  Ana  ')).toBe('Ana'); });
});

describe('Minha conta: trocar senha', () => {
  it('mínimo igual ao cadastro (8)', () => {
    expect(PASSWORD_MIN).toBe(8);
    expect(passwordChangeError({ current: 'atual123', next: '1234567', confirm: '1234567' })).toBe(passwordMessages.short);
    expect(passwordChangeError({ current: 'atual123', next: '12345678', confirm: '12345678' })).toBeNull();
    expect(passwordChangeSchema.safeParse({ current: 'x', next: '1234567' }).success).toBe(false);
  });
  it('exige a senha atual, confirmação igual e senha nova diferente', () => {
    expect(passwordChangeError({ current: '', next: '12345678', confirm: '12345678' })).toBe(passwordMessages.current);
    expect(passwordChangeError({ current: 'a', next: '12345678', confirm: '12345679' })).toBe(passwordMessages.confirm);
    expect(passwordChangeError({ current: '12345678', next: '12345678', confirm: '12345678' })).toBe(passwordMessages.same);
  });
  it('erro desconhecido do serviço de login vira mensagem genérica', () => {
    expect(passwordUpdateMessage('qualquer_coisa')).toBe(passwordMessages.failed);
    expect(passwordUpdateMessage(undefined)).toBe(passwordMessages.failed);
  });
  it('conta só com Google não tem senha', () => {
    expect(hasPasswordLogin(['google'])).toBe(false);
    expect(hasPasswordLogin(['email', 'google'])).toBe(true);
    expect(hasPasswordLogin(undefined)).toBe(false);
  });
  it('servidor confere a senha atual antes de trocar e encerra só as outras sessões', () => {
    const src = readFileSync('src/lib/account.functions.ts', 'utf8');
    const check = src.indexOf('signInWithPassword'), update = src.indexOf('updateUser'), others = src.indexOf("signOut(token, 'others')");
    expect(check).toBeGreaterThan(0); expect(update).toBeGreaterThan(check); expect(others).toBeGreaterThan(update);
    expect(src).not.toMatch(/signOut\([^)]*'global'/);
  });
});
