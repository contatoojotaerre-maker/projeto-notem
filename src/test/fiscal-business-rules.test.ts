import { describe, it, expect, vi } from 'vitest';
import { fiscalSchema, approximateTaxRuleError, chooseSimples } from '../lib/fiscal';
import { ApiFailure, fiscalIn, fiscalToDb, fiscalDbDetail, computeReadiness } from '../lib/api-contract';
import { buildDps, reserveValidatedDps, validateDpsBeforeNumbering } from '../lib/dps';
import { fixture } from './dps-fixtures';

const ids={company_id:'10000000-0000-4000-8000-000000000001',organization_id:'20000000-0000-4000-8000-000000000001'};
const options=[1,2,3] as const;
const modes=['percent_by_sphere','percent_simples','none'] as const;
const allowed={1:['percent_by_sphere'],2:['percent_by_sphere','none'],3:['percent_by_sphere','percent_simples']};
function settings(option:number,mode:typeof modes[number]) {
 return {...ids,simples_nacional_option:option,simples_nacional_regime:option===3?1:null,special_tax_regime:0,dps_series:1,approx_taxes_mode:mode,approx_simples_percent:mode==='percent_simples'?6:null,approx_federal_percent:mode==='percent_by_sphere'?10:null,approx_state_percent:mode==='percent_by_sphere'?0:null,approx_municipal_percent:mode==='percent_by_sphere'?2:null,simples_iss_withholding_percent:null};
}
describe('Matriz oficial E0710/E0712/E0713',()=>{
 for(const option of options) for(const mode of modes) it(`situação ${option}, modo ${mode}: tela/API/DPS`,()=>{
  const valid=allowed[option].includes(mode);
  expect(fiscalSchema.safeParse(settings(option,mode)).success).toBe(valid);
  const dto=fiscalIn.parse({simples_nacional:option===1?'nao_optante':option===2?'mei':'me_epp',regime_apuracao_simples:option===3?'dentro_do_simples':null,regime_especial:'nenhum',tributos_aproximados:mode==='percent_by_sphere'?{modo:'percentual_por_esfera',federal:'10.00',estadual:'0.00',municipal:'2.00'}:mode==='percent_simples'?{modo:'percentual_simples',percentual_simples:'6.00'}:{modo:'nao_informar'}});
  const v=fixture();v.fiscal.simples=option;v.fiscal.regime=option===3?1:null;v.fiscal.approximate=mode==='percent_by_sphere'?{mode,federal:'10.00',state:'0.00',municipal:'2.00'}:mode==='percent_simples'?{mode,simples:'6.00'}:{mode};
  if(valid){expect(fiscalToDb(dto,ids,1).approx_taxes_mode).toBe(mode);const xml=buildDps(v).xml;expect(xml).toContain(mode==='percent_by_sphere'?'<pTotTrib>':mode==='percent_simples'?'<pTotTribSN>6.00</pTotTribSN>':'<indTotTrib>0</indTotTrib>');}
  else {expect(()=>buildDps(v)).toThrow(approximateTaxRuleError(option,mode)??'');try{fiscalToDb(dto,ids,1);throw new Error('aceitou');}catch(e){expect(e).toBeInstanceOf(ApiFailure);if(e instanceof ApiFailure){expect(e.status).toBe(422);expect(e.details[0]?.campo).toBe('tributos_aproximados.modo');expect(e.details[0]?.mensagem).toBe(approximateTaxRuleError(option,mode));}}}
 });
 for(const [option,mode,rule] of [[1,'none','E0713'],[2,'percent_simples','E0710'],[3,'none','E0712']] as const) it(`legado ${rule}: incompleto sem alteração, reserva não chamada`,async()=>{
  const s=settings(option,mode);const original=JSON.stringify(s);
  const readiness=computeReadiness('sandbox',{company:{active:true,cnpj:'11222333000181'},certificates:[],services:[{active:true}],settings:s,lastQuery:null});
  expect(readiness.pronta_para_emitir).toBe(false);expect(readiness.pendencias).toContain('configuracao_fiscal');expect(readiness.itens.find(x=>x.item==='configuracao_fiscal')?.mensagem).toContain(rule);expect(JSON.stringify(s)).toBe(original);
  const v=fixture();v.fiscal.simples=option;v.fiscal.regime=option===3?1:null;v.fiscal.approximate={mode};const reserve=vi.fn(async()=> '9');await expect(reserveValidatedDps(v,reserve)).rejects.toThrow(rule);expect(reserve).not.toHaveBeenCalled();
  expect(fiscalDbDetail({code:'P0001',message:approximateTaxRuleError(option,mode)??''})?.campo).toBe('tributos_aproximados.modo');
 });
 it('seleção de situação nunca sugere modo proibido',()=>{for(const option of options) for(const mode of modes){const s=fiscalSchema.parse(settings(3,'percent_by_sphere'));const next=chooseSimples({...s,approx_taxes_mode:mode},option);expect(allowed[option].includes(next.approx_taxes_mode)).toBe(true);}});
 for(const key of ['federal','state','municipal'] as const) it(`por esfera exige ${key} mesmo com zero aceito`,()=>{const v=fixture();v.fiscal.approximate={mode:'percent_by_sphere',federal:'0.00',state:'0.00',municipal:'0.00'};expect(buildDps(v).xml).toContain('<pTotTrib>');v.fiscal.approximate[key]=null;expect(()=>buildDps(v)).toThrow('três percentuais');});
});
describe('Descontos E0431/E0432',()=>{
 it('ausentes ou ambos zero omitem o grupo inteiro',()=>{for(const values of [{service:'150.00'},{service:'150.00',unconditional:'0.00',conditional:'0.00'}])expect(buildDps({...fixture(),values}).xml).not.toContain('vDescCondIncond');});
 it('incondicionado positivo e condicionado zero',()=>{const xml=buildDps({...fixture(),values:{service:'150.00',unconditional:'10.00',conditional:'0.00'}}).xml;expect(xml).toContain('<vDescCondIncond><vDescIncond>10.00</vDescIncond></vDescCondIncond>');expect(xml).not.toContain('<vDescCond>');});
 it('condicionado positivo e incondicionado zero',()=>{const xml=buildDps({...fixture(),values:{service:'150.00',unconditional:'0.00',conditional:'5.00'}}).xml;expect(xml).toContain('<vDescCondIncond><vDescCond>5.00</vDescCond></vDescCondIncond>');expect(xml).not.toContain('<vDescIncond>');});
 it('ambos positivos são enviados, negativos são recusados',()=>{const v=fixture();v.values={service:'150.00',unconditional:'10.00',conditional:'5.00'};expect(buildDps(v).xml).toContain('<vDescIncond>10.00</vDescIncond><vDescCond>5.00</vDescCond>');v.values.unconditional='-1.00';expect(()=>buildDps(v)).toThrow();});
});
describe('E0202 antes de numerar',()=>{
 for(const [tipo,doc] of [['pj','11222333000181'],['pf','52998224725']] as const) it(`documento igual: ${tipo}, reserva nunca chamada`,async()=>{const v=fixture();v.provider.cnpj=doc;v.customer={tipo,documento:doc,nome:'Mesmo emitente'};const reserve=vi.fn(async()=> '1');expect(()=>validateDpsBeforeNumbering(v)).toThrow('O tomador não pode ser a própria empresa emitente');await expect(reserveValidatedDps(v,reserve)).rejects.toThrow('O tomador não pode ser a própria empresa emitente');expect(reserve).not.toHaveBeenCalled();});
 it('tomador distinto permite uma reserva e retorna o número real',async()=>{const reserve=vi.fn(async()=> '57');expect(await reserveValidatedDps(fixture(),reserve)).toBe('57');expect(reserve).toHaveBeenCalledTimes(1);});
});