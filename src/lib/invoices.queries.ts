import { queryOptions } from '@tanstack/react-query';
import { getPanelInvoice,getPanelInvoices,getPanelCustomers } from './invoices.functions';
export const invoicesQuery=(data:Parameters<typeof getPanelInvoices>[0]['data'])=>queryOptions({queryKey:['invoices',data],queryFn:()=>getPanelInvoices({data}),refetchInterval:30_000});
export const invoiceQuery=(data:Parameters<typeof getPanelInvoice>[0]['data'])=>queryOptions({queryKey:['invoice',data],queryFn:()=>getPanelInvoice({data}),refetchInterval:30_000});
export const customersQuery=(data:Parameters<typeof getPanelCustomers>[0]['data'])=>queryOptions({queryKey:['customers',data],queryFn:()=>getPanelCustomers({data})});