import { describe, expect, it } from 'vitest';
import { securityHeaders } from '@/server';
import { dateRange, MAX_OFFSET, pageParams, searchParam } from '@/lib/api-contract';

describe('cabeçalhos de proteção', () => {
  it('domínio oficial não pode ser exibido dentro de outro site', () => {
    const h = securityHeaders(new URL('https://app.notemfiscal.com.br/entrar'), new Headers());
    expect(h.get('X-Frame-Options')).toBe('DENY'); expect(h.get('Content-Security-Policy')).toContain("frame-ancestors 'none'");
    expect(h.get('X-Content-Type-Options')).toBe('nosniff'); expect(h.get('Referrer-Policy')).toBe('strict-origin-when-cross-origin');
  });
  it('prévia continua abrindo no editor', () => {
    const h = securityHeaders(new URL('https://id-preview--x.lovable.app/'), new Headers());
    expect(h.get('X-Frame-Options')).toBeNull(); expect(h.get('Content-Security-Policy')).toContain('https://*.lovable.dev');
  });
});

const fails = (fn: () => unknown) => { try { fn(); return false; } catch { return true; } };
describe('filtros das listagens', () => {
  const u = (q: string) => new URL(`https://app.notemfiscal.com.br/api/v1/notas?${q}`);
  it('período de no máximo 366 dias e início antes do fim', () => {
    expect(dateRange(u('emitida_de=2026-01-01&emitida_ate=2027-01-01'), 'emitida_de', 'emitida_ate').from).toBe('2026-01-01T00:00:00-03:00');
    expect(fails(() => dateRange(u('emitida_de=2026-01-01&emitida_ate=2027-01-02'), 'emitida_de', 'emitida_ate'))).toBe(true);
    expect(fails(() => dateRange(u('emitida_de=2026-02-01&emitida_ate=2026-01-01'), 'emitida_de', 'emitida_ate'))).toBe(true);
    expect(fails(() => dateRange(u('emitida_de=2026-02-30'), 'emitida_de', 'emitida_ate'))).toBe(true);
  });
  it('busca de 2 a 150 caracteres', () => {
    expect(searchParam(u('busca=ab'))).toBe('ab');
    expect(fails(() => searchParam(u('busca=a')))).toBe(true); expect(fails(() => searchParam(u(`busca=${'a'.repeat(151)}`)))).toBe(true);
  });
  it('cursor não passa de 100.000 posições', () => {
    const cursor = (o: number) => Buffer.from(JSON.stringify({ o })).toString('base64url');
    expect(MAX_OFFSET).toBe(100_000);
    expect(pageParams(u(`cursor=${cursor(100_000)}`)).offset).toBe(100_000);
    expect(fails(() => pageParams(u(`cursor=${cursor(100_001)}`)))).toBe(true);
  });
});
