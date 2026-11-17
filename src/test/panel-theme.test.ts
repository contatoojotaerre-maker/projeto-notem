import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

// Reads the real stylesheet, resolves the tokens of each theme and checks contrast (WCAG 2.x formula).
const css = readFileSync(resolve(__dirname, '../styles.css'), 'utf8');
function block(selector: string): Record<string, string> {
  const start = css.indexOf(`${selector} {`); if (start < 0) throw new Error(`bloco ausente: ${selector}`);
  let i = css.indexOf('{', start) + 1, depth = 1; const from = i; while (depth) { const ch = css[i++]; if (ch === '{') depth++; else if (ch === '}') depth--; }
  const body = css.slice(from, i - 1).replace(/\/\*[\s\S]*?\*\//g, ''); const out: Record<string, string> = {};
  let cur = '', d = 0; for (const ch of body) { if (ch === '(') d++; if (ch === ')') d--; if (ch === ';' && !d) { push(cur); cur = ''; } else cur += ch; } push(cur);
  function push(decl: string) { const m = decl.trim().match(/^(--[\w-]+)\s*:\s*([\s\S]+)$/); if (m) out[m[1]!] = m[2]!.trim(); }
  return out;
}
const base = block(':root'), baseLight = block(':root[data-theme="light"]'), panel = block(':root[data-surface="panel"]'), panelLight = block(':root[data-surface="panel"][data-theme="light"]');
const themes = { escuro: { ...base, ...panel }, claro: { ...base, ...baseLight, ...panel, ...panelLight } };
type Tokens = Record<string, string>;
const value = (t: Tokens, v: string): string => { const m = v.match(/^var\((--[\w-]+)(?:,\s*(.+))?\)$/); return m ? value(t, t[m[1]!] ?? m[2]!) : v; };

type RGBA = [number, number, number, number]; // gamma-encoded sRGB 0..1 + alpha
const lin2srgb = (x: number) => { x = Math.min(1, Math.max(0, x)); return x <= 0.0031308 ? 12.92 * x : 1.055 * x ** (1 / 2.4) - 0.055; };
const srgb2lin = (x: number) => x <= 0.04045 ? x / 12.92 : ((x + 0.055) / 1.055) ** 2.4;
function oklch(L: number, C: number, H: number, alpha = 1): RGBA {
  const a = C * Math.cos(H * Math.PI / 180), b = C * Math.sin(H * Math.PI / 180);
  const l = (L + 0.3963377774 * a + 0.2158037573 * b) ** 3, m = (L - 0.1055613458 * a - 0.0638541728 * b) ** 3, s = (L - 0.0894841775 * a - 1.291485548 * b) ** 3;
  return [lin2srgb(4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s), lin2srgb(-1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s), lin2srgb(-0.0041960863 * l - 0.7034186147 * m + 1.707614701 * s), alpha];
}
const parseOklch = (v: string) => { const m = v.match(/^oklch\(\s*([\d.]+)\s+([\d.]+)\s+([\d.]+)\s*(?:\/\s*([\d.]+)%?)?\s*\)$/); if (!m) throw new Error(`cor não reconhecida: ${v}`); const a = m[4] === undefined ? 1 : Number(m[4]) / (v.includes('%') ? 100 : 1); return { L: Number(m[1]), C: Number(m[2]), H: Number(m[3]), a }; };
const color = (t: Tokens, name: string): RGBA => { if (value(t, `var(${name})`) === 'transparent') return [0, 0, 0, 0]; const o = parseOklch(value(t, `var(${name})`)); return oklch(o.L, o.C, o.H, o.a); };
const over = (top: RGBA, bottom: RGBA): RGBA => [0, 1, 2].map(i => top[i]! * top[3] + bottom[i]! * (1 - top[3])).concat(1) as RGBA;
/** color-mix(in srgb, X p%, Y) for opaque tokens (the badges mix in sRGB so the hue never turns blue). */
const mix = (t: Tokens, x: string, p: number, y: string): RGBA => { const a = color(t, x), b = color(t, y); return [0, 1, 2].map(i => a[i]! * p + b[i]! * (1 - p)).concat(1) as RGBA; };
const lum = (c: RGBA) => 0.2126 * srgb2lin(c[0]) + 0.7152 * srgb2lin(c[1]) + 0.0722 * srgb2lin(c[2]);
const ratio = (fg: RGBA, bg: RGBA) => { const f = lum(over(fg, bg)), b = lum(bg); return (Math.max(f, b) + 0.05) / (Math.min(f, b) + 0.05); };

for (const [name, t] of Object.entries(themes)) {
  describe(`painel, tema ${name}: contraste`, () => {
    const bg = color(t, '--background'); const card = over(color(t, '--card'), bg); const field = over(color(t, '--field'), bg);
    const surfaces = { fundo: bg, cartão: card, 'cartão sólido': over(color(t, '--card-solid'), bg), secundário: over(color(t, '--secondary'), bg) };
    for (const [s, surface] of Object.entries(surfaces)) {
      it(`texto principal sobre ${s} ≥ 4,5:1`, () => expect(ratio(color(t, '--foreground'), surface)).toBeGreaterThanOrEqual(4.5));
      it(`texto secundário sobre ${s} ≥ 4,5:1`, () => expect(ratio(color(t, '--muted-foreground'), surface)).toBeGreaterThanOrEqual(4.5));
    }
    it('texto de destaque (ex.: "+2 emitidas fora da notem") sobre o cartão ≥ 4,5:1', () => expect(ratio(color(t, '--highlight-text'), card)).toBeGreaterThanOrEqual(4.5));
    it('texto escuro sobre o verde-limão (item ativo, botão principal) ≥ 4,5:1', () => expect(ratio(color(t, '--primary-foreground'), color(t, '--primary'))).toBeGreaterThanOrEqual(4.5));
    it('contador de alertas ≥ 4,5:1', () => expect(ratio(color(t, '--on-destructive'), color(t, '--destructive'))).toBeGreaterThanOrEqual(4.5));
    it('faixa de homologação ≥ 4,5:1', () => expect(ratio(color(t, '--warning-foreground'), color(t, '--warning-surface'))).toBeGreaterThanOrEqual(4.5));
    it('selo verde (ativa) ≥ 4,5:1', () => expect(ratio(color(t, '--success'), mix(t, '--success', 0.15, '--background'))).toBeGreaterThanOrEqual(4.5));
    it('selos misturam cores em sRGB (sem desvio para azul)', () => expect(css).toContain('color-mix(in srgb,var(--destructive) 15%,var(--background))'));
  it('selo vermelho (erro) ≥ 4,5:1', () => expect(ratio(color(t, '--destructive'), mix(t, '--destructive', 0.15, '--background'))).toBeGreaterThanOrEqual(4.5));
    it('borda dos campos ≥ 3:1', () => { expect(ratio(color(t, '--input-border'), bg)).toBeGreaterThanOrEqual(3); expect(ratio(color(t, '--input-border'), field)).toBeGreaterThanOrEqual(3); });
    it('contorno de foco ≥ 3:1', () => expect(ratio(color(t, '--ring'), bg)).toBeGreaterThanOrEqual(3));
    it('ícones em destaque (limão e ciano) ≥ 3:1', () => { expect(ratio(color(t, '--highlight-text'), card)).toBeGreaterThanOrEqual(3); expect(ratio(color(t, '--cyan-text'), card)).toBeGreaterThanOrEqual(3); });
  });
}

describe('painel: regra da marca', () => {
  it('no tema claro o texto de destaque não é o verde-limão', () => expect(value(themes.claro, 'var(--highlight-text)')).not.toBe(value(themes.claro, 'var(--primary)')));
});

describe('documentação: cores intactas', () => {
  // Values the public docs used before the panel restyle; the docs never set data-surface, so they read only these.
  const docsDark: Tokens = { '--background': 'oklch(0.17 0.025 267)', '--foreground': 'oklch(0.985 0 0)', '--card': 'oklch(0.21 0.03 264 / 78%)', '--secondary': 'oklch(0.25 0.025 264)', '--accent': 'oklch(0.29 0.028 264)', '--muted-foreground': 'oklch(0.7 0.018 260)', '--primary': 'oklch(0.895 0.254 130)', '--primary-foreground': 'oklch(0.17 0.025 267)', '--highlight': 'oklch(0.961 0.134 120)', '--border': 'oklch(0.85 0.016 260 / 13%)', '--destructive': 'oklch(0.65 0.19 25)', '--on-status': 'oklch(1 0 0)', '--success': 'oklch(0.75 0.16 155)', '--warning': 'oklch(0.82 0.15 85)', '--warning-foreground': 'oklch(0.91 0.13 88)', '--warning-surface': 'oklch(0.32 0.07 70)', '--neutral': 'oklch(0.65 0.015 260)', '--cyan': 'oklch(0.8 0.12 190)', '--glass-shadow': '0 20px 65px oklch(0.05 0.02 264 / 25%)' };
  const docsLight: Tokens = { '--background': 'oklch(0.977 0.003 260)', '--foreground': 'oklch(0.17 0.025 267)', '--card': 'oklch(1 0 0 / 85%)', '--secondary': 'oklch(0.935 0.008 260)', '--accent': 'oklch(0.91 0.01 260)', '--muted-foreground': 'oklch(0.46 0.025 260)', '--border': 'oklch(0.8 0.012 260 / 65%)', '--warning-foreground': 'oklch(0.38 0.08 65)', '--warning-surface': 'oklch(0.94 0.075 90)', '--glass-shadow': '0 12px 40px oklch(0.2 0.02 264 / 8%)' };
  it('tema escuro da documentação igual ao anterior', () => { for (const [k, v] of Object.entries(docsDark)) expect(base[k], k).toBe(v); });
  it('tema claro da documentação igual ao anterior', () => { for (const [k, v] of Object.entries(docsLight)) expect(baseLight[k], k).toBe(v); });
  it('apelidos novos apontam para as mesmas cores na documentação', () => {
    expect(base['--popover']).toBe('var(--card)'); expect(base['--input-border']).toBe('var(--border)'); expect(base['--ring']).toBe('var(--primary)');
  });
  it('a documentação não marca a página como painel', () => {
    for (const f of ['../docs-site/layout.ts', '../docs-site/handler.server.ts', '../docs-site/theme.js']) expect(readFileSync(resolve(__dirname, f), 'utf8')).not.toContain('data-surface');
  });
  it('o painel marca a página como painel', () => expect(readFileSync(resolve(__dirname, '../routes/__root.tsx'), 'utf8')).toContain('data-surface="panel"'));
});

describe('menos movimento', () => {
  it('desliga transições e animações quando o sistema pede', () => expect(css).toMatch(/@media\s*\(prefers-reduced-motion:\s*reduce\)\s*\{\s*\*\s*\{\s*transition:none!important;\s*animation:none!important;/));
});
