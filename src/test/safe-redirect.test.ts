import { describe, expect, it } from 'vitest';
import { DEFAULT_DESTINATION, rememberDestination, safeInternalPath, takeDestination } from '@/lib/safe-redirect';

function memory() { const m = new Map<string, string>(); return { m, getItem: (k: string) => m.get(k) ?? null, setItem: (k: string, v: string) => void m.set(k, v), removeItem: (k: string) => void m.delete(k) }; }

describe('destino do login', () => {
  it.each(['/o/group-jota-abc123/notas', '/o/x/empresas/0b5d1c1e-8f7a-4a7e-9a1d-2f3e4d5c6b7a?aba=certificado', '/o/x/notas?busca=Jo%C3%A3o&pagina=2', '/dashboard#topo'])('aceita caminho interno %s', p => {
    expect(safeInternalPath(p)).toBe(p);
  });
  it.each([
    '//site.com', '///site.com', 'https://site.com', 'http://site.com/o', '/\\site.com', '\\\\site.com', 'javascript:alert(1)', '/javascript:alert(1)',
    '/%2F%2Fsite.com', '/%5Csite.com', '%2F%2Fsite.com', '/o/x\tnotas', '/o/x\nnotas', ' /o/x', '', 'o/x/notas', 'data:text/html,oi',
    '/entrar', '/entrar?destino=/o', '/definir-senha', '/redefinir-senha', '/esqueci-senha',
  ])('recusa %j', p => { expect(safeInternalPath(p)).toBeNull(); });
  it('recusa valores que não são texto', () => { for (const v of [null, undefined, 1, {}, ['/o']]) expect(safeInternalPath(v)).toBeNull(); });

  it('guarda só destino válido e o apaga depois de usado', () => {
    const s = memory();
    rememberDestination('//site.com', s); expect(s.m.size).toBe(0);
    rememberDestination('/o/x/alertas', s); expect(takeDestination(s)).toBe('/o/x/alertas');
    expect(s.m.size).toBe(0); expect(takeDestination(s)).toBe(DEFAULT_DESTINATION);
  });
  it('valida de novo ao ler o destino guardado no navegador (valor adulterado)', () => {
    const s = memory(); s.setItem('notem-destino', 'https://site.com');
    expect(takeDestination(s)).toBe(DEFAULT_DESTINATION); expect(s.m.size).toBe(0);
    s.setItem('notem-destino', '/\\site.com'); expect(takeDestination(s)).toBe(DEFAULT_DESTINATION);
  });
  it('sem armazenamento usa o destino padrão', () => { expect(takeDestination(null)).toBe(DEFAULT_DESTINATION); });
});
