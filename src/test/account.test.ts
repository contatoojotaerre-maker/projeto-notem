import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { DISPLAY_NAME_MESSAGE, displayNameError, displayNameSchema, hasPasswordLogin, passwordChangeError, passwordChangeSchema, passwordMessages } from '@/lib/account';
import { passwordRuleMessages } from '@/lib/password-rule';
import { authErrorMessage } from '@/lib/auth-messages';

describe('Minha conta: nome', () => {
  it.each(['', '   ', 'A', ' A ', 'x'.repeat(81)])('recusa %j', v => { expect(displayNameError(v)).toBe(DISPLAY_NAME_MESSAGE); });
  it.each(['Jo', 'José Roberto', 'x'.repeat(80), '  Ana  '])('aceita %j', v => { expect(displayNameError(v)).toBeNull(); });
  it('guarda o nome sem espaços nas pontas', () => { expect(displayNameSchema.parse('  Ana  ')).toBe('Ana'); });
});

describe('Minha conta: trocar senha', () => {
  it('usa a regra única de senha (10+, maiúscula, minúscula, número, especial)', () => {
    expect(passwordChangeError({ current: 'Atual#2026x', next: 'Senha#123', confirm: 'Senha#123' })).toBe(passwordRuleMessages.length);
    expect(passwordChangeError({ current: 'Atual#2026x', next: 'senha#12345', confirm: 'senha#12345' })).toBe(passwordRuleMessages.upper);
    expect(passwordChangeError({ current: 'Atual#2026x', next: 'Senha#12345', confirm: 'Senha#12345' })).toBeNull();
    expect(passwordChangeSchema.safeParse({ current: 'x', next: 'Senha12345' }).success).toBe(false);
    expect(passwordChangeSchema.safeParse({ current: 'x', next: 'Senha#12345' }).success).toBe(true);
  });
  it('exige a senha atual, confirmação igual e senha nova diferente', () => {
    expect(passwordChangeError({ current: '', next: 'Senha#12345', confirm: 'Senha#12345' })).toBe(passwordMessages.current);
    expect(passwordChangeError({ current: 'a', next: 'Senha#12345', confirm: 'Senha#12346' })).toBe(passwordRuleMessages.confirm);
    expect(passwordChangeError({ current: 'Senha#12345', next: 'Senha#12345', confirm: 'Senha#12345' })).toBe(passwordMessages.same);
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
