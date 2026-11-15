import { describe, it, expect } from 'vitest';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, writeFileSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { buildFiscalEvent, eventRequestId, justificationError, brasiliaNow } from '../lib/fiscal-events';
import { buildDps } from '../lib/dps';
import { eventFixture, eventExamples, substituteFixture, exampleKey } from './fiscal-event-fixtures';

const validate = (schema: 'DPS' | 'pedRegEvento', files: string[], strict = false) => execFileSync('python3', ['src/test/validate-dps-xsd.py', `--schema=${schema}`, ...(strict ? ['--official'] : []), ...files], { encoding: 'utf8', stdio: 'pipe' });

describe('Pedido de registro de evento', () => {
  it('Id = PRE + chave (50) + código do evento (6), 59 caracteres', () => {
    const id = eventRequestId(exampleKey, '101101');
    expect(id).toBe(`PRE${exampleKey}101101`); expect(id).toHaveLength(59);
    expect(buildFiscalEvent(eventFixture('101103')).id).toBe(`PRE${exampleKey}101103`);
  });
  it('motivos 1, 2 e 9 para cancelamento e análise fiscal', () => {
    for (const code of ['101101', '101103'] as const) for (const [reason, value] of [['erro_emissao', '1'], ['servico_nao_prestado', '2'], ['outros', '9']] as const) {
      const v = eventFixture(code); v.reason = reason; expect(buildFiscalEvent(v).xml).toContain(`<cMotivo>${value}</cMotivo>`);
    }
  });
  it('descrições oficiais exatas', () => {
    expect(buildFiscalEvent(eventFixture('101101')).xml).toContain('<e101101><xDesc>Cancelamento de NFS-e</xDesc>');
    expect(buildFiscalEvent(eventFixture('101103')).xml).toContain('<e101103><xDesc>Solicitação de Análise Fiscal para Cancelamento de NFS-e</xDesc>');
  });
  it('justificativa de 15 a 255 caracteres', () => {
    expect(justificationError('a'.repeat(14))).toMatch('15 a 255'); expect(justificationError('a'.repeat(15))).toBeNull();
    expect(justificationError('a'.repeat(255))).toBeNull(); expect(justificationError('a'.repeat(256))).toMatch('15 a 255');
  });
  it('recusa quebra de linha, espaços nas pontas e caracteres fora do XSD', () => {
    expect(justificationError('Primeira linha\nsegunda linha')).toMatch('quebras de linha');
    expect(justificationError(' Justificativa com espaço')).toMatch('espaços');
    expect(justificationError('Justificativa — com travessão')).toMatch('símbolos');
    expect(justificationError('Correção: ação não prestada & revisão')).toBeNull();
  });
  it('autor deve ser o CNPJ do prestador presente na chave (E0812)', () => {
    const v = eventFixture(); v.authorCnpj = '11444777000161'; expect(() => buildFiscalEvent(v)).toThrow('E0812');
  });
  it('ambiente da nota e data com -03:00', () => {
    const v = eventFixture(); v.environment = 'production'; expect(buildFiscalEvent(v).xml).toContain('<tpAmb>1</tpAmb>');
    expect(brasiliaNow(Date.parse('2026-11-14T21:30:00Z'))).toBe('2026-11-14T18:30:00-03:00');
    v.occurredAt = '2026-11-14T18:30:00Z'; expect(() => buildFiscalEvent(v)).toThrow('Data');
  });
  it('escapa texto do usuário', () => { const v = eventFixture(); v.justification = 'Valor <errado> & duplicado na nota'; expect(buildFiscalEvent(v).xml).toContain('Valor &lt;errado&gt; &amp; duplicado'); });
});

describe('Grupo subst da DPS', () => {
  it('fica após cLocEmi e antes de prest, com motivo de dois dígitos', () => {
    const xml = buildDps(substituteFixture(),'nt009r1').xml;
    expect(xml).toContain(`<cLocEmi>4212254</cLocEmi><subst><chSubstda>${exampleKey}</chSubstda><cMotivo>99</cMotivo><xMotivo>`);
    expect(xml.indexOf('</subst>')).toBeLessThan(xml.indexOf('<prest>'));
  });
  it('E0042: chave de outra empresa ou município é recusada', () => {
    const other = substituteFixture(); other.provider.cnpj = '12345678000195'; expect(() => buildDps(other,'nt009r1')).toThrow('E0042');
    const city = substituteFixture(); city.provider.municipality = '4205407'; expect(() => buildDps(city,'nt009r1')).toThrow('E0042');
  });
  it('justificativa obrigatória mesmo fora do motivo 99', () => { const v = substituteFixture(); v.substitution!.reason = 'desenquadramento_simples'; v.substitution!.justification = 'curta'; expect(() => buildDps(v,'nt009r1')).toThrow('15 a 255'); });
});

describe('XSD oficial dos eventos', () => {
  it('eventos e DPS substituta passam; exemplos salvos conferem; variações inválidas falham', () => {
    const folder = mkdtempSync(join(tmpdir(), 'evt-')); const archive = 'docs/referencias/esquemas/nfse-esquemas_xsd-v1-01-20260209.zip'; const original = readFileSync(archive);
    try {
      const events = Object.entries(eventExamples()).map(([name, v]) => { const p = join(folder, `${name}.xml`); const xml = buildFiscalEvent(v).xml; writeFileSync(p, xml); expect(readFileSync(`docs/exemplos/eventos/${name}.xml`, 'utf8')).toBe(xml); return p; });
      for (const reason of ['servico_nao_prestado', 'outros'] as const) { const v = eventFixture(); v.reason = reason; const p = join(folder, `c-${reason}.xml`); writeFileSync(p, buildFiscalEvent(v).xml); events.push(p); }
      expect(validate('pedRegEvento', events).match(/XSD 1.01 válido/g)).toHaveLength(events.length);
      // Event schemas do not use TSSerieDPS: they also pass the untouched official schema.
      expect(validate('pedRegEvento', events, true).match(/XSD 1.01 válido/g)).toHaveLength(events.length);
      const dps = join(folder, 'substituta.xml'); const dpsXml = buildDps(substituteFixture(),'nt009r1').xml; writeFileSync(dps, dpsXml);
      expect(readFileSync('docs/exemplos/eventos/dps-substituta.xml', 'utf8')).toBe(dpsXml);
      expect(validate('DPS', [dps])).toContain('XSD 1.01 válido');
      const base = buildFiscalEvent(eventFixture()).xml;
      for (const [name, xml] of [['motivo', base.replace('<cMotivo>1</cMotivo>', '<cMotivo>3</cMotivo>')], ['id', base.replace(/Id="PRE\d+"/, 'Id="PRE123"')], ['desc', base.replace('Cancelamento de NFS-e<', 'Cancelamento<')], ['curta', base.replace(/<xMotivo>[^<]+</, '<xMotivo>curta<')]] as const) {
        const p = join(folder, `bad-${name}.xml`); writeFileSync(p, xml); expect(() => validate('pedRegEvento', [p])).toThrow();
      }
      const badSubst = join(folder, 'bad-subst.xml'); writeFileSync(badSubst, dpsXml.replace('<cMotivo>99</cMotivo>', '<cMotivo>9</cMotivo>')); expect(() => validate('DPS', [badSubst])).toThrow();
      expect(readFileSync(archive).equals(original)).toBe(true);
    } finally { rmSync(folder, { recursive: true, force: true }); }
  });
});
