import { z } from 'zod';
import { customerSchema, type Customer } from './customers';
import { isValidCnpj } from './notem';
import { RuleError } from './rule-error';
import { approximateTaxRuleError, specialTaxRuleError } from './fiscal';
import { FISCAL_TEXT_MESSAGE, fiscalTextAccepted } from './fiscal-text';
import { DPS_LAYOUTS, REGULAR_FIN_NFSE, orderCServ, type DpsLayout } from './dps-layout';
import { accessKeyIssuer, justificationError, substitutionReasons, type SubstitutionReason } from './fiscal-events';

export const fiscalDecimal = z.string().regex(/^\d{1,15}\.\d{2}$/, 'Use texto decimal com duas casas.');
export function decimalUnits(value: string) { return BigInt(fiscalDecimal.parse(value).replace('.', '')); }
const percent = (v: string) => { if (!/^\d{1,3}(\.\d{1,2})?$/.test(v)) throw new RuleError('Percentual inválido.'); const [a, b = ''] = v.split('.'); const units = BigInt(a ?? '0') * 100n + BigInt(b.padEnd(2, '0')); if (units > 10000n) throw new RuleError('Percentual deve ser de 0 a 100.'); return `${a}.${b.padEnd(2, '0')}`; };
export type DpsInput = {
  environment: 'sandbox' | 'production'; emittedAt: string; competence: string; series: number; number: string;
  provider: { cnpj: string; municipality: string; municipalRegistration?: string | null; phone?: string | null; email?: string | null };
  fiscal: { simples: 1 | 2 | 3; regime: 1 | 2 | 3 | null; special: number; approximate: { mode: 'percent_simples' | 'percent_by_sphere' | 'none'; simples?: string | null; federal?: string | null; state?: string | null; municipal?: string | null }; withheldRate?: string | null };
  service: { code: string; municipalCode?: string | null; nbs?: string | null; description: string; taxation: 1 | 2 | 3 | 4; immunity?: number | null; withholding: 1 | 2 | 3; municipality?: string | null };
  customer?: Customer | null; values: { service: string; unconditional?: string; conditional?: string }; complementary?: string | null;
  substitution?: { accessKey: string; reason: SubstitutionReason; justification: string } | null;
};
export function dpsIdentifier(municipality: string, cnpj: string, series: number, number: string) {
  if (!/^\d{7}$/.test(municipality) || !/^\d{14}$/.test(cnpj) || !isValidCnpj(cnpj) || !Number.isInteger(series) || series < 1 || series > 49999 || !/^[1-9]\d{0,14}$/.test(number)) throw new RuleError('Identificador DPS inválido.');
  return `DPS${municipality}2${cnpj}${String(series).padStart(5, '0')}${number.padStart(15, '0')}`;
}
const escape = (v: string | number) => String(v).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&apos;');
const tag = (n: string, v: string | number | null | undefined) => v === undefined || v === null || v === '' ? '' : `<${n}>${escape(v)}</${n}>`;
const group = (n: string, children: string) => `<${n}>${children}</${n}>`;
function customerXml(c: Customer) {
  const e = c.endereco; let address = '';
  if (e) {
    const location = c.tipo === 'estrangeiro' ? group('endExt', tag('cPais', e.pais) + tag('cEndPost', e.codigo_postal) + tag('xCidade', e.cidade) + tag('xEstProvReg', e.estado_provincia_regiao)) : group('endNac', tag('cMun', e.codigo_municipio) + tag('CEP', e.cep));
    address = group('end', location + tag('xLgr', e.logradouro || e.endereco_livre) + tag('nro', e.numero) + tag('xCpl', e.complemento) + tag('xBairro', e.bairro));
  }
  const document = c.tipo === 'pj' ? tag('CNPJ', c.documento) : c.tipo === 'pf' ? tag('CPF', c.documento) : c.nif ? tag('NIF', c.nif) : tag('cNaoNIF', c.motivo_sem_nif === 'dispensado' ? 1 : 2);
  return group('toma', document + tag('IM', c.inscricao_municipal) + tag('xNome', c.nome) + address + tag('fone', c.telefone) + tag('email', c.email));
}
/** Builds the DPS in the given layout profile (see dps-layout.ts); the layout is always explicit. */
export function buildDps(input: DpsInput, layout: DpsLayout) {
  if (!DPS_LAYOUTS[layout]) throw new RuleError('Leiaute da DPS inválido.');
  validateDpsBeforeNumbering(input);
  const { provider: p, fiscal: f, service: s } = input;
  const id = dpsIdentifier(p.municipality, p.cnpj, input.series, input.number);
  if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}-03:00$/.test(input.emittedAt) || !Number.isFinite(Date.parse(input.emittedAt)) || !/^\d{4}-\d{2}-\d{2}$/.test(input.competence) || !Number.isFinite(Date.parse(input.competence)) || input.competence > input.emittedAt.slice(0, 10)) throw new RuleError('Competência ou data de emissão inválida.');
  if (!/^\d{6}$/.test(s.code) || (s.nbs && !/^\d{9}$/.test(s.nbs)) || (s.municipalCode && !/^\d{3}$/.test(s.municipalCode)) || !s.description.trim() || s.description.length > 2000 || (input.complementary?.length ?? 0) > 2000) throw new RuleError('Dados do serviço inválidos para a DPS.');
  if ((f.simples === 3) !== (f.regime !== null) || ![0, 1, 2, 3, 4, 5, 6, 9].includes(f.special)) throw new RuleError('Regime fiscal inválido.');
  if (s.taxation === 3) throw new RuleError('Exportação exige dados fiscais de comércio exterior não contemplados na E1.');
  if ((s.taxation === 2) !== (s.immunity !== undefined && s.immunity !== null)) throw new RuleError('Confira o tipo de imunidade.');
  const serviceValue = decimalUnits(input.values.service); const unconditional = input.values.unconditional ?? '0.00'; const conditional = input.values.conditional ?? '0.00';
  if (serviceValue <= 0n || decimalUnits(unconditional) + decimalUnits(conditional) > serviceValue) throw new RuleError('Serviço deve ser positivo e descontos não podem superar seu valor.');
  const rateRequired = f.simples === 3 && f.regime === 1 && s.withholding !== 1;
  let rate = ''; if (rateRequired) { if (!f.withheldRate) throw new RuleError('Informe alíquota do ISS para ME/EPP com retenção (E0621).'); const v = percent(f.withheldRate); if (Number(v) < 1.8 || Number(v) > 9.99) throw new RuleError('Alíquota deve estar entre 1,80 e 9,99.'); rate = tag('pAliq', v); }
  const a = f.approximate; let approximate = '';

  if (a.mode === 'percent_simples') { if (!a.simples || a.federal != null || a.state != null || a.municipal != null) throw new RuleError('Confira o percentual do Simples.'); approximate = tag('pTotTribSN', percent(a.simples)); }
  else if (a.mode === 'percent_by_sphere') { if (a.simples != null || a.federal == null || a.state == null || a.municipal == null) throw new RuleError('Informe os três percentuais por esfera.'); approximate = group('pTotTrib', tag('pTotTribFed', percent(a.federal)) + tag('pTotTribEst', percent(a.state)) + tag('pTotTribMun', percent(a.municipal))); }
  else { if ([a.simples, a.federal, a.state, a.municipal].some(v => v != null)) throw new RuleError('Não informar não aceita percentuais.'); approximate = tag('indTotTrib', 0); }
  const customer = input.customer ? customerXml(customerSchema.parse(input.customer)) : '';
  const prest = group('prest', tag('CNPJ', p.cnpj) + tag('IM', p.municipalRegistration) + tag('fone', p.phone) + tag('email', p.email) + group('regTrib', tag('opSimpNac', f.simples) + (f.simples === 3 ? tag('regApTribSN', f.regime) : '') + tag('regEspTrib', f.special)));
  const service = group('serv', group('locPrest', tag('cLocPrestacao', s.municipality || p.municipality)) + group('cServ', orderCServ({ cTribNac: tag('cTribNac', s.code), cTribMun: tag('cTribMun', s.municipalCode), cNBS: tag('cNBS', s.nbs), xDescServ: tag('xDescServ', s.description) }, layout)) + (input.complementary ? group('infoCompl', tag('xInfComp', input.complementary)) : ''));
  // E0431/E0432: only strictly positive discounts may be informed.
  const discounts=(decimalUnits(unconditional)>0n?tag('vDescIncond',unconditional):'')+(decimalUnits(conditional)>0n?tag('vDescCond',conditional):'');
  const values = group('valores', group('vServPrest', tag('vServ', input.values.service)) + (discounts?group('vDescCondIncond',discounts):'') + group('trib', group('tribMun', tag('tribISSQN', s.taxation) + tag('tpImunidade', s.immunity) + tag('tpRetISSQN', s.withholding) + rate) + group('totTrib', approximate)));
  const substitution = input.substitution ? substitutionXml(input.substitution, p) : '';
  const body = tag('tpAmb', input.environment === 'production' ? 1 : 2) + tag('dhEmi', input.emittedAt) + tag('verAplic', 'notem-1.0') + tag('serie', input.series) + tag('nDPS', input.number) + tag('dCompet', input.competence) + tag('tpEmit', 1) + (DPS_LAYOUTS[layout].finNFSe ? tag('finNFSe', REGULAR_FIN_NFSE) : '') + tag('cLocEmi', p.municipality) + substitution + prest + customer + service + values;
  // Final guard: TSString accepts only U+0020–U+00FF; only xDescServ may carry line breaks.
  if (!fiscalTextAccepted(body.replace(/<xDescServ>[^<]*<\/xDescServ>/, m => m.replace(/\n/g, ' ')))) throw new RuleError(`Texto da DPS ${FISCAL_TEXT_MESSAGE}.`);
  return { id, xml: `<?xml version="1.0" encoding="UTF-8"?><DPS xmlns="http://www.sped.fazenda.gov.br/nfse" versao="1.01"><infDPS Id="${id}">${body}</infDPS></DPS>` };
}
/** E0042: the replaced key must carry the same municipality, CNPJ type (2) and CNPJ as this DPS. */
function substitutionXml(v: NonNullable<DpsInput['substitution']>, p: DpsInput['provider']) {
  const issuer = accessKeyIssuer(v.accessKey);
  if (!issuer || issuer.municipality !== p.municipality || issuer.inscriptionType !== '2' || issuer.inscription !== p.cnpj) throw new RuleError('A nota substituída deve ser da mesma empresa e do mesmo município emissor (E0042).');
  const reason = substitutionReasons[v.reason]; if (!reason) throw new RuleError('Motivo da substituição inválido.');
  const error = justificationError(v.justification); if (error) throw new RuleError(error);
  return group('subst', tag('chSubstda', v.accessKey) + tag('cMotivo', reason) + tag('xMotivo', v.justification));
}
/** Mandatory preflight before definitive numbering; Part 3 must use this boundary. */
export function validateDpsBeforeNumbering(input: Pick<DpsInput,'provider'|'customer'|'fiscal'> & {service?:DpsInput['service']}): void {
 const c=input.customer;
 if(c&&(c.tipo==='pj'||c.tipo==='pf')&&c.documento?.replace(/\D/g,'')===input.provider.cnpj.replace(/\D/g,'')) throw new RuleError('O tomador não pode ser a própria empresa emitente');
 const error=approximateTaxRuleError(input.fiscal.simples,input.fiscal.approximate.mode);
 if(error) throw new RuleError(error);
 const special=specialTaxRuleError(input.fiscal.simples,input.fiscal.regime,input.fiscal.special,input.service?.taxation);
 if(special)throw new RuleError(special);
 if(input.service?.withholding===2){
  if(!c||(c.tipo!=='pj'&&c.tipo!=='pf')||!c.documento)throw new RuleError('ISS retido pelo tomador exige CPF ou CNPJ identificado (E0204).');
  const e=c.endereco;
  if(!e||!e.cep||!e.codigo_municipio||!e.logradouro?.trim()||!e.numero?.trim()||!e.bairro?.trim()||e.pais)throw new RuleError('ISS retido pelo tomador exige endereço nacional completo (E0237).');
 }
}
/** Full assembly preflight with a placeholder: rejection never calls the number allocator. */
export async function reserveValidatedDps(input: Omit<DpsInput,'number'>, layout: DpsLayout, reserve:()=>Promise<string>) {
 buildDps({...input,number:'1'},layout);
 return reserve();
}
