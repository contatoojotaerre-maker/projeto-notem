import { createFileRoute, notFound } from '@tanstack/react-router';
import { workspaceQuery } from '@/lib/notem.queries';
import { receivedNoteQuery } from '@/lib/invoices.queries';
import { pageHead } from '@/lib/notem';
import { isMissingError, isPanelId } from '@/lib/panel-errors';
import { useOrganization } from '@/components/notem/app-shell';
import { ReceivedDetail } from '@/components/notem/sync-views';
// Own route: a received note is never opened by /notas/{id} (and an emitted note never here). Invalid or foreign id → not found.
export const Route = createFileRoute('/_authenticated/o/$orgSlug/notas/recebidas/$noteId')({
  loader: async ({ context, params }) => {
    const w = await context.queryClient.ensureQueryData(workspaceQuery()); const org = w.organizations.find(o => o.slug === params.orgSlug);
    if (!org || !isPanelId(params.noteId)) throw notFound();
    try { const r = await context.queryClient.ensureQueryData(receivedNoteQuery({ organization_id: org.id, environment: w.profile?.environment ?? 'production', id: params.noteId })); return { title: r.nota.numero ? `NFS-e ${r.nota.numero}` : 'Nota recebida' }; }
    catch (e) { if (isMissingError(e)) throw notFound(); throw e; }
  },
  head: ({ loaderData }) => pageHead(`${loaderData?.title ?? 'Nota recebida'} · Notas recebidas`),
  component: Detail,
});
function Detail() { const { orgSlug, noteId } = Route.useParams(); const { organization } = useOrganization(orgSlug); return organization ? <ReceivedDetail organizationId={organization.id} slug={orgSlug} id={noteId} /> : null; }
