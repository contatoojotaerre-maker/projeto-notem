// @vitest-environment node
import { describe, expect, it } from 'vitest'
import { serveDocs } from '@/docs-site/handler.server'
import { hostResponse, securityHeaders } from '@/server'
import { routeRequest } from '@/lib/hosts'

const get = (u: string) => { const url = new URL(u); const d = routeRequest(url); if (d.kind !== 'docs') throw new Error(d.kind); return serveDocs(new Request(url), d) }

describe('documentação servida', () => {
  it('página do docs: HTML próprio, sem cookie, sem script do painel e com política restrita', async () => {
    const r = await get('https://docs.notemfiscal.com.br/guias/emissao')
    expect(r.status).toBe(200)
    const html = await r.text()
    expect(r.headers.get('Set-Cookie')).toBeNull()
    expect(r.headers.get('Content-Security-Policy')).toContain("script-src 'self'")
    expect(r.headers.get('Content-Security-Policy')).toContain("frame-ancestors 'none'")
    expect(r.headers.get('Strict-Transport-Security')).toBe('max-age=31536000')
    expect(r.headers.get('Cache-Control')).toBe('public, max-age=300')
    expect(r.headers.get('X-Robots-Tag')).toBeNull()
    expect(html).toContain('<link rel="canonical" href="https://docs.notemfiscal.com.br/guias/emissao">')
    expect(html).not.toMatch(/supabase|sb_publishable|eyJhbGci|VITE_|<script>(?!<\/script>)/i)
    expect([...html.matchAll(/<script[^>]*src="([^"]+)"/g)].map(m => m[1]!.replace(/\?v=\w+$/, ''))).toEqual(['/_recursos/tema.js', '/_recursos/docs.js'])
    // The docs stylesheet is served by the docs handler itself (it is not part of the panel's client build).
    const css = serveDocs(new Request('https://docs.notemfiscal.com.br/_recursos/docs.css'), { path: '/_recursos/docs.css', base: '' })
    expect(css.status).toBe(200)
    expect(css.headers.get('Content-Type')).toContain('text/css')
    expect(html).toMatch(/href="\/_recursos\/docs\.css\?v=\w+"/)
    expect(html).toContain('href="/guias/cancelamento"')
  })
  it('na prévia, as páginas ficam em /docs e não são indexadas', async () => {
    const r = await get('https://id-preview--abc.lovable.app/docs/guias/emissao')
    expect(await r.text()).toContain('href="/docs/guias/cancelamento"')
    expect(r.headers.get('X-Robots-Tag')).toBe('noindex')
  })
  it('endereço inexistente, /api e funções internas no docs: "Página não encontrada" (404)', async () => {
    for (const p of ['/nao-existe', '/api/v1/status', '/_serverFn/abc']) {
      const r = await get('https://docs.notemfiscal.com.br' + p)
      expect(r.status, p).toBe(404); expect(await r.text()).toContain('Página não encontrada')
    }
  })
  it('robots.txt, sitemap.xml, llms.txt, busca e openapi.yaml', async () => {
    const sitemap = await (await get('https://docs.notemfiscal.com.br/sitemap.xml')).text()
    expect(sitemap).toContain('<loc>https://docs.notemfiscal.com.br/referencia/notas/emitir-nota</loc>')
    expect(sitemap).toContain('<loc>https://docs.notemfiscal.com.br/</loc><lastmod>2026-11-17</lastmod>')
    expect((await get('https://docs.notemfiscal.com.br/llms.txt')).headers.get('Content-Type')).toContain('text/plain')
    expect(JSON.parse(await (await get('https://docs.notemfiscal.com.br/busca.json')).text()).length).toBeGreaterThan(100)
    expect(await (await get('https://docs.notemfiscal.com.br/openapi.yaml')).text()).toMatch(/^openapi: 3\.1\.0/)
    const robots = hostResponse(new Request('https://docs.notemfiscal.com.br/robots.txt'), routeRequest(new URL('https://docs.notemfiscal.com.br/robots.txt')))!
    expect(await robots.text()).toBe('User-agent: *\nAllow: /\n\nSitemap: https://docs.notemfiscal.com.br/sitemap.xml\n')
  })
  it('redirecionamento 301 mantém caminho e consulta', () => {
    const r = hostResponse(new Request('https://www.notemfiscal.com.br/o/x?aba=y'), routeRequest(new URL('https://www.notemfiscal.com.br/o/x?aba=y')))!
    expect(r.status).toBe(301); expect(r.headers.get('Location')).toBe('https://app.notemfiscal.com.br/o/x?aba=y')
  })
})

describe('painel e API: cabeçalhos atuais inalterados', () => {
  it('mesmos cabeçalhos de proteção de antes no app. (o noindex é acrescentado à parte)', () => {
    const h = Object.fromEntries(securityHeaders(new URL('https://app.notemfiscal.com.br/api/v1/status'), new Headers()).entries())
    expect(h).toEqual({
      'content-security-policy': "base-uri 'self'; object-src 'none'; form-action 'self'; frame-ancestors 'none'",
      'x-frame-options': 'DENY', 'x-content-type-options': 'nosniff', 'referrer-policy': 'strict-origin-when-cross-origin',
      'permissions-policy': 'camera=(), microphone=(), geolocation=(), payment=()',
    })
  })
})
