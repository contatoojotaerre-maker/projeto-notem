import { describe, it, expect } from 'vitest';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { buildDps, dpsIdentifier } from '../lib/dps';
import { readAuthorizedNfse } from '../lib/nfse-xml';
import { fixture, examples } from './dps-fixtures';
describe('DPS E1', () => {
  it('CNPJ usa tipo 2 e identificador de 45 caracteres', () => { const id = dpsIdentifier('4212254', '11222333000181', 1, '999999999999999'); expect(id).toBe('DPS421225421122233300018100001999999999999999'); expect(id).toHaveLength(45); });
  it('valida exemplos e variações no XSD oficial 1.01', () => {
    const folder = mkdtempSync(join(tmpdir(), 'dps-')); const variations = Object.values(examples()); const absent = fixture(); absent.customer = null; variations.push(absent); const withheld = fixture(); withheld.service.withholding = 2; withheld.fiscal.withheldRate = '2.00'; variations.push(withheld); const none = fixture(); none.fiscal.approximate = { mode: 'none' }; variations.push(none);
    try { const files = variations.map((v, i) => { const p = join(folder, `${i}.xml`); writeFileSync(p, buildDps(v).xml); return p; }); expect(execFileSync('python3', ['src/test/validate-dps-xsd.py', ...files], { encoding: 'utf8' })).toContain('XSD 1.01 válido'); const p = join(folder, 'invalid.xml'); writeFileSync(p, buildDps(fixture()).xml.replace('<tpAmb>2</tpAmb>', '<tpAmb>9</tpAmb>')); expect(() => execFileSync('python3', ['src/test/validate-dps-xsd.py', p], { stdio: 'pipe' })).toThrow(); } finally { rmSync(folder, { recursive: true, force: true }); }
  });
  it('E0713 não optante recusa none e percentual Simples', () => { for (const mode of ['none', 'percent_simples'] as const) { const v = fixture(); v.fiscal.simples = 1; v.fiscal.regime = null; v.fiscal.approximate.mode = mode; expect(() => buildDps(v)).toThrow('E0713'); } });
  it('E0621 exige alíquota com retenção', () => { const v = fixture(); v.service.withholding = 2; expect(() => buildDps(v)).toThrow('E0621'); });
  it('E0625 omite alíquota sem retenção', () => { const v = fixture(); v.fiscal.withheldRate = '2.00'; expect(buildDps(v).xml).not.toContain('pAliq'); });
  it('ambiente definido pela chave e escape XML', () => { const v = fixture(); v.environment = 'production'; expect(buildDps(v).xml).toContain('<tpAmb>1</tpAmb>'); expect(buildDps(v).xml).toContain('&amp; conferência &lt;E1&gt;'); });
  it('descontos não podem superar serviço', () => { const v = fixture(); v.values.unconditional = '151.00'; expect(() => buildDps(v)).toThrow('descontos'); });
  it('competência futura recusada', () => { const v = fixture(); v.competence = '2026-11-14'; expect(() => buildDps(v)).toThrow('Competência'); });
  it('recusa entidades externas no XML do governo', () => { expect(() => readAuthorizedNfse('<!DOCTYPE NFSe SYSTEM "https://exemplo"><NFSe/>')).toThrow('inválido'); });
  it('lê valores do governo sem inventar ISS ausente', () => { const key = '1'.repeat(50); const xml = `<NFSe xmlns="http://www.sped.fazenda.gov.br/nfse"><infNFSe Id="NFS${key}"><nNFSe>9007199254740993</nNFSe><dhProc>2026-11-13T16:00:01-03:00</dhProc><valores><vLiq>150.00</vLiq></valores></infNFSe></NFSe>`; const out = readAuthorizedNfse(xml); expect(out.number).toBe('9007199254740993'); expect(out.iss).toBeNull(); expect(out.net).toBe('150.00'); expect(out.accessKey).toBe(key); });
});