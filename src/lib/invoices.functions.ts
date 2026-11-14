import { createServerFn } from '@tanstack/react-start';
import { requireSupabaseAuth } from '@/integrations/supabase/auth-middleware';
import { z } from 'zod';
import { invoiceOut } from './invoices';
const scope=z.object({organization_id:z.string().uuid(),environment:z.enum(['sandbox','production'])});
export const getPanelInvoices=createServerFn({method:'POST'}).middleware([requireSupabaseAuth]).inputValidator(scope.extend({company_id:z.string().uuid().optional(),status:z.string().max(40).optional(),from:z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),to:z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),offset:z.number().int().min(0).default(0)})).handler(async({context,data})=>{
 let q=context.supabase.from('invoices').select('*').eq('organization_id',data.organization_id).eq('environment',data.environment);
 if(data.company_id)q=q.eq('company_id',data.company_id);if(data.status)q=q.eq('status',data.status);if(data.from)q=q.gte('emitted_at',data.from+'T00:00:00-03:00');if(data.to)q=q.lte('emitted_at',data.to+'T23:59:59.999-03:00');
 const [r,companies]=await Promise.all([q.order('emitted_at',{ascending:false}).order('id').range(data.offset,data.offset+50),context.supabase.from('companies').select('id,legal_name').eq('organization_id',data.organization_id).order('legal_name')]);
 if(r.error||companies.error)throw new Error('Não foi possível carregar as notas.');return {rows:(r.data??[]).slice(0,50).map(i=>({id:i.id,status:i.status,company_id:i.company_id,number:i.nfse_number,external_id:i.external_id,customer:i.customer_snapshot,values:i.sent_values,emitted_at:i.emitted_at})),more:(r.data?.length??0)>50,companies:companies.data??[]};
});
export const getPanelInvoice=createServerFn({method:'POST'}).middleware([requireSupabaseAuth]).inputValidator(scope.extend({id:z.string().uuid()})).handler(async({context,data})=>{
 const i=await context.supabase.from('invoices').select('*').eq('id',data.id).eq('organization_id',data.organization_id).eq('environment',data.environment).maybeSingle();if(i.error||!i.data)throw new Error('Nota não encontrada ou acesso não autorizado.');
 const events=await context.supabase.from('invoice_events').select('id,type,details,created_at').eq('invoice_id',data.id).eq('organization_id',data.organization_id).order('created_at').order('id');if(events.error)throw new Error('Não foi possível carregar o histórico.');
 return {nota:invoiceOut(i.data),status:i.data.status,events:events.data??[],technical:{dps_id:i.data.dps_id,unsigned:i.data.unsigned_dps_xml,signed:i.data.signed_dps_xml,xml:i.data.authorized_nfse_xml}};
});
export const getPanelInvoicePdf=createServerFn({method:'POST'}).middleware([requireSupabaseAuth]).inputValidator(scope.extend({id:z.string().uuid()})).handler(async({context,data})=>{
 const i=await context.supabase.from('invoices').select('authorized_nfse_xml,status,company_id,nfse_number').eq('id',data.id).eq('organization_id',data.organization_id).eq('environment',data.environment).maybeSingle();
 const {pdfStatuses}=await import('./danfse');
 if(i.error||!i.data?.authorized_nfse_xml||!pdfStatuses.includes(i.data.status))throw new Error('DANFSe não encontrado ou acesso não autorizado.');
 const f=await context.supabase.from('company_fiscal_settings').select('print_danfse_receipt').eq('company_id',i.data.company_id).eq('organization_id',data.organization_id).maybeSingle();if(f.error)throw new Error('Não foi possível carregar a configuração do DANFSe.');
 const {generateDanfse}=await import('./danfse.server');const pdf=await generateDanfse(i.data.authorized_nfse_xml,i.data.status,f.data?.print_danfse_receipt??false);
 let base64='';for(const b of pdf)base64+=String.fromCharCode(b);return {base64:btoa(base64),filename:`danfse-${i.data.nfse_number??data.id}.pdf`};
});
export const getPanelCustomers=createServerFn({method:'POST'}).middleware([requireSupabaseAuth]).inputValidator(z.object({company_id:z.string().uuid(),organization_id:z.string().uuid(),offset:z.number().int().min(0).default(0)})).handler(async({context,data})=>{
 const r=await context.supabase.from('company_customers').select('id,external_id,customer_data,created_at,updated_at').eq('company_id',data.company_id).eq('organization_id',data.organization_id).order('created_at',{ascending:false}).order('id').range(data.offset,data.offset+50);if(r.error)throw new Error('Não foi possível carregar os tomadores.');return {rows:(r.data??[]).slice(0,50),more:(r.data?.length??0)>50};
});