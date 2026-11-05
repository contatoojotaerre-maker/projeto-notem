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
const forbiddenHeaders=['host','content-length','content-type','content-encoding','transfer-encoding','connection','keep-alive','upgrade','te','trailer','expect','proxy-authorization','proxy-connection','cookie','user-agent','accept-encoding']
/** Valid custom authorization header name: HTTP token, not Notem-* nor a protocol header. */
export function authHeaderName(value:string){const v=value.trim();return /^[A-Za-z0-9!#$%&'*+.^_`|~-]{1,64}$/.test(v)&&!v.toLowerCase().startsWith('notem-')&&!forbiddenHeaders.includes(v.toLowerCase())}
export const webhookInput=z.object({organization_id:z.string().uuid(),integration_id:z.string().uuid(),id:z.string().uuid().optional(),environment:z.enum(['sandbox','production']),url:z.string().max(2048).refine(v=>{try{webhookUrl(v);return true}catch{return false}},{message:'Informe um endereço HTTPS público, sem credenciais.'}),description:z.string().max(2000).default(''),events:z.array(z.enum(webhookTypes)).min(1,'Escolha pelo menos um evento.').max(14),company_id:z.string().uuid().nullable().default(null),auth_header:z.string().trim().max(64).default('').refine(v=>!v||authHeaderName(v),{message:'Use outro nome de cabeçalho. Nomes Notem-* e cabeçalhos de protocolo (Host, Content-Length, Content-Type etc.) não são permitidos.'}),auth_value:z.string().max(1024,'A chave de autorização pode ter até 1.024 caracteres.').refine(v=>!/[\r\n\0]/.test(v)&&/^[\x20-\x7E]*$/.test(v),{message:'A chave de autorização aceita apenas letras, números e símbolos comuns, sem quebras de linha.'}).default(''),auth_clear:z.boolean().default(false)})
const deliveryMessages:Record<string,string>={TEMPO_ESGOTADO:'O endereço não respondeu em 10 segundos.',REDIRECIONAMENTO_NAO_PERMITIDO:'Redirecionamento não permitido. Cadastre o endereço final.','Redirecionamento não permitido':'Redirecionamento não permitido. Cadastre o endereço final.',DESTINO_NAO_PUBLICO:'O endereço aponta para uma rede privada ou reservada.',DNS_INDISPONIVEL:'Não foi possível localizar o endereço agora.',DNS_INVALIDO:'O domínio do endereço não foi encontrado.',ENDERECO_INDISPONIVEL:'O endereço está desativado ou foi excluído.',ENDERECO_EXCLUIDO:'O endereço foi excluído antes da entrega.',SEGREDO_INDISPONIVEL:'Não foi possível preparar a assinatura.',VERSAO_INVALIDA:'Não foi possível preparar a assinatura.',CONEXAO_FALHOU:'Não foi possível conectar ao endereço.',ENTREGA_FALHOU:'Não foi possível conectar ao endereço.'}
/** Portuguese phrase for a stored delivery error code; the code itself stays only in the record. */
export function deliveryMessage(error:string|null|undefined,status?:number|null){if(!error)return status?`Recebido com HTTP ${status}.`:'Aguardando envio.';if(error==='HTTP_FALHOU')return `O endereço respondeu HTTP ${status??'—'}; esperado 2xx.`;return deliveryMessages[error]??'A entrega não foi concluída.'}
/** Shows a server message only when it is a Portuguese sentence we wrote; anything technical becomes the fallback. */
export function userMessage(e:unknown,fallback='Não foi possível concluir. Tente novamente.'){const m=e instanceof Error?e.message:'';if(!m||m.length>240||/^[\[{]|[A-Z]{2,}_[A-Z]|\b(error|failed|fetch|invalid|undefined|null|violates|constraint|JWT|network|TypeError|function|column|relation|permission denied|duplicate key|Response)\b/i.test(m))return fallback;return m}
/** Example envelope for the selected event; events without defined data show "dados": {}. */
export function webhookExample(type:typeof webhookTypes[number],environment:'sandbox'|'production',organization_id:string,integration_id:string){return JSON.stringify({id:'evt_00000000000000000000000000000000',tipo:type,criado_em:'2026-11-05T12:00:00.000Z',ambiente:environment==='sandbox'?'homologacao':'producao',organizacao_id:organization_id,integracao_id:integration_id,dados:{}},null,2)}
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
export type CurlShell='bash'|'powershell'
/** Ready-to-run example of a delivery; signature is illustrative and the authorization value is always masked. */
export function webhookCurl(shell:CurlShell,input:{url:string,type:typeof webhookTypes[number],environment:'sandbox'|'production',organization_id:string,integration_id:string,auth_header?:string|null}){const body=webhookExample(input.type,input.environment,input.organization_id,input.integration_id);const headers:[string,string][]=[['Content-Type','application/json; charset=utf-8'],['Notem-Evento',input.type],['Notem-Evento-Id','evt_00000000000000000000000000000000'],['Notem-Entrega-Id','whd_00000000000000000000000000000000'],['Notem-Assinatura','t=1762344000,v1=ASSINATURA_ILUSTRATIVA']];if(input.auth_header)headers.push([input.auth_header,'••••••••']);const q=(v:string)=>shell==='bash'?`'${v.replaceAll("'","'\\''")}'`:`'${v.replaceAll("'","''")}'`;const cont=shell==='bash'?' \\':' `';const cmd=shell==='bash'?'curl':'curl.exe';const data=shell==='bash'?q(body):q(body.replaceAll('"','\\"'));return [`${cmd} -X POST ${q(input.url||'https://seu-endereco.exemplo/webhook')}`,...headers.map(([k,v])=>`  -H ${q(`${k}: ${v}`)}`),`  --data-raw ${data}`].join(cont+'\n')}
