import { createFileRoute, notFound, redirect } from '@tanstack/react-router';
import { PanelAccessDenied } from '@/lib/panel-errors';
import { dateBr } from '@/lib/br-format';
import { useState } from 'react';
import { queryOptions,useSuspenseQuery,useQueryClient } from '@tanstack/react-query';
import { useServerFn } from '@tanstack/react-start';
import { toast } from 'sonner';
import { Save } from 'lucide-react';
import { workspaceQuery } from '@/lib/notem.queries';
import { pageHead,canManageOrganization,roleLabels } from '@/lib/notem';
import { getTeam,renameOrganization } from '@/lib/notem.functions';
import { useOrganization } from '@/components/notem/app-shell';
import { HomeView } from '@/components/notem/home-view';
import { AlertsView } from '@/components/notem/alerts-view';
import { HelpView } from '@/components/notem/help-view';
import { dashboardQuery,orgAlertsQuery,supportContactQuery } from '@/lib/panel-home.queries';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { webhookAlertsQuery } from '@/lib/webhooks.queries';
const titles:Record<string,string>={inicio:'Início',alertas:'Alertas',integracoes:'Integrações',equipe:'Equipe',organizacao:'Organização',ajuda:'Ajuda'};
const teamQuery=(organization_id:string)=>queryOptions({queryKey:['team',organization_id],queryFn:()=>getTeam({data:{organization_id}})});
export const Route=createFileRoute('/_authenticated/o/$orgSlug/$section')({head:({params})=>pageHead(titles[params.section]??'Página indisponível'),beforeLoad:({params})=>{if(params.section==='notas')throw redirect({to:'/o/$orgSlug/notas',params:{orgSlug:params.orgSlug},replace:true});if(params.section==='modelos-de-servico')throw redirect({to:'/o/$orgSlug/$section',params:{orgSlug:params.orgSlug,section:'inicio'},replace:true});},loader:async({context,params})=>{const w=await context.queryClient.ensureQueryData(workspaceQuery());const o=w.organizations.find(o=>o.slug===params.orgSlug);if(!o||!titles[params.section])throw notFound();const role=w.memberships.find(m=>m.organization_id===o.id)?.role;if(['equipe','organizacao'].includes(params.section)&&!canManageOrganization(role,w.isAdmin))throw new PanelAccessDenied();const environment=w.profile?.environment??'production';if(params.section==='inicio')await context.queryClient.ensureQueryData(dashboardQuery({organization_id:o.id,environment,period:'mes_atual'}));if(params.section==='alertas')await Promise.all([context.queryClient.ensureQueryData(orgAlertsQuery({organization_id:o.id,environment})),context.queryClient.ensureQueryData(webhookAlertsQuery(o.id))]);if(params.section==='ajuda')await context.queryClient.ensureQueryData(supportContactQuery());if(params.section==='equipe')await context.queryClient.ensureQueryData(teamQuery(o.id));},component:OrganizationSection});
function OrganizationSection(){const {orgSlug,section}=Route.useParams();const {organization,role,isAdmin}=useOrganization(orgSlug);if(!organization)return null;if(section==='alertas')return <AlertsView organizationId={organization.id} slug={orgSlug}/>;if(section==='ajuda')return <HelpView slug={orgSlug}/>;if(section==='organizacao')return <OrganizationForm id={organization.id} name={organization.name} slug={organization.slug}/>;if(section==='equipe')return <Team id={organization.id}/>;return <HomeView organizationId={organization.id} slug={orgSlug} name={organization.name} canCreate={isAdmin||role==='owner'||role==='admin'}/>;}
function OrganizationForm({id,name,slug}:{id:string,name:string,slug:string}){const [value,setValue]=useState(name);const [busy,setBusy]=useState(false);const save=useServerFn(renameOrganization);const cache=useQueryClient();return <><h1 className="page-heading mb-9">Organização</h1><form className="max-w-lg space-y-6" onSubmit={async e=>{e.preventDefault();setBusy(true);try{await save({data:{id,name:value}});await cache.invalidateQueries({queryKey:['workspace']});toast.success('Organização atualizada.');}catch{toast.error('Não foi possível salvar.');}finally{setBusy(false);}}}><div className="form-field"><label htmlFor="organization-name">Nome</label><Input id="organization-name" value={value} onChange={e=>setValue(e.target.value)} required/></div><div className="form-field"><label htmlFor="organization-slug">Endereço</label><Input id="organization-slug" value={slug} disabled/></div><Button disabled={busy}><Save/>Salvar alterações</Button></form></>;}
function Team({id}:{id:string}){const {data}=useSuspenseQuery(teamQuery(id));return <><h1 className="page-heading mb-8">Equipe</h1><div className="table-wrap"><table className="data-table"><thead><tr><th>Usuário</th><th>Papel</th><th>Desde</th></tr></thead><tbody>{data.map(m=><tr key={m.id}><td><p className="font-medium">{m.display_name||m.email}</p>{m.display_name&&<p className="mt-1 text-xs text-muted-foreground">{m.email}</p>}</td><td>{roleLabels[m.role]}</td><td>{dateBr(m.created_at)}</td></tr>)}</tbody></table></div></>;}
