import { createFileRoute, Link, notFound, redirect, useNavigate } from '@tanstack/react-router';
import { queryOptions,useSuspenseQuery } from '@tanstack/react-query';
import { useEffect, useState } from 'react';
import { FileText } from 'lucide-react';
import { getCompany,setCompanyActive } from '@/lib/notem.functions';
import { useServerFn } from '@tanstack/react-start';
import { useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { userMessage } from '@/lib/webhooks';
import { pageHead,canEditCompany,formatCnpj } from '@/lib/notem';
import { workspaceQuery } from '@/lib/notem.queries';
import { COMPANY_TABS, DEFAULT_COMPANY_TAB, companyTab, companyTabLabels, type CompanyTab } from '@/lib/panel-tabs';
import { companyTabRedirect } from '@/lib/panel-nav';
import { isMissingError, isPanelId } from '@/lib/panel-errors';
import { parseCompaniesSearch, recallList, type CompaniesSearch } from '@/lib/list-search';
import { useOrganization } from '@/components/notem/app-shell';
import { CompanyForm } from '@/components/notem/company-form';
import { Button } from '@/components/ui/button';
import { CertificateTab,CompanySummary } from '@/components/notem/certificate-tabs';
import { canUseCertificate } from '@/lib/certificates';
import { fiscalQuery } from '@/lib/fiscal.queries';
import { FiscalTab,ServicesTab } from '@/components/notem/fiscal-tabs';
import { CustomersTab } from '@/components/notem/invoice-views';
import { SyncTab } from '@/components/notem/sync-views';
import { SharedRegistryNotice, Trail } from '@/components/notem/panel-chrome';
const companyQuery=(id:string,organization_id:string)=>queryOptions({queryKey:['company',id,organization_id],queryFn:()=>getCompany({data:{id,organization_id}})});
const SHARED_TABS:CompanyTab[]=['cadastro','fiscal','servicos','certificado','tomadores'];
// ?aba= uses stable codes (resumo is the default; cadastro, fiscal, servicos, certificado, tomadores, sincronizacao); old names are
// converted and the old "Notas recebidas" tab opens Notas › Recebidas filtered by this company.
export const Route=createFileRoute('/_authenticated/o/$orgSlug/empresas/$companyId')({
 validateSearch:(search:Record<string,unknown>):{aba?:string}=>typeof search['aba']==='string'&&search['aba'].length<=60?{aba:search['aba']}:{},
 beforeLoad:({params,search})=>{const r=companyTabRedirect(search.aba);if(r.kind==='received')throw redirect({to:'/o/$orgSlug/notas/recebidas',params:{orgSlug:params.orgSlug},search:isPanelId(params.companyId)?{empresa:params.companyId}:{},replace:true});if(r.kind==='tab')throw redirect({to:'/o/$orgSlug/empresas/$companyId',params,search:r.search,replace:true});},
 loader:async({context,params})=>{const w=await context.queryClient.ensureQueryData(workspaceQuery());const o=w.organizations.find(o=>o.slug===params.orgSlug);if(!o||!isPanelId(params.companyId))throw notFound();try{const [c]=await Promise.all([context.queryClient.ensureQueryData(companyQuery(params.companyId,o.id)),context.queryClient.ensureQueryData(fiscalQuery(params.companyId,o.id))]);return {name:c.legal_name};}catch(e){if(isMissingError(e))throw notFound();throw e;}},
 head:({loaderData})=>pageHead(`Empresa${loaderData?.name?` · ${loaderData.name}`:''}`),component:CompanyDetail});
function CompanyDetail(){const {orgSlug,companyId}=Route.useParams();const {organization,role,isAdmin}=useOrganization(orgSlug);if(!organization)return null;return <Detail id={companyId} organizationId={organization.id} slug={orgSlug} canEdit={canEditCompany(role,isAdmin)} canUse={canUseCertificate(role,isAdmin)} isAdmin={isAdmin}/>;}
function CompaniesLink({slug}:{slug:string}){const [search,setSearch]=useState<CompaniesSearch>({});useEffect(()=>{setSearch(parseCompaniesSearch(recallList(`empresas:${slug}`)));},[slug]);return <Link to="/o/$orgSlug/empresas" params={{orgSlug:slug}} search={search}>Empresas</Link>;}
function Detail({id,organizationId,slug,canEdit,canUse,isAdmin}:{id:string,organizationId:string,slug:string,canEdit:boolean,canUse:boolean,isAdmin:boolean}){const {data:company}=useSuspenseQuery(companyQuery(id,organizationId));const {aba}=Route.useSearch();const tab:CompanyTab=companyTab(aba)??DEFAULT_COMPANY_TAB;const navigate=useNavigate({from:Route.fullPath});const setTab=(t:CompanyTab)=>void navigate({search:t===DEFAULT_COMPANY_TAB?{}:{aba:t},replace:true});
 return <><Trail items={[<CompaniesLink key="e" slug={slug}/>,company.legal_name]}/><div className="flex flex-wrap items-center justify-between gap-4"><div className="flex flex-wrap items-center gap-4"><h1 className="page-heading">{company.legal_name}</h1><span className="status-badge" data-status={company.active?'active':'inactive'}>{company.active?'Ativa':'Inativa'}</span>{canEdit&&<ActiveToggle id={company.id} organizationId={organizationId} active={company.active}/>}</div><Button variant="outline" size="sm" asChild><Link to="/o/$orgSlug/notas" params={{orgSlug:slug}} search={{empresa:company.id}}><FileText/>Ver notas desta empresa</Link></Button></div>
 <p className="mt-2 text-sm text-muted-foreground">CNPJ {formatCnpj(company.cnpj)}{company.trade_name?` · ${company.trade_name}`:''}</p>{company.change_origin==='api'&&<p className="mt-1 text-xs text-muted-foreground">Alterada pela API — integração {company.changed_by_integration_name??'removida'}{company.external_id?` · identificação externa ${company.external_id}`:''}</p>}
 <div className="tab-strip my-8" role="tablist" aria-label="Empresa">{COMPANY_TABS.map(t=><Button key={t} variant={tab===t?'secondary':'ghost'} role="tab" aria-selected={tab===t} onClick={()=>setTab(t)}>{companyTabLabels[t]}</Button>)}</div>
 {SHARED_TABS.includes(tab)&&<SharedRegistryNotice/>}
 {tab==='cadastro'?<CompanyForm key={company.updated_at} organizationId={organizationId} slug={slug} company={company} readOnly={!canEdit}/>:tab==='fiscal'?<FiscalTab companyId={id} organizationId={organizationId} canEdit={canUse} isAdmin={isAdmin}/>:tab==='servicos'?<ServicesTab companyId={id} organizationId={organizationId} canEdit={canUse} isAdmin={isAdmin}/>:tab==='certificado'?<CertificateTab companyId={company.id} organizationId={organizationId} canUse={canUse}/>:tab==='tomadores'?<CustomersTab companyId={id} organizationId={organizationId}/>:tab==='sincronizacao'?<SyncTab companyId={company.id} organizationId={organizationId}/>:<CompanySummary companyId={company.id} organizationId={organizationId} canUse={canUse} onTab={setTab}/>}</>;}
function ActiveToggle({id,organizationId,active}:{id:string,organizationId:string,active:boolean}){const set=useServerFn(setCompanyActive);const qc=useQueryClient();const [busy,setBusy]=useState(false);return <Button variant="outline" size="sm" disabled={busy} onClick={async()=>{setBusy(true);try{await set({data:{id,organization_id:organizationId,active:!active}});await qc.invalidateQueries({queryKey:['company',id,organizationId]});toast.success(active?'Empresa desativada.':'Empresa reativada.')}catch(e){toast.error(userMessage(e,'Não foi possível alterar.'))}finally{setBusy(false)}}}>{active?'Desativar':'Reativar'}</Button>}
