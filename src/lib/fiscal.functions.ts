import { createServerFn } from '@tanstack/react-start';
import { requireSupabaseAuth } from '@/integrations/supabase/auth-middleware';
import { z } from 'zod';
import { catalogNames, fiscalIds, fiscalSchema, serviceProfileSchema, seriesSchema,specialTaxRuleError } from './fiscal';
import { IBSCBS_MESSAGES, ibsCbsServiceRuleError } from './ibscbs';
const ruleMessages=new Set<string>(Object.values(IBSCBS_MESSAGES));

export const getCompanyFiscal = createServerFn({method:'POST'}).middleware([requireSupabaseAuth]).inputValidator(fiscalIds).handler(async({context,data})=>{
 const company=await context.supabase.from('companies').select('id').eq('id',data.company_id).eq('organization_id',data.organization_id).single();
 if(company.error)throw new Error('Empresa não encontrada ou acesso não autorizado.');
 const [settings,profiles,certificates]=await Promise.all([
 context.supabase.from('company_fiscal_settings').select('*').eq('company_id',data.company_id).eq('organization_id',data.organization_id).maybeSingle(),
 context.supabase.from('company_service_profiles').select('*, service_codes(*), nbs_codes(*), ibscbs_operation_indicators(*), ibscbs_classifications(*)').eq('company_id',data.company_id).eq('organization_id',data.organization_id).order('name'),
 context.supabase.from('company_certificates').select('id,status,cnpj,valid_from,valid_until').eq('company_id',data.company_id).eq('organization_id',data.organization_id),
 ]);
 for(const r of [settings,profiles,certificates])if(r.error)throw new Error('Não foi possível carregar os dados fiscais.');
 return {settings:settings.data,profiles:profiles.data??[],certificates:certificates.data??[]};
});
export const saveFiscalSettings = createServerFn({method:'POST'}).middleware([requireSupabaseAuth]).inputValidator(fiscalSchema).handler(async({context,data})=>{
 const services=await context.supabase.from('company_service_profiles').select('iss_taxation').eq('company_id',data.company_id).eq('organization_id',data.organization_id).eq('active',true);
 if(services.error)throw new Error('Não foi possível carregar os serviços.');
 for(const s of services.data??[]){const error=specialTaxRuleError(data.simples_nacional_option,data.simples_nacional_regime,data.special_tax_regime,s.iss_taxation);if(error)throw new Error(error);}
 const current=await context.supabase.from('company_fiscal_settings').select('company_id').eq('company_id',data.company_id).eq('organization_id',data.organization_id).maybeSingle();
 if(current.error)throw new Error('Não foi possível carregar a configuração fiscal.');
 const {dps_series,...fields}=data;
 // On insertion null is intentionally accepted by the BEFORE trigger and replaced atomically before NOT NULL validation.
 const r=current.data ? await context.supabase.from('company_fiscal_settings').update({...fields,...(dps_series===null?{}:{dps_series})}).eq('company_id',data.company_id).eq('organization_id',data.organization_id).select('*').single() : await context.supabase.from('company_fiscal_settings').insert({...data,cnpj:'',created_by:context.userId,updated_by:context.userId,dps_series:data.dps_series as number}).select('*').single();
 if(r.error)throw new Error(r.error.code==='23505'?'Esta série DPS já está reservada para este CNPJ em outra empresa.':'Não foi possível salvar. Confira os dados e tente novamente.');
 const {panelRefreshReadiness}=await import('./readiness.server');await panelRefreshReadiness(data.company_id);
 return r.data;
});
export const saveServiceProfile = createServerFn({method:'POST'}).middleware([requireSupabaseAuth]).inputValidator(serviceProfileSchema).handler(async({context,data})=>{
 const fiscal=await context.supabase.from('company_fiscal_settings').select('simples_nacional_option,simples_nacional_regime,special_tax_regime').eq('company_id',data.company_id).eq('organization_id',data.organization_id).maybeSingle();
 if(fiscal.error)throw new Error('Não foi possível carregar a configuração fiscal.');
 if(data.active&&fiscal.data){const f=fiscal.data,error=specialTaxRuleError(f.simples_nacional_option,f.simples_nacional_regime,f.special_tax_regime,data.iss_taxation);if(error)throw new Error(error);}
 // Same rule as the database trigger, checked first so the panel shows the specific message.
 const cls=data.ibscbs_classification?await context.supabase.from('ibscbs_classifications').select('*').eq('code',data.ibscbs_classification).maybeSingle():null;
 if(cls?.error)throw new Error('Não foi possível consultar o catálogo de classificações.');
 const ind=data.ibscbs_operation_indicator?await context.supabase.from('ibscbs_operation_indicators').select('code,active').eq('code',data.ibscbs_operation_indicator).maybeSingle():null;
 if(ind?.error)throw new Error('Não foi possível consultar o catálogo de indicadores.');
 const ruleError=ibsCbsServiceRuleError(data.service_code,data.ibscbs_classification,cls?.data,data.ibscbs_operation_indicator,data.simples_activity_code);if(ruleError)throw new Error(ruleError);
 if(data.simples_activity_code&&fiscal.data&&fiscal.data.simples_nacional_option!==3)throw new Error(IBSCBS_MESSAGES.simplesActivityForbidden);
 const {id,...fields}=data;
 if(ind?.data&&!ind.data.active&&id){const prev=await context.supabase.from('company_service_profiles').select('ibscbs_operation_indicator').eq('id',id).eq('organization_id',data.organization_id).maybeSingle();if(prev.error||prev.data?.ibscbs_operation_indicator!==data.ibscbs_operation_indicator)throw new Error(IBSCBS_MESSAGES.indicatorInactive);}
 else if(ind?.data&&!ind.data.active)throw new Error(IBSCBS_MESSAGES.indicatorInactive);
 const r=id?await context.supabase.from('company_service_profiles').update(fields).eq('id',id).eq('company_id',data.company_id).eq('organization_id',data.organization_id).select('id').single():await context.supabase.from('company_service_profiles').insert({...fields,created_by:context.userId,updated_by:context.userId}).select('id').single();
 if(r.error)throw new Error(r.error.code==='23503'?'Selecione códigos existentes nos catálogos oficiais.':r.error.code==='P0001'&&ruleMessages.has(r.error.message)?r.error.message:'Não foi possível salvar o perfil. Confira os campos e sua permissão.');const {panelRefreshReadiness}=await import('./readiness.server');await panelRefreshReadiness(data.company_id);return r.data;
});
export const searchFiscalCatalog = createServerFn({method:'POST'}).middleware([requireSupabaseAuth]).inputValidator(z.object({catalog:z.enum(catalogNames),search:z.string().max(200)})).handler(async({context,data})=>{
 const exists=await context.supabase.from(data.catalog).select('code').limit(1);if(exists.error)throw new Error('Não foi possível consultar o catálogo.');
 const catalogEmpty=!exists.data?.length;if(catalogEmpty||data.search.trim().length<2)return {rows:[],catalogEmpty};
 const r=await context.supabase.rpc('search_fiscal_catalog',{_catalog:data.catalog,_search:data.search});if(r.error)throw new Error('Não foi possível buscar no catálogo.');return {rows:r.data??[],catalogEmpty};
});
/** Definitive reservation in a separately committed RPC. No release/recycle operation; future issuance failures leave gaps. */
export const reserveDpsNumber = createServerFn({method:'POST'}).middleware([requireSupabaseAuth]).inputValidator(fiscalIds.extend({series:seriesSchema,environment:z.enum(['production','sandbox'])})).handler(async({context,data})=>{
 const [admin,role,company]=await Promise.all([context.supabase.rpc('is_platform_admin'),context.supabase.rpc('has_org_role',{org_id:data.organization_id,roles:['owner','admin']}),context.supabase.from('companies').select('id').eq('id',data.company_id).eq('organization_id',data.organization_id).single()]);
 if(admin.error||role.error||company.error||(!admin.data&&!role.data))throw new Error('Acesso não autorizado.');
 const settings=await context.supabase.from('company_fiscal_settings').select('*').eq('company_id',data.company_id).eq('organization_id',data.organization_id).maybeSingle();
 if(settings.error||!settings.data)throw new Error('Configuração fiscal incompleta.');
 const validated=fiscalSchema.safeParse(settings.data);
 if(!validated.success)throw new Error(validated.error.issues[0]?.message??'Configuração fiscal incompleta.');
 const {supabaseAdmin}=await import('@/integrations/supabase/client.server');
 const r=await supabaseAdmin.rpc('reserve_dps_number',{_company_id:data.company_id,_organization_id:data.organization_id,_series:data.series,_environment:data.environment,_requested_by:context.userId});
 if(r.error)throw new Error('Não foi possível reservar o número DPS. Confira a série ou o limite da numeração.');
 return {number:r.data,definitive:true as const};
});
/** Anexo VIII suggestion for a national tax code: shown to the user, never applied automatically. */
export const suggestServiceIbsCbs = createServerFn({method:'POST'}).middleware([requireSupabaseAuth]).inputValidator(z.object({service_code:z.string().regex(/^\d{6}$/)})).handler(async({context,data})=>{
 const {loadIbsCbsSuggestion}=await import('./ibscbs.server');
 try{return {suggestion:await loadIbsCbsSuggestion(context.supabase,data.service_code)};}catch{throw new Error('Não foi possível consultar a tabela de correlação.');}
});
