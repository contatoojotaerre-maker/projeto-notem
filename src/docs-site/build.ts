// Build-time reader of the public documentation. Reads ONLY docs/api/**/*.md and docs/api/openapi.yaml
// (never docs/interno) and produces pages, menu, search index and llms.txt. Runs in Node (Vite plugin and tests).
import fs from 'node:fs'
import path from 'node:path'
import yaml from 'js-yaml'
import { Marked, type Tokens, type Token } from 'marked'
import hljs from 'highlight.js/lib/core'
import bash from 'highlight.js/lib/languages/bash'
import javascript from 'highlight.js/lib/languages/javascript'
import json from 'highlight.js/lib/languages/json'
import powershell from 'highlight.js/lib/languages/powershell'
import http from 'highlight.js/lib/languages/http'
import xml from 'highlight.js/lib/languages/xml'
import yamlLang from 'highlight.js/lib/languages/yaml'
import { LIMITS, SLOTS, routeKind } from '../lib/api-policy'
import { rejectionGuidance } from '../lib/rejection-guidance'
import { BASE_TOKEN, type DocPage, type DocsSite, type NavSection, type SearchEntry, type TocItem } from './types'

hljs.registerLanguage('bash', bash); hljs.registerLanguage('javascript', javascript); hljs.registerLanguage('json', json)
hljs.registerLanguage('powershell', powershell); hljs.registerLanguage('http', http); hljs.registerLanguage('xml', xml); hljs.registerLanguage('yaml', yamlLang)

export const DOCS_ORIGIN = 'https://docs.notemfiscal.com.br'
const API = 'https://app.notemfiscal.com.br/api/v1'
const SECTIONS: { dir: string; title: string }[] = [
  { dir: '', title: 'Início' }, { dir: 'primeiros-passos', title: 'Primeiros passos' }, { dir: 'guias', title: 'Guias' },
  { dir: 'webhooks', title: 'Webhooks' }, { dir: 'referencia', title: 'Referência da API' }, { dir: 'historico', title: 'Histórico de mudanças' },
]
const LANG_NAMES: Record<string, string> = { bash: 'Terminal', javascript: 'JavaScript', json: 'JSON', powershell: 'PowerShell', http: 'HTTP', xml: 'XML', yaml: 'YAML', text: 'Texto' }
const CALLOUTS: Record<string, string> = { DICA: 'Dica', ATENCAO: 'Atenção', IMPORTANTE: 'Importante' }

export const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')
export const slugify = (s: string) => s.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/<[^>]+>/g, '').replace(/&[a-z]+;/g, ' ').replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '')
const kebab = (s: string) => s.replace(/([a-z0-9])([A-Z])/g, '$1-$2').toLowerCase()
/** Search result summary: only sentences from paragraphs and list items (never code, JSON or tables), cut at a word boundary. */
export function searchSummary(html: string, max = 160): string {
  const prose = [...html.replace(/<pre[\s\S]*?<\/pre>/g, ' ').replace(/<table[\s\S]*?<\/table>/g, ' ').matchAll(/<(p|li)\b[^>]*>([\s\S]*?)<\/\1>/g)].map(x => stripTags(x[2]!).replace(/ ([.,;:!?)])/g, '$1')).filter(Boolean).join(' ')
  if (prose.length <= max) return prose
  const cut = prose.slice(0, max); const sp = cut.lastIndexOf(' ')
  return (sp > max / 2 ? cut.slice(0, sp) : cut).replace(/[\s,;:.—–-]+$/, '') + '…'
}
const inlineText = (s: string) => esc(s.replace(/`/g, '').replace(/\[([^\]]+)\]\([^)]*\)/g, '$1'))
const stripTags = (h: string) => h.replace(/<[^>]+>/g, ' ').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&amp;/g, '&').replace(/\s+/g, ' ').trim()

function highlight(code: string, lang: string) {
  const l = hljs.getLanguage(lang) ? lang : null
  return l ? hljs.highlight(code, { language: l, ignoreIllegals: true }).value : esc(code)
}
export function codeBlock(code: string, lang: string, label?: string) {
  const name = label || LANG_NAMES[lang] || lang || 'Texto'
  return `<div class="docs-code"><div class="docs-code-head"><span>${esc(name)}</span><button type="button" class="docs-copy" data-copy>Copiar</button></div><pre tabindex="0"><code class="hljs language-${esc(lang || 'text')}">${highlight(code.replace(/\n$/, ''), lang)}</code></pre></div>`
}
export function tabs(items: { label: string; html: string }[], group = 'codigo') {
  const btn = items.map((t, i) => `<button type="button" role="tab" class="docs-tab" data-tab="${esc(t.label)}" aria-selected="${i === 0}">${esc(t.label)}</button>`).join('')
  const panels = items.map((t, i) => `<div class="docs-tabpanel" role="tabpanel" data-panel="${esc(t.label)}"${i ? ' hidden' : ''}>${t.html}</div>`).join('')
  return `<div class="docs-tabs" data-tabs="${esc(group)}"><div class="docs-tablist" role="tablist">${btn}</div>${panels}</div>`
}

type Front = { titulo: string; menu?: string | undefined; ordem: number; atualizado: string; descricao: string }
function frontMatter(file: string, raw: string): { fm: Front; body: string } {
  const m = /^---\n([\s\S]*?)\n---\n/.exec(raw)
  if (!m) throw new Error(`${file}: falta o cabeçalho (titulo, ordem, atualizado, descricao)`)
  // Simple "chave: valor" lines (values may contain ":"), no YAML quoting needed.
  const kv = Object.fromEntries(m[1]!.split('\n').filter(Boolean).map(l => { const i = l.indexOf(':'); return [l.slice(0, i).trim(), l.slice(i + 1).trim()] }))
  for (const k of ['titulo', 'ordem', 'atualizado', 'descricao']) if (!kv[k]) throw new Error(`${file}: cabeçalho sem "${k}"`)
  if (!/^\d{4}-\d{2}-\d{2}$/.test(kv['atualizado']!)) throw new Error(`${file}: "atualizado" deve ser AAAA-MM-DD`)
  return { fm: { titulo: kv['titulo']!, menu: kv['menu'], ordem: Number(kv['ordem']), atualizado: kv['atualizado']!, descricao: kv['descricao']! }, body: raw.slice(m[0].length) }
}

/** Markdown file (relative to docs/api) → site path. */
export function pagePath(rel: string) {
  if (rel === 'LEIAME.md') return '/'
  return '/' + rel.replace(/\.md$/, '')
}

// ---------- OpenAPI helpers ----------
// OpenAPI documents are loosely shaped YAML; property access is checked by the example/spec tests instead.
type Json = any
function opPath(tag: string, id: string) { return `/referencia/${slugify(tag)}/${kebab(id)}` }
const METHOD_ORDER = ['get', 'post', 'put', 'patch', 'delete']
const SAMPLE_IDS: Record<string, string> = { empresas: '00000000-0000-4000-8000-000000000201', notas: '00000000-0000-4000-8000-000000000101', servico_id: '00000000-0000-4000-8000-000000000301', tomador_id: '00000000-0000-4000-8000-000000000601', nota_id: '00000000-0000-4000-8000-000000000701', codigo: '101101' }
const SAMPLE_QUERY: Record<string, string> = { '/catalogos/municipios': 'busca=florianopolis', '/catalogos/servicos': 'busca=140101', '/catalogos/nbs': 'busca=120012100', '/catalogos/classificacoes-tributarias': 'busca=000001', '/catalogos/indicadores-operacao': 'busca=100501', '/catalogos/sugestao-classificacao': 'codigo_servico=140101' }
const EXAMPLE_KEY = 'ntm_homolog_EXEMPLO0000000000000000'

function samplePath(route: string) {
  return route.replace(/\{(\w+)\}/g, (_, name: string, offset: number) => {
    if (name !== 'id') return SAMPLE_IDS[name] ?? name
    return route.slice(0, offset).startsWith('/empresas') ? SAMPLE_IDS['empresas']! : SAMPLE_IDS['notas']!
  })
}

export function buildDocsSite(root = process.cwd()): DocsSite {
  const dir = path.join(root, 'docs', 'api')
  const problems: string[] = []
  const openapiRaw = fs.readFileSync(path.join(dir, 'openapi.yaml'), 'utf8')
  const spec = yaml.load(openapiRaw) as Json
  const deref = (n: any): any => { let x = n, guard = 0; while (x && typeof x === 'object' && typeof x.$ref === 'string' && guard++ < 20) { x = x.$ref.slice(2).split('/').reduce((o: any, k: string) => o?.[k.replace(/~1/g, '/').replace(/~0/g, '~')], spec) } return x }

  // operations
  type Op = { id: string; tag: string; method: string; route: string; op: Json; item: Json; path: string }
  const ops: Op[] = []
  for (const [route, item] of Object.entries(spec.paths as Json)) for (const method of METHOD_ORDER) {
    const op = (item as Json)[method]; if (!op) continue
    if (!op.operationId || !op.tags?.[0]) { problems.push(`openapi: ${method.toUpperCase()} ${route} sem operationId ou grupo`); continue }
    ops.push({ id: op.operationId, tag: op.tags[0], method, route, op, item: item as Json, path: opPath(op.tags[0], op.operationId) })
  }
  const opById = new Map(ops.map(o => [o.id, o]))
  const tagOrder: string[] = (spec.tags ?? []).map((t: Json) => t.name)

  // ---------- Markdown pages ----------
  const files: string[] = []
  const walk = (d: string) => { for (const e of fs.readdirSync(d, { withFileTypes: true })) { const f = path.join(d, e.name); if (e.isDirectory()) walk(f); else if (e.name.endsWith('.md')) files.push(path.relative(dir, f).split(path.sep).join('/')) } }
  walk(dir)
  const links: { from: string; to: string; hash: string; text: string }[] = []

  function resolveHref(href: string, fromRel: string, text: string): string {
    if (/^(https?:|mailto:)/.test(href)) return href
    if (href.startsWith('op:')) { const o = opById.get(href.slice(3)); if (!o) { problems.push(`${fromRel}: operação inexistente em "${href}"`); return '#' } links.push({ from: pagePath(fromRel), to: o.path, hash: '', text }); return BASE_TOKEN + o.path }
    const [p = '', hash = ''] = href.split('#')
    if (!p) { links.push({ from: pagePath(fromRel), to: pagePath(fromRel), hash, text }); return '#' + hash }
    const target = path.posix.normalize(path.posix.join(path.posix.dirname(fromRel), p))
    if (target === 'openapi.yaml') return BASE_TOKEN + '/openapi.yaml'
    if (!target.endsWith('.md') || target.startsWith('..')) { problems.push(`${fromRel}: link para fora da documentação pública "${href}"`); return '#' }
    if (!files.includes(target)) problems.push(`${fromRel}: link quebrado "${href}"`)
    const to = pagePath(target); links.push({ from: pagePath(fromRel), to, hash, text })
    return BASE_TOKEN + (to === '/' ? '/' : to) + (hash ? '#' + hash : '')
  }

  function generated(name: string, rel: string): string {
    if (name === 'limites') {
      const per = (r: { max: number; window: number }) => `${r.max} ${r.window === 60 ? 'por minuto' : r.window === 86400 ? 'por dia' : r.window % 60 === 0 ? `a cada ${r.window / 60} minutos` : `a cada ${r.window} segundos`}`
      const L = LIMITS
      const rows: [string, string][] = [
        ['Todas as chamadas', `${per(L.geral)} e ${L.geral_rajada.max} a cada ${L.geral_rajada.window} segundos, por chave`],
        ['Todas as chamadas da organização (todas as chaves somadas)', `${per(L.geral_organizacao)}, por ambiente`],
        ['Listas (`GET /empresas`, `/notas`, `/catalogos/*`, serviços, tomadores, notas recebidas)', per(L.listagem)],
        ['Emissão e substituição de nota', `${per(L.emissao_producao)} em produção, ${L.emissao_homologacao.max} em homologação; no máximo ${SLOTS.emissao} ao mesmo tempo por empresa`],
        ['Cancelamento e pedido de análise', `${per(L.evento)}; ${SLOTS.evento} de cada vez por nota`],
        ['Envio de certificado', `${per(L.certificado)} por chave e ${per(L.certificado_empresa_dia)} por empresa`],
        ['Verificação do município', `${per(L.municipio)} por empresa e ambiente`],
        ['PDF', `${per(L.pdf)}; no máximo ${SLOTS.pdf} ao mesmo tempo`],
        ['XML', per(L.xml)], ['Situação da sincronização', per(L.sincronizacao)], ['Chamadas sem chave válida', `${per(L.sem_chave)} por endereço de origem`],
      ]
      return '| O quê | Limite |\n|---|---|\n' + rows.map(([a, b]) => `| ${a} | ${b} |`).join('\n') + '\n'
    }
    if (name === 'operacoes') {
      return tagOrder.map(tag => `## ${tag}\n` + ops.filter(o => o.tag === tag).map(o => `- [\`${o.method.toUpperCase()} ${o.route}\`](op:${o.id}) — ${o.op.summary}`).join('\n')).join('\n\n') + '\n'
    }
    if (name === 'rejeicoes') return '\n<!--rejeicoes-->\n'
    problems.push(`${rel}: bloco gerado desconhecido "${name}"`); return ''
  }
  function rejectionsHtml() {
    const rows = Object.entries(rejectionGuidance).sort(([a], [b]) => a.localeCompare(b))
    return `<div class="docs-filter"><label for="filtro-rejeicoes">Filtrar</label><input id="filtro-rejeicoes" type="search" data-filter-table="tabela-rejeicoes" placeholder="Código ou palavra (ex.: E0822, CEP)" autocomplete="off"></div>`
      + `<div class="docs-table"><table id="tabela-rejeicoes"><thead><tr><th>Código</th><th>Campo</th><th>Orientação</th></tr></thead><tbody>`
      + rows.map(([c, g]) => `<tr><td><code>${esc(c)}</code></td><td><code>${esc(g.campo)}</code></td><td>${esc(g.mensagem)}</td></tr>`).join('') + `</tbody></table></div>`
  }

  function renderMarkdown(md: string, rel: string) {
    const toc: TocItem[] = []; const ids = new Set<string>()
    const marked = new Marked({ gfm: true })
    marked.use({ renderer: {
      heading(this: any, t: Tokens.Heading) {
        const inner = this.parser.parseInline(t.tokens); let id = slugify(stripTags(inner)) || 'secao'; let n = 2; const b = id; while (ids.has(id)) id = `${b}-${n++}`; ids.add(id)
        if (t.depth === 2 || t.depth === 3) toc.push({ id, text: stripTags(inner), level: t.depth as 2 | 3 })
        return `<h${t.depth} id="${id}"><a class="docs-anchor" href="#${id}" aria-hidden="true" tabindex="-1">#</a>${inner}</h${t.depth}>\n`
      },
      link(this: any, t: Tokens.Link) {
        const text = this.parser.parseInline(t.tokens); const href = resolveHref(t.href, rel, stripTags(text)); const ext = /^https?:/.test(href)
        return `<a href="${esc(href)}"${ext ? ' rel="noopener"' : ''}>${text}</a>`
      },
      code(t: Tokens.Code) {
        const [lang = '', ...label] = (t.lang ?? '').split(/\s+/)
        if (lang === 'cartoes') return cards(t.text)
        if (lang === 'fluxo') return flow(t.text)
        return codeBlock(t.text, lang, label.join(' ') || undefined)
      },
    } })
    const cards = (text: string) => '<div class="docs-cards">' + text.split('\n').filter(Boolean).map(l => {
      const m = /^- \[([^\]]+)\]\(([^)]+)\)\s*(.*)$/.exec(l.trim()); if (!m) { problems.push(`${rel}: cartão inválido "${l}"`); return '' }
      const href = resolveHref(m[2]!, rel, m[1]!)
      return `<a class="docs-card" href="${esc(href)}"><strong>${esc(m[1]!)}</strong><span>${esc(m[3]!)}</span></a>`
    }).join('') + '</div>'
    const flow = (text: string) => '<div class="docs-flow" role="img" aria-label="Diagrama">' + text.split('\n').filter(Boolean).map(line => {
      const parts = line.split(/\s*(->|<-)\s*/)
      return '<div class="docs-flow-row">' + parts.map(p => p === '->' ? '<span class="docs-flow-arrow" aria-hidden="true">→</span>' : p === '<-' ? '<span class="docs-flow-arrow" aria-hidden="true">←</span>' : `<span class="docs-flow-box">${esc(p)}</span>`).join('') + '</div>'
    }).join('') + '</div>'
    const prepared = md.replace(/<!-- notem:([a-z-]+) -->/g, (_, n: string) => generated(n, rel))
    const tokens = marked.lexer(prepared)
    // Consecutive labeled code fences ("```bash cURL" + "```javascript JavaScript") become one tab group.
    const out: Token[] = []
    for (let i = 0; i < tokens.length; i++) {
      const t = tokens[i]!
      const labeled = (x?: Token) => x?.type === 'code' && /\s/.test(((x as Tokens.Code).lang ?? '').trim()) && !/^(cartoes|fluxo)\b/.test((x as Tokens.Code).lang ?? '')
      if (labeled(t)) {
        const group: Tokens.Code[] = [t as Tokens.Code]; let j = i + 1
        while (j < tokens.length) { if (tokens[j]!.type === 'space') { j++; continue } if (labeled(tokens[j])) { group.push(tokens[j] as Tokens.Code); j++; continue } break }
        if (group.length > 1) {
          const items = group.map(g => { const [lang = '', ...lab] = (g.lang ?? '').split(/\s+/); const label = lab.join(' '); return { label, html: codeBlock(g.text, lang, label) } })
          out.push({ type: 'html', block: true, pre: false, raw: '', text: tabs(items) } as Tokens.HTML); i = j - 1; continue
        }
      }
      out.push(t)
    }
    let html = marked.parser(out)
    html = html.replace(/<table>/g, '<div class="docs-table"><table>').replace(/<\/table>/g, '</table></div>')
    html = html.replace(/<blockquote>\s*<p>\[!(DICA|ATENCAO|IMPORTANTE)\]\s*([\s\S]*?)<\/blockquote>/g, (_, k: string, inner: string) => `<aside class="docs-callout" data-kind="${k.toLowerCase()}"><p class="docs-callout-title">${CALLOUTS[k]}</p><p>${inner}</aside>`)
    if (/\[!(DICA|ATENCAO|IMPORTANTE)\]/.test(html)) problems.push(`${rel}: aviso mal formatado`)
    html = html.replace('<!--rejeicoes-->', rejectionsHtml())
    return { html, toc, ids }
  }

  const pages: DocPage[] = []; const idsByPath = new Map<string, Set<string>>()
  for (const rel of files) {
    const { fm, body } = frontMatter(rel, fs.readFileSync(path.join(dir, rel), 'utf8'))
    const top = rel.includes('/') ? rel.split('/')[0]! : rel === 'LEIAME.md' ? '' : rel.replace(/\.md$/, '')
    const section = SECTIONS.find(s => s.dir === top)
    if (!section) { problems.push(`${rel}: pasta fora do menu`); continue }
    const content = body.replace(/^\s*# .*\n+/, '')
    const { html, toc, ids } = renderMarkdown(content, rel)
    const p = pagePath(rel); idsByPath.set(p, ids)
    pages.push({ path: p, source: rel, title: fm.titulo, menu: fm.menu ?? fm.titulo, description: fm.descricao, section: section.title, updated: fm.atualizado, html, toc, ...{ order: fm.ordem } } as DocPage & { order: number })
  }

  // ---------- Reference pages ----------
  const updatedRef = spec.info?.['x-atualizado'] ? String(spec.info['x-atualizado']) : null
  const inline = (s: string) => new Marked().parseInline(esc(s).replace(/&#39;/g, "'"), { async: false }) as string
  const para = (s?: string) => s ? s.trim().split(/\n{2,}|\n(?=[A-ZÁÉÍÓÚ])/).map(x => `<p>${inline(x.replace(/\n/g, ' '))}</p>`).join('') : ''
  const typeOf = (s0: any): string => {
    const s = s0?.$ref ? deref(s0) : s0; if (!s) return ''
    if (s0?.$ref && !s.type && !s.enum) return 'objeto'
    if (s.oneOf || s.anyOf) return (s.oneOf ?? s.anyOf).map(typeOf).filter(Boolean).join(' ou ')
    if (s.allOf) return 'objeto'
    const t = ([] as string[]).concat(s.type ?? (s.enum ? 'string' : 'objeto'))
    const name: Record<string, string> = { string: 'texto', integer: 'inteiro', number: 'número', boolean: 'booleano', object: 'objeto', array: 'lista', null: 'null', objeto: 'objeto' }
    return t.map(x => x === 'array' ? `lista de ${typeOf(s.items) || 'itens'}` : name[x] ?? x).join(' ou ')
  }
  const constraints = (s0: any) => {
    const s = s0?.$ref ? deref(s0) : s0; if (!s) return ''
    const c: string[] = []
    const fmt: Record<string, string> = { uuid: 'UUID', date: 'data AAAA-MM-DD', 'date-time': 'data e hora ISO 8601', uri: 'endereço (URL)', binary: 'arquivo' }
    if (s.format && fmt[s.format]) c.push(fmt[s.format]!)
    const en = (s.enum ?? []).filter((v: unknown) => v !== null); if (en.length) c.push('Valores: ' + en.map((v: unknown) => `<code>${esc(String(v))}</code>`).join(', '))
    if (s.pattern) c.push(`Formato: <code>${esc(s.pattern)}</code>`)
    if (s.minLength !== undefined && s.maxLength !== undefined) c.push(`${s.minLength} a ${s.maxLength} caracteres`); else if (s.maxLength !== undefined) c.push(`até ${s.maxLength} caracteres`); else if (s.minLength !== undefined) c.push(`mínimo de ${s.minLength} caracteres`)
    if (s.minimum !== undefined || s.maximum !== undefined) c.push(`de ${s.minimum ?? '…'} a ${s.maximum ?? '…'}`)
    if (s.default !== undefined) c.push(`Padrão: <code>${esc(JSON.stringify(s.default))}</code>`)
    if (s.deprecated) c.push('<strong>Obsoleto.</strong>')
    return c.join(' · ')
  }
  type Row = { name: string; type: string; req: boolean; desc: string }
  const merged = (s0: any): any => { const s = deref(s0); if (!s) return s; if (s.allOf) { const parts = s.allOf.map(merged); return { ...s, type: 'object', properties: Object.assign({}, ...parts.map((p: any) => p?.properties ?? {}), s.properties ?? {}), required: [...new Set(parts.flatMap((p: any) => p?.required ?? []).concat(s.required ?? []))] } } if (s.oneOf) { const real = s.oneOf.map(deref).filter((x: any) => x?.type !== 'null'); if (real.length === 1) return { ...merged(real[0]), nullable: true } } return s }
  function fields(s0: any, prefix: string, mode: 'req' | 'res', depth = 0, seen = new Set<any>()): Row[] {
    const s = merged(s0); if (!s || depth > 4 || seen.has(s)) return []
    const rows: Row[] = []; const req = new Set<string>(s.required ?? [])
    for (const [name, p0] of Object.entries((s.properties ?? {}) as Record<string, Json>)) {
      const p = deref(p0); if (mode === 'req' && p?.readOnly) continue
      const full = prefix ? `${prefix}.${name}` : name
      const desc = [p0.description ?? p?.description ? inline(p0.description ?? p.description) : '', constraints(p0.$ref ? p : p0)].filter(Boolean).join(' · ')
      rows.push({ name: full, type: typeOf(p0), req: req.has(name), desc })
      const inner = merged(p0)
      if (inner?.properties) rows.push(...fields(p0, full, mode, depth + 1, new Set([...seen, s])))
      else if (inner?.type === 'array' || (Array.isArray(inner?.type) && inner.type.includes('array'))) { const it = merged(inner.items); if (it?.properties) rows.push(...fields(inner.items, full + '[]', mode, depth + 1, new Set([...seen, s]))) }
    }
    return rows
  }
  // Field lists render as stacked rows (name · type · required, then description) so they stay readable beside the code column.
  const fieldRow = (name: string, meta: string[], desc: string) => `<div class="docs-field"><div class="docs-field-head"><code>${esc(name)}</code>${meta.map(m => `<span class="docs-field-meta${m === 'obrigatório' ? ' docs-field-req' : ''}">${m}</span>`).join('')}</div>${desc ? `<div class="docs-field-desc">${desc}</div>` : ''}</div>`
  const fieldTable = (rows: Row[], showReq = true) => rows.length ? `<div class="docs-fields">${rows.map(r => fieldRow(r.name, [esc(r.type), ...(showReq && r.req ? ['obrigatório'] : [])], r.desc)).join('')}</div>` : ''
  const exampleValues = (content: Json | undefined) => Object.entries((content?.examples ?? {}) as Json).map(([k, v]) => { const e = deref(v); return { key: k, summary: e.summary ?? k, value: e.value } })

  for (const o of ops) {
    const toc: TocItem[] = []; const h2 = (id: string, t: string) => { toc.push({ id, text: t, level: 2 }); return `<h2 id="${id}"><a class="docs-anchor" href="#${id}" aria-hidden="true" tabindex="-1">#</a>${esc(t)}</h2>` }
    const M = o.method.toUpperCase()
    let html = `<div class="docs-endpoint"><span class="docs-method" data-method="${o.method}">${M}</span><code>/api/v1${esc(o.route)}</code></div>`
    html = `<p class="docs-lead">${inline(o.op.summary)}</p>` + html + para(o.op.description ?? '')
    const params = [...(o.item.parameters ?? []), ...(o.op.parameters ?? [])].map(deref)
    if (params.length) {
      const where: Record<string, string> = { path: 'no caminho', query: 'na consulta', header: 'no cabeçalho' }
      html += h2('parametros', 'Parâmetros') + `<div class="docs-fields">` + params.map((p: Json) => fieldRow(p.name, [esc(typeOf(p.schema)), where[p.in] ?? p.in, ...(p.required ? ['obrigatório'] : [])], [p.description ? inline(p.description) : '', constraints(p.schema)].filter(Boolean).join(' · '))).join('') + '</div>'
    }
    const body = o.op.requestBody ? deref(o.op.requestBody) : null
    const bodyContent = body?.content?.['application/json']
    if (bodyContent) {
      const bs = merged(bodyContent.schema)
      html += h2('corpo', 'Corpo da requisição') + (bs?.description ? para(bs.description) : '') + fieldTable(fields(bodyContent.schema, '', 'req'))
    }
    html += h2('respostas', 'Respostas')
    const responses = Object.entries(o.op.responses as Json)
    for (const [status, r0] of responses) {
      const r = deref(r0); const media = Object.keys(r.content ?? {})[0]
      html += `<h3 id="resposta-${status}"><span class="docs-status" data-status="${status[0]}">${esc(status)}</span> ${inline(r.description ?? '')}</h3>`
      if (media === 'application/json' && status.startsWith('2')) { const rows = fields(r.content[media].schema, '', 'res'); if (rows.length) html += `<details class="docs-details"><summary>Campos da resposta</summary>${fieldTable(rows, false)}</details>` }
      if (media && media !== 'application/json') html += `<p>Conteúdo: <code>${esc(media)}</code>.</p>`
      if (r.headers?.['Retry-After']) html += '<p>Cabeçalho <code>Retry-After</code>: segundos até poder tentar de novo.</p>'
    }
    const kind = routeKind(M, '/api/v1' + samplePath(o.route))
    const limitText: Record<string, string> = { emissao: `${LIMITS.emissao_producao.max} por minuto em produção e ${LIMITS.emissao_homologacao.max} em homologação; no máximo ${SLOTS.emissao} ao mesmo tempo por empresa.`, evento: `${LIMITS.evento.max} por minuto; ${SLOTS.evento} de cada vez por nota.`, certificado: `${LIMITS.certificado.max} a cada ${LIMITS.certificado.window / 60} minutos por chave e ${LIMITS.certificado_empresa_dia.max} por dia por empresa.`, municipio: `${LIMITS.municipio.max} por minuto por empresa e ambiente.`, pdf: `${LIMITS.pdf.max} por minuto; no máximo ${SLOTS.pdf} ao mesmo tempo.`, xml: `${LIMITS.xml.max} por minuto.`, sincronizacao: `${LIMITS.sincronizacao.max} por minuto.`, listagem: `${LIMITS.listagem.max} por minuto.` }
    html += h2('limites', 'Limites') + `<p>${kind ? 'Esta operação: ' + limitText[kind] + ' ' : ''}Valem também os limites gerais da chave. Veja <a href="${BASE_TOKEN}/primeiros-passos/limites">Limites de uso</a>.</p>`
    links.push({ from: o.path, to: '/primeiros-passos/limites', hash: '', text: 'Limites de uso' })

    // right column: request and response examples
    const url = API + samplePath(o.route) + (SAMPLE_QUERY[o.route] && o.method === 'get' ? '?' + SAMPLE_QUERY[o.route] : '')
    const reqEx = exampleValues(bodyContent)[0]?.value
    const needsKey = params.some((p: Json) => p.name === 'Idempotency-Key')
    const headers = [`Authorization: Bearer ${EXAMPLE_KEY}`, ...(reqEx !== undefined ? ['Content-Type: application/json'] : []), ...(needsKey ? ['Idempotency-Key: 7d1f0a52-2c1e-4f7e-9a51-0c6a3b8e4d21'] : [])]
    const curl = [`curl -X ${M} "${url}"`, ...headers.map(h => `  -H "${h}"`), ...(reqEx !== undefined ? [`  -d '${JSON.stringify(reqEx, null, 2).replace(/'/g, "'\\''")}'`] : [])].join(' \\\n')
    const jsHeaders = headers.map(h => { const [k, ...v] = h.split(': '); const val = k === 'Authorization' ? '`Bearer ${process.env.NOTEM_CHAVE}`' : k === 'Idempotency-Key' ? 'crypto.randomUUID()' : JSON.stringify(v.join(': ')); return `    ${/^[A-Za-z]+$/.test(k!) ? k : JSON.stringify(k)}: ${val},` })
    const js = `const resposta = await fetch("${url}", {\n  method: "${M}",\n  headers: {\n${jsHeaders.join('\n')}\n  },${reqEx !== undefined ? `\n  body: JSON.stringify(${JSON.stringify(reqEx, null, 2).replace(/\n/g, '\n  ')}),` : ''}\n});\n${responses.some(([, r]) => Object.keys(deref(r).content ?? {})[0] === 'application/json') ? 'const dados = await resposta.json();' : 'const arquivo = await resposta.arrayBuffer();'}`
    let aside = `<p class="docs-aside-title">Requisição</p>` + tabs([{ label: 'cURL', html: codeBlock(curl, 'bash', 'cURL') }, { label: 'JavaScript', html: codeBlock(js, 'javascript', 'JavaScript') }])
    const resTabs = responses.flatMap(([status, r0]) => { const r = deref(r0); const media = Object.keys(r.content ?? {})[0]; const exs = exampleValues(r.content?.[media ?? '']); return exs.map(e => ({ label: exs.length > 1 ? `${status} · ${e.summary}` : status, html: `<p class="docs-example-title">${esc(e.summary)}</p>` + codeBlock(typeof e.value === 'string' ? e.value : JSON.stringify(e.value, null, 2), media === 'application/json' ? 'json' : media === 'application/xml' ? 'xml' : 'text') })) })
    if (!exampleValues(bodyContent).length && bodyContent) problems.push(`${o.id}: corpo sem exemplo`)
    if (!resTabs.length) problems.push(`${o.id}: resposta sem exemplo`)
    aside += `<p class="docs-aside-title">Resposta</p>` + tabs(resTabs, 'resposta')
    const short = o.op['x-titulo'] ?? o.op.summary
    // Absolute docs links in the OpenAPI text (kept absolute for spec readers) become site links here, so previews stay on /docs and the link check covers them.
    html = html.replace(/href="https:\/\/docs\.notemfiscal\.com\.br(\/[^"#]*)?(?:#([^"]*))?"/g, (_m, to = '/', hash = '') => { links.push({ from: o.path, to, hash, text: to }); return `href="${BASE_TOKEN}${to}${hash ? '#' + hash : ''}"` })
    pages.push({ path: o.path, source: `openapi.yaml#${o.id}`, title: short, menu: short, description: o.op.summary, section: 'Referência da API', group: o.tag, updated: updatedRef, method: M, route: o.route, html, aside, toc })
  }

  // ---------- menu, order ----------
  const ord = (p: DocPage) => (p as DocPage & { order?: number }).order ?? 0
  const nav: NavSection[] = SECTIONS.map(s => {
    const docs = pages.filter(p => p.section === s.title && !p.group).sort((a, b) => ord(a) - ord(b) || a.title.localeCompare(b.title))
    const groups = s.dir === 'referencia' ? tagOrder.map(tag => ({ title: tag, items: pages.filter(p => p.group === tag).map(p => ({ path: p.path, title: p.menu, method: p.method })) })) : []
    return { title: s.title, items: docs.map(p => ({ path: p.path, title: p.menu })), groups }
  })
  const order = nav.flatMap(s => [...s.items, ...s.groups.flatMap(g => g.items)]).map(i => i.path)
  pages.sort((a, b) => order.indexOf(a.path) - order.indexOf(b.path))
  for (const p of pages) { delete (p as { order?: number }).order; if (p.group || p.toc.length || !p.aside) { /* keep */ } }
  // link check (pages and anchors)
  for (const p of pages) if (p.method) idsByPath.set(p.path, new Set(p.toc.map(t => t.id).concat(Object.keys((spec.paths[p.route!][p.method.toLowerCase()].responses) ?? {}).map(s => `resposta-${s}`))))
  for (const l of links) {
    if (!pages.some(p => p.path === l.to)) problems.push(`${l.from}: link para página inexistente ${l.to}`)
    else if (l.hash && !idsByPath.get(l.to)?.has(l.hash)) problems.push(`${l.from}: âncora inexistente ${l.to}#${l.hash}`)
  }

  // ---------- search ----------
  const search: SearchEntry[] = []
  for (const p of pages) {
    // Operation pages are one entry each (their per-status sections would flood the results); other pages index by heading.
    const parts = p.method ? [p.html] : p.html.split(/(?=<h[23] id=")/)
    for (const part of parts) {
      const m = /^<h[23] id="([^"]+)">([\s\S]*?)<\/h[23]>/.exec(part)
      const heading = m ? stripTags(m[2]!).replace(/^#\s*/, '') : ''
      const body = (m ? part.slice(m[0].length) : part).replace(/<button[\s\S]*?<\/button>/g, '').replace(/<div class="docs-code-head">[\s\S]*?<\/div>/g, '').replace(/<pre[\s\S]*?<\/pre>/g, ' ')
      const text = stripTags(body).slice(0, 700)
      if (!heading && !text) continue
      const r = searchSummary(p.method ? `<p>${inlineText(p.description)}</p>` : body)
      search.push({ p: p.path + (m ? '#' + m[1] : ''), t: p.method ? `${p.title} (${p.method} ${p.route})` : p.title, h: heading, s: p.section, x: text, r })
    }
  }

  // ---------- llms.txt ----------
  const abs = (p: string) => DOCS_ORIGIN + (p === '/' ? '/' : p)
  let llms = `# notem — Documentação da API\n\n> API para sistemas parceiros emitirem, cancelarem, substituírem e consultarem NFS-e do padrão nacional.\n\nEndereço da API: ${API}. Autenticação por chave de integração no cabeçalho Authorization. Todos os exemplos usam dados fictícios.\n`
  for (const s of nav) {
    if (s.title === 'Histórico de mudanças') continue
    const items = [...s.items, ...s.groups.flatMap(g => g.items)]
    if (!items.length) continue
    llms += `\n## ${s.title}\n\n` + items.map(i => { const pg = pages.find(p => p.path === i.path)!; return `- [${pg.method ? `${pg.title} (${pg.method} /api/v1${pg.route})` : pg.title}](${abs(pg.path)}): ${pg.description}` }).join('\n') + '\n'
  }
  llms += `\n## Optional\n\n- [Especificação OpenAPI 3.1](${DOCS_ORIGIN}/openapi.yaml): contrato técnico completo da API v1, com exemplos.\n- [Histórico de mudanças](${DOCS_ORIGIN}/historico): alterações que afetam respostas da API.\n`

  return { pages, nav, search, llms, problems, openapi: openapiRaw }
}
