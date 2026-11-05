import { describe,it,expect } from 'vitest'
import { keyRotationState } from '../lib/integration-keys'
import { webhookCurl } from '../lib/webhooks'
const k=(id:string,c:string,r:string|null=null)=>({id,created_at:c,revoked_at:r})
describe('key rotation',()=>{
 it('no keys allows generating first',()=>{const s=keyRotationState([]);expect(s.mode).toBe('none');expect(s.canGenerate).toBe(true)})
 it('one active key allows a second',()=>{const s=keyRotationState([k('a','2026-01-01'),k('x','2025-01-01','2025-02-01')]);expect(s.mode).toBe('one');expect(s.canGenerate).toBe(true);expect(s.newestId).toBeNull()})
 it('two active keys block generation and mark newest',()=>{const s=keyRotationState([k('old','2026-01-01'),k('new','2026-03-01')]);expect(s.mode).toBe('two');expect(s.canGenerate).toBe(false);expect(s.newestId).toBe('new')})
})
describe('webhook curl',()=>{
 const base={url:'https://ex.com/h',type:'webhook.teste' as const,environment:'sandbox' as const,organization_id:'o',integration_id:'i'}
 it('bash has all headers and masked auth',()=>{const c=webhookCurl('bash',{...base,auth_header:'X-Chave'});for(const h of ['Content-Type','Notem-Evento:','Notem-Evento-Id','Notem-Entrega-Id','Notem-Assinatura'])expect(c).toContain(h);expect(c).toContain("X-Chave: ••••••••");expect(c).toContain('"dados": {}');expect(c.startsWith("curl -X POST 'https://ex.com/h'")).toBe(true)})
 it('no auth header when not configured',()=>{expect(webhookCurl('bash',base)).not.toContain('••••')})
 it('powershell uses curl.exe and escapes quotes',()=>{const c=webhookCurl('powershell',base);expect(c.startsWith('curl.exe')).toBe(true);expect(c).toContain('\\"tipo\\"');expect(c).toContain(' `\n')})
})
import { subscriptionMatches,groupState,webhookGroups,webhookInput } from '../lib/webhooks'
describe('webhook groups',()=>{
 it('exact type matches',()=>expect(subscriptionMatches(['nota.autorizada'],'nota.autorizada')).toBe(true))
 it('wildcard matches any nota, including future ones',()=>{expect(subscriptionMatches(['nota.*'],'nota.rejeitada')).toBe(true);expect(subscriptionMatches(['nota.*'],'nota.evento_futuro')).toBe(true)})
 it('no cross-group match',()=>expect(subscriptionMatches(['nota.*'],'certificado.vencido')).toBe(false))
 it('teste always matches',()=>expect(subscriptionMatches(['municipio.*'],'webhook.teste')).toBe(true))
 it('group state all/some/none',()=>{const g=webhookGroups[1];expect(groupState(['empresa.*','certificado.*'],g).mode).toBe('all');expect(groupState(['certificado.vencido'],g)).toEqual({mode:'some',count:1});expect(groupState([],g).mode).toBe('none')})
 it('unknown wildcard rejected',()=>{const r=webhookInput.safeParse({organization_id:crypto.randomUUID(),integration_id:crypto.randomUUID(),environment:'sandbox',url:'https://ex.com/h',events:['outro.*']});expect(r.success).toBe(false)})
})
