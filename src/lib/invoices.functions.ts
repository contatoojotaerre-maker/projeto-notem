import { createServerFn } from '@tanstack/react-start';
import { requireSupabaseAuth } from '@/integrations/supabase/auth-middleware';
import { z, integer } from './validation';
import { requireOrgMember } from './panel-access';
import { invoiceOut } from './invoices';
import type { Json } from '@/integrations/supabase/types';
import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database } from '@/integrations/supabase/types';
type Rpc = SupabaseClient<Database>;
/** Owner, admin, operator or platform administrator; the database checks again before writing. */
async function canIssueFiscalChange(supabase: Rpc, organization_id: string) { const [admin, role] = await Promise.all([supabase.rpc('is_platform_admin'), supabase.rpc('has_org_role', { org_id: organization_id, roles: ['owner', 'admin', 'operator'] })]); return admin.data === true || role.data === true; }
type PanelResult = { ok: true; status: string; invoice_id: string } | { ok: false; mensagem: string; detalhes: { campo: string; mensagem: string }[] };
async function panelOutcome(run: () => Promise<{ status: number; body?: unknown }>, fallbackId: string): Promise<PanelResult> {
  const { ApiFailure } = await import('./api-contract');
  try { const r = await run(); const body = (r.body ?? {}) as { id?: string; situacao?: string }; return { ok: true, status: r.status === 202 ? 'pending' : 'done', invoice_id: body.id ?? fallbackId }; }
  catch (e) { if (e instanceof ApiFailure) return { ok: false, mensagem: e.userMessage, detalhes: e.details.map(d => ({ campo: String(d.campo), mensagem: String(d.mensagem) })) }; console.error('PANEL_FISCAL_CHANGE_FAILED'); return { ok: false, mensagem: 'Não foi possível concluir agora. Tente novamente; o pedido não será duplicado.', detalhes: [] }; }
}
const changeScope = z.object({ organization_id: z.string().uuid(), environment: z.enum(['sandbox', 'production']), id: z.string().uuid(), idempotency_key: z.string().uuid() });
export const requestPanelFiscalEvent = createServerFn({ method: 'POST' }).middleware([requireSupabaseAuth]).inputValidator(changeScope.extend({ kind: z.enum(['cancel', 'analysis']), body: z.object({ motivo: z.string().max(40), justificativa: z.string().max(2000) }) })).handler(async ({ context, data }): Promise<PanelResult> => {
  if (!await canIssueFiscalChange(context.supabase, data.organization_id)) return { ok: false, mensagem: 'Seu papel permite apenas visualizar esta nota.', detalhes: [] };
  const { supabaseAdmin } = await import('@/integrations/supabase/client.server'); const { requestFiscalEvent, eventResponse } = await import('./fiscal-events.server'); const { bodyHash } = await import('./api-contract');
  const hash = await bodyHash('POST', `panel:/notas/${data.id}/${data.kind}`, JSON.stringify(data.body));
  return panelOutcome(async () => eventResponse(await requestFiscalEvent({ db: supabaseAdmin, organization_id: data.organization_id, environment: data.environment, invoice_id: data.id, integration_id: null, origin: 'panel', actor: context.userId, kind: data.kind, body: data.body, idempotency_key: data.idempotency_key, request_hash: hash })), data.id);
});
export const substitutePanelInvoice = createServerFn({ method: 'POST' }).middleware([requireSupabaseAuth]).inputValidator(changeScope.extend({ body: z.record(z.string(), z.unknown()) })).handler(async ({ context, data }): Promise<PanelResult> => {
  if (!await canIssueFiscalChange(context.supabase, data.organization_id)) return { ok: false, mensagem: 'Seu papel permite apenas visualizar esta nota.', detalhes: [] };
  const visible = await context.supabase.from('invoices').select('id').eq('id', data.id).eq('organization_id', data.organization_id).eq('environment', data.environment).maybeSingle();
  if (visible.error || !visible.data) return { ok: false, mensagem: 'Nota não encontrada ou acesso não autorizado.', detalhes: [] };
  const { supabaseAdmin } = await import('@/integrations/supabase/client.server'); const { issueSubstitution } = await import('./api-invoices.server'); const { bodyHash } = await import('./api-contract');
  const original = await supabaseAdmin.from('invoices').select('*').eq('id', data.id).eq('organization_id', data.organization_id).eq('environment', data.environment).single();
  if (original.error) return { ok: false, mensagem: 'Nota não encontrada ou acesso não autorizado.', detalhes: [] };
  const hash = await bodyHash('POST', `panel:/notas/${data.id}/substituir`, JSON.stringify(data.body));
  return panelOutcome(() => issueSubstitution({ db: supabaseAdmin, organization_id: data.organization_id, env: data.environment, integration_id: null, origin: 'panel', actor: context.userId, setCompany: () => {} }, original.data, data.body as Json, data.idempotency_key, hash), data.id);
});
const scope=z.object({organization_id:z.string().uuid(),environment:z.enum(['sandbox','production'])});
const customerName=(v:unknown)=>v&&typeof v==='object'&&!Array.isArray(v)?(v as Record<string,unknown>):{};
/** notem and external notes in one list (external: issued outside notem by a company of the organization with proof of possession). */
export const getPanelInvoices=createServerFn({method:'POST'}).middleware([requireSupabaseAuth]).inputValidator(scope.extend({company_id:z.string().uuid().optional(),status:z.string().max(40).optional(),origin:z.enum(['notem','externa']).optional(),from:z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),to:z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),offset:integer().min(0).default(0)})).handler(async({context,data})=>{
 const [r,companies]=await Promise.all([context.supabase.rpc('list_org_notes',{_org:data.organization_id,_env:data.environment,...Object.fromEntries(Object.entries({_company:data.company_id,_origin:data.origin,_status:data.status,_from:data.from?data.from+'T00:00:00-03:00':undefined,_to:data.to?data.to+'T23:59:59.999-03:00':undefined}).filter(([,v])=>v!=null)) as Record<string,string>,_limit:51,_offset:data.offset}),context.supabase.from('companies').select('id,legal_name').eq('organization_id',data.organization_id).order('legal_name')]);
 if(r.error||companies.error)throw new Error('Não foi possível carregar as notas.');
 const rows=(r.data??[]).slice(0,50);const own=rows.filter(x=>x.origin==='notem').map(x=>x.id),ext=rows.filter(x=>x.origin==='externa').map(x=>x.id);
 const [inv,docs]=await Promise.all([own.length?context.supabase.from('invoices').select('id,status,company_id,nfse_number,external_id,customer_snapshot,sent_values,emitted_at').eq('organization_id',data.organization_id).in('id',own):Promise.resolve({data:[],error:null}),ext.length?context.supabase.from('nfse_documents').select('id,status,nfse_number,taker_name,taker_document,summary,issued_at,authorized_at,created_at').in('id',ext):Promise.resolve({data:[],error:null})]);
 if(inv.error||docs.error)throw new Error('Não foi possível carregar as notas.');
 const out=rows.map(x=>{
  if(x.origin==='notem'){const i=(inv.data??[]).find(v=>v.id===x.id);return i?{id:i.id,origin:'notem' as const,status:i.status,company_id:i.company_id,number:i.nfse_number,external_id:i.external_id,customer:i.customer_snapshot,values:i.sent_values,emitted_at:i.emitted_at}:null;}
  const d=(docs.data??[]).find(v=>v.id===x.id);if(!d)return null;const v=customerName(customerName(d.summary)['valores']);
  return {id:d.id,origin:'externa' as const,status:d.status,company_id:x.company_id,number:d.nfse_number,external_id:null,customer:{nome:d.taker_name,documento:d.taker_document},values:{servico:v['valor_servico']??null},emitted_at:d.issued_at??d.authorized_at??d.created_at};
 }).filter((x):x is NonNullable<typeof x>=>x!==null);
 return {rows:out,more:(r.data?.length??0)>50,companies:companies.data??[]};
});
async function readFiles(table:'invoices'|'invoice_fiscal_events'|'nfse_documents'|'nfse_document_events',ids:string[]){const {supabaseAdmin}=await import('@/integrations/supabase/client.server');const {xmlRefs,readXml}=await import('./xml-files.server');const refs=await xmlRefs(supabaseAdmin,table,ids);const out:Record<string,Record<string,string>>={};for(const [id,kinds] of Object.entries(refs))for(const [kind,ref] of Object.entries(kinds))(out[id]??={})[kind]=await readXml(supabaseAdmin,ref);return out;}
const eventNames:Record<string,string>={'101101':'Cancelamento','101103':'Solicitação de análise fiscal do cancelamento','105102':'Cancelamento por substituição','105104':'Cancelamento deferido','105105':'Cancelamento indeferido','305101':'Cancelamento por ofício','305102':'Bloqueio por ofício','305103':'Desbloqueio por ofício'};
async function officialEvents(env:'sandbox'|'production',key:string){const {supabaseAdmin}=await import('@/integrations/supabase/client.server');const r=await supabaseAdmin.from('nfse_document_events').select('id,code,sequence,processed_at,reason_text').eq('environment',env).eq('access_key',key).order('processed_at',{nullsFirst:false}).order('created_at');if(r.error)throw new Error('Não foi possível carregar os eventos.');const files=await readFiles('nfse_document_events',(r.data??[]).map(e=>e.id));return (r.data??[]).map(e=>({id:e.id,code:e.code,name:eventNames[e.code]??e.code,sequence:e.sequence,processed_at:e.processed_at,reason:e.reason_text,xml:files[e.id]?.['xml']??null}));}
const requireMember=(supabase:Parameters<typeof requireOrgMember>[0],org:string)=>requireOrgMember(supabase,org,'Nota não encontrada ou acesso não autorizado.');
export const getPanelInvoice=createServerFn({method:'POST'}).middleware([requireSupabaseAuth]).inputValidator(scope.extend({id:z.string().uuid()})).handler(async({context,data})=>{
 await requireMember(context.supabase,data.organization_id);
 const i=await context.supabase.from('invoices').select('*').eq('id',data.id).eq('organization_id',data.organization_id).eq('environment',data.environment).maybeSingle();if(i.error)throw new Error('Nota não encontrada ou acesso não autorizado.');
 const refresh=await context.supabase.rpc('has_org_role',{org_id:data.organization_id,roles:['owner','admin','operator']});const admin=await context.supabase.rpc('is_platform_admin');const canRefresh=refresh.data===true||admin.data===true;
 if(!i.data){
  const {supabaseAdmin}=await import('@/integrations/supabase/client.server');const {loadExternalNote,documentXml}=await import('./notes.server');const {externalOut}=await import('./nfse-documents');
  const ext=await loadExternalNote(supabaseAdmin,data.organization_id,data.environment,data.id);if(!ext)throw new Error('Nota não encontrada ou acesso não autorizado.');
  return {kind:'externa' as const,nota:externalOut(ext.doc,ext.companyId),status:ext.doc.status,xml:await documentXml(supabaseAdmin,ext.doc),officialEvents:await officialEvents(data.environment,ext.doc.access_key),canRefresh};
 }
 const events=await context.supabase.from('invoice_events').select('id,type,details,created_at').eq('invoice_id',data.id).eq('organization_id',data.organization_id).order('created_at').order('id');if(events.error)throw new Error('Não foi possível carregar o histórico.');
 const [fiscalEvents,manage,settings,profiles]=await Promise.all([context.supabase.from('invoice_fiscal_events').select('id,code,status,reason,created_at,registered_at,registered_outside').eq('invoice_id',data.id).eq('organization_id',data.organization_id).order('created_at').order('id'),canIssueFiscalChange(context.supabase,data.organization_id),context.supabase.from('company_fiscal_settings').select('simples_nacional_option').eq('company_id',i.data.company_id).eq('organization_id',data.organization_id).maybeSingle(),context.supabase.from('company_service_profiles').select('id,name,service_code,municipal_tax_code').eq('company_id',i.data.company_id).eq('organization_id',data.organization_id).eq('active',true).order('name')]);
 if(fiscalEvents.error||settings.error||profiles.error)throw new Error('Não foi possível carregar o histórico.');
 const {dpsWithNumber}=await import('./xml-files.server');const withNumber=(x:string,id:string,n:number)=>{try{return dpsWithNumber(x,id,n);}catch{return x;}};
 const [invFiles,evFiles]=await Promise.all([readFiles('invoices',[i.data.id]),readFiles('invoice_fiscal_events',(fiscalEvents.data??[]).map(e=>e.id))]);const f=invFiles[i.data.id]??{};
 const official=i.data.access_key?await officialEvents(data.environment,i.data.access_key):[];
 const sent=(i.data.sent_values??{}) as Record<string,unknown>,service=(i.data.service_snapshot??{}) as Record<string,unknown>,loc=(i.data.service_location??{}) as Record<string,unknown>;
 return {kind:'notem' as const,nota:invoiceOut(i.data),status:i.data.status,events:events.data??[],fiscalEvents:(fiscalEvents.data??[]).map(e=>({id:e.id,code:e.code,status:e.status,reason:e.reason,created_at:e.created_at,registered_at:e.registered_at,registered_outside:e.registered_outside,xml:evFiles[e.id]?.['event']??official.find(o=>o.code===e.code)?.xml??null,unsigned:evFiles[e.id]?.['unsigned']??null,signed:evFiles[e.id]?.['signed']??null})),officialEvents:official,canManage:manage,canRefresh,simples:settings.data?.simples_nacional_option??null,profiles:profiles.data??[],substitution:{service_profile_id:i.data.service_profile_id,competence:i.data.competence,description:i.data.description,complementary:i.data.complementary_information,service:String(sent['servico']??''),unconditional:String(sent['desconto_incondicionado']??'0.00'),conditional:String(sent['desconto_condicionado']??'0.00'),withholding:typeof service['withholding']==='number'?service['withholding']:1,location:typeof loc['codigo_municipio']==='string'?loc['codigo_municipio']:'',customer:i.data.customer_snapshot},technical:{dps_id:i.data.dps_id,unsigned:f['unsigned_dps']?withNumber(f['unsigned_dps'],i.data.dps_id,i.data.dps_number):null,signed:f['signed_dps']??null,xml:f['authorized_nfse']??null}};
});
/** DANFSe of a notem note, an external note or a received note (company_id), always from the official XML. */
export const getPanelInvoicePdf=createServerFn({method:'POST'}).middleware([requireSupabaseAuth]).inputValidator(scope.extend({id:z.string().uuid(),company_id:z.string().uuid().optional()})).handler(async({context,data})=>{
 await requireMember(context.supabase,data.organization_id);
 const {pdfStatuses}=await import('./danfse');const {supabaseAdmin}=await import('@/integrations/supabase/client.server');const notes=await import('./notes.server');
 let xml:string|null=null,status='',number:string|null=null,receipt=false;
 const i=await context.supabase.from('invoices').select('id,status,company_id,nfse_number').eq('id',data.id).eq('organization_id',data.organization_id).eq('environment',data.environment).maybeSingle();
 if(i.error)throw new Error('DANFSe não encontrado ou acesso não autorizado.');
 if(i.data){status=i.data.status;number=i.data.nfse_number;xml=await notes.invoiceXml(supabaseAdmin,i.data);const f=await context.supabase.from('company_fiscal_settings').select('print_danfse_receipt').eq('company_id',i.data.company_id).eq('organization_id',data.organization_id).maybeSingle();if(f.error)throw new Error('Não foi possível carregar a configuração do DANFSe.');receipt=f.data?.print_danfse_receipt??false;}
 else{
  const c=data.company_id?await context.supabase.from('companies').select('id').eq('id',data.company_id).eq('organization_id',data.organization_id).maybeSingle():null;if(c?.error)throw new Error('DANFSe não encontrado ou acesso não autorizado.');
  const ext=await notes.loadExternalNote(supabaseAdmin,data.organization_id,data.environment,data.id);const rec=!ext&&c?.data?await notes.loadReceivedNote(supabaseAdmin,data.organization_id,data.environment,c.data.id,data.id):null;
  const doc=ext?.doc??rec?.doc;if(!doc)throw new Error('DANFSe não encontrado ou acesso não autorizado.');
  status=doc.status;number=doc.nfse_number;xml=await notes.documentXml(supabaseAdmin,doc);
  if(ext){const f=await context.supabase.from('company_fiscal_settings').select('print_danfse_receipt').eq('company_id',ext.companyId).eq('organization_id',data.organization_id).maybeSingle();receipt=f.data?.print_danfse_receipt??false;}
 }
 if(!xml||!pdfStatuses.includes(status))throw new Error('DANFSe não encontrado ou acesso não autorizado.');
 const {generateDanfse}=await import('./danfse.server');const pdf=await generateDanfse(xml,status,receipt);
 let base64='';for(const b of pdf)base64+=String.fromCharCode(b);return {base64:btoa(base64),filename:`danfse-${number??data.id}.pdf`};
});
/** Received notes of a company (taker or intermediary); read only. */
export const getPanelReceived=createServerFn({method:'POST'}).middleware([requireSupabaseAuth]).inputValidator(scope.extend({company_id:z.string().uuid(),status:z.string().max(40).optional(),offset:integer().min(0).default(0)})).handler(async({context,data})=>{
 const c=await context.supabase.from('companies').select('id').eq('id',data.company_id).eq('organization_id',data.organization_id).maybeSingle();if(c.error||!c.data)throw new Error('Empresa não encontrada ou acesso não autorizado.');
 const {supabaseAdmin}=await import('@/integrations/supabase/client.server');const {listReceivedNotes}=await import('./notes.server');const {receivedOut}=await import('./nfse-documents');
 const r=await listReceivedNotes(supabaseAdmin,data.organization_id,data.environment,data.company_id,{status:data.status??null},50,data.offset);if(!r)throw new Error('Empresa não encontrada.');
 return {rows:r.rows.slice(0,50).map(d=>receivedOut(d,data.company_id,r.cnpj)),more:r.rows.length>50};
});
export const getPanelReceivedXml=createServerFn({method:'POST'}).middleware([requireSupabaseAuth]).inputValidator(scope.extend({company_id:z.string().uuid(),id:z.string().uuid()})).handler(async({context,data})=>{
 const c=await context.supabase.from('companies').select('id').eq('id',data.company_id).eq('organization_id',data.organization_id).maybeSingle();if(c.error||!c.data)throw new Error('Empresa não encontrada ou acesso não autorizado.');
 const {supabaseAdmin}=await import('@/integrations/supabase/client.server');const notes=await import('./notes.server');
 const r=await notes.loadReceivedNote(supabaseAdmin,data.organization_id,data.environment,data.company_id,data.id);if(!r)throw new Error('Nota não encontrada ou acesso não autorizado.');
 const xml=await notes.documentXml(supabaseAdmin,r.doc);if(!xml)throw new Error('XML indisponível.');return {xml,filename:`nfse-recebida-${r.doc.nfse_number??r.doc.id}.xml`};
});
export const getPanelCustomers=createServerFn({method:'POST'}).middleware([requireSupabaseAuth]).inputValidator(z.object({company_id:z.string().uuid(),organization_id:z.string().uuid(),offset:integer().min(0).default(0)})).handler(async({context,data})=>{
 const r=await context.supabase.from('company_customers').select('id,external_id,customer_data,created_at,updated_at').eq('company_id',data.company_id).eq('organization_id',data.organization_id).order('created_at',{ascending:false}).order('id').range(data.offset,data.offset+50);if(r.error)throw new Error('Não foi possível carregar os tomadores.');return {rows:(r.data??[]).slice(0,50),more:(r.data?.length??0)>50};
});