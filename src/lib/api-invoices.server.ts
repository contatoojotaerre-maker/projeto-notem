import { ruleMessage } from './rule-error';
import type { Json } from '@/integrations/supabase/types';
import { type ApiCtx,type ApiResult } from './api.server';
import { z } from 'zod';
import { ApiFailure,bodyHash,dateRange,MAX_SEARCH,fail,idempotencyKey,page,pageParams,parseBody,pct,withholdingMap,type Detail,type Env } from './api-contract';
import { invoiceRequest,invoiceOut,replayDecision,invoiceStatuses,rejectionGuidance,type Invoice,type InvoiceRequest } from './invoices';
import { justificationError,substitutionReasons,type SubstitutionReason } from './fiscal-events';
import { FISCAL_TEXT_MESSAGE,fiscalTextAccepted,normalizeCustomerText,normalizeFields,normalizeFiscalText } from './fiscal-text';
import { buildDps,dpsInputHasAlphanumericCnpj,reserveValidatedDps,type DpsInput } from './dps';
import { ALPHANUMERIC_CNPJ_LAYOUT_MESSAGE,DPS_LAYOUTS } from './dps-layout';
import type { DpsLayout } from './dps-layout';
import { customerSchema,type Customer } from './customers';
import { fiscalSchema } from './fiscal';
import { loadReadiness } from './readiness.server';
import { sendInvoice } from './invoices.server';
import { pdfStatuses } from './danfse';
import { generateDanfse } from './danfse.server';
import { isAlphanumericCnpj,normalizeCnpj } from './notem';
import { ibsCbsForDps } from './ibscbs';
const PROFILE_SELECT='*, ibscbs_classifications(*), ibscbs_operation_indicators(code,active,incidence_location)';

export function invoiceResponse(i:Invoice):ApiResult{
 if(i.status==='authorized')return {status:201,body:invoiceOut(i)};
 if(i.status==='rejected')throw new ApiFailure(422,'REJEITADO_GOVERNO','O governo rejeitou a nota. Confira os motivos.',Array.isArray(i.government_errors)?i.government_errors as unknown as ApiFailure['details']:[]);
 if(i.status==='processing'&&i.dispatch_state==='not_sent')throw fail(503,'GOVERNO_INDISPONIVEL',[], 'Envio não realizado. Tente novamente com a mesma Idempotency-Key.');
 return {status:202,body:invoiceOut(i)};
}
export type IssueCtx={db:ApiCtx['db'];organization_id:string;env:Env;integration_id:string|null;origin:'api'|'panel';actor:string;request?:Request;setCompany:(id:string|null)=>void};
export const apiIssueCtx=(ctx:ApiCtx):IssueCtx=>({db:ctx.db,organization_id:ctx.organization_id,env:ctx.env,integration_id:ctx.integration_id,origin:'api',actor:ctx.actor,request:ctx.request,setCompany:ctx.setCompany});
type Substitution={original:Invoice;reason:SubstitutionReason;justification:string};
/** Same Idempotency-Key always returns the same invoice; a different body is a conflict. */
export async function replayInvoice(c:IssueCtx,key:string,hash:string):Promise<ApiResult|null>{
 let q=c.db.from('invoices').select('*').eq('organization_id',c.organization_id).eq('environment',c.env).eq('idempotency_key',key);q=c.integration_id?q.eq('integration_id',c.integration_id):q.is('integration_id',null);
 const prior=await q.maybeSingle();if(prior.error)throw new Error('INVOICE_READ_FAILED');if(!prior.data)return null;
 c.setCompany(prior.data.company_id);const decision=replayDecision(prior.data,hash);if(decision==='conflict')throw fail(409,'IDEMPOTENCIA_CONFLITO');
 return invoiceResponse(decision==='send'?await sendInvoice(c.db,prior.data,c.request):prior.data);
}
/** Normalizes every DPS text field of a raw issuance body in place; returns fields with refused characters. */
export function normalizeInvoiceText(body:unknown):Detail[]{
 if(!body||typeof body!=='object'||Array.isArray(body))return [];const o=body as Record<string,unknown>;
 return [...normalizeFields(o,['descricao'],'',['descricao']),...normalizeFields(o,['informacoes_complementares','justificativa'],''),...normalizeCustomerText(o['tomador'],'tomador.')];
}
const conflictMessages:Record<string,string>={CONFLITO_SITUACAO:'Somente notas autorizadas podem ser substituídas.',CONFLITO_OPERACAO:'Há um pedido de cancelamento ou análise em andamento para esta nota.',CONFLITO_SUBSTITUICAO:'Já existe uma substituição em andamento para esta nota.'};
/** E0060 (não optante) and E0061 (MEI, ME/EPP): fields a substitute may not change. */
export function substitutionRuleError(simples:number,before:{competence:string;serviceCode:string|null;municipalCode:string|null;location:string|null;customerDocument:string|null;serviceValue:string|null},after:typeof before):Detail|null{
 const e60=rejectionGuidance['E0060']?.mensagem??'E0060',e61=rejectionGuidance['E0061']?.mensagem??'E0061';
 if(simples===1){
  if(after.competence!==before.competence)return {campo:'competencia',mensagem:e60};
  if(after.serviceCode!==before.serviceCode||(after.municipalCode??null)!==(before.municipalCode??null))return {campo:'servico_id',mensagem:e60};
  if(after.location!==before.location)return {campo:'local_prestacao.codigo_municipio',mensagem:e60};
  return null;
 }
 if(before.customerDocument&&after.customerDocument!==before.customerDocument)return {campo:'tomador.documento',mensagem:e61};
 if(after.competence!==before.competence)return {campo:'competencia',mensagem:e61};
 if(after.serviceValue!==before.serviceValue)return {campo:'valores.servico',mensagem:e61};
 return null;
}
const docOf=(c:unknown)=>{if(!c||typeof c!=='object')return null;const o=c as Record<string,unknown>;return (typeof o['documento']==='string'&&o['documento'])||(typeof o['nif']==='string'&&o['nif'])||null;};
export async function issueInvoice(ctx:IssueCtx,v:InvoiceRequest,key:string,hash:string,textIssues:Detail[],substitution?:Substitution):Promise<ApiResult>{
 let companyQuery=ctx.db.from('companies').select('*').eq('organization_id',ctx.organization_id);companyQuery=v.empresa_id?companyQuery.eq('id',v.empresa_id):companyQuery.eq('external_id',v.empresa_id_externo??'');const company=await companyQuery.maybeSingle();if(company.error)throw new Error('COMPANY_READ_FAILED');const c=company.data;if(!c)throw fail(404,'NAO_ENCONTRADO');ctx.setCompany(c.id);
 const [settings,profile]=await Promise.all([ctx.db.from('company_fiscal_settings').select('*').eq('company_id',c.id).eq('organization_id',ctx.organization_id).maybeSingle(),(v.servico_id?ctx.db.from('company_service_profiles').select(PROFILE_SELECT).eq('id',v.servico_id):ctx.db.from('company_service_profiles').select(PROFILE_SELECT).eq('external_id',v.servico_id_externo??'')).eq('company_id',c.id).eq('organization_id',ctx.organization_id).eq('active',true).maybeSingle()]);
 if(settings.error||profile.error)throw new Error('FISCAL_READ_FAILED');const f=settings.data;const {ibscbs_classifications:cls,ibscbs_operation_indicators:indicator,...s}=profile.data??({} as NonNullable<typeof profile.data>);if(!profile.data)throw fail(404,'NAO_ENCONTRADO',[], 'Serviço ativo não encontrado para esta empresa.');if(!s)throw fail(404,'NAO_ENCONTRADO',[], 'Serviço ativo não encontrado para esta empresa.');if(!f)throw fail(422,'EMPRESA_NAO_PRONTA',[{campo:'configuracao_fiscal',mensagem:'Configuração fiscal incompleta.'}]);
 const checked=fiscalSchema.safeParse(f);if(!checked.success)throw fail(422,'REGRA_DE_NEGOCIO',checked.error.issues.map(e=>({campo:e.path[0]==='special_tax_regime'?'configuracao_fiscal.regime_especial':'configuracao_fiscal.tributos_aproximados',mensagem:e.message})));
 let customer:Customer|null=v.tomador??null;const issues=[...textIssues];
 if(v.tomador_id||v.tomador_id_externo){let q=ctx.db.from('company_customers').select('customer_data').eq('company_id',c.id).eq('organization_id',ctx.organization_id);q=v.tomador_id?q.eq('id',v.tomador_id):q.eq('external_id',v.tomador_id_externo??'');const r=await q.maybeSingle();if(r.error)throw new Error('CUSTOMER_READ_FAILED');if(!r.data)throw fail(404,'NAO_ENCONTRADO');const stored=structuredClone(r.data.customer_data);issues.push(...normalizeCustomerText(stored,'tomador.'));customer=customerSchema.parse(stored);}
 const description=normalizeFiscalText(v.descricao??s.default_description,true);if(!v.descricao&&!fiscalTextAccepted(description,true))issues.push({campo:'descricao',mensagem:FISCAL_TEXT_MESSAGE});
 const complementary=v.informacoes_complementares==null?null:normalizeFiscalText(v.informacoes_complementares)||null;
 if(issues.length)throw fail(422,'REGRA_DE_NEGOCIO',issues.filter((x,i,a)=>a.findIndex(y=>y.campo===x.campo)===i));
 const emittedAt=new Date(Date.now()-3*3600_000).toISOString().replace(/\.\d{3}Z$/,'-03:00');
 const input:Omit<DpsInput,'number'>={environment:ctx.env,emittedAt,competence:v.competencia??emittedAt.slice(0,10),series:f.dps_series,provider:{cnpj:c.cnpj,municipality:c.municipality_ibge_code,municipalRegistration:c.municipal_registration||null,phone:c.phone||null,email:c.email||null},fiscal:{simples:f.simples_nacional_option as 1|2|3,regime:f.simples_nacional_regime as 1|2|3|null,ibsCbsRegime:f.ibscbs_simples_regime as 1|2|3|null,special:f.special_tax_regime,approximate:{mode:f.approx_taxes_mode as DpsInput['fiscal']['approximate']['mode'],simples:pct(f.approx_simples_percent),federal:pct(f.approx_federal_percent),state:pct(f.approx_state_percent),municipal:pct(f.approx_municipal_percent)},withheldRate:v.aliquota_iss_simples??pct(f.simples_iss_withholding_percent)},service:{code:s.service_code,municipalCode:s.municipal_tax_code,nbs:s.nbs_code,description,taxation:s.iss_taxation as 1|2|3|4,immunity:s.immunity_type,withholding:(v.retencao_iss?withholdingMap[v.retencao_iss]:s.iss_withholding) as 1|2|3,municipality:v.local_prestacao?.codigo_municipio??null,simplesActivity:f.simples_nacional_option===3?s.simples_activity_code:null},customer,values:{service:v.valores.servico,unconditional:v.valores.desconto_incondicionado??'0.00',conditional:v.valores.desconto_condicionado??'0.00'},complementary,...substitution?{substitution:{accessKey:substitution.original.access_key??'',reason:substitution.reason,justification:substitution.justification}}:{}};
 if(substitution){
  const o=substitution.original,os=(o.service_snapshot??{}) as Record<string,unknown>,loc=(o.service_location??{}) as Record<string,unknown>,sent=(o.sent_values??{}) as Record<string,unknown>;
  const rule=substitutionRuleError(input.fiscal.simples,{competence:o.competence,serviceCode:String(os['service_code']??''),municipalCode:(os['municipal_tax_code'] as string|null)??null,location:String(loc['codigo_municipio']??''),customerDocument:docOf(o.customer_snapshot),serviceValue:String(sent['servico']??'')},{competence:input.competence,serviceCode:s.service_code,municipalCode:s.municipal_tax_code,location:input.service.municipality??c.municipality_ibge_code,customerDocument:docOf(customer),serviceValue:input.values.service});
  if(rule)throw fail(422,'REGRA_DE_NEGOCIO',[rule]);
 }
 // Layout in force at request time for the preflight and base; it is decided again right before each send.
 let layout:DpsLayout,requiredFrom:string;try{const {currentDpsLayout,ibsCbsRequiredFrom}=await import('./platform-settings.server');layout=await currentDpsLayout(ctx.db,ctx.env);requiredFrom=await ibsCbsRequiredFrom(ctx.db,ctx.env);}catch{throw new Error('PLATFORM_SETTINGS_READ_FAILED');}
 // IBS/CBS: the group goes only from the obligation date of the environment; every rule is checked before numbering.
 const ibs=ibsCbsForDps({service_code:s.service_code,nbs_code:s.nbs_code,ibscbs_classification:s.ibscbs_classification,ibscbs_operation_indicator:s.ibscbs_operation_indicator,simples_activity_code:input.service.simplesActivity??null,ibscbs_final_consumer:s.ibscbs_final_consumer,classification:cls,indicator},input.competence,requiredFrom,DPS_LAYOUTS[layout].ibsCbs);
 if('error' in ibs)throw fail(422,'REGRA_DE_NEGOCIO',[{campo:ibs.field,mensagem:ibs.error}]);
 input.ibsCbs=ibs.value;
 // The previous layout only accepts numeric CNPJ: refuse before numbering, naming the configured NT 009 start.
 if(!DPS_LAYOUTS[layout].alphanumericCnpj&&dpsInputHasAlphanumericCnpj(input)){const {nt009ProductionStart}=await import('./platform-settings.server');let start:string;try{start=await nt009ProductionStart(ctx.db);}catch{throw new Error('PLATFORM_SETTINGS_READ_FAILED');}const day=new Date(Date.parse(start)-3*3600_000).toISOString().slice(0,10).split('-').reverse().join('/');throw fail(422,'REGRA_DE_NEGOCIO',[{campo:isAlphanumericCnpj(input.provider.cnpj)?'empresa.cnpj':'tomador.documento',mensagem:`${ALPHANUMERIC_CNPJ_LAYOUT_MESSAGE} (${day}).`}]);}
 try{buildDps({...input,number:'1'},layout);}catch(e){const message=ruleMessage(e,'Confira os dados fiscais da nota.');throw fail(422,'REGRA_DE_NEGOCIO',[{campo:/E0042/.test(message)?'substituicao':/E0322/.test(message)?'servico.codigo_nbs':/E0959|E0859|E0860/.test(message)?'servico.classificacao_ibscbs':/E0239|E0243/.test(message)?'tomador':/NT 009/.test(message)?'competencia':/atividade do Simples/.test(message)?'servico.atividade_simples':/E0202|própria/.test(message)?'tomador.documento':/E0204/.test(message)?'tomador.documento':/E0237/.test(message)?'tomador.endereco':/E017/.test(message)?'configuracao_fiscal.regime_especial':/E071/.test(message)?'configuracao_fiscal.tributos_aproximados':/justificativa/i.test(message)?'justificativa':'nota',mensagem:message}]);}
 for(const [table,,value,field] of [['municipalities','ibge_code',customer?.endereco?.codigo_municipio,'tomador.endereco.codigo_municipio'],['countries','iso2',customer?.endereco?.pais,'tomador.endereco.pais'],['municipalities','ibge_code',input.service.municipality,'local_prestacao.codigo_municipio']] as const){if(value){const found=table==='countries'?await ctx.db.from('countries').select('iso2').eq('iso2',value).maybeSingle():await ctx.db.from('municipalities').select('ibge_code').eq('ibge_code',value).maybeSingle();if(found.error)throw new Error('CATALOG_READ_FAILED');if(!found.data)throw fail(422,'REGRA_DE_NEGOCIO',[{campo:field,mensagem:'Código não encontrado no catálogo oficial.'}]);}}
 const {readiness}=await loadReadiness(ctx.db,c.id,ctx.env);if(!readiness.pronta_para_emitir)throw fail(422,'EMPRESA_NAO_PRONTA',readiness.itens.filter(i=>i.ok!==true).map(i=>({campo:i.item,mensagem:i.mensagem})));
 let created:Invoice|null=null;
 await reserveValidatedDps(input,layout,async()=>{
  const placeholder=buildDps({...input,number:'1'},layout);
  // Base DPS (number 1) goes to a private file before numbering; the RPC checks its SHA-256 and stores only the reference.
  let baseFile;try{const {putXml}=await import('./xml-files.server');baseFile=await putXml(ctx.db,ctx.env,'invoices','dps-base','unsigned_dps',placeholder.xml);}catch{throw new Error('INVOICE_CREATE_FAILED');}
  const r=await ctx.db.rpc('create_invoice_request',{_payload:{organization_id:ctx.organization_id,company_id:c.id,integration_id:ctx.integration_id,origin:ctx.origin,substitutes_invoice_id:substitution?.original.id??null,environment:ctx.env,external_id:v.id_externo??null,service_profile_id:s.id,profile_snapshot:s,provider_snapshot:c,fiscal_snapshot:f,service_snapshot:{...s,withholding:input.service.withholding},customer_snapshot:customer,dps_input:input,competence:input.competence,description:input.service.description,complementary_information:input.complementary??null,sent_values:{servico:input.values.service,desconto_incondicionado:input.values.unconditional??'0.00',desconto_condicionado:input.values.conditional??'0.00'},service_location:{codigo_municipio:input.service.municipality??c.municipality_ibge_code,municipio:null,uf:null},emitted_at:emittedAt,unsigned_dps_xml:placeholder.xml,unsigned_dps_file:baseFile,placeholder_id:placeholder.id,idempotency_key:key,request_hash:hash,created_by:ctx.actor} as Json});
  if(r.error){const m=r.error.message;if(m.includes('IDEMPOTENCIA_CONFLITO'))throw fail(409,'IDEMPOTENCIA_CONFLITO');const conflict=Object.keys(conflictMessages).find(k=>m.includes(k));if(conflict)throw fail(409,'CONFLITO',[],conflictMessages[conflict]);if(m.includes('NAO_ENCONTRADO'))throw fail(404,'NAO_ENCONTRADO');if(/Acesso não autorizado/.test(m))throw fail(403,'SEM_PERMISSAO');if(/E0042|E0065/.test(m))throw fail(422,'REGRA_DE_NEGOCIO',[{campo:'substituicao',mensagem:m}]);if(r.error.code==='23505')throw fail(409,'ID_EXTERNO_DUPLICADO');if(/E017|E020|E023|E071/.test(m))throw fail(422,'REGRA_DE_NEGOCIO',[{campo:/E017/.test(m)?'configuracao_fiscal.regime_especial':'nota',mensagem:m}]);if(/CONFIGURACAO_ALTERADA/.test(m))throw fail(409,'CONFLITO',[], 'A configuração mudou durante a emissão. Repita com a mesma chave.');throw new Error('INVOICE_CREATE_FAILED');}
  created=r.data;return String(r.data.dps_number);
 });
 if(!created)throw new Error('INVOICE_CREATE_FAILED');
 return invoiceResponse(await sendInvoice(ctx.db,created,ctx.request));
}
export async function createInvoice(ctx:ApiCtx):Promise<ApiResult>{
 const key=idempotencyKey(ctx.request.headers.get('Idempotency-Key'));if(!key)throw fail(400,'REQUISICAO_INVALIDA',[{campo:'Idempotency-Key',mensagem:'A chave é obrigatória para emitir notas.'}]);
 const hash=await bodyHash('POST','/api/v1/notas',JSON.stringify(ctx.body));const c=apiIssueCtx(ctx);
 const replay=await replayInvoice(c,key,hash);if(replay)return replay;
 const raw=structuredClone(ctx.body);const issues=normalizeInvoiceText(raw);const v=parseBody(invoiceRequest,raw);
 return issueInvoice(c,v,key,hash,issues);
}
const withholdingName:Record<number,'nao_retido'|'retido_tomador'|'retido_intermediario'>={1:'nao_retido',2:'retido_tomador',3:'retido_intermediario'};
const substitutionHead=z.object({motivo:z.enum(Object.keys(substitutionReasons) as [SubstitutionReason,...SubstitutionReason[]]),justificativa:z.string().max(2000)}).passthrough();
/** Builds the substitute request: omitted fields come from the original invoice. */
export function substitutionBody(original:Invoice,body:Record<string,unknown>){
 const has=(k:string)=>Object.prototype.hasOwnProperty.call(body,k);const os=(original.service_snapshot??{}) as Record<string,unknown>,loc=(original.service_location??{}) as Record<string,unknown>,sent=(original.sent_values??{}) as Record<string,unknown>;
 const {motivo:_m,justificativa:_j,empresa_id:_e,empresa_id_externo:_x,...rest}=body;
 const out:Record<string,unknown>={empresa_id:original.company_id,...rest};
 if(!has('servico_id')&&!has('servico_id_externo')){if(!original.service_profile_id)throw fail(422,'REGRA_DE_NEGOCIO',[{campo:'servico_id',mensagem:'Informe o serviço da nota substituta.'}]);out['servico_id']=original.service_profile_id;}
 if(!has('competencia'))out['competencia']=original.competence;
 if(!has('descricao'))out['descricao']=original.description;
 if(!has('tomador')&&!has('tomador_id')&&!has('tomador_id_externo')&&original.customer_snapshot)out['tomador']=structuredClone(original.customer_snapshot);
 if(!has('valores'))out['valores']={servico:String(sent['servico']??''),...Number(sent['desconto_incondicionado']??0)>0?{desconto_incondicionado:String(sent['desconto_incondicionado'])}:{},...Number(sent['desconto_condicionado']??0)>0?{desconto_condicionado:String(sent['desconto_condicionado'])}:{}};
 if(!has('retencao_iss')&&typeof os['withholding']==='number')out['retencao_iss']=withholdingName[os['withholding']];
 if(!has('local_prestacao')&&typeof loc['codigo_municipio']==='string')out['local_prestacao']={codigo_municipio:loc['codigo_municipio']};
 if(!has('informacoes_complementares')&&original.complementary_information)out['informacoes_complementares']=original.complementary_information;
 return out;
}
/** Substitution shares issuance: preflight before numbering, the original changes only when the substitute is authorized. */
export async function issueSubstitution(c:IssueCtx,original:Invoice,body:unknown,key:string,hash:string):Promise<ApiResult>{
 const replay=await replayInvoice(c,key,hash);if(replay)return replay;
 c.setCompany(original.company_id);
 if(original.status!=='authorized'||!original.access_key)throw fail(409,'CONFLITO',[],conflictMessages['CONFLITO_SITUACAO']);
 const head=parseBody(substitutionHead,body);const b=body as Record<string,unknown>;
 if((typeof b['empresa_id']==='string'&&b['empresa_id']!==original.company_id)||(typeof b['empresa_id_externo']==='string'))throw fail(422,'REGRA_DE_NEGOCIO',[{campo:'empresa_id',mensagem:'A nota substituta deve ser da mesma empresa da nota original (E0042).'}]);
 const justification=normalizeFiscalText(head.justificativa);if(!fiscalTextAccepted(justification))throw fail(422,'REGRA_DE_NEGOCIO',[{campo:'justificativa',mensagem:FISCAL_TEXT_MESSAGE}]);
 const lengthError=justificationError(justification);if(lengthError)throw fail(422,'REGRA_DE_NEGOCIO',[{campo:'justificativa',mensagem:lengthError}]);
 const raw=substitutionBody(original,structuredClone(b));const issues=normalizeInvoiceText(raw);const v=parseBody(invoiceRequest,raw);
 return issueInvoice(c,v,key,hash,issues,{original,reason:head.motivo,justification});
}
export async function substituteInvoice(ctx:ApiCtx):Promise<ApiResult>{
 const key=idempotencyKey(ctx.request.headers.get('Idempotency-Key'));if(!key)throw fail(400,'REQUISICAO_INVALIDA',[{campo:'Idempotency-Key',mensagem:'A chave é obrigatória para substituir notas.'}]);
 const original=await loadOwnInvoice(ctx);const hash=await bodyHash('POST',`/api/v1/notas/${original.id}/substituir`,JSON.stringify(ctx.body));
 return issueSubstitution(apiIssueCtx(ctx),original,ctx.body,key,hash);
}
async function fiscalEvent(ctx:ApiCtx,kind:'cancel'|'analysis'):Promise<ApiResult>{
 const key=idempotencyKey(ctx.request.headers.get('Idempotency-Key'));if(!key)throw fail(400,'REQUISICAO_INVALIDA',[{campo:'Idempotency-Key',mensagem:'A chave é obrigatória para este pedido.'}]);
 const original=await loadOwnInvoice(ctx);const hash=await bodyHash('POST',`/api/v1/notas/${original.id}/${kind==='cancel'?'cancelar':'solicitar-analise-cancelamento'}`,JSON.stringify(ctx.body));
 const {requestFiscalEvent,eventResponse}=await import('./fiscal-events.server');
 return eventResponse(await requestFiscalEvent({db:ctx.db,organization_id:ctx.organization_id,environment:ctx.env,invoice_id:original.id,integration_id:ctx.integration_id,origin:'api',actor:ctx.actor,kind,body:ctx.body,idempotency_key:key,request_hash:hash,request:ctx.request}));
}
export const cancelInvoice=(ctx:ApiCtx)=>fiscalEvent(ctx,'cancel');
export const requestCancellationAnalysis=(ctx:ApiCtx)=>fiscalEvent(ctx,'analysis');
export async function getInvoiceEventXml(ctx:ApiCtx):Promise<ApiResult>{
 const n=await loadNote(ctx);const code=ctx.params['codigo']??'';if(!/^\d{6}$/.test(code))throw fail(404,'NAO_ENCONTRADO');
 const {invoiceEventXml,documentEventXml}=await import('./notes.server');
 const xml=n.kind==='notem'?await invoiceEventXml(ctx.db,n.invoice,code):await documentEventXml(ctx.db,ctx.env,n.doc.access_key,code);
 if(!xml)throw fail(404,'NAO_ENCONTRADO',[], 'Evento não registrado para esta nota.');
 return {status:200,body:xml,headers:{'Content-Type':'application/xml; charset=utf-8','Content-Disposition':`attachment; filename="evento-${code}-${n.id}.xml"`}};
}
type Note={kind:'notem';id:string;invoice:Invoice}|{kind:'externa';id:string;doc:import('./nfse-documents').NfseDocument;companyId:string};
/** notem invoice of the organization, or a note issued outside notem by one of its companies (proof of possession). */
export async function loadNote(ctx:ApiCtx):Promise<Note>{
 const id=ctx.params['invoiceId'];if(!id||!zUuid(id))throw fail(404,'NAO_ENCONTRADO');
 const r=await ctx.db.from('invoices').select('*').eq('id',id).eq('organization_id',ctx.organization_id).eq('environment',ctx.env).maybeSingle();if(r.error)throw new Error('INVOICE_READ_FAILED');
 if(r.data){ctx.setCompany(r.data.company_id);return {kind:'notem',id,invoice:r.data};}
 const {loadExternalNote}=await import('./notes.server');const e=await loadExternalNote(ctx.db,ctx.organization_id,ctx.env,id);if(!e)throw fail(404,'NAO_ENCONTRADO');
 ctx.setCompany(e.companyId);return {kind:'externa',id,doc:e.doc,companyId:e.companyId};
}
/** Cancel, analysis and substitution are only for notes issued by notem. */
async function loadOwnInvoice(ctx:ApiCtx){const n=await loadNote(ctx);if(n.kind==='externa'){const {EXTERNAL_MUTATION_MESSAGE}=await import('./nfse-documents');throw fail(409,'CONFLITO',[],EXTERNAL_MUTATION_MESSAGE);}return n.invoice;}
export async function loadInvoice(ctx:ApiCtx){const id=ctx.params['invoiceId'];if(!id||!zUuid(id))throw fail(404,'NAO_ENCONTRADO');const r=await ctx.db.from('invoices').select('*').eq('id',id).eq('organization_id',ctx.organization_id).eq('environment',ctx.env).maybeSingle();if(r.error)throw new Error('INVOICE_READ_FAILED');if(!r.data)throw fail(404,'NAO_ENCONTRADO');ctx.setCompany(r.data.company_id);return r.data;}
const zUuid=(id:string)=>/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id);
export async function getInvoice(ctx:ApiCtx){const n=await loadNote(ctx);if(n.kind==='notem')return {status:200,body:invoiceOut(n.invoice)};const {externalOut}=await import('./nfse-documents');return {status:200,body:externalOut(n.doc,n.companyId)};}
async function noteXml(ctx:ApiCtx,n:Note){const {invoiceXml,documentXml}=await import('./notes.server');return n.kind==='notem'?await invoiceXml(ctx.db,n.invoice):await documentXml(ctx.db,n.doc);}
export async function getInvoiceXml(ctx:ApiCtx){const n=await loadNote(ctx);const xml=await noteXml(ctx,n);if(!xml)throw fail(404,'NAO_ENCONTRADO',[], 'XML autorizado ainda não disponível.');return {status:200,body:xml,headers:{'Content-Type':'application/xml; charset=utf-8','Content-Disposition':`attachment; filename="nfse-${n.id}.xml"`}};}
export async function getInvoicePdf(ctx:ApiCtx):Promise<ApiResult>{const n=await loadNote(ctx);const status=n.kind==='notem'?n.invoice.status:n.doc.status;const xml=pdfStatuses.includes(status)?await noteXml(ctx,n):null;if(!xml)throw fail(404,'NAO_ENCONTRADO',[], 'DANFSe ainda não disponível.');const companyId=n.kind==='notem'?n.invoice.company_id:n.companyId;const f=await ctx.db.from('company_fiscal_settings').select('print_danfse_receipt').eq('company_id',companyId).eq('organization_id',ctx.organization_id).maybeSingle();if(f.error)throw new Error('FISCAL_READ_FAILED');const number=n.kind==='notem'?n.invoice.nfse_number:n.doc.nfse_number;return {status:200,body:await generateDanfse(xml,status,f.data?.print_danfse_receipt??false),headers:{'Content-Type':'application/pdf','Content-Disposition':`attachment; filename="danfse-${number??n.id}.pdf"`}};}
export async function listInvoices(ctx:ApiCtx){const {limite,offset}=pageParams(ctx.url);const p=ctx.url.searchParams;
 let company=p.get('empresa_id');if(company&&!zUuid(company))throw fail(400,'REQUISICAO_INVALIDA',[{campo:'empresa_id',mensagem:'Identificador inválido.'}]);
 const external=p.get('empresa_id_externo');if(external){const c=await ctx.db.from('companies').select('id').eq('organization_id',ctx.organization_id).eq('external_id',external).maybeSingle();if(c.error)throw new Error('COMPANY_READ_FAILED');if(!c.data)return {status:200,body:page([],limite,offset)};company=c.data.id;}
 const status=p.get('situacao');let dbStatus:string|null=null;if(status){dbStatus=Object.entries(invoiceStatuses).find(([,label])=>label===status)?.[0]??null;if(!dbStatus)throw fail(400,'REQUISICAO_INVALIDA',[{campo:'situacao',mensagem:'Situação inválida.'}]);}
 const origin=p.get('origem');if(origin&&!['notem','externa'].includes(origin))throw fail(400,'REQUISICAO_INVALIDA',[{campo:'origem',mensagem:'Use notem ou externa.'}]);
 const range=dateRange(ctx.url,'emitida_de','emitida_ate');const dates:Record<string,string|null>={emitida_de:range.from,emitida_ate:range.to};
 for(const field of ['id_externo','tomador_documento'] as const){const v=p.get(field);if(v&&v.length>MAX_SEARCH)throw fail(400,'REQUISICAO_INVALIDA',[{campo:field,mensagem:`Use no máximo ${MAX_SEARCH} caracteres.`}]);}
 const args=Object.fromEntries(Object.entries({_company:company,_origin:origin,_status:dbStatus,_from:dates['emitida_de'],_to:dates['emitida_ate'],_external_id:p.get('id_externo'),_taker:p.get('tomador_documento')?normalizeCnpj(p.get('tomador_documento')!):null}).filter(([,v])=>v!=null)) as Record<string,string>;
 const r=await ctx.db.rpc('list_org_notes',{_org:ctx.organization_id,_env:ctx.env,...args,_limit:limite+1,_offset:offset});
 if(r.error)throw new Error('INVOICES_LIST_FAILED');
 const rows=r.data??[];const own=rows.filter(x=>x.origin==='notem').map(x=>x.id),ext=rows.filter(x=>x.origin==='externa').map(x=>x.id);
 const [inv,docs]=await Promise.all([own.length?ctx.db.from('invoices').select('*').eq('organization_id',ctx.organization_id).in('id',own):Promise.resolve({data:[],error:null}),ext.length?ctx.db.from('nfse_documents').select('*').in('id',ext):Promise.resolve({data:[],error:null})]);
 if(inv.error||docs.error)throw new Error('INVOICES_LIST_FAILED');
 const {externalOut}=await import('./nfse-documents');
 const out=rows.map(x=>{if(x.origin==='notem'){const i=(inv.data??[]).find(v=>v.id===x.id);return i?invoiceOut(i):null;}const d=(docs.data??[]).find(v=>v.id===x.id);return d?externalOut(d,x.company_id):null;}).filter(Boolean);
 return {status:200,body:page(out,limite,offset)};
}
