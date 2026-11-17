import { createFileRoute, notFound, redirect, useNavigate } from '@tanstack/react-router';
import { PanelAccessDenied } from '@/lib/panel-errors';
import { dateBr } from '@/lib/br-format';
import { useState } from 'react';
import { queryOptions,useSuspenseQuery,useQueryClient } from '@tanstack/react-query';
import { useServerFn } from '@tanstack/react-start';
import { toast } from 'sonner';
import { Save } from 'lucide-react';
import { workspaceQuery } from '@/lib/notem.queries';
import { pageHead,canManageOrganization,roleLabels,organizationTypeLabels } from '@/lib/notem';
import { getTeam,renameOrganization } from '@/lib/notem.functions';
import { useOrganization } from '@/components/notem/app-shell';
import { HomeView } from '@/components/notem/home-view';
import { AlertsView } from '@/components/notem/alerts-view';
import { SharedRegistryNotice } from '@/components/notem/panel-chrome';
import { dashboardQuery,orgAlertsQuery } from '@/lib/panel-home.queries';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { webhookAlertsQuery } from '@/lib/webhooks.queries';
import { ORG_SECTIONS, organizationTabRedirect, sectionNeedsManager, sectionRedirect, type OrgSection } from '@/lib/panel-nav';
import { ORGANIZATION_TABS, organizationTab, organizationTabLabels, type OrganizationTab } from '@/lib/panel-tabs';
const titles:Record<OrgSection,string>={inicio:'Início',alertas:'Alertas',organizacao:'Organização'};
const isSection=(s:string):s is OrgSection=>(ORG_SECTIONS as readonly string[]).includes(s);
const teamQuery=(organization_id:string)=>queryOptions({queryKey:['team',organization_id],queryFn:()=>getTeam({data:{organization_id}})});
// Old sections redirect: ajuda/modelos-de-servico → Início, equipe → Organização › Equipe, notas → its own route.
export const Route=createFileRoute('/_authenticated/o/$orgSlug/$section')({
 validateSearch:(search:Record<string,unknown>):{aba?:string}=>typeof search['aba']==='string'&&search['aba'].length<=60?{aba:search['aba']}:{},
 beforeLoad:({params,search})=>{const r=sectionRedirect(params.section);if(r?.to==='notas')throw redirect({to:'/o/$orgSlug/notas',params:{orgSlug:params.orgSlug},replace:true});if(r)throw redirect({to:'/o/$orgSlug/$section',params:{orgSlug:params.orgSlug,section:r.section},search:r.aba?{aba:r.aba}:{},replace:true});
  if(params.section!=='organizacao'){if(search.aba!==undefined)throw redirect({to:'/o/$orgSlug/$section',params,search:{},replace:true});return;}
  const t=organizationTabRedirect(search.aba);if(t.kind==='tab')throw redirect({to:'/o/$orgSlug/$section',params,search:t.aba?{aba:t.aba}:{},replace:true});},
 loader:async({context,params})=>{const w=await context.queryClient.ensureQueryData(workspaceQuery());const o=w.organizations.find(o=>o.slug===params.orgSlug);if(!o||!isSection(params.section))throw notFound();const role=w.memberships.find(m=>m.organization_id===o.id)?.role;if(sectionNeedsManager(params.section)&&!canManageOrganization(role,w.isAdmin))throw new PanelAccessDenied();const environment=w.profile?.environment??'production';
  if(params.section==='inicio')await context.queryClient.ensureQueryData(dashboardQuery({organization_id:o.id,environment,period:'mes_atual'}));
  if(params.section==='alertas')await Promise.all([context.queryClient.ensureQueryData(orgAlertsQuery({organization_id:o.id,environment})),context.queryClient.ensureQueryData(webhookAlertsQuery(o.id,environment))]);
  if(params.section==='organizacao')await context.queryClient.ensureQueryData(teamQuery(o.id));
  return {organizationName:o.name};},
 head:({params,loaderData})=>pageHead(isSection(params.section)?`${titles[params.section]}${loaderData?.organizationName?` · ${loaderData.organizationName}`:''}`:'Página não encontrada'),
 component:OrganizationSection});
function OrganizationSection(){const {orgSlug,section}=Route.useParams();const {organization,role,isAdmin}=useOrganization(orgSlug);if(!organization)return null;if(section==='alertas')return <AlertsView organizationId={organization.id} slug={orgSlug}/>;if(section==='organizacao')return <OrganizationPage id={organization.id} name={organization.name} slug={organization.slug} type={organization.type}/>;return <HomeView organizationId={organization.id} slug={orgSlug} name={organization.name} canCreate={isAdmin||role==='owner'||role==='admin'}/>;}
function OrganizationPage({id,name,slug,type}:{id:string,name:string,slug:string,type:keyof typeof organizationTypeLabels}){const {aba}=Route.useSearch();const tab:OrganizationTab=organizationTab(aba)??'dados';const navigate=useNavigate({from:Route.fullPath});
 return <><h1 className="page-heading">Organização</h1><div className="tab-strip my-7" role="tablist" aria-label="Organização">{ORGANIZATION_TABS.map(t=><Button key={t} variant={tab===t?'secondary':'ghost'} role="tab" aria-selected={tab===t} onClick={()=>void navigate({search:t==='dados'?{}:{aba:t},replace:true})}>{organizationTabLabels[t]}</Button>)}</div><SharedRegistryNotice/>{tab==='equipe'?<Team id={id}/>:<OrganizationForm id={id} name={name} slug={slug} type={type}/>}</>;}
function OrganizationForm({id,name,slug,type}:{id:string,name:string,slug:string,type:keyof typeof organizationTypeLabels}){const [value,setValue]=useState(name);const [busy,setBusy]=useState(false);const save=useServerFn(renameOrganization);const cache=useQueryClient();return <form className="max-w-lg space-y-6" onSubmit={async e=>{e.preventDefault();setBusy(true);try{await save({data:{id,name:value}});await cache.invalidateQueries({queryKey:['workspace']});toast.success('Organização atualizada.');}catch{toast.error('Não foi possível salvar.');}finally{setBusy(false);}}}><div className="form-field"><label htmlFor="organization-name">Nome</label><Input id="organization-name" value={value} onChange={e=>setValue(e.target.value)} required/></div><div className="form-field"><label htmlFor="organization-type">Tipo</label><Input id="organization-type" value={organizationTypeLabels[type]??type} disabled/></div><div className="form-field"><label htmlFor="organization-slug">Identificador no painel</label><Input id="organization-slug" value={slug} disabled/><p className="mt-1 text-xs text-muted-foreground">Faz parte do endereço das páginas desta organização e não muda.</p></div><Button disabled={busy}><Save/>Salvar</Button></form>;}
function Team({id}:{id:string}){const {data}=useSuspenseQuery(teamQuery(id));return <div className="table-wrap"><table className="data-table"><thead><tr><th>Usuário</th><th>Papel</th><th>Desde</th></tr></thead><tbody>{data.map(m=><tr key={m.id}><td><p className="font-medium">{m.display_name||m.email}</p>{m.display_name&&<p className="mt-1 text-xs text-muted-foreground">{m.email}</p>}</td><td>{roleLabels[m.role]}</td><td>{dateBr(m.created_at)}</td></tr>)}</tbody></table></div>;}
