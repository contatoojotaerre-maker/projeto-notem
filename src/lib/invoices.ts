import { TAKER_MUNICIPALITY_REJECTION } from './ibscbs';
import { z } from './validation';
import type { Database, Json } from '@/integrations/supabase/types';
import { customerSchema } from './customers';
import { fiscalDecimal } from './dps';
import { API_BASE } from './app-url';
import { envLabel, isoBr } from './api-contract';
import { publicNfseUrl } from './danfse';
import { keyHitsSchemaDefect } from './fiscal-ids';

export type Invoice = Database['public']['Tables']['invoices']['Row'];
export const invoiceStatuses:Record<string,string>={processing:'processando',verifying:'em_verificacao',authorized:'autorizada',rejected:'rejeitada',cancellation_pending:'cancelamento_em_analise',cancelled:'cancelada',substituted:'substituida',cancelled_by_authority:'cancelada_prefeitura'};
export const invoiceLabels:Record<string,string>={processing:'Processando',verifying:'Em verificação',authorized:'Autorizada',rejected:'Rejeitada',cancellation_pending:'Cancelamento em análise',cancelled:'Cancelada',substituted:'Substituída',cancelled_by_authority:'Cancelada pela prefeitura'};
export const invoiceEventLabels:Record<string,string>={government_event:'Registrado fora da notem',cancellation_requested:'Cancelamento solicitado',analysis_requested:'Análise fiscal do cancelamento solicitada',cancellation_registered:'Cancelamento registrado',cancellation_registered_outside:'Cancelamento registrado fora da notem',analysis_registered:'Cancelamento em análise pela prefeitura',event_rejected:'Pedido recusado pelo governo',event_verifying:'Aguardando confirmação do governo',event_not_registered:'Governo sem registro do pedido; nota segue autorizada',event_not_sent:'Pedido não enviado; repita com a mesma chave',substitution_requested:'Substituição solicitada',substituted:'Nota substituída',external_number_skipped:'Número usado externamente; DPS renumerada',created:'Nota criada',sent:'DPS enviada',authorized:'Nota autorizada',rejected:'Nota rejeitada',verifying:'Aguardando confirmação do governo',verified:'Nota confirmada por consulta',not_sent:'Envio não realizado; aguardando repetição com a mesma chave'};
import { rejectionGuidance } from './rejection-guidance';
export { rejectionGuidance };
const selector=z.string().trim().min(1).max(100);
export const invoiceRequest=z.strictObject({
 empresa_id:z.string().uuid().optional(),empresa_id_externo:selector.optional(),id_externo:selector.nullable().optional(),
 servico_id:z.string().uuid().optional(),servico_id_externo:selector.optional(),competencia:z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),descricao:z.string().trim().min(1).max(2000).optional(),
 tomador:customerSchema.nullable().optional(),tomador_id:z.string().uuid().optional(),tomador_id_externo:selector.optional(),
 valores:z.strictObject({servico:fiscalDecimal,desconto_incondicionado:fiscalDecimal.optional(),desconto_condicionado:fiscalDecimal.optional()}),
 retencao_iss:z.enum(['nao_retido','retido_tomador','retido_intermediario']).nullable().optional(),aliquota_iss_simples:z.string().regex(/^\d{1,2}(\.\d{1,2})?$/).nullable().optional(),
 local_prestacao:z.strictObject({codigo_municipio:z.string().regex(/^\d{7}$/)}).nullable().optional(),informacoes_complementares:z.string().max(2000).nullable().optional(),
}).superRefine((v,c)=>{
 if(Number(Boolean(v.empresa_id))+Number(Boolean(v.empresa_id_externo))!==1)c.addIssue({code:'custom',path:['empresa_id'],message:'Informe empresa_id ou empresa_id_externo, nunca ambos.'});
 if(Number(Boolean(v.servico_id))+Number(Boolean(v.servico_id_externo))!==1)c.addIssue({code:'custom',path:['servico_id'],message:'Informe servico_id ou servico_id_externo, nunca ambos.'});
 if([v.tomador,v.tomador_id,v.tomador_id_externo].filter(Boolean).length>1)c.addIssue({code:'custom',path:['tomador'],message:'Informe somente uma forma de identificar o tomador.'});
});
export type InvoiceRequest=z.infer<typeof invoiceRequest>;
export function invoiceOut(i:Invoice){
 const obj=(v:unknown)=>v&&typeof v==='object'&&!Array.isArray(v)?v as Record<string,Json|undefined>:{};
 const sent=obj(i.sent_values),gov=obj(i.government_values),service=obj(i.service_snapshot);
 return {id:i.id,origem:'notem' as const,id_externo:i.external_id,empresa_id:i.company_id,ambiente:envLabel(i.environment),situacao:invoiceStatuses[i.status]??'processando',restricoes:i.restrictions,manifestacao:i.manifestation,numero:i.nfse_number,chave_acesso:i.access_key,serie_dps:String(i.dps_series).padStart(5,'0'),numero_dps:String(i.dps_number),competencia:i.competence,emitida_em:isoBr(i.emitted_at),autorizada_em:isoBr(i.authorized_at),tomador:i.customer_snapshot,servico:{servico_id:i.service_profile_id,codigo_servico:service['service_code'],descricao:i.description},valores:{...sent,base_calculo:gov['base']??null,aliquota_iss:gov['rate']??null,valor_iss:gov['iss']??null,valor_liquido:gov['net']??null,iss_retido:typeof gov['withheld']==='boolean'?gov['withheld']:service['withholding']!==1},local_prestacao:i.service_location,ibs_cbs:gov['ibs_cbs']??null,erros_governo:i.government_errors,substitui_nota_id:i.substitutes_invoice_id,substituida_por_nota_id:i.substituted_by_invoice_id,operacao_pendente:pendingOut(i.pending_operation),cancelamento:cancellationOut(i.cancellation),links:{xml:`${API_BASE}/notas/${i.id}/xml`,pdf:`${API_BASE}/notas/${i.id}/pdf`,consulta_publica:i.access_key?publicNfseUrl(i.access_key):null},criada_em:isoBr(i.created_at),atualizada_em:isoBr(i.updated_at)};
}
/** Official text of the Anexo VI rule still coded EXXX: taker municipality differs from the CPF/CNPJ registry. */
const TAKER_MUNICIPALITY_PATTERN=/endereço do tomador do serviço, identificado pelo (CNPJ|CPF), não corresponde ao município registrado/i;
export type GovernmentReply={status?:number;erro?:string;ms?:number;corpo_json?:Record<string,unknown>;corpo_texto?:string};
export type Transmission={dps_assinada?:string;resposta?:GovernmentReply};
export function governmentErrors(reply:GovernmentReply,invoiceId:string){
 const body=reply.corpo_json??{};const raw=body['erros']??body['Erros']??body['erro']??body['Erro'];
 const rows=Array.isArray(raw)?raw:raw&&typeof raw==='object'?[raw]:[];
 return rows.map((v:unknown)=>{const e=v&&typeof v==='object'?v as Record<string,Json|undefined>:{};const code=String(e['codigo']??e['Codigo']??'');const original=String(e['descricao']??e['Descricao']??'Rejeição informada pelo governo.');const guide=rejectionGuidance[code]??(TAKER_MUNICIPALITY_PATTERN.test(original)?{campo:'tomador.endereco.codigo_municipio',mensagem:TAKER_MUNICIPALITY_REJECTION}:undefined);return {campo:guide?.campo??'nota',mensagem:guide?.mensagem??'O governo rejeitou a nota. Confira a mensagem original nos detalhes.',codigo_governo:code,mensagem_governo:original,complemento:e['complemento']??null,nota_id:invoiceId};});
}
/** Shown when the government refuses, by schema failure, an access key that the defective official TSChaveNFSe rejects. */
export const ALPHANUMERIC_KEY_SCHEMA_MESSAGE='O governo recusou a chave de acesso com CNPJ alfanumérico por um defeito conhecido no esquema oficial. Tente novamente mais tarde ou use o Portal Nacional.';
export function explainKeySchemaDefect<T extends {campo:string;mensagem:string;codigo_governo:string;mensagem_governo:string}>(errors:T[],key:unknown,campo?:string):T[]{
 if(!keyHitsSchemaDefect(key))return errors;
 return errors.map(e=>e.codigo_governo==='E1235'||/esquema|schema/i.test(e.mensagem_governo)?{...e,...campo?{campo}:{},mensagem:ALPHANUMERIC_KEY_SCHEMA_MESSAGE}:e);
}
export function verificationDecision(reply:GovernmentReply,started:string,now=Date.now()):'found'|'missing'|'retry'{
 if(reply.status===200)return 'found';
 if(reply.status===404&&now-Date.parse(started)>=15*60_000)return 'missing';
 return 'retry';
}
export function replayDecision(i:Pick<Invoice,'request_hash'|'status'|'dispatch_state'>,hash:string){
 if(i.request_hash!==hash)return 'conflict';
 if(i.status==='processing'&&i.dispatch_state==='not_sent')return 'send';
 return i.status==='authorized'?'authorized':i.status==='rejected'?'rejected':'pending';
}
const record=(v:unknown)=>v&&typeof v==='object'&&!Array.isArray(v)?v as Record<string,unknown>:null;
const when=(v:unknown)=>typeof v==='string'?isoBr(v):null;
/** Public shape of an ambiguous fiscal operation; null when nothing is pending. */
export function pendingOut(v:unknown){const o=record(v);return o?{tipo:String(o['tipo']),estado:String(o['estado']),desde:when(o['desde'])}:null;}
/** Public shape of the latest cancellation/analysis request (stored in the invoice row). */
export function cancellationOut(v:unknown){const o=record(v);if(!o)return null;const text=(k:string)=>typeof o[k]==='string'?o[k] as string:null;return {tipo:text('tipo'),motivo:text('motivo'),justificativa:text('justificativa'),solicitado_em:when(o['solicitado_em']),registrado_em:when(o['registrado_em']),situacao:text('situacao'),pode_solicitar_analise:o['pode_solicitar_analise']===true,registrado_fora_da_notem:o['registrado_fora_da_notem']===true,erros_governo:(Array.isArray(o['erros_governo'])?o['erros_governo']:[]) as Json[]};}
