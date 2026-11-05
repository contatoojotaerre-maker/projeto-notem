/** Official notem address. Use for every displayed URL and every link sent by e-mail; internal navigation stays relative. */
export const APP_URL = 'https://app.notemfiscal.com.br'
export const APP_HOST = new URL(APP_URL).host
export const API_BASE = `${APP_URL}/api/v1`
export function appLink(path: string) { return APP_URL + (path.startsWith('/') ? path : '/' + path) }
