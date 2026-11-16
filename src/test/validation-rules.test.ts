// @vitest-environment node
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { z, email, integer, isoDateTime, notemMessage } from '@/lib/validation';
import { companySchema, organizationSchema } from '@/lib/notem';
import { customerSchema } from '@/lib/customers';
import { idParam, ApiFailure } from '@/lib/api-contract';

const files = (dir: string): string[] => readdirSync(dir).flatMap(n => { const p = join(dir, n); return statSync(p).isDirectory() ? files(p) : /\.(ts|tsx)$/.test(n) ? [p] : []; });

describe('módulo de mensagens', () => {
  it('nenhum arquivo importa o zod diretamente, só src/lib/validation.ts', () => {
    const src = resolve(__dirname, '..');
    const direct = files(src).filter(f => !f.endsWith(join('lib', 'validation.ts')) && /from\s+['"]zod(\/[^'"]*)?['"]/.test(readFileSync(f, 'utf8')));
    expect(direct).toEqual([]);
  });
  it('está instalado: erro sem mensagem própria sai em português da notem', () => {
    expect(z.string().safeParse(undefined).error?.issues[0]?.message).toBe('Campo obrigatório.');
    expect(z.strictObject({}).safeParse({ a: 1 }).error?.issues[0]?.message).toBe('Campo não aceito: a.');
  });
  it('mensagem escrita pela notem num campo vence a padrão', () => {
    expect(organizationSchema.safeParse({ name: 'X' }).error?.issues.find(i => i.path[0] === 'type')?.message).toBe('Selecione o tipo de organização.');
    expect(z.string().min(1, 'Informe a razão social.').safeParse('').error?.issues[0]?.message).toBe('Informe a razão social.');
    expect(email('E-mail inválido.').max(5).safeParse('abcdef@x.com').error?.issues.map(i => i.message)).toEqual(['Use no máximo 5 caracteres.']);
  });
  it('campo não aceito: nome até 60 caracteres e no máximo 5 nomes', () => {
    const name = 'n'.repeat(100);
    expect(notemMessage({ kind: 'keys', keys: [name] })).toBe(`Campo não aceito: ${'n'.repeat(59)}….`);
    expect(notemMessage({ kind: 'keys', keys: ['a', 'b', 'c'] })).toBe('Campos não aceitos: a, b e c.');
    expect(notemMessage({ kind: 'keys', keys: Array.from({ length: 20 }, (_, i) => `k${i + 1}`) })).toBe('Campos não aceitos: k1, k2, k3, k4, k5 e mais 15.');
  });
});

describe('regras mantidas da versão anterior', () => {
  const company = { organization_id: '20000000-0000-4000-8000-000000000001', cnpj: '11222333000181', legal_name: 'E', trade_name: '', municipal_registration: '', phone: '', postal_code: '', street: '', number: '', complement: '', district: '', municipality_ibge_code: '4205407' };
  it.each(['joao.silva@empresa.com.br', 'financeiro+notas@grupo.com.br', 'contato@sub.dominio.com.br', 'nome.sobrenome@mail.empresa.gov.br', "o'neil@x.com", 'a_b-c@x.com', 'A@X.COM.BR', 'x@y.co'])('aceita o e-mail %s', v => {
    expect(companySchema.safeParse({ ...company, email: v }).success).toBe(true);
    expect(customerSchema.safeParse({ tipo: 'pf', documento: '52998224725', nome: 'A', email: v }).success).toBe(true);
  });
  it.each(['ana@localhost', 'a..b@x.com', '.a@x.com', 'a.@x.com', 'ç@x.com', 'a@x.c', 'a@-x.com', 'a@b'])('recusa o e-mail %s', v => {
    expect(companySchema.safeParse({ ...company, email: v }).error?.issues[0]?.message).toBe('E-mail inválido.');
  });
  it('data e hora: mesmo critério de antes (Z obrigatório, segundos opcionais)', () => {
    const ok = ['2026-11-15T10:00:00Z', '2026-11-15T10:00:00.123Z', '2026-11-15T10:00:00.123456Z', '2026-11-15T10:00Z'];
    const no = ['2026-11-15T10:00:00-03:00', '2026-11-15T10:00:00', '2026-11-15', '2026-02-30T10:00:00Z', '2026-11-15T24:00:00Z'];
    for (const v of ok) expect(isoDateTime().safeParse(v).success, v).toBe(true);
    for (const v of no) expect(isoDateTime().safeParse(v).error?.issues[0]?.message, v).toBe('Data e hora inválidas.');
  });
  it('inteiro: mesmo critério de antes', () => {
    expect(integer().safeParse(2 ** 60).success).toBe(true);
    expect(integer().safeParse(1.5).error?.issues[0]?.message).toBe('Informe um número inteiro.');
  });
  it('UUID rígido no corpo e no caminho (400 com campo)', () => {
    expect(z.uuid().safeParse('10000000-0000-4000-8000-00000000000A').success).toBe(true);
    let e: unknown; try { idParam('00000000-0000-0000-0000-000000000001', 'id'); } catch (x) { e = x; }
    expect(e).toBeInstanceOf(ApiFailure); expect(e).toMatchObject({ status: 400, code: 'REQUISICAO_INVALIDA', details: [{ campo: 'id', mensagem: 'Identificador inválido (UUID).' }] });
  });
});
