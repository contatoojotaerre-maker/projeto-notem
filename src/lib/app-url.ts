/** Official notem address. Use for every displayed URL and every link sent by e-mail; internal navigation stays relative. */
export const APP_URL = 'https://app.notemfiscal.com.br'
export const APP_HOST = new URL(APP_URL).host
export const API_BASE = `${APP_URL}/api/v1`
export function appLink(path: string) { return APP_URL + (path.startsWith('/') ? path : '/' + path) }
/** Public API documentation (docs.notemfiscal.com.br); in editor previews it lives under /docs. */
export const DOCS_URL = 'https://docs.notemfiscal.com.br'
export const DOCS_HOST = new URL(DOCS_URL).host
/** Hosts that only redirect (301, same path) to APP_URL: the bare domain, www and the project's published .lovable.app address. */
export const REDIRECT_TO_APP_HOSTS = ['notemfiscal.com.br', 'www.notemfiscal.com.br', 'notem-waiting-garden.lovable.app'] as const
