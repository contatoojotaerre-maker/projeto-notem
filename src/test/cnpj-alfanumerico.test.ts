// Fase C Parte 2: alphanumeric CNPJ (12 positions [0-9A-Z] + 2 numeric check digits, character value = ASCII - 48).
import { describe, it, expect } from 'vitest';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { companySchema, formatCnpj, isAlphanumericCnpj, isValidCnpj, normalizeCnpj } from '../lib/notem';
import { customerSchema } from '../lib/customers';
import { companyCreate, companyIn } from '../lib/api-contract';
import { buildDps, dpsIdentifier } from '../lib/dps';
import { ALPHANUMERIC_CNPJ_CONVERSION_ERROR, convertDpsLayout } from '../lib/dps-layout';
import { accessKeyIssuer, buildFiscalEvent, eventRequestId } from '../lib/fiscal-events';
import { ACCESS_KEY_PATTERN, OFFICIAL_TSCHAVE_PATTERN, isAccessKey, keyHitsSchemaDefect } from '../lib/fiscal-ids';
import { ALPHANUMERIC_KEY_SCHEMA_MESSAGE, explainKeySchemaDefect } from '../lib/invoices';
import { readEvent, readNfse } from '../lib/adn-xml';
import { readAuthorizedNfse } from '../lib/nfse-xml';
import { mask, parseDanfse, publicNfseUrl } from '../lib/danfse';
import { danfseFixture } from './danfse-fixtures';
import { fixture } from './dps-fixtures';
import { eventFixture } from './fiscal-event-fixtures';

const OFFICIAL = '12ABC34501DE35'; // official example of the Receita Federal
const TAKER = 'A1B2C3D4E5F668';
/** Key of OFFICIAL in 4212254 (CNPJ at positions 10–23; letter at position 21 hits the TSChaveNFSe defect). */
const key = '4212254' + '2' + '2' + OFFICIAL + '0000000000001' + '2611' + '123456789' + '0';
const run = (args: string[]) => execFileSync('python3', ['src/test/validate-dps-xsd.py', '--layout=nt009r1', ...args], { encoding: 'utf8', stdio: 'pipe' });
function withFiles<T>(docs: Record<string, string>, fn: (paths: string[]) => T): T {
  const folder = mkdtempSync(join(tmpdir(), 'cnpj-alfa-'));
  try { return fn(Object.entries(docs).map(([n, x]) => { const p = join(folder, `${n}.xml`); writeFileSync(p, x); return p; })); }
  finally { rmSync(folder, { recursive: true, force: true }); }
}
function alphaInput() { const v = fixture(); v.provider.cnpj = OFFICIAL; v.customer = { ...v.customer!, tipo: 'pj', documento: TAKER }; return v; }

describe('Dígito verificador do CNPJ alfanumérico', () => {
  it('aceita o exemplo oficial 12ABC34501DE35 e o CNPJ numérico', () => {
    expect(isValidCnpj(OFFICIAL)).toBe(true); expect(isValidCnpj('11222333000181')).toBe(true); expect(isValidCnpj(TAKER)).toBe(true);
  });
  it('recusa DV trocado, letra no DV e caracteres repetidos', () => {
    expect(isValidCnpj('12ABC34501DE36')).toBe(false); expect(isValidCnpj('12ABC34501DE53')).toBe(false);
    expect(isValidCnpj('12ABC34501DEA5')).toBe(false); expect(isValidCnpj('AAAAAAAAAAAAAA')).toBe(false); expect(isValidCnpj('12ABC34501DE3')).toBe(false);
  });
  it('aceita máscara e minúsculas, normaliza para maiúsculas sem pontuação e exibe com máscara', () => {
    expect(normalizeCnpj('12.abc.345/01de-35')).toBe(OFFICIAL); expect(isValidCnpj('12.abc.345/01de-35')).toBe(true);
    expect(formatCnpj('12abc34501de35')).toBe('12.ABC.345/01DE-35'); expect(formatCnpj('11222333000181')).toBe('11.222.333/0001-81');
    expect(mask(OFFICIAL)).toBe('12.ABC.345/01DE-35'); expect(isAlphanumericCnpj(OFFICIAL)).toBe(true); expect(isAlphanumericCnpj('11222333000181')).toBe(false);
  });
});

describe('Cadastro com CNPJ alfanumérico', () => {
  it('painel: empresa grava o CNPJ normalizado', () => {
    const r = companySchema.safeParse({ organization_id: '00000000-0000-4000-8000-000000000001', cnpj: '12.abc.345/01de-35', legal_name: 'Empresa Alfa', trade_name: '', municipal_registration: '', email: '', phone: '', postal_code: '', street: '', number: '', complement: '', district: '', municipality_ibge_code: '4212254' });
    expect(r.success && r.data.cnpj).toBe(OFFICIAL);
  });
  it('API: aceita máscara e minúsculas e grava normalizado; recusa DV inválido', () => {
    const body = { cnpj: '12.abc.345/01de-35', razao_social: 'Empresa Alfa', endereco: { cep: '88980000', logradouro: 'Rua A', numero: '1', bairro: 'Centro', codigo_municipio: '4212254' } };
    const ok = companyCreate.parse(body); expect(companyIn(ok)['cnpj']).toBe(OFFICIAL);
    expect(companyCreate.safeParse({ ...body, cnpj: '12ABC34501DE36' }).success).toBe(false);
    expect(companyCreate.safeParse({ ...body, cnpj: '12ABC34501DE' }).success).toBe(false);
  });
  it('tomador PJ alfanumérico é normalizado; CPF continua só numérico', () => {
    expect(customerSchema.parse({ tipo: 'pj', documento: 'a1.b2c.3d4/e5f6-68', nome: 'Tomador Alfa' }).documento).toBe(TAKER);
    expect(customerSchema.safeParse({ tipo: 'pj', documento: 'A1B2C3D4E5F669', nome: 'Tomador Alfa' }).success).toBe(false);
    expect(customerSchema.safeParse({ tipo: 'pf', documento: '5299822472A', nome: 'Pessoa' }).success).toBe(false);
  });
});

describe('Emissão com CNPJ alfanumérico', () => {
  it('Id da DPS leva o CNPJ com letras e a DPS valida no XSD oficial do release 1', () => {
    expect(dpsIdentifier('4212254', OFFICIAL, 900, '1')).toBe(`DPS42122542${OFFICIAL}00900000000000000001`);
    const xml = buildDps(alphaInput(), 'nt009r1').xml;
    expect(xml).toContain(`<prest><CNPJ>${OFFICIAL}</CNPJ>`); expect(xml).toContain(`<toma><CNPJ>${TAKER}</CNPJ>`);
    expect(withFiles({ dps: xml }, p => run(p))).toContain('NT 009 release 1, oficial');
  });
  it('leiaute anterior: recusa antes da numeração (emitente ou tomador alfanumérico)', () => {
    expect(() => buildDps(alphaInput(), 'nt004')).toThrow(/CNPJ alfanumérico só pode ser usado em produção a partir da vigência da NT 009/);
    const taker = fixture(); taker.customer = { ...taker.customer!, documento: TAKER };
    expect(() => buildDps(taker, 'nt004')).toThrow(/vigência da NT 009/);
    expect(() => buildDps(fixture(), 'nt004')).not.toThrow();
  });
  it('conversão para o leiaute anterior é recusada; para a NT 009 continua permitida', () => {
    const xml = buildDps(alphaInput(), 'nt009r1').xml;
    expect(() => convertDpsLayout(xml, 'nt004')).toThrow(ALPHANUMERIC_CNPJ_CONVERSION_ERROR);
    expect(convertDpsLayout(buildDps(fixture(), 'nt004').xml, 'nt009r1')).toBe(buildDps(fixture(), 'nt009r1').xml);
  });
  it('tomador igual ao emitente é recusado também com letras e máscara', () => {
    const v = alphaInput(); v.customer = { ...v.customer!, documento: '12.abc.345/01de-35' };
    expect(() => buildDps(v, 'nt009r1')).toThrow(/própria empresa/);
  });
});

describe('Chave de acesso com letras', () => {
  it('estrutura 9 + 14 + 27: aceita letras somente nas posições do CNPJ', () => {
    expect(isAccessKey(key)).toBe(true); expect(ACCESS_KEY_PATTERN.test(key.slice(0, 20) + 'A' + key.slice(21))).toBe(true);
    expect(isAccessKey('A' + key.slice(1))).toBe(false); expect(isAccessKey(key.slice(0, 30) + 'A' + key.slice(31))).toBe(false); expect(isAccessKey(key.toLowerCase())).toBe(false);
    expect(accessKeyIssuer(key)).toEqual({ municipality: '4212254', inscriptionType: '2', inscription: OFFICIAL });
    expect(publicNfseUrl(key)).toContain(key);
  });
  it('defeito oficial: o TSChaveNFSe publicado recusa a chave do CNPJ oficial; a correção em memória aceita', () => {
    expect(OFFICIAL_TSCHAVE_PATTERN.test(key)).toBe(false); expect(keyHitsSchemaDefect(key)).toBe(true);
    const v = fixture(); v.provider.cnpj = OFFICIAL; v.number = '4'; v.substitution = { accessKey: key, reason: 'outros', justification: 'Correção da descrição do serviço prestado ao tomador.' };
    const dps = buildDps(v, 'nt009r1').xml;
    const event = buildFiscalEvent({ ...eventFixture(), accessKey: key, authorCnpj: OFFICIAL }).xml;
    withFiles({ dps }, p => { expect(() => run(p)).toThrow(); expect(run(['--chave-corrigida', ...p])).toContain('TSChaveNFSe corrigido somente em memória'); });
    withFiles({ event }, p => { expect(() => run(['--schema=pedRegEvento', ...p])).toThrow(); expect(run(['--schema=pedRegEvento', '--chave-corrigida', ...p])).toContain('corrigido'); });
    expect(eventRequestId(key, '101101')).toBe(`PRE${key}101101`);
  });
  it('recusa de esquema pelo governo vira mensagem clara só quando a chave atinge o defeito', () => {
    const errors = [{ campo: 'nota', mensagem: 'x', codigo_governo: 'E1235', mensagem_governo: 'Falha no esquema XML do DF-e.' }, { campo: 'nota', mensagem: 'y', codigo_governo: 'E0042', mensagem_governo: 'Outra' }];
    const out = explainKeySchemaDefect(errors, key, 'substituicao');
    expect(out[0]).toMatchObject({ campo: 'substituicao', mensagem: ALPHANUMERIC_KEY_SCHEMA_MESSAGE, mensagem_governo: 'Falha no esquema XML do DF-e.' });
    expect(out[1]?.mensagem).toBe('y');
    expect(explainKeySchemaDefect(errors, '4212254' + '2' + '2' + '11222333000181' + '0'.repeat(27), 'substituicao')[0]?.mensagem).toBe('x');
    expect(ALPHANUMERIC_KEY_SCHEMA_MESSAGE).toBe('O governo recusou a chave de acesso com CNPJ alfanumérico por um defeito conhecido no esquema oficial. Tente novamente mais tarde ou use o Portal Nacional.');
  });
  it('lê NFS-e autorizada, DANFSe, ADN e evento com chave e CNPJ alfanuméricos', () => {
    const xml = danfseFixture().replaceAll('63642453000131', OFFICIAL);
    const id = /Id="NFS([0-9A-Z]{50})"/.exec(xml)![1]!; expect(id).toMatch(/12ABC34501DE35/);
    expect(parseDanfse(xml)['@_Id']).toBe(`NFS${id}`);
    const n = readNfse(xml)!; expect(n.access_key).toBe(id); expect(n.provider_cnpj).toBe(OFFICIAL);
    const dpsId = /<infDPS Id="([^"]+)"/.exec(xml)![1]!;
    const environment = /<infDPS[^>]*><tpAmb>1</.test(xml) ? 'production' as const : 'sandbox' as const;
    expect(readAuthorizedNfse(xml, { dpsId, environment, cnpj: OFFICIAL }).accessKey).toBe(id);
    const ev = `<evento versao="1.01" xmlns="http://www.sped.fazenda.gov.br/nfse"><infEvento Id="EVT${key}101101001"><nSeqEvento>1</nSeqEvento><dhProc>2026-11-14T18:08:20-03:00</dhProc><pedRegEvento versao="1.01"><infPedReg Id="PRE${key}101101"><tpAmb>2</tpAmb><verAplic>x</verAplic><dhEvento>2026-11-14T18:08:00-03:00</dhEvento><CNPJAutor>${OFFICIAL}</CNPJAutor><chNFSe>${key}</chNFSe><e101101><xDesc>Cancelamento de NFS-e</xDesc><cMotivo>1</cMotivo><xMotivo>Erro na emissão da nota fiscal.</xMotivo></e101101></infPedReg></pedRegEvento></infEvento></evento>`;
    expect(readEvent(ev)).toMatchObject({ access_key: key, code: '101101', author_document: OFFICIAL });
  });
});
