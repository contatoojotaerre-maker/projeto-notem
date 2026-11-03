import { createFileRoute } from '@tanstack/react-router'
import { apiError, hashKey, keyEnvironment, sanitizeBody } from '@/lib/integrations'

async function handle(request:Request) {
 const started=performance.now();const id=`req_${crypto.randomUUID().replaceAll('-','')}`
 const headers=new Headers({'X-Request-Id':id,'Cache-Control':'no-store','Content-Type':'application/json; charset=utf-8'})
 let status=401;let body:unknown=apiError(id);let identity:{organization_id:string,integration_id:string,key_id:string,environment:'sandbox'|'production'}|null=null
 const {supabaseAdmin}=await import('@/integrations/supabase/client.server')
 try {
  const bearer=request.headers.get('authorization')??'';const key=bearer.startsWith('Bearer ')?bearer.slice(7):'';const environment=keyEnvironment(key)
  if(environment){
   const found=await supabaseAdmin.from('integration_keys').select('id,integration_id,organization_id,environment,revoked_at,last_used_at').eq('key_hash',await hashKey(key)).maybeSingle()
   if(found.error)throw new Error('KEY_READ_FAILED')
   if(found.data){const k=found.data;identity={organization_id:k.organization_id,integration_id:k.integration_id,key_id:k.id,environment:k.environment}
    if(!k.revoked_at&&k.environment===environment){
     const integration=await supabaseAdmin.from('integrations').select('id,name,active,organization_id').eq('id',k.integration_id).eq('organization_id',k.organization_id).single();if(integration.error)throw new Error('INTEGRATION_READ_FAILED')
     if(integration.data.active){const org=await supabaseAdmin.from('organizations').select('id,name').eq('id',k.organization_id).single();if(org.error)throw new Error('ORG_READ_FAILED');status=200;body={ambiente:environment==='sandbox'?'homologacao':'producao',organizacao:{id:org.data.id,nome:org.data.name},integracao:{id:integration.data.id,nome:integration.data.name}}
      if(!k.last_used_at||Date.now()-Date.parse(k.last_used_at)>=60000){const update=await supabaseAdmin.from('integration_keys').update({last_used_at:new Date().toISOString()}).eq('id',k.id).or(`last_used_at.is.null,last_used_at.lt.${new Date(Date.now()-60000).toISOString()}`);if(update.error)console.error('API_LAST_USED_FAILED',id)}
     }
    }
   }
  }
  if(request.method!=='GET'&&status===200){status=400;body=apiError(id,'REQUISICAO_INVALIDA')}
 }catch{status=500;body=apiError(id,'ERRO_INTERNO');console.error('API_STATUS_FAILED',id)}
 // No floating promises: use the runtime's request-scoped waitUntil when present.
 const waitUntil=(request as Request & {waitUntil?: (promise:Promise<unknown>)=>void}).waitUntil
 const logStarted=performance.now()
 const persist=async()=>{const result=await supabaseAdmin.from('api_request_logs').insert({id,...(identity??{}),method:request.method,path:new URL(request.url).pathname,status_code:status,error_code:status===200?null:(body as ReturnType<typeof apiError>).erro.codigo,duration_ms:Math.round(performance.now()-started),request_body:null,response_body:sanitizeBody(body)});if(result.error)console.error('API_LOG_FAILED',id,result.error.code)}
 if(typeof waitUntil==='function'){waitUntil.call(request,persist());headers.set('Server-Timing','api-log;desc="background"')}
 else{await persist();headers.set('Server-Timing',`api-log;dur=${(performance.now()-logStarted).toFixed(1)};desc="synchronous"`)}
 return new Response(JSON.stringify(body),{status,headers})
}
export const Route = createFileRoute('/api/v1/status')({
  server: { handlers: { GET:({request})=>handle(request), POST:({request})=>handle(request), PUT:({request})=>handle(request), PATCH:({request})=>handle(request), DELETE:({request})=>handle(request) } },
})