// @vitest-environment node
/**
 * Public documentation (docs.notemfiscal.com.br): content comes only from docs/api, never exposes internal
 * material or real data, every operation has examples, links work and domains stay separated.
 */
import { createHash } from 'node:crypto'
import { execFileSync } from 'node:child_process'
import { readFileSync, readdirSync, statSync, writeFileSync } from 'node:fs'
import { join, relative } from 'node:path'
import { describe, expect, it } from 'vitest'
import yaml from 'js-yaml'
import { buildDocsSite } from '@/docs-site/build'
import { LIMITS, SLOTS, limitMessages } from '@/lib/api-policy'
import { rejectionGuidance } from '@/lib/rejection-guidance'
import { defaultMessages } from '@/lib/api-contract'
import { isValidCnpj } from '@/lib/notem'
import { validCpf } from '@/lib/customers'
import { routeRequest, APP_ROBOTS, DOCS_ROBOTS } from '@/lib/hosts'
import { DOCS_URL } from '@/lib/app-url'
import fingerprints from './real-data-fingerprints.json'

const site = buildDocsSite(process.cwd())
const strip = (h: string) => h.replace(/<[^>]+>/g, ' ').replace(/&quot;/g, '"').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&amp;/g, '&')
const published = [...site.pages.map(p => p.html + (p.aside ?? '') + p.title + p.description), JSON.stringify(site.search), site.llms, site.openapi].join('\n')
const publishedText = strip(published)
const walk = (d: string): string[] => readdirSync(d).flatMap(f => { const p = join(d, f); return statSync(p).isDirectory() ? walk(p) : [p] })
const markdown = walk('docs/api').filter(f => f.endsWith('.md'))

describe('fonte única e material interno', () => {
  it('só lê docs/api; nada de docs/interno nas páginas, na busca ou no llms.txt', () => {
    expect(site.pages.every(p => !p.source.startsWith('..') && !p.source.includes('interno'))).toBe(true)
    expect(published).not.toMatch(/docs\/interno|interno\//)
    const internalLines = walk('docs/interno').filter(f => f.endsWith('.md')).flatMap(f => readFileSync(f, 'utf8').split('\n')).map(l => l.trim()).filter(l => l.length > 60 && !l.startsWith('|') && !l.startsWith('```'))
    const leaked = internalLines.filter(l => publishedText.includes(strip(l).replace(/[*`]/g, '').trim()) && strip(l).replace(/[*`]/g, '').trim().length > 60)
    expect(leaked).toEqual([])
  })
  it('nenhum termo interno nas páginas, no índice de busca, no llms.txt e na especificação', () => {
    const forbidden = [/transmissor/i, /cloud run/i, /supabase/i, /service[_ ]role/i, /\bRLS\b/, /administrador da plataforma/i, /lovable/i, /edge function/i, /\blease\b/i, /inngest/i, /\b(nfse_documents|api_request_logs|integration_keys|webhook_endpoints|company_fiscal_settings|platform_settings)\b/]
    for (const re of forbidden) expect(publishedText, String(re)).not.toMatch(re)
  })
  it('mensagens para o parceiro (orientações, erros e limites) sem termos internos', () => {
    const messages = [...Object.values(rejectionGuidance).map(g => g.mensagem), ...Object.values(defaultMessages), ...Object.values(limitMessages)]
    for (const m of messages) expect(m).not.toMatch(/transmissor|administrador da plataforma|supabase|service.?role|cloud run|banco de dados|lease/i)
    expect(rejectionGuidance['E0714']?.mensagem).toBe('O governo recusou a assinatura da DPS. Confira se o certificado digital da empresa está válido e corresponde ao CNPJ antes de repetir a emissão.')
    expect(rejectionGuidance['E0855']?.mensagem).toMatch(/fale com o suporte da notem\.$/)
  })
})

describe('referência da API', () => {
  const ops = site.pages.filter(p => p.method)
  it('40 operações, cada uma com página, exemplos cURL e JavaScript e exemplo de resposta', () => {
    expect(ops).toHaveLength(40)
    for (const p of ops) {
      expect(p.aside, p.path).toContain('data-tab="cURL"'); expect(p.aside, p.path).toContain('data-tab="JavaScript"')
      expect(p.aside!.split('Resposta</p>')[1], p.path).toMatch(/docs-code/)
      expect(p.path).toMatch(/^\/referencia\/[a-z-]+\/[a-z-]+$/)
    }
    expect(new Set(ops.map(p => p.group)).size).toBe(11)
  })
  it('exemplos válidos pelo esquema da própria operação', () => {
    expect(execFileSync('python3', ['src/test/validate-openapi-examples.py'], { encoding: 'utf8' })).toContain('EXEMPLOS OK — 40 operações')
  })
  it('exemplo errado é recusado pelo validador', () => {
    const bad = site.openapi.replace('servico: "150.00"', 'servico: 150')
    expect(bad).not.toBe(site.openapi)
    const tmp = join(process.env['TMPDIR'] ?? '/tmp', `notem-openapi-${process.pid}.yaml`)
    writeFileSync(tmp, bad)
    expect(() => execFileSync('python3', ['src/test/validate-openapi-examples.py', tmp], { stdio: 'pipe' })).toThrow()
  })
})

describe('links e conteúdo', () => {
  it('nenhum link interno quebrado (páginas e âncoras) e nenhum problema na montagem', () => {
    expect(site.problems).toEqual([])
  })
  it('não sobrou referência aos arquivos antigos', () => {
    expect(published).not.toMatch(/\b(convencoes|empresas|notas|cancelamento|sincronizacao|webhooks|glossario)\.md\b/)
  })
  it('nenhum parágrafo repetido entre páginas (texto movido, não duplicado)', () => {
    const seen = new Map<string, string>(); const dup: string[] = []
    for (const f of markdown) {
      const body = readFileSync(f, 'utf8').replace(/^---[\s\S]*?---\n/, '').replace(/```[\s\S]*?```/g, '')
      for (const para of body.split(/\n\s*\n|\n(?=- )/).map(s => s.replace(/\s+/g, ' ').trim()).filter(s => s.length >= 80 && !s.startsWith('|'))) {
        const other = seen.get(para); if (other && other !== f) dup.push(`${relative('docs/api', f)} × ${relative('docs/api', other)}: ${para.slice(0, 60)}`); else seen.set(para, f)
      }
    }
    expect(dup).toEqual([])
  })
  it('limites mostrados iguais aos limites reais', () => {
    const page = strip(site.pages.find(p => p.path === '/primeiros-passos/limites')!.html).replace(/\s+/g, ' ')
    expect(page).toContain(`Todas as chamadas ${LIMITS.geral.max} por minuto e ${LIMITS.geral_rajada.max} a cada ${LIMITS.geral_rajada.window} segundos, por chave`)
    expect(page).toContain(`${LIMITS.emissao_producao.max} por minuto em produção, ${LIMITS.emissao_homologacao.max} em homologação; no máximo ${SLOTS.emissao} ao mesmo tempo por empresa`)
    expect(page).toContain(`${LIMITS.certificado.max} a cada ${LIMITS.certificado.window / 60} minutos por chave e ${LIMITS.certificado_empresa_dia.max} por dia por empresa`)
    expect(page).toContain(`Chamadas sem chave válida ${LIMITS.sem_chave.max} por minuto por endereço de origem`)
    expect(readFileSync('docs/api/primeiros-passos/limites.md', 'utf8')).not.toMatch(/\| O quê \|/)
  })
  it('tabela de rejeições vem da mesma base do painel', () => {
    const html = site.pages.find(p => p.path === '/referencia/rejeicoes-do-governo')!.html
    for (const [code, g] of Object.entries(rejectionGuidance)) { expect(html).toContain(`<code>${code}</code>`); expect(strip(html)).toContain(g.mensagem) }
  })
  it('llms.txt lista todas as páginas com endereço do docs', () => {
    for (const p of site.pages.filter(p => p.path !== '/historico')) expect(site.llms).toContain(`(${DOCS_URL}${p.path === '/' ? '/' : p.path})`)
    expect(site.llms.startsWith('# ')).toBe(true); expect(site.llms).toMatch(/\n## Optional\n[\s\S]*$/)
  })
})

describe('texto para quem não conhece a NFS-e', () => {
  const spec = yaml.load(readFileSync('docs/api/openapi.yaml', 'utf8')) as { paths: Record<string, Record<string, { summary?: string; description?: string }>> }
  const ops = Object.values(spec.paths).flatMap(item => ['get', 'post', 'put', 'patch', 'delete'].flatMap(m => item[m] ? [item[m]!] : []))
  const guides = ['guias/emissao.md', 'guias/cancelamento.md', 'guias/substituicao.md', 'guias/ciclo-de-vida.md', 'guias/configuracao-fiscal.md', 'primeiros-passos/idempotencia.md'].map(f => readFileSync(`docs/api/${f}`, 'utf8'))
  it('as 40 operações têm resumo em frase completa, sem códigos do governo, e descrição com o que fazem e o resultado', () => {
    expect(ops).toHaveLength(40)
    for (const o of ops) {
      expect(o.summary, o.summary).toMatch(/^[A-ZÁÉÍÓÚ].{30,}\.$/)
      expect(o.summary, o.summary).not.toMatch(/E0\d{3}/)
      expect((o.description ?? '').split(/(?<=\.)\s/).length, o.summary).toBeGreaterThanOrEqual(2)
    }
  })
  it('jargão interno não aparece nas operações nem nos guias revisados', () => {
    const text = [...ops.flatMap(o => [o.summary ?? '', o.description ?? '']), ...guides].join('\n')
    for (const re of [/numerar/i, /antes da numeração/i, /ambiguidade vai para consulta/i, /falha comprovada anterior ao envio/i, /E0014 exclusiva/i, /DPS\/número/i]) expect(text, String(re)).not.toMatch(re)
  })
  it('código do governo nunca aparece em lista solta, sem o significado ao lado', () => {
    const text = [...ops.flatMap(o => [o.summary ?? '', o.description ?? '']), ...guides].join('\n')
    expect(text).not.toMatch(/E0\d{3}\s*\/\s*E0\d{3}/)
    expect(text).not.toMatch(/(regras|inclui|exclusiva|por) E0\d{3}/i)
  })
  it('resumos da busca são só texto: sem código, JSON, marcação ou cortes no meio da palavra', () => {
    expect(site.search.length).toBeGreaterThan(100)
    for (const e of site.search) {
      expect(e.r.length, e.p).toBeLessThanOrEqual(161)
      expect(e.r, e.p).not.toMatch(/[<>`|]|\*\*|^#|":|\{"|\bcurl\b| [.,;:]/)
    }
    const emitir = site.search.find(e => e.t.startsWith('Emitir nota'))!
    expect(emitir.r).toBe('Envia a NFS-e ao governo e devolve a nota autorizada ou o motivo da recusa.')
  })
  it('blocos de código quebram linhas longas e aceitam rolagem pelo teclado', () => {
    const css = readFileSync('src/docs-site/docs.css', 'utf8')
    expect(css).toMatch(/\.docs-code pre \{[^}]*white-space: pre-wrap/)
    expect(site.pages.every(p => !/<pre(?! tabindex="0")/.test(p.html + (p.aside ?? '')))).toBe(true)
  })
})

describe('somente dados fictícios', () => {
  const sha = (s: string) => createHash('sha256').update(s).digest('hex')
  const real = new Set(Object.values(fingerprints.hashes).flat())
  it('nenhum CNPJ, CPF, chave de acesso, prefixo de chave ou e-mail real aparece', () => {
    const candidates = new Set<string>()
    const upper = published.toUpperCase()
    for (const m of upper.matchAll(/[0-9A-Z]{2}\.?[0-9A-Z]{3}\.?[0-9A-Z]{3}\/?[0-9A-Z]{4}-?\d{2}/g)) candidates.add(m[0].replace(/[^0-9A-Z]/g, ''))
    for (const m of upper.matchAll(/\d{3}\.?\d{3}\.?\d{3}-?\d{2}/g)) candidates.add(m[0].replace(/\D/g, ''))
    for (const m of upper.matchAll(/[0-9]{9}[0-9A-Z]{14}[0-9]{27}/g)) candidates.add(m[0])
    for (const m of published.matchAll(/ntm_(?:prod|homolog)_[A-Za-z0-9]{8}|whsec_[A-Za-z0-9]{9}/g)) candidates.add(m[0])
    for (const m of published.matchAll(/[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[a-z]{2,}/g)) candidates.add(m[0].toLowerCase())
    expect(candidates.size).toBeGreaterThan(10)
    expect([...candidates].filter(c => real.has(sha(c)))).toEqual([])
  })
  it('chaves de exemplo são claramente falsas e e-mails usam @exemplo.com.br', () => {
    for (const m of published.matchAll(/ntm_(?:prod|homolog|test)_[A-Za-z0-9_.…]*/g)) if (m[0].length > 13) expect(m[0]).toMatch(/EXEMPLO|\.\.\.|…/)
    for (const m of published.matchAll(/[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[a-z]{2,}/g)) expect(m[0]).toMatch(/@exemplo\.com\.br$/)
  })
  it('CNPJ e CPF dos exemplos são de teste válidos, incluindo um alfanumérico', () => {
    const docs = new Set([...site.openapi.matchAll(/"?(?:cnpj|documento)"?: "?([0-9A-Z]{11,14})"?/g)].map(m => m[1]!))
    expect([...docs].some(d => /[A-Z]/.test(d))).toBe(true)
    for (const d of docs) expect(d.length === 11 ? validCpf(d) : isValidCnpj(d), d).toBe(true)
  })
})

describe('separação de domínios', () => {
  const r = (u: string) => routeRequest(new URL(u))
  it('docs serve a documentação e nunca o painel nem a API', () => {
    expect(r('https://docs.notemfiscal.com.br/guias/emissao')).toEqual({ kind: 'docs', path: '/guias/emissao', base: '' })
    expect(r('https://docs.notemfiscal.com.br/api/v1/status')).toEqual({ kind: 'docs-api-404' })
    expect(r('https://docs.notemfiscal.com.br/_serverFn/abc')).toEqual({ kind: 'docs', path: '/_serverFn/abc', base: '' })
    expect(r('https://docs.notemfiscal.com.br/o/grupo/notas?aba=x')).toEqual({ kind: 'redirect', location: 'https://app.notemfiscal.com.br/o/grupo/notas?aba=x' })
    expect(r('https://docs.notemfiscal.com.br/entrar')).toEqual({ kind: 'redirect', location: 'https://app.notemfiscal.com.br/entrar' })
    expect(r('https://docs.notemfiscal.com.br/robots.txt')).toEqual({ kind: 'robots', body: DOCS_ROBOTS })
  })
  it('app./docs vai para o docs; app. não é indexado', () => {
    expect(r('https://app.notemfiscal.com.br/docs/guias/emissao?x=1')).toEqual({ kind: 'redirect', location: 'https://docs.notemfiscal.com.br/guias/emissao?x=1' })
    expect(r('https://app.notemfiscal.com.br/docs')).toEqual({ kind: 'redirect', location: 'https://docs.notemfiscal.com.br/' })
    expect(r('https://app.notemfiscal.com.br/entrar')).toEqual({ kind: 'app', noindex: true })
    expect(r('https://app.notemfiscal.com.br/robots.txt')).toEqual({ kind: 'robots', body: APP_ROBOTS })
    expect(APP_ROBOTS).toBe('User-agent: *\nDisallow: /\n')
  })
  it('raiz, www e o endereço .lovable.app redirecionam para app. mantendo o caminho', () => {
    for (const h of ['notemfiscal.com.br', 'www.notemfiscal.com.br', 'notem-waiting-garden.lovable.app'])
      expect(r(`https://${h}/o/x/notas?aba=recebidas`)).toEqual({ kind: 'redirect', location: 'https://app.notemfiscal.com.br/o/x/notas?aba=recebidas' })
  })
  it('prévia do editor continua igual e mostra a documentação em /docs', () => {
    expect(r('https://id-preview--abc.lovable.app/entrar')).toEqual({ kind: 'app', noindex: false })
    expect(r('https://id-preview--abc.lovable.app/docs/guias/emissao')).toEqual({ kind: 'docs', path: '/guias/emissao', base: '/docs' })
    expect(r('http://localhost:8080/docs')).toEqual({ kind: 'docs', path: '/', base: '/docs' })
  })
})
