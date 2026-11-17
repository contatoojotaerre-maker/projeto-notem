import { createFileRoute, notFound, redirect } from '@tanstack/react-router';
import { isHiddenAdminSection } from '@/lib/panel-nav';
import { PanelAccessDenied } from '@/lib/panel-errors';
import { workspaceQuery } from '@/lib/notem.queries';
import { pageHead } from '@/lib/notem';
import { rejectionGuidance } from '@/lib/invoices';
import { LayoutSettings, layoutStatusQuery } from '@/components/notem/layout-settings';
import { SupportSettings, supportSettingsQuery } from '@/components/notem/support-settings';
const titles:Record<string,string>={'mensagens-de-rejeicao':'Mensagens de rejeição','leiaute-fiscal':'Leiaute fiscal',suporte:'Suporte'};
// The "em breve" placeholders (empresas-e-notas, municipios, saude-do-sistema, cobranca) were removed; their addresses go to Organizações.
export const Route=createFileRoute('/_authenticated/admin/$section')({head:({params})=>pageHead(`Administração · ${titles[params.section]??'Indisponível'}`),beforeLoad:({params})=>{if(isHiddenAdminSection(params.section))throw redirect({to:'/admin/organizacoes',replace:true});},loader:async({context,params})=>{const w=await context.queryClient.ensureQueryData(workspaceQuery());if(!w.isAdmin)throw new PanelAccessDenied();if(!titles[params.section])throw notFound();if(params.section==='leiaute-fiscal')await context.queryClient.ensureQueryData(layoutStatusQuery());if(params.section==='suporte')await context.queryClient.ensureQueryData(supportSettingsQuery());},component:AdminSection});
function AdminSection(){const {section}=Route.useParams();if(section==='leiaute-fiscal')return <LayoutSettings/>;if(section==='suporte')return <SupportSettings/>;if(section==='mensagens-de-rejeicao')return <><h1 className="page-heading mb-8">Mensagens de rejeição</h1><div className="table-wrap"><table className="data-table"><thead><tr><th>Código</th><th>Campo</th><th>Orientação</th></tr></thead><tbody>{Object.entries(rejectionGuidance).map(([code,v])=><tr key={code}><td className="font-mono">{code}</td><td>{v.campo}</td><td className="max-w-2xl whitespace-normal">{v.mensagem}</td></tr>)}</tbody></table></div></>;return null;}