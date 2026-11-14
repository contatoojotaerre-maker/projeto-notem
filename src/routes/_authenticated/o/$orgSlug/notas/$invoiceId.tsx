import { createFileRoute } from '@tanstack/react-router';
import { workspaceQuery } from '@/lib/notem.queries';
import { invoiceQuery } from '@/lib/invoices.queries';
import { pageHead } from '@/lib/notem';
import { useOrganization } from '@/components/notem/app-shell';
import { InvoiceDetail } from '@/components/notem/invoice-views';
export const Route=createFileRoute('/_authenticated/o/$orgSlug/notas/$invoiceId')({head:()=>pageHead('Detalhe e histórico da NFS-e'),loader:async({context,params})=>{const w=await context.queryClient.ensureQueryData(workspaceQuery());const org=w.organizations.find(o=>o.slug===params.orgSlug);if(!org)throw new Error('Acesso não autorizado.');await context.queryClient.ensureQueryData(invoiceQuery({organization_id:org.id,environment:w.profile?.environment??'production',id:params.invoiceId}));},component:Detail});
function Detail(){const {orgSlug,invoiceId}=Route.useParams();const {organization}=useOrganization(orgSlug);return organization?<InvoiceDetail organizationId={organization.id} slug={orgSlug} id={invoiceId}/>:null;}