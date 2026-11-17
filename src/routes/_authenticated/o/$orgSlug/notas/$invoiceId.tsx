import { createFileRoute, notFound } from '@tanstack/react-router';
import { workspaceQuery } from '@/lib/notem.queries';
import { invoiceQuery } from '@/lib/invoices.queries';
import { pageHead } from '@/lib/notem';
import { isMissingError, isPanelId } from '@/lib/panel-errors';
import { useOrganization } from '@/components/notem/app-shell';
import { InvoiceDetail } from '@/components/notem/invoice-views';
// Emitted notes only (notem and issued outside notem); received notes have their own route under notas/recebidas.
export const Route=createFileRoute('/_authenticated/o/$orgSlug/notas/$invoiceId')({loader:async({context,params})=>{const w=await context.queryClient.ensureQueryData(workspaceQuery());const org=w.organizations.find(o=>o.slug===params.orgSlug);if(!org||!isPanelId(params.invoiceId))throw notFound();try{const r=await context.queryClient.ensureQueryData(invoiceQuery({organization_id:org.id,environment:w.profile?.environment??'production',id:params.invoiceId}));return {title:r.nota.numero?`NFS-e ${r.nota.numero}`:'Nota em acompanhamento'};}catch(e){if(isMissingError(e))throw notFound();throw e;}},head:({loaderData})=>pageHead(`${loaderData?.title??'Nota'} · Notas emitidas`),component:Detail});
function Detail(){const {orgSlug,invoiceId}=Route.useParams();const {organization}=useOrganization(orgSlug);return organization?<InvoiceDetail organizationId={organization.id} slug={orgSlug} id={invoiceId}/>:null;}
