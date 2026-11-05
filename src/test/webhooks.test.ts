import { describe,it,expect,vi } from 'vitest'
import type { SupabaseClient } from '@supabase/supabase-js'
import type { Database } from '@/integrations/supabase/types'
import { createHmac } from 'node:crypto'
import { publicIp,webhookUrl,retrySeconds,webhookTimeout,webhookSignature,signatureHeader,responseSummary } from '../lib/webhooks'
import { encryptWebhook,decryptWebhook,validateDestination,processWebhookBatch } from '../lib/webhooks.server'
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
  try {expect(await processWebhookBatch(db,master)).toEqual({reserved:1,completed:1,disabled:0});const call=send.mock.calls[0] as unknown as [string,RequestInit];expect(call[1].body).toBe(body);expect(call[1].redirect).toBe('manual');const h=call[1].headers as Record<string,string>;expect(h['Notem-Evento-Id']).toBe('evt_test');expect(h['Notem-Entrega-Id']).toBe('whd_test');expect(h['Notem-Evento']).toBe('webhook.teste');const t=Number(h['Notem-Assinatura'].split(',')[0].slice(2));expect(h['Notem-Assinatura']).toBe('t='+t+',v1='+await webhookSignature(secret,t,body));expect(rpc.mock.calls.at(-1)?.[0]).toBe('finish_webhook_delivery');expect(rpc).toHaveBeenCalledWith('finish_webhook_delivery',expect.objectContaining({_http:204,_error:''}));}finally{vi.unstubAllGlobals()}
 })
})
