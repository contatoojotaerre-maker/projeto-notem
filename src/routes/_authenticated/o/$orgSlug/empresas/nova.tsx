import { createFileRoute, Link } from '@tanstack/react-router';
import { ArrowLeft } from 'lucide-react';
import { pageHead,canEditCompany } from '@/lib/notem';
import { workspaceQuery } from '@/lib/notem.queries';
import { useOrganization } from '@/components/notem/app-shell';
import { CompanyForm } from '@/components/notem/company-form';
import { Button } from '@/components/ui/button';
export const Route=createFileRoute('/_authenticated/o/$orgSlug/empresas/nova')({head:()=>pageHead('Nova empresa'),loader:async({context,params})=>{const w=await context.queryClient.ensureQueryData(workspaceQuery());const o=w.organizations.find(o=>o.slug===params.orgSlug);const role=w.memberships.find(m=>m.organization_id===o?.id)?.role;if(!o||!canEditCompany(role,w.isAdmin))throw new Error('Acesso não autorizado.');},component:NewCompany});
function NewCompany(){const {orgSlug}=Route.useParams();const {organization}=useOrganization(orgSlug);if(!organization)return null;return <><Button variant="ghost" size="icon" asChild className="mb-4"><Link to="/o/$orgSlug/empresas" params={{orgSlug}} aria-label="Voltar para empresas"><ArrowLeft/></Link></Button><h1 className="page-heading mb-9">Nova empresa</h1><CompanyForm organizationId={organization.id} slug={orgSlug}/></>;}