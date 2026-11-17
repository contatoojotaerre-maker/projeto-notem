// Pure host routing for src/server.ts: one deployment serves app.notemfiscal.com.br (panel + API) and
// docs.notemfiscal.com.br (public documentation). Editor previews keep working and show the docs under /docs.
import { APP_URL, DOCS_HOST, DOCS_URL, APP_HOST, REDIRECT_TO_APP_HOSTS } from './app-url'

export type HostDecision =
  | { kind: 'redirect'; location: string }
  | { kind: 'docs'; path: string; base: '' | '/docs' }
  | { kind: 'robots'; body: string }
  | { kind: 'app'; noindex: boolean }
  | { kind: 'docs-api-404' }

/** Panel screens: opened on the docs domain they go to the same path on app. */
const PANEL = [/^\/entrar\/?$/, /^\/esqueci-senha\/?$/, /^\/definir-senha\/?$/, /^\/redefinir-senha\/?$/, /^\/(o|admin|conta|dashboard)(\/|$)/]
/** Built assets and brand files are shared by both domains. */
const STATIC = /^\/(assets|brand)\/|^\/favicon\.png$/
/** Shown when an integration calls the API on the docs domain (any method): JSON 404, never a redirect. */
export const DOCS_API_MESSAGE = `A API da notem fica em ${APP_URL}/api/v1. Este endereço é da documentação.`
export const APP_ROBOTS = 'User-agent: *\nDisallow: /\n'
export const DOCS_ROBOTS = `User-agent: *\nAllow: /\n\nSitemap: ${DOCS_URL}/sitemap.xml\n`

const isDocsPath = (p: string) => p === '/docs' || p.startsWith('/docs/')
const stripDocs = (p: string) => p.slice('/docs'.length) || '/'

export function routeRequest(url: URL): HostDecision {
  const host = url.hostname.toLowerCase(); const path = url.pathname; const rest = path + url.search
  if (host === DOCS_HOST) {
    if (path === '/robots.txt') return { kind: 'robots', body: DOCS_ROBOTS }
    if (path === '/api' || path.startsWith('/api/')) return { kind: 'docs-api-404' }
    if (isDocsPath(path)) return { kind: 'redirect', location: DOCS_URL + stripDocs(path) + url.search }
    if (PANEL.some(r => r.test(path))) return { kind: 'redirect', location: APP_URL + rest }
    if (STATIC.test(path)) return { kind: 'app', noindex: false }
    return { kind: 'docs', path, base: '' }
  }
  if ((REDIRECT_TO_APP_HOSTS as readonly string[]).includes(host)) return { kind: 'redirect', location: APP_URL + rest }
  if (host === APP_HOST) {
    if (path === '/robots.txt') return { kind: 'robots', body: APP_ROBOTS }
    if (isDocsPath(path)) return { kind: 'redirect', location: DOCS_URL + stripDocs(path) + url.search }
    return { kind: 'app', noindex: true }
  }
  // Editor previews and local development: unchanged app, docs under /docs, never indexed.
  if (path === '/robots.txt') return { kind: 'robots', body: APP_ROBOTS }
  if (isDocsPath(path)) return { kind: 'docs', path: stripDocs(path), base: '/docs' }
  return { kind: 'app', noindex: false }
}
