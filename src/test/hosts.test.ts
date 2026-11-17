import { describe, expect, it } from 'vitest'
import { routeRequest, APP_ROBOTS, DOCS_ROBOTS } from '@/lib/hosts'

// Owner decisions (17/11/2026): only app. and docs. serve the site; root, www and the project's .lovable.app address
// 301 to app. keeping the path; editor previews keep working with the docs under /docs; app. is noindex.
const r = (u: string) => routeRequest(new URL(u))

describe('endereços aceitos', () => {
  it.each([
    'https://notemfiscal.com.br/o/acme/notas?aba=recebidas',
    'https://www.notemfiscal.com.br/o/acme/notas?aba=recebidas',
    'https://notem-waiting-garden.lovable.app/o/acme/notas?aba=recebidas',
  ])('%s → 301 para app. com o mesmo caminho', u => {
    expect(r(u)).toEqual({ kind: 'redirect', location: 'https://app.notemfiscal.com.br/o/acme/notas?aba=recebidas' })
  })
  it('raiz, www e .lovable.app também redirecionam a API e o robots.txt', () => {
    expect(r('https://notemfiscal.com.br/api/v1/status')).toEqual({ kind: 'redirect', location: 'https://app.notemfiscal.com.br/api/v1/status' })
    expect(r('https://www.notemfiscal.com.br/robots.txt')).toEqual({ kind: 'redirect', location: 'https://app.notemfiscal.com.br/robots.txt' })
  })
  it('app.: painel e API com noindex; robots.txt bloqueia tudo; /docs vai para o docs', () => {
    expect(r('https://app.notemfiscal.com.br/o/acme')).toEqual({ kind: 'app', noindex: true })
    expect(r('https://app.notemfiscal.com.br/api/v1/status')).toEqual({ kind: 'app', noindex: true })
    expect(r('https://app.notemfiscal.com.br/robots.txt')).toEqual({ kind: 'robots', body: APP_ROBOTS })
    expect(APP_ROBOTS).toBe('User-agent: *\nDisallow: /\n')
    expect(r('https://app.notemfiscal.com.br/docs/guias/emissao?x=1')).toEqual({ kind: 'redirect', location: 'https://docs.notemfiscal.com.br/guias/emissao?x=1' })
  })
  it('docs.: páginas liberadas, robots.txt próprio com sitemap; telas do painel vão para app.', () => {
    expect(r('https://docs.notemfiscal.com.br/guias/emissao')).toEqual({ kind: 'docs', path: '/guias/emissao', base: '' })
    expect(r('https://docs.notemfiscal.com.br/robots.txt')).toEqual({ kind: 'robots', body: DOCS_ROBOTS })
    expect(DOCS_ROBOTS).toContain('Allow: /'); expect(DOCS_ROBOTS).toContain('Sitemap: https://docs.notemfiscal.com.br/sitemap.xml')
    for (const p of ['/entrar', '/esqueci-senha', '/definir-senha', '/redefinir-senha', '/o/acme/notas', '/conta', '/admin'])
      expect(r(`https://docs.notemfiscal.com.br${p}`)).toEqual({ kind: 'redirect', location: `https://app.notemfiscal.com.br${p}` })
    expect(r('https://docs.notemfiscal.com.br/api/v1/status')).toEqual({ kind: 'docs', path: '/api/v1/status', base: '' })
  })
  it('prévia do editor e local: painel como antes, docs em /docs', () => {
    for (const host of ['https://id-preview--24f0f935-7f21-4010-b7cf-276026256fea.lovable.app', 'http://localhost:8080']) {
      expect(r(`${host}/o/acme`)).toEqual({ kind: 'app', noindex: false })
      expect(r(`${host}/docs/guias/emissao`)).toEqual({ kind: 'docs', path: '/guias/emissao', base: '/docs' })
      expect(r(`${host}/docs`)).toEqual({ kind: 'docs', path: '/', base: '/docs' })
    }
  })
})
