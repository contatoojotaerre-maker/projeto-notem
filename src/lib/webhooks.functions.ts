import { createServerFn } from '@tanstack/react-start'
import { setResponseHeader } from '@tanstack/react-start/server'
import { z } from 'zod'
import { requireSupabaseAuth } from '@/integrations/supabase/auth-middleware'
import { webhookInput, deliveryMessage } from './webhooks'

type AuthedSupabase = { rpc: (fn: 'is_platform_admin' | 'has_org_role', args?: Record<string, unknown>) => PromiseLike<{ data: unknown, error: unknown }> }
const contextInput=z.object({organization_id:z.string().uuid(),integration_id:z.string().uuid()})
const endpointInput=contextInput.extend({id:z.string().uuid(),action:z.enum(['active','rotate','delete','test']),active:z.boolean().optional()})
export const endpointColumns='id,organization_id,integration_id,environment,url,description,events,active,disabled_reason,secret_prefix,previous_secret_expires_at,created_by,created_at,updated_at,last_success_at,failing_since,deleted_at,auth_header,auth_configured,company_id' as const

/** Owner, admin, developer or platform admin. */
async function requireManager(supabase:AuthedSupabase,organization_id:string){const [admin,role]=await Promise.all([supabase.rpc('is_platform_admin'),supabase.rpc('has_org_role',{org_id:organization_id,roles:['owner','admin','developer']})]);if(admin.error||role.error||(!admin.data&&!role.data))throw new Error('Acesso não autorizado.')}
function masterKey(){const master=process.env['WEBHOOK_ENCRYPTION_KEY'];if(!master)throw new Error('Proteção dos segredos não configurada.');return master}

export const getWebhooks=createServerFn({method:'POST'}).middleware([requireSupabaseAuth]).inputValidator(contextInput.extend({environment:z.enum(['sandbox','production']),errors:z.boolean().default(false),page:z.number().int().min(0).max(10000).default(0),endpoint_id:z.string().uuid().optional()})).handler(async({data,context})=>{
 const cutoff=new Date(Date.now()-90*86400000).toISOString();let deliveries=context.supabase.from('webhook_deliveries').select('*,webhook_events(type)',{count:'exact'}).eq('organization_id',data.organization_id).eq('integration_id',data.integration_id).eq('environment',data.environment).gte('created_at',cutoff).order('created_at',{ascending:false}).range(data.page*20,data.page*20+19);if(data.errors)deliveries=deliveries.in('status',['failed','exhausted']);if(data.endpoint_id)deliveries=deliveries.eq('endpoint_id',data.endpoint_id)
 const [endpoints,history,alerts]=await Promise.all([context.supabase.from('webhook_endpoints').select(endpointColumns).eq('organization_id',data.organization_id).eq('integration_id',data.integration_id).eq('environment',data.environment).is('deleted_at',null).order('created_at'),deliveries,context.supabase.from('webhook_alerts').select('*').eq('organization_id',data.organization_id).eq('integration_id',data.integration_id).eq('environment',data.environment).gte('created_at',cutoff).order('created_at',{ascending:false}).limit(20)])
 if(endpoints.error||history.error||alerts.error){console.error('webhooks: load failed');throw new Error('Não foi possível carregar os webhooks.')}
 // Error codes stay in the record; the panel receives a Portuguese phrase.
 const rows=(history.data??[]).map(d=>({...d,message:d.status==='pending'&&!d.error?'Aguardando envio.':deliveryMessage(d.error,d.response_status)}))
 return {endpoints:endpoints.data??[],history:rows,count:history.count??0,alerts:alerts.data??[]}
})

export const saveWebhook=createServerFn({method:'POST'}).middleware([requireSupabaseAuth]).inputValidator(webhookInput).handler(async({data,context})=>{
 setResponseHeader('Cache-Control','no-store');await requireManager(context.supabase as unknown as AuthedSupabase,data.organization_id)
 const {validateDestination,encryptWebhook,newWebhookSecret}=await import('./webhooks.server')
 try{await validateDestination(data.url)}catch(e){const m=e instanceof Error?e.message:'';console.error('webhook: destination check failed',m);throw new Error(m==='DESTINO_NAO_PUBLICO'?'Este endereço aponta para uma rede privada ou reservada. Use um endereço público HTTPS.':m==='DNS_INVALIDO'?'O domínio deste endereço não foi encontrado. Confira o endereço.':'Não foi possível verificar o endereço agora. Confira se ele está correto e tente novamente.')}
 if(data.company_id){const link=await context.supabase.from('integration_companies').select('company_id').eq('integration_id',data.integration_id).eq('company_id',data.company_id).maybeSingle();if(link.error||!link.data)throw new Error('Escolha uma empresa autorizada nesta integração.')}
 const master=masterKey();const id=data.id??crypto.randomUUID();const secret=data.id?null:newWebhookSecret()
 const {auth_value,auth_header,auth_clear,...rest}=data
 const payload={...rest,company_id:data.company_id??'',...secret?{secret:await encryptWebhook(secret,master,id),secret_prefix:secret.slice(0,14)+'…'}:{},...auth_value?{auth_value:await encryptWebhook(auth_value,master,id+':auth')}:{},auth_header:auth_header||'Authorization',auth_clear:auth_clear&&!auth_value}
 const {supabaseAdmin}=await import('@/integrations/supabase/client.server');const result=await supabaseAdmin.rpc('manage_webhook',{_actor:context.userId,_org:data.organization_id,_integration:data.integration_id,_action:data.id?'save':'create',_id:id,_payload:payload})
 if(result.error){console.error('webhook: save failed',result.error.code);throw new Error(result.error.message.includes('Empresa não autorizada')?'Escolha uma empresa autorizada nesta integração.':'Não foi possível salvar o endereço.')}
 return {id,secret}
})

export const revealWebhookSecret=createServerFn({method:'POST'}).middleware([requireSupabaseAuth]).inputValidator(contextInput.extend({id:z.string().uuid()})).handler(async({data,context})=>{
 setResponseHeader('Cache-Control','no-store');await requireManager(context.supabase as unknown as AuthedSupabase,data.organization_id)
 const {supabaseAdmin}=await import('@/integrations/supabase/client.server')
 const ep=await supabaseAdmin.from('webhook_endpoints').select('id,secret').eq('id',data.id).eq('organization_id',data.organization_id).eq('integration_id',data.integration_id).is('deleted_at',null).single()
 if(ep.error||!ep.data.secret)throw new Error('Endereço não encontrado.')
 // Record who revealed and when before returning the value.
 const audit=await supabaseAdmin.rpc('manage_webhook',{_actor:context.userId,_org:data.organization_id,_integration:data.integration_id,_action:'reveal',_id:data.id,_payload:{}});if(audit.error)throw new Error('Não foi possível revelar o segredo.')
 const {decryptWebhook}=await import('./webhooks.server');try{return {secret:await decryptWebhook(ep.data.secret,masterKey(),ep.data.id)}}catch{console.error('webhook: reveal decrypt failed');throw new Error('Não foi possível revelar o segredo.')}
})

export const webhookAction=createServerFn({method:'POST'}).middleware([requireSupabaseAuth]).inputValidator(endpointInput).handler(async({data,context})=>{
 setResponseHeader('Cache-Control','no-store');await requireManager(context.supabase as unknown as AuthedSupabase,data.organization_id)
 const {supabaseAdmin}=await import('@/integrations/supabase/client.server');const {data:ep,error}=await context.supabase.from('webhook_endpoints').select(endpointColumns).eq('id',data.id).eq('organization_id',data.organization_id).eq('integration_id',data.integration_id).is('deleted_at',null).single();if(error)throw new Error('Endereço não encontrado.')
 const {encryptWebhook,newWebhookSecret,emitWebhookEvent,processWebhookBatch}=await import('./webhooks.server');const master=masterKey();let secret:string|null=null
 if(data.action==='test'){
  if(!ep.active)throw new Error('Ative o endereço antes de enviar teste.')
  // Event and delivery are persisted first; then one direct attempt (max 10 s). A failure follows the scheduler's retry plan.
  let event:string;try{event=await emitWebhookEvent(supabaseAdmin,{organization_id:data.organization_id,integration_id:data.integration_id,environment:ep.environment,type:'webhook.teste',data:{},endpoint_id:ep.id})}catch{console.error('webhook: test event not created');throw new Error('Não foi possível registrar o teste. Confira se a integração está ativa.')}
  try{const batch=await processWebhookBatch(supabaseAdmin,master,{event,skipDisable:true});const r=batch.results[0]
   if(!r)return {secret,event:null,test:{event,ok:false,queued:true,status:null,duration:null,message:'O teste foi registrado e será enviado pelo agendador em até 1 minuto.'}}
   return {secret,event:null,test:{event,ok:!r.error,queued:false,status:r.status,duration:r.duration,message:r.error?deliveryMessage(r.error,r.status)+' Novas tentativas seguirão o cronograma.':`Recebido com HTTP ${r.status} em ${r.duration} ms.`}}
  }catch{console.error('webhook: direct test failed',event);return {secret,event:null,test:{event,ok:false,queued:true,status:null,duration:null,message:'O teste foi registrado e será enviado pelo agendador em até 1 minuto.'}}}
 }
 if(data.action==='rotate')secret=newWebhookSecret();const payload=secret?{secret:await encryptWebhook(secret,master,data.id),secret_prefix:secret.slice(0,14)+'…'}:{active:data.active??false};const result=await supabaseAdmin.rpc('manage_webhook',{_actor:context.userId,_org:data.organization_id,_integration:data.integration_id,_action:data.action,_id:data.id,_payload:payload});if(result.error)throw new Error('Não foi possível alterar o endereço.');return {secret,event:null,test:null}
})

export const replayWebhook=createServerFn({method:'POST'}).middleware([requireSupabaseAuth]).inputValidator(contextInput.extend({id:z.string().regex(/^whd_[a-f0-9]{32}$/)})).handler(async({data,context})=>{
 await requireManager(context.supabase as unknown as AuthedSupabase,data.organization_id);const {supabaseAdmin}=await import('@/integrations/supabase/client.server');const result=await supabaseAdmin.rpc('replay_webhook_delivery',{_actor:context.userId,_org:data.organization_id,_id:data.id});if(result.error)throw new Error('Ative o endereço e confira se não há reenvio pendente.')
 // Queued: the scheduler sends it within about a minute.
 return {event:result.data}
})

export const getWebhookAlerts=createServerFn({method:'POST'}).middleware([requireSupabaseAuth]).inputValidator(z.object({organization_id:z.string().uuid()})).handler(async({data,context})=>{const r=await context.supabase.from('webhook_alerts').select('id,message,created_at,environment,integration_id,webhook_endpoints(url)').eq('organization_id',data.organization_id).gte('created_at',new Date(Date.now()-90*86400000).toISOString()).order('created_at',{ascending:false}).limit(50);if(r.error)throw new Error('Não foi possível carregar os alertas.');return r.data??[]})
