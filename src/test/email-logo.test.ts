import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { routeRequest } from '@/lib/hosts';

// Fixed address used by the Supabase e-mail templates: never rename or remove this file.
const FILE = 'public/brand/email/notem-logo-email.png';
const PATH = '/brand/email/notem-logo-email.png';

describe('logo dos e-mails', () => {
  const png = readFileSync(FILE);
  it('existe como PNG 280 × 62 e com até 15 KB', () => {
    expect(png.subarray(1, 4).toString('ascii')).toBe('PNG');
    expect(png.readUInt32BE(16)).toBe(280);
    expect(png.readUInt32BE(20)).toBe(62);
    expect(png.length).toBeLessThanOrEqual(15 * 1024);
  });
  it('abre no app. sem redirecionar nem passar pelo login', () => {
    expect(routeRequest(new URL('https://app.notemfiscal.com.br' + PATH))).toEqual({ kind: 'app', noindex: true });
  });
  it('não vira página da documentação no docs.', () => {
    expect(routeRequest(new URL('https://docs.notemfiscal.com.br' + PATH)).kind).toBe('app');
  });
  it('endereços antigos levam ao mesmo caminho no app.', () => {
    expect(routeRequest(new URL('https://notemfiscal.com.br' + PATH))).toEqual({ kind: 'redirect', location: 'https://app.notemfiscal.com.br' + PATH });
  });
});
