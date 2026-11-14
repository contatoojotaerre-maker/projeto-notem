import type { Json } from '@/integrations/supabase/types';
import type { DB } from './api.server';
import { callTransmissor,TransmissorError } from './transmissor.server';
import { readAuthorizedNfse } from './nfse-xml';
import { governmentErrors,invoiceOut,verificationDecision,type Invoice,type Transmission,type GovernmentReply } from './invoices';

async function payload(db:DB,i:Invoice){
 const r=await db.from('company_certificate_material').select('key_version,nonce,data').eq('company_id',i.company_id).eq('organization_id',i.organization_id).maybeSingle();
 if(r.error||!r.data)throw new TransmissorError('ENVELOPE_INVALIDO',422);
 const audit=await db.from('certificate_audit_events').insert({company_id:i.company_id,organization_id:i.organization_id,user_id:i.created_by,action:'used',purpose:'assinatura/transmissão ou consulta da nota '+i.id,environment:i.environment,result:'solicitado'});
 if(audit.error)throw new TransmissorError('AUDITORIA_INDISPONIVEL',422);
 return {organizacao_id:i.organization_id,empresa_id:i.company_id,ambiente:i.environment==='sandbox'?'homologacao':'producao',envelope:{versao_chave:r.data.key_version,nonce:r.data.nonce,dados:r.data.data}};
}
type Patch=Partial<Invoice>&{message?:string};
export async function persistInvoiceResult(db:DB,i:Invoice,patch:Patch,event:string,request?:Request){
 if(!i.claim_token)throw new Error('INVOICE_LEASE_MISSING');
 const next={...i,...patch,updated_at:new Date().toISOString()};
 const r=await db.rpc('finish_invoice_attempt',{_id:i.id,_token:i.claim_token,_patch:patch as Json,_nota:invoiceOut(next) as Json,_event:event});
 if(r.error)throw new Error('INVOICE_FINISH_FAILED');
 if(!r.data){const current=await db.from('invoices').select('*').eq('id',i.id).eq('organization_id',i.organization_id).single();if(current.error)throw new Error('INVOICE_READ_FAILED');return current.data;}
 if(request&&['authorized','rejected'].includes(r.data.status)){
  const wait=(request as Request&{waitUntil?:(p:Promise<unknown>)=>void}).waitUntil;
  const master=process.env['WEBHOOK_ENCRYPTION_KEY'];
  if(master&&typeof wait==='function'){const {processWebhookBatch}=await import('./webhooks.server');try{wait.call(request,processWebhookBatch(db,master,{skipDisable:true}).catch(()=>console.error('INVOICE_WEBHOOK_FAILED')));}catch{ /* durable queue remains */ }}
 }
 return r.data;
}
export async function applyGovernmentReply(db:DB,i:Invoice,res:Transmission,request?:Request){
 const reply=res.resposta??{};const signed=res.dps_assinada?{signed_dps_xml:res.dps_assinada}:{};
 const xml=reply.corpo_json?.['nfseXml'];
 if(reply.status===201&&typeof xml==='string'){
  try{const n=readAuthorizedNfse(xml);const key=reply.corpo_json?.['chaveAcesso'];if(key&&key!==n.accessKey)throw new Error('KEY_MISMATCH');return await persistInvoiceResult(db,i,{...signed,status:'authorized',dispatch_state:'completed',authorized_nfse_xml:xml,access_key:n.accessKey,nfse_number:n.number,authorized_at:n.authorizedAt,government_values:{base:n.base,rate:n.rate,iss:n.iss,net:n.net,withheld:n.withheld},message:'Nota autorizada pelo governo.'},'authorized',request);}catch(e){console.error('INVOICE_XML_RECONCILIATION_REQUIRED',i.id);}
 }
 if(reply.status===400||reply.status===403){
  let errors=governmentErrors(reply,i.id);
  if(!errors.length)errors=[{campo:reply.status===403?'certificado':'nota',mensagem:reply.status===403?'O governo recusou o certificado da empresa. Confira sua validade e autorização para emitir.':'O governo rejeitou a nota. Confira os dados enviados e os detalhes originais.',codigo_governo:String(reply.status),mensagem_governo:'Rejeição informada pelo governo.',complemento:null,nota_id:i.id}];
  const result=await persistInvoiceResult(db,i,{...signed,status:'rejected',dispatch_state:'completed',government_errors:errors as Json,message:errors[0]?.mensagem},'rejected',request);
  if(reply.status===403){const {refreshReadiness}=await import('./readiness.server');await refreshReadiness(db,i.company_id);}
  return result;
 }
 return persistInvoiceResult(db,i,{...signed,status:'verifying',dispatch_state:'uncertain',message:'Aguardando confirmação do governo; não envie com outra chave.'},'verifying',request);
}
/** A timeout/network failure is ambiguous: never assume the fiscal request was not sent. */
export function definitelyNotSent(e:unknown){return e instanceof TransmissorError&&(e.code==='CREDENCIAL'||(e.status!==undefined&&[400,422].includes(e.status)&&['DPS_INVALIDA','ENVELOPE_INVALIDO','REQUISICAO_INVALIDA','AUDITORIA_INDISPONIVEL'].includes(e.code)));}
export async function sendInvoice(db:DB,i:Invoice,request?:Request){
 const claim=await db.rpc('claim_invoice_dispatch',{_id:i.id,_org:i.organization_id});if(claim.error)throw new Error('INVOICE_CLAIM_FAILED');const claimed=claim.data?.[0];if(!claimed){const r=await db.from('invoices').select('*').eq('id',i.id).eq('organization_id',i.organization_id).single();if(r.error)throw new Error('INVOICE_READ_FAILED');return r.data;}
 let res:Transmission;
 try{const base=await payload(db,claimed);res=await callTransmissor<Transmission>('/v1/nfse/emitir',{...base,dps_xml:claimed.unsigned_dps_xml,tempo_limite_segundos:18});}
 catch(e){return persistInvoiceResult(db,claimed,{status:definitelyNotSent(e)?'processing':'verifying',dispatch_state:definitelyNotSent(e)?'not_sent':'uncertain',message:definitelyNotSent(e)?'Envio não realizado. Tente novamente com a mesma Idempotency-Key.':'Aguardando confirmação do governo.'},definitelyNotSent(e)?'not_sent':'verifying',request);}
 return applyGovernmentReply(db,claimed,res,request);
}
export async function processInvoiceVerifications(db:DB,now=Date.now()){
 const claims=await db.rpc('claim_invoice_verifications',{_limit:5});if(claims.error)throw new Error('INVOICE_VERIFICATION_CLAIM_FAILED');let completed=0,failed=0;
 for(const i of claims.data??[]){
  try{
   const base=await payload(db,i);const d=await callTransmissor<Transmission>('/v1/dps/consultar',{...base,id_dps:i.dps_id});const reply=d.resposta??{};const decision=verificationDecision(reply,i.verification_started_at??i.last_attempt_at??i.emitted_at,now);
   if(decision==='missing'){await persistInvoiceResult(db,i,{status:'rejected',dispatch_state:'completed',government_errors:[{campo:'nota',mensagem:'O governo não gerou esta nota',codigo_governo:'404',mensagem_governo:'DPS não encontrada',nota_id:i.id}],message:'O governo não gerou esta nota'},'rejected');completed++;continue;}
   const key=reply.corpo_json?.['chaveAcesso'];
   if(decision==='found'&&typeof key==='string'&&/^\d{50}$/.test(key)){
    const n=await callTransmissor<Transmission>('/v1/nfse/consultar',{...base,chave_acesso:key});const xml=n.resposta?.corpo_json?.['nfseXml'];
    if(n.resposta?.status===200&&typeof xml==='string'){const next=await applyGovernmentReply(db,i,{resposta:{...n.resposta,status:201,corpo_json:{...n.resposta.corpo_json,chaveAcesso:key}}});if(next.status==='authorized')completed++;else failed++;continue;}
   }
   await persistInvoiceResult(db,i,{status:'verifying',dispatch_state:'uncertain',message:'Consulta ainda sem confirmação; nova tentativa no próximo ciclo.'},'verifying');
  }catch{failed++;await persistInvoiceResult(db,i,{status:'verifying',dispatch_state:'uncertain',message:'Não foi possível consultar o governo; nova tentativa no próximo ciclo.'},'verifying');}
 }
 return {reserved:claims.data?.length??0,completed,failed};
}