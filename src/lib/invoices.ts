import { z } from 'zod';
import type { Database, Json } from '@/integrations/supabase/types';
import { customerSchema } from './customers';
import { fiscalDecimal } from './dps';
import { API_BASE } from './app-url';
import { envLabel, isoBr } from './api-contract';
import { publicNfseUrl } from './danfse';

export type Invoice = Database['public']['Tables']['invoices']['Row'];
export const invoiceStatuses:Record<string,string>={processing:'processando',verifying:'em_verificacao',authorized:'autorizada',rejected:'rejeitada',cancellation_pending:'cancelamento_em_analise',cancelled:'cancelada',substituted:'substituida',cancelled_by_authority:'cancelada_prefeitura'};
export const invoiceLabels:Record<string,string>={processing:'Processando',verifying:'Em verificação',authorized:'Autorizada',rejected:'Rejeitada',cancellation_pending:'Cancelamento em análise',cancelled:'Cancelada',substituted:'Substituída',cancelled_by_authority:'Cancelada pela prefeitura'};
export const invoiceEventLabels:Record<string,string>={created:'Nota criada',sent:'DPS enviada',authorized:'Nota autorizada',rejected:'Nota rejeitada',verifying:'Aguardando confirmação do governo',verified:'Nota confirmada por consulta',not_sent:'Envio não realizado; aguardando repetição com a mesma chave'};
export const rejectionGuidance:Record<string,{campo:string;mensagem:string}>={
 E0116:{campo:'empresa.inscricao_municipal',mensagem:'Informe a inscrição municipal cadastrada pela prefeitura no CNC. Confirme o cadastro municipal antes de tentar novamente.'},
 E0120:{campo:'empresa.inscricao_municipal',mensagem:'A inscrição municipal não deve ser informada: não há cadastro complementar da prefeitura no CNC. Confira o cadastro e remova a inscrição quando não exigida.'},
 E0160:{campo:'configuracao_fiscal.simples_nacional',mensagem:'A situação no Simples diverge do cadastro da Receita na competência da nota. Confira a configuração fiscal e a data de competência.'},
 E0240:{campo:'tomador.endereco.cep',mensagem:'O CEP do tomador não existe ou não pertence ao município informado. Confira o CEP e o código do município.'},
 E0190:{campo:'tomador.documento',mensagem:'O CNPJ do tomador não foi encontrado na Receita. Confira os números e o cadastro na data de competência.'},
 E0207:{campo:'tomador.documento',mensagem:'O CPF do tomador não foi encontrado na Receita. Confira os números e o cadastro na data de competência.'},
 E0008:{campo:'emitida_em',mensagem:'A data e hora de emissão estão posteriores ao processamento pelo governo. Confira o relógio e tente novamente com a mesma chave.'},
 E0015:{campo:'competencia',mensagem:'A competência não pode ser posterior à emissão. Informe uma data igual ou anterior à emissão.'},
 E0714:{campo:'assinatura',mensagem:'O governo recusou a assinatura da DPS. Confira o certificado e a assinatura no transmissor antes de repetir a emissão.'},
};
const selector=z.string().trim().min(1).max(100);
export const invoiceRequest=z.object({
 empresa_id:z.string().uuid().optional(),empresa_id_externo:selector.optional(),id_externo:selector.nullable().optional(),
 servico_id:z.string().uuid().optional(),servico_id_externo:selector.optional(),competencia:z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),descricao:z.string().trim().min(1).max(2000).optional(),
 tomador:customerSchema.nullable().optional(),tomador_id:z.string().uuid().optional(),tomador_id_externo:selector.optional(),
 valores:z.object({servico:fiscalDecimal,desconto_incondicionado:fiscalDecimal.optional(),desconto_condicionado:fiscalDecimal.optional()}).strict(),
 retencao_iss:z.enum(['nao_retido','retido_tomador','retido_intermediario']).nullable().optional(),aliquota_iss_simples:z.string().regex(/^\d{1,2}(\.\d{1,2})?$/).nullable().optional(),
 local_prestacao:z.object({codigo_municipio:z.string().regex(/^\d{7}$/)}).strict().nullable().optional(),informacoes_complementares:z.string().max(2000).nullable().optional(),
}).strict().superRefine((v,c)=>{
 if(Number(Boolean(v.empresa_id))+Number(Boolean(v.empresa_id_externo))!==1)c.addIssue({code:'custom',path:['empresa_id'],message:'Informe empresa_id ou empresa_id_externo, nunca ambos.'});
 if(Number(Boolean(v.servico_id))+Number(Boolean(v.servico_id_externo))!==1)c.addIssue({code:'custom',path:['servico_id'],message:'Informe servico_id ou servico_id_externo, nunca ambos.'});
 if([v.tomador,v.tomador_id,v.tomador_id_externo].filter(Boolean).length>1)c.addIssue({code:'custom',path:['tomador'],message:'Informe somente uma forma de identificar o tomador.'});
});
export type InvoiceRequest=z.infer<typeof invoiceRequest>;
export function invoiceOut(i:Invoice){
 const obj=(v:unknown)=>v&&typeof v==='object'&&!Array.isArray(v)?v as Record<string,Json|undefined>:{};
 const sent=obj(i.sent_values),gov=obj(i.government_values),service=obj(i.service_snapshot);
 return {id:i.id,id_externo:i.external_id,empresa_id:i.company_id,ambiente:envLabel(i.environment),situacao:invoiceStatuses[i.status]??'processando',restricoes:i.restrictions,manifestacao:i.manifestation,numero:i.nfse_number,chave_acesso:i.access_key,serie_dps:String(i.dps_series).padStart(5,'0'),numero_dps:String(i.dps_number),competencia:i.competence,emitida_em:isoBr(i.emitted_at),autorizada_em:isoBr(i.authorized_at),tomador:i.customer_snapshot,servico:{servico_id:i.service_profile_id,codigo_servico:service['service_code'],descricao:i.description},valores:{...sent,base_calculo:gov['base']??null,aliquota_iss:gov['rate']??null,valor_iss:gov['iss']??null,valor_liquido:gov['net']??null,iss_retido:typeof gov['withheld']==='boolean'?gov['withheld']:service['withholding']!==1},local_prestacao:i.service_location,erros_governo:i.government_errors,substitui_nota_id:i.substitutes_invoice_id,substituida_por_nota_id:i.substituted_by_invoice_id,links:{xml:`${API_BASE}/notas/${i.id}/xml`,pdf:`${API_BASE}/notas/${i.id}/pdf`,consulta_publica:null},criada_em:isoBr(i.created_at),atualizada_em:isoBr(i.updated_at)};
}
export type GovernmentReply={status?:number;erro?:string;ms?:number;corpo_json?:Record<string,unknown>;corpo_texto?:string};
export type Transmission={dps_assinada?:string;resposta?:GovernmentReply};
export function governmentErrors(reply:GovernmentReply,invoiceId:string){
 const body=reply.corpo_json??{};const raw=body['erros']??body['Erros'];
 const rows=Array.isArray(raw)?raw:[];
 return rows.map((v:unknown)=>{const e=v&&typeof v==='object'?v as Record<string,Json|undefined>:{};const code=String(e['codigo']??e['Codigo']??'');const original=String(e['descricao']??e['Descricao']??'Rejeição informada pelo governo.');const guide=rejectionGuidance[code];return {campo:guide?.campo??'nota',mensagem:guide?.mensagem??'O governo rejeitou a nota. Confira a mensagem original nos detalhes.',codigo_governo:code,mensagem_governo:original,complemento:e['complemento']??null,nota_id:invoiceId};});
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