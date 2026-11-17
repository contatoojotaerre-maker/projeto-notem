import type { DocsSite } from './types'

export const DOCS_ORIGIN_SITEMAP = 'https://docs.notemfiscal.com.br'
/** lastmod only from the page's own "atualizado" date (Markdown pages); generated reference pages omit it. */
export function sitemapXml(site: DocsSite, origin: string) {
  const urls = site.pages.map(p => `<url><loc>${origin}${p.path === '/' ? '/' : p.path}</loc>${p.updated && !p.method ? `<lastmod>${p.updated}</lastmod>` : ''}</url>`)
  return `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${urls.join('\n')}\n</urlset>\n`
}
