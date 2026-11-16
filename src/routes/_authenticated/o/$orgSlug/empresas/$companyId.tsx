import { createFileRoute, Link, notFound, redirect, useNavigate } from '@tanstack/react-router';
import { queryOptions,useSuspenseQuery } from '@tanstack/react-query';
import { ArrowLeft } from 'lucide-react';
import { useEffect, useState } from 'react';
import { getCompany,setCompanyActive } from '@/lib/notem.functions';
import { useServerFn } from '@tanstack/react-start';
import { useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { userMessage } from '@/lib/webhooks';
import { pageHead,canEditCompany } from '@/lib/notem';
import { workspaceQuery } from '@/lib/notem.queries';
import { COMPANY_TABS, companyTab, companyTabLabels, type CompanyTab } from '@/lib/panel-tabs';
import { isMissingError, isPanelId } from '@/lib/panel-errors';
import { parseCompaniesSearch, recallList, type CompaniesSearch } from '@/lib/list-search';
import { useOrganization } from '@/components/notem/app-shell';
import { CompanyForm } from '@/components/notem/company-form';
import { Button } from '@/components/ui/button';
import { CertificateTab,ReadinessTab } from '@/components/notem/certificate-tabs';
import { canUseCertificate } from '@/lib/certificates';
import { fiscalQuery } from '@/lib/fiscal.queries';
import { FiscalTab,ServicesTab } from '@/components/notem/fiscal-tabs';
import { CustomersTab } from '@/components/notem/invoice-views';
import { SyncTab,ReceivedTab } from '@/components/notem/sync-views';
const companyQuery=(id:string,organization_id:string)=>queryOptions({queryKey:['company',id,organization_id],queryFn:()=>getCompany({data:{id,organization_id}})});
// ?aba= uses stable codes (resumo, cadastro, fiscal, servicos, certificado, tomadores, recebidas, sincronizacao); old visible names are converted.
export const Route=createFileRoute('/_authenticated/o/$orgSlug/empresas/$companyId')({head:()=>pageHead('Dados e configuração fiscal da empresa'),
 validateSearch:(search:Record<string,unknown>):{aba?:string}=>typeof search['aba']==='string'&&search['aba'].length<=60?{aba:search['aba']}:{},
 beforeLoad:({params,search})=>{if(search.aba===undefined)return;const code=companyTab(search.aba);if(code!==search.aba)throw redirect({to:'/o/$orgSlug/empresas/$companyId',params,search:code&&code!=='cadastro'?{aba:code}:{},replace:true});},
 loader:async({context,params})=>{const w=await context.queryClient.ensureQueryData(workspaceQuery());const o=w.organizations.find(o=>o.slug===params.orgSlug);if(!o||!isPanelId(params.companyId))throw notFound();try{await Promise.all([context.queryClient.ensureQueryData(companyQuery(params.companyId,o.id)),context.queryClient.ensureQueryData(fiscalQuery(params.companyId,o.id))]);}catch(e){if(isMissingError(e))throw notFound();throw e;}},component:CompanyDetail});
function CompanyDetail(){const {orgSlug,companyId}=Route.useParams();const {organization,role,isAdmin}=useOrganization(orgSlug);if(!organization)return null;return <Detail id={companyId} organizationId={organization.id} slug={orgSlug} canEdit={canEditCompany(role,isAdmin)} canUse={canUseCertificate(role,isAdmin)} isAdmin={isAdmin}/>;}
function BackToCompanies({slug}:{slug:string}){const [search,setSearch]=useState<CompaniesSearch>({});useEffect(()=>{setSearch(parseCompaniesSearch(recallList(`empresas:${slug}`)));},[slug]);return <Button variant="ghost" size="icon" asChild className="mb-4"><Link to="/o/$orgSlug/empresas" params={{orgSlug:slug}} search={search} aria-label="Voltar para empresas"><ArrowLeft/></Link></Button>;}
function Detail({id,organizationId,slug,canEdit,canUse,isAdmin}:{id:string,organizationId:string,slug:string,canEdit:boolean,canUse:boolean,isAdmin:boolean}){const {data:company}=useSuspenseQuery(companyQuery(id,organizationId));const {aba}=Route.useSearch();const tab:CompanyTab=companyTab(aba)??'cadastro';const navigate=useNavigate({from:Route.fullPath});const setTab=(t:CompanyTab)=>void navigate({search:t==='cadastro'?{}:{aba:t},replace:true});
 return <><BackToCompanies slug={slug}/><div className="flex flex-wrap items-center gap-4"><h1 className="page-heading">{company.legal_name}</h1><span className="status-badge" data-status={company.active?'active':'inactive'}>{company.active?'Ativa':'Inativa'}</span>{canEdit&&<ActiveToggle id={company.id} organizationId={organizationId} active={company.active}/>}</div>{company.change_origin==='api'&&<p className="mt-2 text-xs text-muted-foreground">Alterado via API — integração {company.changed_by_integration_name??'removida'}{company.external_id?` · id externo ${company.external_id}`:''}</p>}<p className="mt-2 text-sm text-muted-foreground">{company.trade_name}</p>
 <div className="my-8 flex gap-2 overflow-auto border-b border-border pb-3" role="tablist" aria-label="Empresa">{COMPANY_TABS.map(t=><Button key={t} variant={tab===t?'secondary':'ghost'} role="tab" aria-selected={tab===t} onClick={()=>setTab(t)}>{companyTabLabels[t]}</Button>)}</div>
 {tab==='cadastro'?<CompanyForm key={company.updated_at} organizationId={organizationId} slug={slug} company={company} readOnly={!canEdit}/>:tab==='fiscal'?<FiscalTab companyId={id} organizationId={organizationId} canEdit={canUse} isAdmin={isAdmin}/>:tab==='servicos'?<ServicesTab companyId={id} organizationId={organizationId} canEdit={canUse} isAdmin={isAdmin}/>:tab==='certificado'?<CertificateTab companyId={company.id} organizationId={organizationId} canUse={canUse}/>:tab==='tomadores'?<CustomersTab companyId={id} organizationId={organizationId}/>:tab==='resumo'?<ReadinessTab companyId={company.id} organizationId={organizationId} canUse={canUse} cnpj={company.cnpj}/>:tab==='recebidas'?<ReceivedTab companyId={company.id} organizationId={organizationId}/>:<SyncTab companyId={company.id} organizationId={organizationId}/>}</>;}
function ActiveToggle({id,organizationId,active}:{id:string,organizationId:string,active:boolean}){const set=useServerFn(setCompanyActive);const qc=useQueryClient();const [busy,setBusy]=useState(false);return <Button variant="outline" size="sm" disabled={busy} onClick={async()=>{setBusy(true);try{await set({data:{id,organization_id:organizationId,active:!active}});await qc.invalidateQueries({queryKey:['company',id,organizationId]});toast.success(active?'Empresa desativada.':'Empresa reativada.')}catch(e){toast.error(userMessage(e,'Não foi possível alterar.'))}finally{setBusy(false)}}}>{active?'Desativar':'Reativar'}</Button>}
