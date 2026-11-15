import { it,expect,vi } from 'vitest';
import { explicitExternalDps,MAX_EXTERNAL_DPS_RETRIES } from '../lib/external-dps';
import { sendInvoice } from '../lib/invoices.server';
import { callTransmissor } from '../lib/transmissor.server';
import { xmlStore } from './fake-db';
vi.mock('../lib/transmissor.server',()=>({callTransmissor:vi.fn(),TransmissorError:class extends Error{}}));
it('só E0014 explícita permite salto',()=>{expect(explicitExternalDps({status:400,corpo_json:{erros:[{codigo:'E0014'}]}})).toBe(true);for(const reply of [{status:500},{status:400,corpo_json:{erros:[]}},{status:400,corpo_json:{erros:[{codigo:'E0014'},{codigo:'E0160'}]}},{erro:'CONEXAO'}])expect(explicitExternalDps(reply)).toBe(false);});
it('cinco saltos, seis envios, mesma nota e nenhuma sétima tentativa',async()=>{
 expect(MAX_EXTERNAL_DPS_RETRIES).toBe(5);let i:any={id:'same',organization_id:'org',company_id:'company',status:'processing',dispatch_state:'not_sent',claim_token:'token',environment:'sandbox',dps_id:'DPS1',dps_number:1,external_number_retries:0};const x=xmlStore();x.seed('invoices','same','unsigned_dps','<DPS><infDPS Id="DPS1"><nDPS>1</nDPS><tpEmit>1</tpEmit><finNFSe>0</finNFSe><cLocEmi>4212254</cLocEmi></infDPS></DPS>');const kept:string[]=[];const numbers:number[]=[];
 const q:any={select:()=>q,eq:()=>q,maybeSingle:async()=>({data:{key_version:'1',nonce:'n',data:'d'},error:null}),insert:async()=>({error:null})};
 const db:any={storage:x.storage,from:(t:string)=>t==='fiscal_xml_files'?x.refsQuery():q,rpc:vi.fn(async(name:string,args:any)=>{if(name==='claim_invoice_dispatch'){i={...i,claim_token:'token',dispatch_state:'sending'};numbers.push(i.dps_number);return {data:[i]};}if(name==='retry_external_dps'){kept.push(await x.read(args._files.unsigned));if(i.external_number_retries<5)i={...i,dps_number:i.dps_number+1,dps_id:'DPS'+(i.dps_number+1),external_number_retries:i.external_number_retries+1,dispatch_state:'not_sent'};return {data:i};}i={...i,...args._patch};return {data:i};})};
 vi.mocked(callTransmissor).mockResolvedValue({resposta:{status:400,corpo_json:{erros:[{codigo:'E0014'}]}}});const result=await sendInvoice(db,i);expect(numbers).toEqual([1,2,3,4,5,6]);expect(result.id).toBe('same');expect(result.status).toBe('rejected');expect(callTransmissor).toHaveBeenCalledTimes(6);
 // Each number is sent with its own Id/nDPS and its XML is kept for the externally used number.
 expect(vi.mocked(callTransmissor).mock.calls.map(c=>(c[1] as {dps_xml:string}).dps_xml)).toEqual([1,2,3,4,5,6].map(n=>`<DPS><infDPS Id="DPS${n}"><nDPS>${n}</nDPS><tpEmit>1</tpEmit><finNFSe>0</finNFSe><cLocEmi>4212254</cLocEmi></infDPS></DPS>`));
 expect(kept).toEqual([1,2,3,4,5,6].map(n=>`<DPS><infDPS Id="DPS${n}"><nDPS>${n}</nDPS><tpEmit>1</tpEmit><finNFSe>0</finNFSe><cLocEmi>4212254</cLocEmi></infDPS></DPS>`));
});