import { describe, expect, it } from 'vitest';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { ApiFailure, fiscalDbDetail, fiscalIn, fiscalOut, fiscalToDb, regimeMap, simplesMap, specialMap } from '../lib/api-contract';
import { buildDps, reserveValidatedDps, type DpsInput } from '../lib/dps';
import { convertDpsLayout } from '../lib/dps-layout';
import { fiscalSchema } from '../lib/fiscal';
import { parsePisCofins, pisCofinsFromColumns, PIS_COFINS_UNSUPPORTED } from '../lib/pis-cofins';
import { fixture } from './dps-fixtures';

const ids = { company_id: '10000000-0000-4000-8000-000000000001', organization_id: '20000000-0000-4000-8000-000000000001' };
const body = { simples_nacional: 'me_epp', regime_apuracao_simples: 'tudo_fora_do_simples', regime_especial: 'nenhum', tributos_aproximados: { modo: 'percentual_simples', percentual_simples: '8.30' } };
const pair = { cst: '99', tipo_retencao: '0' } as const;
const group = '<tribFed><piscofins><CST>99</CST><tpRetPisCofins>0</tpRetPisCofins></piscofins></tribFed>';

function reference(): DpsInput {
  const input = fixture();
  input.environment = 'production'; input.series = 900; input.number = '37';
  input.emittedAt = '2026-11-23T09:11:42-03:00'; input.competence = '2026-11-06';
  input.fiscal.regime = 3; input.fiscal.approximate = { mode: 'percent_simples', simples: '8.30' };
  input.fiscal.pisCofins = pair;
  input.service = { code: '170901', nbs: '114044900', description: 'VISTORIA', taxation: 1, withholding: 1 };
  input.values = { service: '130.00' };
  input.customer = { tipo: 'pf', documento: '52998224725', nome: 'Cliente fictício' };
  return input;
}

describe('PIS/COFINS opcional por empresa — versão 99/0', () => {
  it('sem configuração ou null não escolhe 99/0 automaticamente', () => {
    for (const value of [undefined, null]) expect(parsePisCofins(value)).toBeNull();
    expect(pisCofinsFromColumns({})).toBeNull();
    expect(pisCofinsFromColumns({ pis_cofins_cst: null, pis_cofins_withholding_type: null })).toBeNull();
  });
  it('aceita somente o par textual 99/0', () => {
    expect(parsePisCofins(pair)).toEqual({ cst: '99', tipo_retencao: '0' });
    const row = fiscalToDb(fiscalIn.parse({ ...body, pis_cofins: pair }), ids, 900);
    expect([row.pis_cofins_cst, row.pis_cofins_withholding_type]).toEqual(['99', '0']);
    expect(fiscalOut(row).pis_cofins).toEqual(pair);
  });
  it.each([
    { cst: '00', tipo_retencao: '0' }, { cst: '01', tipo_retencao: '0' },
    ...Array.from({ length: 9 }, (_, i) => ({ cst: '99', tipo_retencao: String(i + 1) })),
    { cst: '99' }, { tipo_retencao: '0' }, {}, { cst: 99, tipo_retencao: 0 },
    { cst: '99', tipo_retencao: '0', base: '130.00' }, [], '99/0', false,
  ])('outra combinação %j → 422 com campo e motivo fixos', (pis_cofins) => {
    try {
      fiscalToDb(fiscalIn.parse({ ...body, pis_cofins }), ids, 900);
      expect.fail('A combinação inválida não pode passar.');
    } catch (error) {
      expect(error).toBeInstanceOf(ApiFailure);
      if (!(error instanceof ApiFailure)) throw error;
      expect(error.status).toBe(422); expect(error.code).toBe('REGRA_DE_NEGOCIO');
      expect(error.details).toEqual([{ campo: 'pis_cofins', mensagem: 'combinação de PIS/COFINS ainda não suportada' }]);
    }
  });
  it('PUT sem o objeto, ou com null, produz ambos nulos para remover a escolha anterior', () => {
    const previous = fiscalToDb(fiscalIn.parse({ ...body, pis_cofins: pair }), ids, 900);
    for (const next of [body, { ...body, pis_cofins: null }]) {
      const replaced = { ...previous, ...fiscalToDb(fiscalIn.parse(next), ids, 900) };
      expect([replaced.pis_cofins_cst, replaced.pis_cofins_withholding_type]).toEqual([null, null]);
      expect(fiscalOut(replaced).pis_cofins).toBeNull();
    }
  });
  it('todo PUT com o objeto mantém 99/0 mesmo ao mudar outro campo', () => {
    const next = fiscalToDb(fiscalIn.parse({ ...body, regime_apuracao_simples: 'iss_fora_do_simples', pis_cofins: pair }), ids, 900);
    expect(fiscalOut(next).pis_cofins).toEqual(pair); expect(next.simples_nacional_regime).toBe(2);
  });
  it('formulário fiscal rejeita pares parciais e escolhas não suportadas', () => {
    const row = fiscalToDb(fiscalIn.parse(body), ids, 900);
    expect(fiscalSchema.safeParse({ ...row, pis_cofins_cst: '99' }).success).toBe(false);
    expect(fiscalSchema.safeParse({ ...row, pis_cofins_withholding_type: '0' }).success).toBe(false);
    expect(fiscalSchema.safeParse({ ...row, pis_cofins_cst: '99', pis_cofins_withholding_type: '1' }).success).toBe(false);
    expect(fiscalSchema.safeParse({ ...row, pis_cofins_cst: '99', pis_cofins_withholding_type: '0' }).success).toBe(true);
  });
  it('recusa do CHECK do banco aponta PIS/COFINS, não o corpo inteiro', () => {
    expect(fiscalDbDetail({ code: '23514', message: 'violates check constraint "company_fiscal_settings_pis_cofins_check"' })).toEqual({ campo: 'pis_cofins', mensagem: PIS_COFINS_UNSUPPORTED });
  });
  it('regimes 1/2/3, ME/EPP 3 e nenhum 0 conservam a correspondência aprovada', () => {
    expect([regimeMap.dentro_do_simples, regimeMap.iss_fora_do_simples, regimeMap.tudo_fora_do_simples]).toEqual([1, 2, 3]);
    expect(simplesMap.me_epp).toBe(3); expect(specialMap.nenhum).toBe(0);
  });
});

describe('DPS com PIS/COFINS da referência', () => {
  it('escreve exatamente 99/0 entre tribMun e totTrib, mantendo 8.30 e R$130', () => {
    const xml = buildDps(reference(), 'nt004').xml;
    expect(xml).toContain('<tribMun><tribISSQN>1</tribISSQN><tpRetISSQN>1</tpRetISSQN></tribMun>' + group + '<totTrib><pTotTribSN>8.30</pTotTribSN></totTrib>');
    expect(xml).toContain('<vServ>130.00</vServ>');
    expect(xml).not.toMatch(/vBCPisCofins|pAliqPis|pAliqCofins|<vPis>|<vCofins>|<pAliq>/);
    expect(xml).toContain('<opSimpNac>3</opSimpNac><regApTribSN>3</regApTribSN><regEspTrib>0</regEspTrib>');
    expect(xml).toContain('<toma><CPF>52998224725</CPF><xNome>Cliente fictício</xNome></toma>');
  });
  it('ausência e null omitem todo tribFed, sem mudar XML antigos', () => {
    const input = reference(); delete input.fiscal.pisCofins;
    const original = buildDps(input, 'nt004').xml;
    expect(original).not.toContain('tribFed');
    input.fiscal.pisCofins = null; expect(buildDps(input, 'nt004').xml).toBe(original);
  });
  it('conversão de leiaute mantém grupo e o mesmo número', () => {
    const input = reference(); const before = buildDps(input, 'nt004').xml;
    const converted = convertDpsLayout(before, 'nt009r1');
    expect(converted).toBe(buildDps(input, 'nt009r1').xml);
    expect(converted).toContain(group); expect(converted).toContain('<nDPS>37</nDPS>');
    expect(convertDpsLayout(converted, 'nt004')).toBe(before);
  });
  it('montagem também recusa dados inválidos antes da reserva de número', async () => {
    const input = reference(); input.fiscal.pisCofins = { cst: '99', tipo_retencao: '1' } as never;
    let reservations = 0;
    await expect(reserveValidatedDps(input, 'nt004', async () => { reservations++; return '38'; })).rejects.toThrow(PIS_COFINS_UNSUPPORTED);
    expect(reservations).toBe(0);
  });
  it('99/0 valida nos XSD antigo e NT009r1, sem transmitir', () => {
    const dir = mkdtempSync(join(tmpdir(), 'pis-cofins-xsd-'));
    try {
      for (const layout of ['nt004', 'nt009r1'] as const) {
        const file = join(dir, `${layout}.xml`); writeFileSync(file, buildDps(reference(), layout).xml);
        expect(execFileSync('python3', ['src/test/validate-dps-xsd.py', `--layout=${layout}`, file], { encoding: 'utf8' })).toContain('XSD 1.01 válido');
      }
    } finally { rmSync(dir, { recursive: true, force: true }); }
  });
});