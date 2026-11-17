// Request handler of the public documentation (docs.notemfiscal.com.br, or /docs in editor previews).
// Serves only build-time content: no login session, no database, no secrets.
import site from 'virtual:notem-docs'
import appCss from '../styles.css?url'
import docsCss from './docs.css?url'
import clientJs from './client.js?raw'
import themeJs from './theme.js?raw'
import { DOCS_HOST } from '@/lib/app-url'
import { renderNotFound, renderPage, withBase } from './layout'
import { DOCS_ORIGIN_SITEMAP, sitemapXml } from './sitemap'

/** Docs-only headers: strict content policy on the official domain (only own scripts/styles and the brand font). */
export function docsHeaders(url: URL, contentType: string, cache = 'public, max-age=300') {
  const official = url.hostname === DOCS_HOST
  const ancestors = official ? "'none'" : "'self' https://lovable.dev https://*.lovable.dev https://*.lovable.app"
  const h = new Headers({ 'Content-Type': contentType, 'Cache-Control': cache, 'X-Content-Type-Options': 'nosniff', 'Referrer-Policy': 'strict-origin-when-cross-origin', 'Permissions-Policy': 'camera=(), microphone=(), geolocation=(), payment=()' })
  if (official) {
    h.set('Content-Security-Policy', `default-src 'self'; script-src 'self'; style-src 'self' https://fonts.googleapis.com; font-src https://fonts.gstatic.com; img-src 'self' data:; connect-src 'self'; base-uri 'self'; object-src 'none'; form-action 'none'; frame-ancestors ${ancestors}`)
    h.set('X-Frame-Options', 'DENY'); h.set('Strict-Transport-Security', 'max-age=31536000')
  } else {
    h.set('Content-Security-Policy', `base-uri 'self'; object-src 'none'; form-action 'none'; frame-ancestors ${ancestors}`)
    h.set('X-Robots-Tag', 'noindex')
  }
  return h
}

const pagesByPath = new Map(site.pages.map(p => [p.path, p]))

export function serveDocs(request: Request, d: { path: string; base: '' | '/docs' }): Response {
  const url = new URL(request.url)
  if (request.method !== 'GET' && request.method !== 'HEAD') return new Response('Método não permitido.', { status: 405, headers: docsHeaders(url, 'text/plain; charset=utf-8', 'no-store') })
  const reply = (body: string, type: string, status = 200, cache?: string) => new Response(request.method === 'HEAD' ? null : body, { status, headers: docsHeaders(url, type, cache) })
  const path = d.path.length > 1 ? d.path.replace(/\/+$/, '') : '/'
  switch (path) {
    case '/_recursos/docs.js': return reply(clientJs, 'text/javascript; charset=utf-8', 200, 'public, max-age=300')
    case '/_recursos/tema.js': return reply(themeJs, 'text/javascript; charset=utf-8', 200, 'public, max-age=300')
    case '/busca.json': return reply(withBase(JSON.stringify(site.search), d.base), 'application/json; charset=utf-8')
    case '/llms.txt': return reply(site.llms, 'text/plain; charset=utf-8')
    case '/sitemap.xml': return reply(sitemapXml(site, DOCS_ORIGIN_SITEMAP), 'application/xml; charset=utf-8')
    case '/openapi.yaml': return reply(site.openapi, 'application/yaml; charset=utf-8')
  }
  const assets = { css: [appCss, docsCss], base: d.base }
  const page = pagesByPath.get(path)
  if (!page) return reply(renderNotFound(site, assets), 'text/html; charset=utf-8', 404, 'no-store')
  return reply(renderPage(site, page, assets), 'text/html; charset=utf-8')
}
