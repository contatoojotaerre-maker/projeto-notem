import { createFileRoute, Link } from '@tanstack/react-router';
import { useSuspenseQuery } from '@tanstack/react-query';
import { Building2, ArrowRight, Users } from 'lucide-react';
import { AppShell, useWorkspace } from '@/components/notem/app-shell';
import { workspaceQuery } from '@/lib/notem.queries';
import { pageHead } from '@/lib/notem';
import { Button } from '@/components/ui/button';
export const Route=createFileRoute('/_authenticated/dashboard')({head:()=>pageHead('Início'),loader:({context})=>context.queryClient.ensureQueryData(workspaceQuery()),component:Dashboard});
function Dashboard(){useSuspenseQuery(workspaceQuery());return <AppShellDashboard/>;}
function AppShellDashboard(){return <DashboardStandalone/>;}
function DashboardStandalone(){return <DashboardWrapper/>;}
function DashboardWrapper(){return <AppShell/>;}
export function DashboardContent(){const workspace=useWorkspace();return <><h1 className="page-heading">Olá{workspace.profile?.display_name?`, ${workspace.profile.display_name.split(' ')[0]}`:''}.</h1><p className="mt-2 text-muted-foreground">{workspace.organizations.length?'Suas organizações':'Você ainda não participa de nenhuma organização.'}</p><div className="mt-8 grid gap-5 md:grid-cols-2 xl:grid-cols-3">{workspace.organizations.map(o=><article className="glass-panel p-6" key={o.id}><Building2 size={25} className="mb-6 text-muted-foreground"/><h2 className="text-lg font-medium">{o.name}</h2><Button variant="ghost" asChild className="mt-5 w-full justify-between"><Link to="/o/$orgSlug/$section" params={{orgSlug:o.slug,section:'inicio'}}>Abrir organização<ArrowRight/></Link></Button></article>)}</div>{workspace.isAdmin&&<Button className="mt-8" asChild><Link to="/admin/organizacoes"><Users/>Gerenciar organizações</Link></Button>}</>;}