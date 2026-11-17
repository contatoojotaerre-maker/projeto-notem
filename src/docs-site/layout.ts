// HTML shell of the public documentation. Pages are plain server-rendered HTML plus one small script
// (no panel bundle, no login session, no database calls).
import { BASE_TOKEN, type DocPage, type DocsSite, type NavSection, type NavItem } from './types'

const DOCS_ORIGIN = 'https://docs.notemfiscal.com.br'
const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')
export const withBase = (html: string, base: string) => html.split(BASE_TOKEN).join(base)
const dateBr = (d: string) => `${d.slice(8, 10)}/${d.slice(5, 7)}/${d.slice(0, 4)}`

export type Assets = { css: string[]; base: string; version?: string | undefined }

const icon = {
  menu: '<svg viewBox="0 0 24 24" width="20" height="20" aria-hidden="true"><path d="M4 6h16M4 12h16M4 18h16" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></svg>',
  search: '<svg viewBox="0 0 24 24" width="16" height="16" aria-hidden="true"><circle cx="11" cy="11" r="7" stroke="currentColor" stroke-width="2" fill="none"/><path d="m20 20-3.5-3.5" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></svg>',
  sun: '<svg class="docs-icon-sun" viewBox="0 0 24 24" width="18" height="18" aria-hidden="true"><circle cx="12" cy="12" r="4" fill="none" stroke="currentColor" stroke-width="2"/><path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></svg>',
  moon: '<svg class="docs-icon-moon" viewBox="0 0 24 24" width="18" height="18" aria-hidden="true"><path d="M21 12.8A9 9 0 1 1 11.2 3a7 7 0 0 0 9.8 9.8z" fill="none" stroke="currentColor" stroke-width="2" stroke-linejoin="round"/></svg>',
}

function navHtml(nav: NavSection[], current: string) {
  const link = (i: NavItem) => `<a href="${BASE_TOKEN}${i.path}" class="docs-nav-link"${i.path === current ? ' aria-current="page"' : ''}>${i.method ? `<span class="docs-method docs-method-sm" data-method="${i.method.toLowerCase()}">${i.method === 'DELETE' ? 'DEL' : i.method}</span>` : ''}<span>${esc(i.title)}</span></a>`
  return nav.map(s => `<div class="docs-nav-section"><p class="docs-nav-title">${esc(s.title)}</p>${s.items.map(link).join('')}${s.groups.map(g => {
    const open = g.items.some(i => i.path === current)
    return `<details class="docs-nav-group"${open ? ' open' : ''}><summary>${esc(g.title)}</summary>${g.items.map(link).join('')}</details>`
  }).join('')}</div>`).join('')
}

function head(title: string, description: string, canonicalPath: string, a: Assets, type: 'website' | 'article', robots?: string) {
  const full = title === 'Documentação da API da notem' ? title : `${title} — Documentação da API da notem`
  return `<head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>${esc(full)}</title>
<meta name="description" content="${esc(description)}">${robots ? `<meta name="robots" content="${robots}">` : ''}
<meta property="og:title" content="${esc(full)}"><meta property="og:description" content="${esc(description)}"><meta property="og:type" content="${type}"><meta property="og:site_name" content="notem"><meta property="og:url" content="${DOCS_ORIGIN}${canonicalPath}">
<meta name="twitter:card" content="summary"><meta name="twitter:title" content="${esc(full)}"><meta name="twitter:description" content="${esc(description)}">
<link rel="canonical" href="${DOCS_ORIGIN}${canonicalPath}"><link rel="icon" href="/favicon.png" type="image/png">
<script src="${a.base}/_recursos/tema.js${a.version ? `?v=${a.version}` : ''}"></script>
<link rel="preconnect" href="https://fonts.googleapis.com"><link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Plus+Jakarta+Sans:wght@400;500;600;700&display=swap">
${a.css.map(c => `<link rel="stylesheet" href="${c}">`).join('')}
<link rel="alternate" type="text/plain" href="${a.base}/llms.txt" title="llms.txt"></head>`
}

function shell(site: DocsSite, current: string, main: string, a: Assets) {
  return `<body class="docs-body"><a class="docs-skip" href="#conteudo">Pular para o conteúdo</a>
<header class="docs-top"><button type="button" class="docs-icon-btn docs-menu-btn" data-nav-toggle aria-controls="docs-nav" aria-expanded="false" aria-label="Abrir menu">${icon.menu}</button>
<a class="docs-brand" href="${BASE_TOKEN}/" aria-label="notem — início da documentação"><img src="/brand/notem-logo-fundo-escuro.png" width="1527" height="357" alt="notem" class="docs-logo-dark"><img src="/brand/notem-logo-fundo-claro.png" width="1920" height="430" alt="notem" class="docs-logo-light"><span class="docs-brand-label">Documentação</span></a>
<button type="button" class="docs-search-btn" data-search-open aria-label="Buscar na documentação">${icon.search}<span>Buscar</span><kbd>/</kbd></button>
<nav class="docs-top-links" aria-label="Atalhos"><a href="https://app.notemfiscal.com.br/entrar" class="docs-top-link">Painel</a>
<button type="button" class="docs-icon-btn" data-theme-toggle aria-label="Alternar tema claro e escuro" title="Alternar tema">${icon.sun}${icon.moon}</button></nav></header>
<div class="docs-shell"><nav class="docs-nav" id="docs-nav" aria-label="Documentação">${navHtml(site.nav, current)}</nav><div class="docs-backdrop" data-nav-close hidden></div>
${main}</div>
<div class="docs-search" data-search hidden><div class="docs-search-box" role="dialog" aria-modal="true" aria-label="Buscar na documentação">
<div class="docs-search-field">${icon.search}<input type="search" data-search-input placeholder="Buscar páginas, campos e rotas" autocomplete="off" aria-label="Buscar"><button type="button" class="docs-search-close" data-search-close>Esc</button></div>
<ul class="docs-search-results" data-search-results role="listbox" aria-label="Resultados"></ul><p class="docs-search-empty" data-search-empty hidden>Nenhum resultado.</p></div></div>
<script src="${a.base}/_recursos/docs.js${a.version ? `?v=${a.version}` : ''}" defer></script></body>`
}

export function renderPage(site: DocsSite, page: DocPage, a: Assets) {
  const i = site.pages.indexOf(page); const prev = site.pages[i - 1]; const next = site.pages[i + 1]
  const crumbs = [page.section, page.group].filter((x): x is string => !!x && x !== page.title)
  const right = page.aside ? `<aside class="docs-examples" aria-label="Exemplos">${page.aside}</aside>`
    : page.toc.length ? `<aside class="docs-toc" aria-label="Nesta página"><p class="docs-toc-title">Nesta página</p>${page.toc.map(t => `<a href="#${t.id}" class="docs-toc-link" data-level="${t.level}">${esc(t.text)}</a>`).join('')}</aside>` : ''
  const pager = `<nav class="docs-pager" aria-label="Anterior e próxima">${prev ? `<a href="${BASE_TOKEN}${prev.path}" rel="prev"><small>Anterior</small><span>${esc(prev.menu)}</span></a>` : '<span></span>'}${next ? `<a href="${BASE_TOKEN}${next.path}" rel="next" class="docs-pager-next"><small>Próxima</small><span>${esc(next.menu)}</span></a>` : ''}</nav>`
  const main = `<main id="conteudo" class="docs-main${page.aside ? ' docs-main-ref' : ''}"><article class="docs-article">
${crumbs.length && page.path !== '/' ? `<p class="docs-eyebrow">${crumbs.map(esc).join(' › ')}</p>` : ''}<h1>${esc(page.title)}</h1>
<div class="docs-content">${page.html}</div>${pager}
<footer class="docs-foot">${page.updated ? `<span>Atualizado em ${dateBr(page.updated)}</span>` : ''}<a href="${BASE_TOKEN}/openapi.yaml">openapi.yaml</a><a href="${BASE_TOKEN}/historico">Histórico de mudanças</a></footer></article>${right}</main>`
  const html = `<!doctype html><html lang="pt-BR" data-base="${a.base}">${head(page.title, page.description, page.path, a, page.path === '/' ? 'website' : 'article')}${shell(site, page.path, main, a)}</html>`
  return withBase(html, a.base)
}

export function renderNotFound(site: DocsSite, a: Assets) {
  const main = `<main id="conteudo" class="docs-main"><article class="docs-article docs-notfound"><p class="docs-eyebrow">Erro 404</p><h1>Página não encontrada</h1>
<div class="docs-content"><p>O endereço não existe na documentação da notem. Ele pode ter mudado de lugar.</p>
<div class="docs-cards"><a class="docs-card" href="${BASE_TOKEN}/"><strong>Início</strong><span>Visão geral da API e por onde começar.</span></a><a class="docs-card" href="${BASE_TOKEN}/referencia/introducao"><strong>Referência da API</strong><span>Todas as operações, com exemplos.</span></a><button type="button" class="docs-card" data-search-open><strong>Buscar</strong><span>Procure por página, campo ou rota.</span></button></div></div></article></main>`
  return withBase(`<!doctype html><html lang="pt-BR" data-base="${a.base}">${head('Página não encontrada', 'Esta página não existe na documentação da API da notem.', '/404', a, 'website', 'noindex')}${shell(site, '', main, a)}</html>`, a.base)
}
