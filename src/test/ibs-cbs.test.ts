// Part 3 (IBS/CBS): one test per approved rule. DPS with the group are validated against the official release 1 XSD.
import { describe, it, expect, vi } from 'vitest';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { buildDps, reserveValidatedDps, type DpsInput } from '../lib/dps';
import { chooseDpsLayout, convertDpsLayout, detectDpsLayout, IBSCBS_OLD_LAYOUT_ERROR, LAYOUT_NOT_CONVERTIBLE } from '../lib/dps-layout';
import { IBSCBS_MESSAGES, TAKER_MUNICIPALITY_REJECTION, allowedIbsCbsRegimes, buildSuggestion, defaultIbsCbsRegime, ibsCbsForDps, ibsCbsRequired, ibsCbsServiceRuleError, serviceItemOf, type IbsCbsClassification } from '../lib/ibscbs';
import { chooseIssRegime, chooseSimples, fiscalSchema } from '../lib/fiscal';
import { computeReadiness, fiscalIn, fiscalOut, fiscalToDb, serviceOut, servicePatch, serviceToDb, ApiFailure } from '../lib/api-contract';
import { governmentErrors } from '../lib/invoices';
import { addDecimals, ibsCbsExclusionsOf, ibsCbsValuesOf } from '../lib/nfse-layout-read';
import { parseDanfse } from '../lib/danfse';
import { generateDanfse } from '../lib/danfse.server';
import { readNfse } from '../lib/adn-xml';
import { fixture } from './dps-fixtures';
import { danfseFixture } from './danfse-fixtures';

const cls = (code: string, over: Partial<IbsCbsClassification> = {}): IbsCbsClassification => ({ code, cst: code.slice(0, 3), requires_taxation: true, regular_taxation: false, presumed_credit: false, deferral: false, ...over });
const integral = cls('000001'), reduction = cls('200052'), exempt = cls('410999', { requires_taxation: false });
const run = (args: string[]) => execFileSync('python3', ['src/test/validate-dps-xsd.py', '--layout=nt009r1', ...args], { encoding: 'utf8', stdio: 'pipe' });
const withIbs = (c: IbsCbsClassification, indicator: string | null, mutate?: (v: DpsInput) => void): DpsInput => {
  const v = fixture(); v.service = { ...v.service, code: '010501', nbs: '111032100' }; v.customer = { tipo: 'pj', documento: '11444777000161', nome: 'Tomador', endereco: { cep: '88980000', codigo_municipio: '4212254', logradouro: 'Rua A', numero: '1', bairro: 'Centro' } };
  v.ibsCbs = { cst: c.cst, classification: c.code, requiresTaxation: c.requires_taxation, indicator, indicatorIncidence: 'Endereço do Tomador/Adquirente' }; mutate?.(v); return v;
};

describe('Cadastro do serviço (mesma regra do gatilho do banco)', () => {
  it('atividade 10 do Simples somente com 16.01', () => { expect(ibsCbsServiceRuleError('160101', null, null, null, '09')).toBe(IBSCBS_MESSAGES.activity10); expect(ibsCbsServiceRuleError('010501', null, null, null, '10')).toBe(IBSCBS_MESSAGES.activity10); expect(ibsCbsServiceRuleError('160101', null, null, null, '10')).toBeNull(); });
  it('atividade 11 somente com 99.04.01', () => { expect(ibsCbsServiceRuleError('010501', null, null, null, '11')).toBe(IBSCBS_MESSAGES.activity11); });
  it('atividades 12/13 somente com 7.02 e 7.05', () => { expect(ibsCbsServiceRuleError('070201', null, null, null, '09')).toBe(IBSCBS_MESSAGES.activity1213); expect(ibsCbsServiceRuleError('070501', null, null, null, '13')).toBeNull(); });
  it('classificação fora do catálogo é recusada', () => { expect(ibsCbsServiceRuleError('010501', '999999', undefined, null, null)).toBe(IBSCBS_MESSAGES.unknownClassification); });
  it('99.03, 99.04 e 99.05 não suportados', () => { for (const c of ['990301', '990401', '990501']) expect(ibsCbsServiceRuleError(c, '000001', integral, '100501', null)).toBe(IBSCBS_MESSAGES.realEstate); });
  it('25.05, 15.09, 17.12 e 10.05 (tpOper) não suportados', () => { for (const c of ['250501', '150901', '171201', '100501']) expect(ibsCbsServiceRuleError(c, '000001', integral, '100501', null)).toBe(IBSCBS_MESSAGES.operationType); });
  it('tributação regular, crédito presumido e diferimento não suportados', () => { for (const k of ['regular_taxation', 'presumed_credit', 'deferral'] as const) expect(ibsCbsServiceRuleError('010501', '000001', cls('000001', { [k]: true }), '100501', null)).toBe(IBSCBS_MESSAGES.specialRegime); });
  it('CST 800 e 811 não suportados', () => { expect(ibsCbsServiceRuleError('010501', '800001', cls('800001'), '100501', null)).toBe(IBSCBS_MESSAGES.creditAdjustment); expect(ibsCbsServiceRuleError('010501', '811001', cls('811001'), '100501', null)).toBe(IBSCBS_MESSAGES.creditAdjustment); });
  it('doações 410003 e 410026 não suportadas', () => { for (const c of ['410003', '410026']) expect(ibsCbsServiceRuleError('010501', c, cls(c, { requires_taxation: false }), null, null)).toBe(IBSCBS_MESSAGES.donation); });
  it('820xxx permitido', () => { expect(ibsCbsServiceRuleError('010501', '820001', cls('820001', { requires_taxation: false }), null, null)).toBeNull(); });
  it('E0860: indicador obrigatório quando exige tributação', () => { expect(ibsCbsServiceRuleError('010501', '000001', integral, null, null)).toBe(IBSCBS_MESSAGES.indicatorRequired); });
  it('E0859: indicador proibido sem tributação', () => { expect(ibsCbsServiceRuleError('010501', '410999', exempt, '100501', null)).toBe(IBSCBS_MESSAGES.indicatorForbidden); });
});

describe('Regime de apuração do IBS/CBS (ME/EPP)', () => {
  it('ISS dentro do Simples: padrão 1, opção 3', () => { expect(defaultIbsCbsRegime(1)).toBe(1); expect(allowedIbsCbsRegimes(1)).toEqual([1, 3]); });
  it('ISS fora do Simples: padrão 2, opção 3', () => { expect(defaultIbsCbsRegime(2)).toBe(2); expect(allowedIbsCbsRegimes(2)).toEqual([2, 3]); });
  it('trocar o regime do ISS ajusta o padrão e avisa', () => {
    const base = fiscalSchema.parse({ company_id: '10000000-0000-4000-8000-000000000001', organization_id: '20000000-0000-4000-8000-000000000001', simples_nacional_option: 3, simples_nacional_regime: 1, special_tax_regime: 0, dps_series: 1, approx_taxes_mode: 'percent_simples', approx_simples_percent: 6, approx_federal_percent: null, approx_state_percent: null, approx_municipal_percent: null, simples_iss_withholding_percent: null, ibscbs_simples_regime: 1 });
    const r = chooseIssRegime(base, 2); expect(r.form.ibscbs_simples_regime).toBe(2); expect(r.changed).toBe(true);
    expect(fiscalSchema.safeParse({ ...base, ibscbs_simples_regime: 2 }).success).toBe(false);
    expect(chooseSimples(base, 1).ibscbs_simples_regime).toBeNull();
  });
});

describe('Data de obrigatoriedade por ambiente (padrão 01/01/2027)', () => {
  it('antes da data a DPS sai sem o grupo; a partir dela exige classificação', () => {
    const p = { service_code: '010501', nbs_code: '111032100', ibscbs_classification: '000001', ibscbs_operation_indicator: '100501', classification: integral, indicator: { code: '100501', active: true, incidence_location: 'Endereço do Tomador/Adquirente' } };
    expect(ibsCbsRequired('2026-12-31', null)).toBe(false); expect(ibsCbsRequired('2027-01-01', null)).toBe(true);
    expect(ibsCbsForDps(p, '2026-12-31', '2027-01-01', true)).toEqual({ value: null });
    expect(ibsCbsForDps(p, '2027-01-01', '2027-01-01', true)).toMatchObject({ value: { cst: '000', classification: '000001', indicator: '100501' } });
    expect(ibsCbsForDps({ ...p, ibscbs_classification: null, classification: null }, '2027-01-02', '2027-01-01', true)).toMatchObject({ field: 'servico.classificacao_ibscbs' });
    expect(ibsCbsForDps(p, '2027-01-01', '2027-01-01', false)).toEqual({ error: IBSCBS_MESSAGES.layoutWithoutIbsCbs, field: 'competencia' });
    expect(ibsCbsForDps({ ...p, indicator: { code: '100501', active: false } }, '2027-01-01', '2027-01-01', true)).toMatchObject({ error: IBSCBS_MESSAGES.indicatorInactive });
  });
  it('situação: aviso antes da data (não bloqueia); pendência a partir dela', () => {
    const base = { company: { active: true, cnpj: '11222333000181' }, certificates: [{ status: 'active', cnpj: '11222333000181', valid_from: '2026-01-01T00:00:00Z', valid_until: '2028-01-01T00:00:00Z' }], settings: { company_id: 'c', organization_id: 'o', simples_nacional_option: 2, simples_nacional_regime: null, special_tax_regime: 0, dps_series: 1, approx_taxes_mode: 'none', approx_simples_percent: null, approx_federal_percent: null, approx_state_percent: null, approx_municipal_percent: null, simples_iss_withholding_percent: null }, services: [{ active: true, service_code: '010501', nbs_code: null, ibscbs_classification: null, ibscbs_operation_indicator: null }], lastQuery: { created_at: '2026-11-05T10:00:00Z', http_status: 200, response_body: '{}', error_code: null }, ibsCbsRequiredFrom: '2027-01-01' };
    const before = computeReadiness('production', base, Date.parse('2026-11-15T12:00:00Z'));
    expect(before.pronta_para_emitir).toBe(true); expect(before.avisos).toEqual([{ item: 'classificacao_ibscbs', mensagem: 'Classificação IBS/CBS pendente — obrigatória a partir de 01/01/2027.' }]);
    const after = computeReadiness('production', base, Date.parse('2027-01-01T12:00:00Z'));
    expect(after.pronta_para_emitir).toBe(false); expect(after.pendencias).toContain('classificacao_ibscbs');
  });
});

describe('DPS com IBS/CBS (XSD release 1 oficial)', () => {
  it('Simples e não optante; integral, redução e isenção validam no XSD', () => {
    const folder = mkdtempSync(join(tmpdir(), 'ibscbs-')); try {
      const cases: [string, DpsInput][] = [
        ['simples-integral', withIbs(integral, '100501')],
        ['nao-optante-reducao', withIbs(reduction, '100501', v => { v.fiscal = { simples: 1, regime: null, special: 0, approximate: { mode: 'percent_by_sphere', federal: '10.00', state: '0.00', municipal: '2.00' } }; })],
        ['isencao', withIbs(exempt, null)],
        ['consumidor-final', withIbs(integral, '100501', v => { v.ibsCbs!.finalConsumer = true; })],
      ];
      const files = cases.map(([n, v]) => { const p = join(folder, `${n}.xml`); writeFileSync(p, buildDps(v, 'nt009r1').xml); return p; });
      expect(run(files).match(/válido/g)).toHaveLength(files.length);
      const xml = buildDps(cases[2]![1], 'nt009r1').xml; expect(xml).not.toContain('<cIndOp>'); expect(xml).not.toContain('<gIBSCBS>');
      expect(buildDps(cases[0]![1], 'nt009r1').xml).toContain('<IBSCBS><cIndOp>100501</cIndOp><indDest>0</indDest><valores><trib><CST>000</CST><cClassTrib>000001</cClassTrib><gIBSCBS></gIBSCBS></trib></valores></IBSCBS>');
    } finally { rmSync(folder, { recursive: true, force: true }); }
  });
  it('sem o grupo a DPS não muda', () => { expect(buildDps(fixture(), 'nt009r1').xml).not.toContain('IBSCBS'); });
  const refuse = async (v: DpsInput, message: string) => { const reserve = vi.fn(async () => '7'); await expect(reserveValidatedDps(v, 'nt009r1', reserve)).rejects.toThrow(message); expect(reserve).not.toHaveBeenCalled(); };
  it('E0322: NBS obrigatório (sem consumir número)', () => refuse(withIbs(integral, '100501', v => { v.service.nbs = null; }), IBSCBS_MESSAGES.nbsRequired));
  it('E0959: CST igual aos 3 primeiros dígitos', () => refuse(withIbs(integral, '100501', v => { v.ibsCbs!.cst = '200'; }), IBSCBS_MESSAGES.cstMismatch));
  it('E0860/E0859 antes da numeração', async () => { await refuse(withIbs(integral, null), IBSCBS_MESSAGES.indicatorRequired); await refuse(withIbs(exempt, '100501'), IBSCBS_MESSAGES.indicatorForbidden); });
  it('E0239/E0243: tomador com CPF/CNPJ e endereço nacional quando o indicador aponta para ele', async () => {
    await refuse(withIbs(integral, '100501', v => { v.customer = null; }), IBSCBS_MESSAGES.takerRequired);
    await refuse(withIbs(integral, '100501', v => { v.customer = { tipo: 'estrangeiro', nif: 'X1', nome: 'Foreign' }; }), IBSCBS_MESSAGES.takerRequired);
    const reserve = vi.fn(async () => '7'); await reserveValidatedDps(withIbs(integral, '100501', v => { v.customer = null; v.ibsCbs!.indicatorIncidence = 'Estabelecimento do Prestador/Fornecedor'; }), 'nt009r1', reserve); expect(reserve).toHaveBeenCalled();
  });
  it('leiaute antigo não monta o grupo e não converte DPS com IBS/CBS', () => {
    expect(() => buildDps(withIbs(integral, '100501'), 'nt004')).toThrow(IBSCBS_MESSAGES.layoutWithoutIbsCbs);
    expect(() => convertDpsLayout(buildDps(withIbs(integral, '100501'), 'nt009r1').xml, 'nt004')).toThrow(IBSCBS_OLD_LAYOUT_ERROR);
  });
});

describe('Perfil nt009r2 (desligado; estrutura do Anexo VI v1.04.01)', () => {
  const r2 = () => withIbs(integral, '100501', v => { v.service.simplesActivity = '09'; v.fiscal.ibsCbsRegime = 3; });
  it('só vigora após a data configurada por ambiente', () => {
    expect(chooseDpsLayout('sandbox', Date.parse('2027-06-01T00:00:00Z'), null, null)).toBe('nt009r1');
    expect(chooseDpsLayout('production', Date.parse('2027-06-01T00:00:00Z'), null, '2027-05-01T00:00:00-03:00')).toBe('nt009r2');
    expect(chooseDpsLayout('production', Date.parse('2027-04-01T00:00:00Z'), null, '2027-05-01T00:00:00-03:00')).toBe('nt009r1');
  });
  it('regApIBSCBSSN em regTrib, cAtvSN após cNBS e indDest na raiz', () => {
    const xml = buildDps(r2(), 'nt009r2').xml;
    expect(xml).toContain('<regApTribSN>1</regApTribSN><regApIBSCBSSN>3</regApIBSCBSSN><regEspTrib>');
    expect(xml).toMatch(/<cNBS>111032100<\/cNBS><cAtvSN>09<\/cAtvSN><xDescServ>/);
    expect(xml).toMatch(/<\/toma><indDest>0<\/indDest><serv>/); expect(xml).toContain('<IBSCBS><cIndOp>100501</cIndOp><valores>');
    expect(detectDpsLayout(xml)).toBe('nt009r2'); expect(detectDpsLayout(buildDps(withIbs(integral, '100501'), 'nt009r1').xml)).toBe('nt009r1');
  });
  it('regime padrão pelo regime do ISS; release 1 apenas guarda', () => {
    const v = r2(); v.fiscal.ibsCbsRegime = null; v.fiscal.regime = 2; expect(buildDps(v, 'nt009r2').xml).toContain('<regApIBSCBSSN>2</regApIBSCBSSN>');
    expect(buildDps(r2(), 'nt009r1').xml).not.toMatch(/regApIBSCBSSN|cAtvSN/);
  });
  it('ME/EPP sem atividade do Simples é recusada; base não é convertida de/para r2', () => {
    const v = r2(); v.service.simplesActivity = null; expect(() => buildDps(v, 'nt009r2')).toThrow(IBSCBS_MESSAGES.simplesActivityRequired);
    expect(() => convertDpsLayout(buildDps(withIbs(integral, '100501'), 'nt009r1').xml, 'nt009r2')).toThrow(LAYOUT_NOT_CONVERTIBLE);
  });
});

describe('API: classificação, regime e campo obsoleto', () => {
  const current = { name: 'S', active: true, service_code: '010501', iss_taxation: 1, iss_withholding: 1, immunity_type: null, ibscbs_operation_indicator: null };
  it('indicador_operacao_ibscbs divergente responde 422', () => {
    const v = servicePatch.parse({ classificacao_ibscbs: { codigo_classificacao: '000001', indicador_operacao: '100501' }, indicador_operacao_ibscbs: '100101' });
    try { serviceToDb(v, current); throw new Error('esperava 422'); } catch (e) { expect(e).toBeInstanceOf(ApiFailure); expect((e as ApiFailure).status).toBe(422); }
    expect(serviceToDb(servicePatch.parse({ classificacao_ibscbs: { codigo_classificacao: '000001', indicador_operacao: '100501' }, indicador_operacao_ibscbs: '100501' }), current)).toMatchObject({ ibscbs_classification: '000001', ibscbs_operation_indicator: '100501' });
    expect(serviceToDb(servicePatch.parse({ indicador_operacao_ibscbs: '100501' }), current)).toMatchObject({ ibscbs_operation_indicator: '100501' });
  });
  it('saída: classificacao_ibscbs com situação e campo antigo espelhado', () => {
    const out = serviceOut({ id: 'i', external_id: null, name: 'S', active: true, service_code: '010501', municipal_tax_code: null, nbs_code: '111032100', default_description: '', iss_taxation: 1, immunity_type: null, iss_withholding: 1, ibscbs_operation_indicator: '100501', municipal_benefit_number: null, ibscbs_classification: '000001', ibscbs_final_consumer: false, simples_activity_code: null, ibscbs_classifications: integral, ibscbs_operation_indicators: { code: '100501', active: true } });
    expect(out.classificacao_ibscbs).toMatchObject({ codigo_classificacao: '000001', cst: '000', situacao: 'completa' }); expect(out.indicador_operacao_ibscbs).toBe('100501');
  });
  it('regime_apuracao_ibscbs: mapeado, validado e devolvido', () => {
    const ids = { company_id: '10000000-0000-4000-8000-000000000001', organization_id: '20000000-0000-4000-8000-000000000001' };
    const body = (r: string) => fiscalIn.parse({ simples_nacional: 'me_epp', regime_apuracao_simples: 'iss_fora_do_simples', regime_especial: 'nenhum', tributos_aproximados: { modo: 'percentual_simples', percentual_simples: '6.00' }, regime_apuracao_ibscbs: r });
    const row = fiscalToDb(body('cbs_simples_ibs_regular'), ids, 1); expect(row.ibscbs_simples_regime).toBe(2);
    expect(fiscalOut({ ...row, dps_series: 1 }).regime_apuracao_ibscbs).toBe('cbs_simples_ibs_regular');
    expect(() => fiscalToDb(body('pelo_simples'), ids, 1)).toThrow(ApiFailure);
  });
});

describe('Rejeições do governo traduzidas', () => {
  it('E0855 e município do tomador (EXXX pelo texto oficial)', () => {
    const e = governmentErrors({ corpo_json: { erros: [{ codigo: 'E0855', descricao: 'É obrigatório declarar informações de IBS/CBS…' }, { codigo: 'EXXX', descricao: 'O código do município informado na DPS para o endereço do tomador do serviço, identificado pelo CNPJ, não corresponde ao município registrado em seus cadastros na data de competência informada na DPS.' }] } }, 'n');
    expect(e[0]!.mensagem).toMatch(/E0855/); expect(e[1]).toMatchObject({ campo: 'tomador.endereco.codigo_municipio', mensagem: TAKER_MUNICIPALITY_REJECTION });
  });
});

const nfseIbs = (classPath: 'nt009' | 'old') => danfseFixture().replace('<DPS versao', '<IBSCBS><cLocalidadeIncid>4212254</cLocalidadeIncid><xLocalidadeIncid>Passo de Torres</xLocalidadeIncid><valores><vBC>249.90</vBC><vCalcAjusteBCIBSCBS>1.10</vCalcAjusteBCIBSCBS><uf><pIBSUF>0.10</pIBSUF><pAliqEfetUF>0.10</pAliqEfetUF></uf><mun><pIBSMun>0.00</pIBSMun><pAliqEfetMun>0.00</pAliqEfetMun></mun><fed><pCBS>0.90</pCBS><pAliqEfetCBS>0.90</pAliqEfetCBS></fed></valores><totCIBS><vTotNF>252.40</vTotNF><gIBS><vIBSTot>0.25</vIBSTot><gIBSUFTot><vIBSUF>0.25</vIBSUF></gIBSUFTot><gIBSMunTot><vIBSMun>0.00</vIBSMun></gIBSMunTot></gIBS><gCBS><vCBS>2.25</vCBS></gCBS></totCIBS></IBSCBS><DPS versao')
  .replace('</valores></infDPS>', classPath === 'nt009' ? '</valores><IBSCBS><cIndOp>100501</cIndOp><indDest>0</indDest><valores><trib><CST>000</CST><cClassTrib>000001</cClassTrib><gIBSCBS/></trib></valores></IBSCBS></infDPS>' : '</valores><IBSCBS><finNFSe>0</finNFSe><cIndOp>100501</cIndOp><indDest>0</indDest><valores><trib><gIBSCBS><CST>000</CST><cClassTrib>000001</cClassTrib></gIBSCBS></trib></valores></IBSCBS></infDPS>');

describe('Leitura e DANFSe', () => {
  it('ibs_cbs lido nos dois formatos, null sem o grupo', () => {
    for (const f of ['nt009', 'old'] as const) {
      const v = ibsCbsValuesOf(parseDanfse(nfseIbs(f)));
      expect(v).toMatchObject({ classificacao: { cst: '000', codigo: '000001' }, indicador_operacao: '100501', base_calculo: '249.90', ibs_uf: { valor: '0.25' }, cbs: { valor: '2.25' }, valor_total_ibs: '0.25', valor_total_ibs_cbs: '2.50', valor_total_nota: '252.40' });
    }
    expect(ibsCbsValuesOf(parseDanfse(danfseFixture()))).toBeNull();
    expect(readNfse(nfseIbs('nt009'))?.summary['ibs_cbs']).toMatchObject({ valor_total_ibs_cbs: '2.50' });
  });
  it('Exclusões e reduções = vDescIncond + ajuste + vISSQN + vPis + vCofins; soma exata em centavos', () => {
    const xml = nfseIbs('nt009').replace('<vServ>249.90</vServ></vServPrest>', '<vServ>249.90</vServ></vServPrest><vDescCondIncond><vDescIncond>10.00</vDescIncond></vDescCondIncond>').replace('<valores><vLiq>', '<valores><vISSQN>5.00</vISSQN><vLiq>');
    expect(ibsCbsExclusionsOf(parseDanfse(xml))).toBe('16.10'); expect(addDecimals('0.10', '0.20')).toBe('0.30');
  });
  it('DANFSe mostra o Total do IBS/CBS (vIBSTot + vCBS) e mantém o bloco com "-" sem o grupo', async () => {
    const text = async (x: string) => { const d = mkdtempSync(join(tmpdir(), 'danfse-ibs-')); try { const p = join(d, 'n.pdf'); writeFileSync(p, await generateDanfse(x, 'authorized')); return execFileSync('pdftotext', ['-raw', p, '-'], { encoding: 'utf8' }); } finally { rmSync(d, { recursive: true, force: true }); } };
    const withGroup = await text(nfseIbs('nt009')); expect(withGroup).toMatch(/R\$ 2,50/); expect(withGroup).toMatch(/R\$ 252,40/);
    const without = await text(danfseFixture()); expect(without).toMatch(/TRIBUTAÇÃO IBS\/CBS/);
  });
});

describe('Sugestão da tabela de correlação (Anexo VIII), nunca automática', () => {
  const catalogs = { classifications: new Map([['000001', integral], ['410999', exempt]]), indicators: new Map([['100501', { code: '100501', active: true }], ['030103', { code: '030103', active: false }]]), nbs: new Set(['111032100']) };
  it('01.05: NBS, classificação, indicador e atividade aplicáveis; alternativas listadas', () => {
    expect(serviceItemOf('010501')).toBe('01.05'); expect(serviceItemOf('990401')).toBe('99.04.01');
    const s = buildSuggestion('010501', { service_item: '01.05', simples_activity: '09', nbs: [{ code: '111032100', formatted_code: '1.1103.21.00' }, { code: '111032200', formatted_code: '1.1103.22.00' }], operation_indicators: [{ code: '100501' }], classifications: [{ code: '000001' }] }, catalogs);
    expect(s).toMatchObject({ nbs: { codigo: '111032100', aplicavel: true }, classificacao: { codigo: '000001', aplicavel: true }, indicador_operacao: { codigo: '100501', aplicavel: true }, atividade_simples: { codigo: '09', aplicavel: true }, alternativas: { nbs: ['111032200'] } });
  });
  it('valores não aceitos, inativos ou impeditivos vêm marcados como não aplicáveis', () => {
    const s = buildSuggestion('990401', { service_item: '99.04.01', simples_activity: 'IMP', nbs: [], operation_indicators: [{ code: '030103' }], classifications: [{ code: '000001' }, { code: '999999' }] }, catalogs);
    expect(s.classificacao).toMatchObject({ aplicavel: false, motivo: IBSCBS_MESSAGES.realEstate }); expect(s.indicador_operacao).toMatchObject({ aplicavel: false }); expect(s.atividade_simples).toMatchObject({ aplicavel: false }); expect(s.aviso).toMatch(/impeditiva/);
  });
});
