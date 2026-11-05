import { z } from 'zod'
import ipaddr from 'ipaddr.js'
import { sanitizeBody } from './integrations'
export const webhookTypes = ['webhook.teste','nota.autorizada','nota.rejeitada','nota.cancelada','nota.cancelamento_em_analise','nota.cancelamento_indeferido','nota.substituida','nota.cancelada_prefeitura','nota.bloqueada_prefeitura','nota.manifestacao','empresa.situacao_alterada','certificado.vencendo','certificado.vencido','municipio.disponivel'] as const
export const eventLabels: Record<typeof webhookTypes[number],string> = {'webhook.teste':'Teste da conexão','nota.autorizada':'Nota autorizada','nota.rejeitada':'Emissão rejeitada','nota.cancelada':'Cancelamento concluído','nota.cancelamento_em_analise':'Cancelamento em análise','nota.cancelamento_indeferido':'Cancelamento indeferido','nota.substituida':'Nota substituída','nota.cancelada_prefeitura':'Cancelada pela prefeitura','nota.bloqueada_prefeitura':'Bloqueada pela prefeitura','nota.manifestacao':'Manifestação do tomador','empresa.situacao_alterada':'Situação da empresa alterada','certificado.vencendo':'Certificado perto do vencimento','certificado.vencido':'Certificado vencido','municipio.disponivel':'Município disponível'}
export const retrySeconds = [60,300,1800,7200,21600,43200,86400] as const
export const webhookTimeout = 10000
export function publicIp(value: string) { try { const ip=ipaddr.process(value); return ip.range()==='unicast' } catch { return false } }
export function webhookUrl(value:string) {
 const url=new URL(value);const host=url.hostname.replace(/^\[|\]$/g,'').toLowerCase().replace(/\.$/,'')
 if(url.protocol!=='https:'||url.username||url.password||['localhost','localhost.localdomain'].includes(host)||host.endsWith('.localhost')||host.endsWith('.local')||!host)throw new Error('Informe um endereço HTTPS público, sem credenciais.')
 if(ipaddr.isValid(host)&&!publicIp(host))throw new Error('Endereços internos ou reservados não são permitidos.')
 return url
}
export const webhookInput=z.object({organization_id:z.string().uuid(),integration_id:z.string().uuid(),id:z.string().uuid().optional(),environment:z.enum(['sandbox','production']),url:z.string().max(2048).refine(v=>{try{webhookUrl(v);return true}catch{return false}},{message:'Informe um endereço HTTPS público, sem credenciais.'}),description:z.string().max(2000).default(''),events:z.array(z.enum(webhookTypes)).min(1).max(14)})
const enc=new TextEncoder()
export async function webhookSignature(secret:string,timestamp:number,body:string) {const key=await crypto.subtle.importKey('raw',enc.encode(secret),{name:'HMAC',hash:'SHA-256'},false,['sign']);return Array.from(new Uint8Array(await crypto.subtle.sign('HMAC',key,enc.encode(`${timestamp}.${body}`))),b=>b.toString(16).padStart(2,'0')).join('')}
export async function signatureHeader(current:string,previous:string|null,expires:string|null,body:string,now=Date.now()) {const t=Math.floor(now/1000);const signatures=[await webhookSignature(current,t,body)];if(previous&&expires&&Date.parse(expires)>now)signatures.push(await webhookSignature(previous,t,body));return `t=${t},${signatures.map(s=>`v1=${s}`).join(',')}`}
export function responseSummary(value:unknown){const s=JSON.stringify(sanitizeBody(value)).replace(/whsec_[a-zA-Z0-9_-]+/g,'[REMOVIDO]');let out='';for(const c of s){if(enc.encode(out+c).length>4080)break;out+=c}return enc.encode(s).length>4080?out+' [TRUNCADO]':out}
export const signatureExample = `import crypto from 'node:crypto';
// corpoBruto: bytes recebidos, antes de converter JSON.
function validarAssinatura(cabecalho, corpoBruto, segredo) {
  const partes = cabecalho.split(',');
  const t = partes.find(p => p.startsWith('t='))?.slice(2);
  if (!t || !/^\\d+$/.test(t) ||
      Math.abs(Date.now() / 1000 - Number(t)) > 300) return false;
  const esperado = crypto.createHmac('sha256', segredo)
    .update(t + '.').update(corpoBruto).digest();
  return partes.filter(p => p.startsWith('v1=')).some(p => {
    const hex = p.slice(3);
    if (!/^[a-f0-9]{64}$/.test(hex)) return false;
    const recebido = Buffer.from(hex, 'hex');
    return crypto.timingSafeEqual(esperado, recebido);
  });
}`
