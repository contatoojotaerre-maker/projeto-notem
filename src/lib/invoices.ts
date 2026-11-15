import { TAKER_MUNICIPALITY_REJECTION } from './ibscbs';
import { z } from 'zod';
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
export const rejectionGuidance:Record<string,{campo:string;mensagem:string}>={
 E0855:{campo:'servico_id',mensagem:'O governo exige a classificação IBS/CBS para esta competência (E0855). Classifique o serviço (NBS, classificação tributária e indicador de operação) e emita novamente. Se a data de obrigatoriedade configurada na notem ainda não chegou, o administrador da plataforma precisa antecipá-la para este ambiente.'},
 E0322:{campo:'servico.codigo_nbs',mensagem:'O governo exige o código NBS quando a nota leva IBS/CBS (E0322). Informe o NBS no cadastro do serviço.'},
 E0859:{campo:'servico.classificacao_ibscbs',mensagem:'O governo não aceita indicador de operação para esta classificação, que não tem tributação do IBS/CBS (E0859). Remova o indicador no cadastro do serviço.'},
 E0860:{campo:'servico.classificacao_ibscbs',mensagem:'O governo exige o indicador de operação para esta classificação, que tem tributação do IBS/CBS (E0860). Informe o indicador no cadastro do serviço.'},
 E0958:{campo:'servico.classificacao_ibscbs',mensagem:'O governo não aceita esta classificação tributária para prestação de serviços (E0958). Escolha outra classificação no cadastro do serviço.'},
 E0959:{campo:'servico.classificacao_ibscbs',mensagem:'O CST não corresponde à classificação tributária (E0959). Escolha novamente a classificação no cadastro do serviço.'},
 E0960:{campo:'servico.classificacao_ibscbs',mensagem:'O governo exige as informações de tributação do IBS/CBS para esta classificação (E0960). Confira a classificação do serviço.'},
 E0961:{campo:'servico.classificacao_ibscbs',mensagem:'O governo não aceita informações de tributação do IBS/CBS para esta classificação (E0961). Confira a classificação do serviço.'},
 E0239:{campo:'tomador',mensagem:'Com IBS/CBS tributado no endereço do tomador, o governo exige tomador identificado por CPF ou CNPJ com endereço no Brasil (E0239).'},
 E0243:{campo:'tomador',mensagem:'Com IBS/CBS tributado no endereço do destinatário, o governo exige tomador identificado por CPF ou CNPJ com endereço no Brasil (E0243).'},
 E0014:{campo:'numero_dps',mensagem:'O governo informou que esta DPS já existe. O limite de cinco saltos foi atingido ou a numeração está esgotada. Confira a série e o histórico antes de emitir novamente.'},
 E0116:{campo:'empresa.inscricao_municipal',mensagem:'Informe a inscrição municipal cadastrada pela prefeitura no CNC. Confirme o cadastro municipal antes de tentar novamente.'},
 E0120:{campo:'empresa.inscricao_municipal',mensagem:'A inscrição municipal não deve ser informada: não há cadastro complementar da prefeitura no CNC. Confira o cadastro e remova a inscrição quando não exigida.'},
 E0160:{campo:'configuracao_fiscal.simples_nacional',mensagem:'A situação no Simples diverge do cadastro da Receita na competência da nota. Confira a configuração fiscal e a data de competência.'},
 E0240:{campo:'tomador.endereco.cep',mensagem:'O CEP do tomador não existe ou não pertence ao município informado. Confira o CEP e o código do município.'},
 E0190:{campo:'tomador.documento',mensagem:'O CNPJ do tomador não foi encontrado na Receita. Confira os números e o cadastro na data de competência.'},
 E0207:{campo:'tomador.documento',mensagem:'O CPF do tomador não foi encontrado na Receita. Confira os números e o cadastro na data de competência.'},
 E0008:{campo:'emitida_em',mensagem:'A data e hora de emissão estão posteriores ao processamento pelo governo. Confira o relógio e tente novamente com a mesma chave.'},
 E0015:{campo:'competencia',mensagem:'A competência não pode ser posterior à emissão. Informe uma data igual ou anterior à emissão.'},
 E0822:{campo:'cancelamento',mensagem:'O prazo de cancelamento definido pelo município expirou. Você pode solicitar a análise fiscal do cancelamento à prefeitura.'},
 E0823:{campo:'cancelamento',mensagem:'O valor da nota está acima do limite que o município permite cancelar diretamente. Você pode solicitar a análise fiscal do cancelamento à prefeitura.'},
 E0824:{campo:'cancelamento',mensagem:'O município não permite cancelar diretamente nota sem tomador identificado. Você pode solicitar a análise fiscal do cancelamento à prefeitura.'},
 E0827:{campo:'cancelamento',mensagem:'A nota já tem tributos recolhidos vinculados e o município não permite cancelá-la diretamente. Você pode solicitar a análise fiscal do cancelamento à prefeitura.'},
 E0840:{campo:'cancelamento',mensagem:'A nota já tem um evento que impede o cancelamento (por exemplo, análise pendente ou manifestação de confirmação). Confira o histórico da nota no Portal Nacional.'},
 E0848:{campo:'cancelamento',mensagem:'A nota já tem um evento que impede a solicitação de análise fiscal. Confira o histórico da nota no Portal Nacional.'},
 E0068:{campo:'substituicao',mensagem:'A nota tem análise fiscal de cancelamento aguardando resposta da prefeitura e não pode ser substituída agora.'},
 E0070:{campo:'substituicao',mensagem:'O tomador já confirmou o serviço desta nota; ela não pode mais ser substituída.'},
 E0072:{campo:'substituicao',mensagem:'A nota já teve confirmação tácita; ela não pode mais ser substituída.'},
 E0046:{campo:'substituicao',mensagem:'Nota cancelada não pode ser substituída.'},
 E0042:{campo:'substituicao',mensagem:'A nota substituída deve ser da mesma empresa e do mesmo município emissor.'},
 E0065:{campo:'substituicao',mensagem:'A nota substituída deve ser do mesmo ambiente (produção ou homologação).'},
 E0060:{campo:'substituicao',mensagem:'Para não optante do Simples, a substituição não pode alterar competência, código do serviço, código municipal nem local da prestação.'},
 E0061:{campo:'substituicao',mensagem:'Para MEI e ME/EPP, a substituição não pode alterar o documento do tomador, a competência nem o valor do serviço.'},
 E0050:{campo:'substituicao',mensagem:'O prazo de substituição definido pelo município expirou.'},
 E0056:{campo:'substituicao',mensagem:'O município não permite substituir nota sem tomador identificado.'},
 E0058:{campo:'substituicao',mensagem:'O município não permite alterar a identificação do tomador ou intermediário na substituição.'},
 E0074:{campo:'substituicao',mensagem:'A nota já tem tributos recolhidos vinculados e o município não permite substituí-la.'},
 E0812:{campo:'certificado',mensagem:'O CNPJ do certificado da empresa não corresponde ao prestador da nota. Confira o certificado cadastrado.'},
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
 return {id:i.id,origem:'notem' as const,id_externo:i.external_id,empresa_id:i.company_id,ambiente:envLabel(i.environment),situacao:invoiceStatuses[i.status]??'processando',restricoes:i.restrictions,manifestacao:i.manifestation,numero:i.nfse_number,chave_acesso:i.access_key,serie_dps:String(i.dps_series).padStart(5,'0'),numero_dps:String(i.dps_number),competencia:i.competence,emitida_em:isoBr(i.emitted_at),autorizada_em:isoBr(i.authorized_at),tomador:i.customer_snapshot,servico:{servico_id:i.service_profile_id,codigo_servico:service['service_code'],descricao:i.description},valores:{...sent,base_calculo:gov['base']??null,aliquota_iss:gov['rate']??null,valor_iss:gov['iss']??null,valor_liquido:gov['net']??null,iss_retido:typeof gov['withheld']==='boolean'?gov['withheld']:service['withholding']!==1},local_prestacao:i.service_location,erros_governo:i.government_errors,substitui_nota_id:i.substitutes_invoice_id,substituida_por_nota_id:i.substituted_by_invoice_id,operacao_pendente:pendingOut(i.pending_operation),cancelamento:cancellationOut(i.cancellation),links:{xml:`${API_BASE}/notas/${i.id}/xml`,pdf:`${API_BASE}/notas/${i.id}/pdf`,consulta_publica:i.access_key?publicNfseUrl(i.access_key):null},criada_em:isoBr(i.created_at),atualizada_em:isoBr(i.updated_at)};
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
