import { z } from 'zod'
export const integrationSchema = z.object({ organization_id: z.string().uuid(), id: z.string().uuid().optional(), name: z.string().trim().min(1).max(100), description: z.string().max(2000).default(''), active: z.boolean().default(true), company_scope: z.literal('all').default('all'), company_ids: z.array(z.string().uuid()).max(0).default([]) })
export const canManageIntegrations = (role?:string, admin=false)=>admin||['owner','admin','developer'].includes(role??'')
export const keyEnvironment = (key:string)=>/^ntm_homolog_[a-f0-9]{64}$/.test(key)?'sandbox':/^ntm_prod_[a-f0-9]{64}$/.test(key)?'production':null
export async function hashKey(key:string){return Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(key))),b=>b.toString(16).padStart(2,'0')).join('')}
export async function makeKey(environment:'sandbox'|'production'){
 const random=Array.from(crypto.getRandomValues(new Uint8Array(32)),b=>b.toString(16).padStart(2,'0')).join('');const key=`${environment==='sandbox'?'ntm_homolog_':'ntm_prod_'}${random}`
 return {key,key_hash:await hashKey(key),key_prefix:key.slice(0,environment==='sandbox'?19:16)+'…'}
}
export function sanitizeBody(value:unknown):import('@/integrations/supabase/types').Json {
 const secret=/(^key$|pfx|arquivo_base64|base64|senha|password|certificado|certificate|authorization|private.?key|api.?key|key_hash|key_prefix|chave|token|secret|credential)/i
 const text=(v:string)=>v.replace(/-----BEGIN [^-]+-----[\s\S]*?-----END [^-]+-----/g,'[REMOVIDO]').replace(/ntm_(?:homolog|prod)_[a-zA-Z0-9._-]+/g,'[REMOVIDO]').replace(/Bearer\s+[^\s"\\,}]+/gi,'Bearer [REMOVIDO]').replace(/eyJ[a-zA-Z0-9_-]+\.[a-zA-Z0-9_-]+\.[a-zA-Z0-9_-]+/g,'[REMOVIDO]')
 const walk=(v:unknown,depth=0):import('@/integrations/supabase/types').Json=>{if(depth>20)return '[TRUNCADO]';if(typeof v==='string')return text(v);if(v===null||typeof v==='boolean'||typeof v==='number')return v;if(Array.isArray(v))return v.slice(0,1000).map(x=>walk(x,depth+1));if(typeof v==='object'){return Object.fromEntries(Object.entries(v).slice(0,1000).map(([k,x])=>[k,secret.test(k)?'[REMOVIDO]':walk(x,depth+1)]))}return null}
 const clean=walk(value);const json=JSON.stringify(clean);if(new TextEncoder().encode(json).length<=60000)return clean
 // Keep JSONB serialization overhead below 64 KB, even with multi-byte characters.
 return {truncado:true,conteudo:Array.from(json).slice(0,10000).join('')}
}
export const apiError=(id:string,code='AUTENTICACAO_INVALIDA')=>({erro:{codigo:code,mensagem:code==='AUTENTICACAO_INVALIDA'?'Chave de acesso inválida.':code==='REQUISICAO_INVALIDA'?'Método não permitido.':'Não foi possível concluir a requisição.',detalhes:[],codigo_governo:null,mensagem_governo:null},id_requisicao:id})