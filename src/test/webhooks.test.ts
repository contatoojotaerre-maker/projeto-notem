import { describe,it,expect,vi } from 'vitest'
import type { SupabaseClient } from '@supabase/supabase-js'
import type { Database } from '@/integrations/supabase/types'
import { createHmac } from 'node:crypto'
import { publicIp,webhookUrl,retrySeconds,webhookTimeout,webhookSignature,signatureHeader,responseSummary } from '../lib/webhooks'
import { encryptWebhook,decryptWebhook,validateDestination,processWebhookBatch,dispatchWebhookEvent,recordSchedulerRun } from '../lib/webhooks.server'
import { authHeaderName,deliveryMessage,userMessage,webhookExample,webhookInput } from '../lib/webhooks'
describe('webhook contract',()=>{
 it('has exactly seven retry delays after the initial attempt',()=>expect([...retrySeconds]).toEqual([60,300,1800,7200,21600,43200,86400]))
 it('limits attempts to 10 seconds',()=>expect(webhookTimeout).toBe(10000))
 it.each(['127.0.0.1','10.0.0.1','172.16.0.1','192.168.0.1','169.254.1.1','0.0.0.0','100.64.0.1','192.0.2.1','198.51.100.1','203.0.113.1','224.0.0.1','240.0.0.1','::1','::','fe80::1','fc00::1','ff02::1','2001:db8::1','::ffff:127.0.0.1'])('rejects private/reserved %s',ip=>expect(publicIp(ip)).toBe(false))
 it.each(['8.8.8.8','1.1.1.1','2606:4700:4700::1111'])('allows public %s',ip=>expect(publicIp(ip)).toBe(true))
 it.each(['http://example.com','https://user:pass@example.com','https://localhost','https://localhost.','https://abc.localhost','https://127.1','https://[::1]'])('rejects unsafe URL %s',url=>expect(()=>webhookUrl(url)).toThrow())
 it('signs the exact raw body with timestamp',async()=>{const body='{ "dados": {} }';expect(await webhookSignature('whsec_test',123,body)).toBe(createHmac('sha256','whsec_test').update('123.'+body).digest('hex'))})
 it('keeps both v1 values within 24-hour rotation',async()=>{const now=Date.now();const header=await signatureHeader('new','old',new Date(now+86400000).toISOString(),'{}',now);expect(header.match(/v1=/g)).toHaveLength(2)})
 it('drops old signature after its expiry',async()=>{const now=Date.now();expect((await signatureHeader('new','old',new Date(now).toISOString(),'{}',now)).match(/v1=/g)).toHaveLength(1)})
 it('encrypts with AES-GCM and binds material to endpoint',async()=>{const e=await encryptWebhook('whsec_test','master','endpoint');expect(e.data).not.toContain('whsec_test');expect(await decryptWebhook(e,'master','endpoint')).toBe('whsec_test');await expect(decryptWebhook(e,'master','other')).rejects.toThrow()})
 it('sanitizes and limits response to 4KiB',()=>{const s=responseSummary({password:'hidden',secret:'whsec_private',text:'é'.repeat(9000)});expect(new TextEncoder().encode(s).length).toBeLessThanOrEqual(4096);expect(s).not.toContain('hidden');expect(s).not.toContain('whsec_private')})
 it('rejects a DNS reply containing any private address',async()=>{vi.stubGlobal('fetch',vi.fn(async()=>Response.json({Status:0,Answer:[{type:1,data:'8.8.8.8'},{type:1,data:'10.1.1.1'}]})));try{await expect(validateDestination('https://example.com')).rejects.toThrow('DESTINO_NAO_PUBLICO')}finally{vi.unstubAllGlobals()}})
 it('checks both DNS families on every call',async()=>{const f=vi.fn(async()=>Response.json({Status:0,Answer:[{type:1,data:'8.8.8.8'}]}));vi.stubGlobal('fetch',f);try{await validateDestination('https://example.com');await validateDestination('https://example.com');expect(f).toHaveBeenCalledTimes(4)}finally{vi.unstubAllGlobals()}})
})

describe('delivery processor',()=>{
 it('sends signed raw body with required headers and records 2xx success',async()=>{
  const secret='whsec_test';const master='test-master';const envelope=await encryptWebhook(secret,master,'endpoint');const body='{ "id": "evt_test", "dados": {} }';
  const delivery={id:'whd_test',event_id:'evt_test',endpoint_id:'endpoint',claim_token:'lease'};
  const rpc=vi.fn(async(name:string)=>({data:name==='claim_webhook_deliveries'?[delivery]:0,error:null}));
  const db={rpc,from:(table:string)=>({select:()=>({eq:()=>({single:async()=>({error:null,data:table==='webhook_endpoints'?{id:'endpoint',active:true,url:'https://8.8.8.8/receiver',deleted_at:null,secret:envelope,previous_secret:null,previous_secret_expires_at:null}:{body,type:'webhook.teste'}})})})})} as unknown as SupabaseClient<Database>;
  const send=vi.fn(async(..._args:unknown[])=>new Response(null,{status:204}));vi.stubGlobal('fetch',send);
  try {expect(await processWebhookBatch(db,master)).toMatchObject({reserved:1,completed:1,failed:0,disabled:0});const call=send.mock.calls[0] as unknown as [string,RequestInit];expect(call[1].body).toBe(body);expect(call[1].redirect).toBe('manual');const h=call[1].headers as Record<string,string>;expect(h['Notem-Evento-Id']).toBe('evt_test');expect(h['Notem-Entrega-Id']).toBe('whd_test');expect(h['Notem-Evento']).toBe('webhook.teste');const signature=h['Notem-Assinatura'];if(!signature)throw new Error('Signature missing');const stamp=signature.split(',')[0];if(!stamp)throw new Error('Timestamp missing');const t=Number(stamp.slice(2));expect(signature).toBe('t='+t+',v1='+await webhookSignature(secret,t,body));expect(rpc.mock.calls.at(-1)?.[0]).toBe('finish_webhook_delivery');expect(rpc).toHaveBeenCalledWith('finish_webhook_delivery',expect.objectContaining({_http:204,_error:''}));}finally{vi.unstubAllGlobals()}
 })
})

describe('redirect handling',()=>{
 it.each([301,302])('fails a %s delivery without following it',async code=>{
  const master='m';const envelope=await encryptWebhook('whsec_x',master,'endpoint');
  const rpc=vi.fn(async(name:string)=>({data:name==='claim_webhook_deliveries'?[{id:'whd_r',event_id:'evt_r',endpoint_id:'endpoint',claim_token:'l'}]:0,error:null}));
  const db={rpc,from:(table:string)=>({select:()=>({eq:()=>({single:async()=>({error:null,data:table==='webhook_endpoints'?{id:'endpoint',active:true,url:'https://8.8.8.8/r',deleted_at:null,secret:envelope,previous_secret:null,previous_secret_expires_at:null}:{body:'{}',type:'webhook.teste'}})})})})} as unknown as SupabaseClient<Database>;
  const send=vi.fn(async(..._a:unknown[])=>new Response(null,{status:code,headers:{Location:'https://8.8.4.4/other'}}));vi.stubGlobal('fetch',send);
  try{await processWebhookBatch(db,master);expect(send).toHaveBeenCalledTimes(1);expect((send.mock.calls[0] as unknown as [string,RequestInit])[1].redirect).toBe('manual');expect(rpc).toHaveBeenCalledWith('finish_webhook_delivery',expect.objectContaining({_http:code,_error:'REDIRECIONAMENTO_NAO_PERMITIDO'}))}finally{vi.unstubAllGlobals()}
 })
 it('DNS lookup never uses the unsupported error redirect mode',async()=>{const f=vi.fn(async(..._a:unknown[])=>Response.json({Status:0,Answer:[{type:1,data:'8.8.8.8'}]}));vi.stubGlobal('fetch',f);try{await validateDestination('https://example.com');for(const c of f.mock.calls)expect((c[1] as RequestInit).redirect).toBe('manual')}finally{vi.unstubAllGlobals()}})
})

async function fakeDb(extra:Record<string,unknown>={}){
 const master='m';const envelope=await encryptWebhook('whsec_x',master,'endpoint');
 const rpc=vi.fn(async(name:string,_args?:unknown)=>({data:name==='claim_webhook_deliveries'?[{id:'whd_t',event_id:'evt_t',endpoint_id:'endpoint',claim_token:'l'}]:name==='emit_webhook_event'?1:0,error:null}));
 const db={rpc,from:(table:string)=>({select:()=>({eq:()=>({single:async()=>({error:null,data:table==='webhook_endpoints'?{id:'endpoint',active:true,url:'https://8.8.8.8/r',deleted_at:null,secret:envelope,previous_secret:null,previous_secret_expires_at:null,...extra}:{body:'{}',type:'webhook.teste'}})})})})} as unknown as SupabaseClient<Database>;
 return {db,rpc,master}
}
describe('direct test send',()=>{
 it('returns HTTP status and time on success',async()=>{const {db,master,rpc}=await fakeDb();vi.stubGlobal('fetch',vi.fn(async()=>new Response('ok',{status:200})));try{const r=await processWebhookBatch(db,master,{event:'evt_t',skipDisable:true});expect(r.results[0]).toMatchObject({status:200,error:null});expect(typeof r.results[0]?.duration).toBe('number');expect(rpc).not.toHaveBeenCalledWith('disable_failing_webhooks',expect.anything());expect(rpc).toHaveBeenCalledWith('claim_webhook_deliveries',{_limit:10,_event:'evt_t'})}finally{vi.unstubAllGlobals()}})
 it('records failure so the retry schedule continues',async()=>{const {db,master,rpc}=await fakeDb();vi.stubGlobal('fetch',vi.fn(async()=>new Response('no',{status:500})));try{const r=await processWebhookBatch(db,master,{event:'evt_t',skipDisable:true});expect(r.results[0]?.error).toBe('HTTP_FALHOU');expect(r.failed).toBe(1);expect(rpc).toHaveBeenCalledWith('finish_webhook_delivery',expect.objectContaining({_http:500,_error:'HTTP_FALHOU'}));expect(deliveryMessage('HTTP_FALHOU',500)).toBe('O endereço respondeu HTTP 500; esperado 2xx.')}finally{vi.unstubAllGlobals()}})
 it('reports timeout in Portuguese after 10 seconds',async()=>{const {db,master,rpc}=await fakeDb();vi.stubGlobal('fetch',vi.fn(async()=>{throw new DOMException('timed out','TimeoutError')}));try{const r=await processWebhookBatch(db,master,{event:'evt_t',skipDisable:true});expect(r.results[0]?.error).toBe('TEMPO_ESGOTADO');expect(rpc).toHaveBeenCalledWith('finish_webhook_delivery',expect.objectContaining({_error:'TEMPO_ESGOTADO'}));expect(deliveryMessage('TEMPO_ESGOTADO')).toBe('O endereço não respondeu em 10 segundos.')}finally{vi.unstubAllGlobals()}})
})
describe('real events without background',()=>{
 it('persists the event and leaves it queued for the scheduler',async()=>{const {db,rpc,master}=await fakeDb();const send=vi.fn();vi.stubGlobal('fetch',send);try{const r=await dispatchWebhookEvent(new Request('https://app.notemfiscal.com.br/api/v1/x'),db,master,{organization_id:'00000000-0000-0000-0000-000000000001',integration_id:'00000000-0000-0000-0000-000000000002',environment:'sandbox',type:'nota.autorizada',data:{}});expect(r.background).toBe(false);expect(r.event).toMatch(/^evt_[a-f0-9]{32}$/);expect(rpc).toHaveBeenCalledWith('emit_webhook_event',expect.objectContaining({_type:'nota.autorizada'}));expect(rpc).not.toHaveBeenCalledWith('claim_webhook_deliveries',expect.anything());expect(send).not.toHaveBeenCalled()}finally{vi.unstubAllGlobals()}})
})
describe('authorization key',()=>{
 it('sends the decrypted key in the chosen header with the signature',async()=>{const auth=await encryptWebhook('segredo-parceiro','m','endpoint:auth');const {db,master}=await fakeDb({auth_header:'X-Chave',auth_value:auth});const send=vi.fn(async(..._a:unknown[])=>new Response(null,{status:204}));vi.stubGlobal('fetch',send);try{await processWebhookBatch(db,master);const h=(send.mock.calls[0] as unknown as [string,RequestInit])[1].headers as Record<string,string>;expect(h['X-Chave']).toBe('segredo-parceiro');expect(h['Notem-Assinatura']).toMatch(/^t=\d+,v1=/)}finally{vi.unstubAllGlobals()}})
 it.each(['Notem-Teste','Host','Content-Length','Content-Type','Transfer-Encoding','notem-assinatura','X Bad'])('refuses header name %s',h=>expect(authHeaderName(h)).toBe(false))
 it.each(['Authorization','X-Api-Key'])('accepts header name %s',h=>expect(authHeaderName(h)).toBe(true))
 it('defaults header to empty (Authorization on save) and rejects line breaks',()=>{const base={organization_id:'00000000-0000-0000-0000-000000000001',integration_id:'00000000-0000-0000-0000-000000000002',environment:'sandbox',url:'https://8.8.8.8/r',events:['webhook.teste']};expect(webhookInput.parse(base).company_id).toBeNull();expect(webhookInput.safeParse({...base,auth_value:'a\r\nb'}).success).toBe(false)})
})
describe('panel messages and example',()=>{
 it('hides technical messages',()=>{expect(userMessage(new Error('duplicate key value violates unique constraint'))).toBe('Não foi possível concluir. Tente novamente.');expect(userMessage(new Error('Endereço não encontrado.'))).toBe('Endereço não encontrado.')})
 it('example uses contract envelope with empty dados',()=>{const e=JSON.parse(webhookExample('nota.autorizada','production','o','i'));expect(Object.keys(e)).toEqual(['id','tipo','criado_em','ambiente','organizacao_id','integracao_id','dados']);expect(e.dados).toEqual({});expect(e.ambiente).toBe('producao')})
})
describe('scheduler record',()=>{
 function db(){const inserts:unknown[]=[];const upserts:unknown[]=[];return {inserts,upserts,client:{from:(t:string)=>({insert:async(v:unknown)=>{inserts.push([t,v]);return {error:null}},upsert:async(v:unknown)=>{upserts.push([t,v]);return {error:null}}})} as unknown as SupabaseClient<Database>}}
 it('idle cycle only refreshes the heartbeat',async()=>{const d=db();await recordSchedulerRun(d.client,{reserved:0,completed:0,failed:0,disabled:0},null);expect(d.inserts).toHaveLength(0);expect(d.upserts).toHaveLength(1)})
 it('cycle with work is logged with summary',async()=>{const d=db();await recordSchedulerRun(d.client,{reserved:3,completed:2,failed:1,disabled:0},null);expect(d.inserts[0]).toEqual(['webhook_scheduler_runs',{reserved:3,completed:2,failed:1,disabled:0,error:null}])})
 it('error cycle is logged and does not refresh heartbeat',async()=>{const d=db();await recordSchedulerRun(d.client,{reserved:0,completed:0,failed:0,disabled:0},'RESERVA_FALHOU');expect(d.inserts).toHaveLength(1);expect(d.upserts).toHaveLength(0)})
})
