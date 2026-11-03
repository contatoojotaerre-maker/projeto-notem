import { queryOptions } from '@tanstack/react-query';
import { getCompanyFiscal } from './fiscal.functions';
export const fiscalQuery=(company_id:string,organization_id:string)=>queryOptions({queryKey:['company-fiscal',company_id,organization_id],queryFn:()=>getCompanyFiscal({data:{company_id,organization_id}})});