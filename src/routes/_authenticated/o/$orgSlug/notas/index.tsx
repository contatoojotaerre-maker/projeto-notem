import { createFileRoute, notFound, useNavigate } from '@tanstack/react-router';
import { workspaceQuery } from '@/lib/notem.queries';
import { invoicesQuery } from '@/lib/invoices.queries';
import { pageHead } from '@/lib/notem';
import { parseNotesSearch, type NotesSearch } from '@/lib/list-search';
import { useOrganization } from '@/components/notem/app-shell';
import { InvoiceList } from '@/components/notem/invoice-views';
// Filters live in the address (?busca, empresa, situacao, origem, data, de, ate, pagina) so "voltar" keeps them.
export const Route = createFileRoute('/_authenticated/o/$orgSlug/notas/')({
  validateSearch: (search: Record<string, unknown>): NotesSearch => parseNotesSearch(search),
  loader: async ({ context, params }) => {
    const w = await context.queryClient.ensureQueryData(workspaceQuery()); const o = w.organizations.find(o => o.slug === params.orgSlug); if (!o) throw notFound();
    await context.queryClient.ensureQueryData(invoicesQuery({ organization_id: o.id, environment: w.profile?.environment ?? 'production', offset: 0 }));
    return { organizationName: o.name };
  },
  head: ({ loaderData }) => pageHead(`Notas emitidas${loaderData?.organizationName ? ` · ${loaderData.organizationName}` : ''}`),
  component: Notes,
});
function Notes() {
  const { orgSlug } = Route.useParams(); const search = Route.useSearch(); const navigate = useNavigate({ from: Route.fullPath }); const { organization } = useOrganization(orgSlug);
  if (!organization) return null;
  return <InvoiceList organizationId={organization.id} slug={orgSlug} search={search} onSearch={next => void navigate({ search: parseNotesSearch(next as Record<string, unknown>), replace: true })} />;
}
