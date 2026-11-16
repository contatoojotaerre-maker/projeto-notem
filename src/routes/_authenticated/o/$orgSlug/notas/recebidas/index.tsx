import { createFileRoute, notFound, useNavigate } from '@tanstack/react-router';
import { workspaceQuery } from '@/lib/notem.queries';
import { invoicesQuery } from '@/lib/invoices.queries';
import { pageHead } from '@/lib/notem';
import { parseReceivedSearch, type NotesSearch } from '@/lib/list-search';
import { useOrganization } from '@/components/notem/app-shell';
import { InvoiceList } from '@/components/notem/invoice-views';
// Notas › Recebidas: notes where a company of the organization is taker or intermediary (same filters, CSV and ZIP as Emitidas).
export const Route = createFileRoute('/_authenticated/o/$orgSlug/notas/recebidas/')({
  validateSearch: (search: Record<string, unknown>): NotesSearch => parseReceivedSearch(search),
  loader: async ({ context, params }) => {
    const w = await context.queryClient.ensureQueryData(workspaceQuery()); const o = w.organizations.find(o => o.slug === params.orgSlug); if (!o) throw notFound();
    await context.queryClient.ensureQueryData(invoicesQuery({ organization_id: o.id, environment: w.profile?.environment ?? 'production', offset: 0 }));
    return { organizationName: o.name };
  },
  head: ({ loaderData }) => pageHead(`Notas recebidas${loaderData?.organizationName ? ` · ${loaderData.organizationName}` : ''}`),
  component: Received,
});
function Received() {
  const { orgSlug } = Route.useParams(); const search = Route.useSearch(); const navigate = useNavigate({ from: Route.fullPath }); const { organization } = useOrganization(orgSlug);
  if (!organization) return null;
  return <InvoiceList direction="recebidas" organizationId={organization.id} slug={orgSlug} search={search} onSearch={next => void navigate({ search: parseReceivedSearch(next as Record<string, unknown>), replace: true })} />;
}
