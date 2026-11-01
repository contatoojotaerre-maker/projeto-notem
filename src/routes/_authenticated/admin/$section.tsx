import { createFileRoute } from '@tanstack/react-router';
import { ComingSoon } from '@/components/notem/app-shell';
import { workspaceQuery } from '@/lib/notem.queries';
import { pageHead } from '@/lib/notem';
const titles:Record<string,string>={'empresas-e-notas':'Empresas e notas',municipios:'Municípios','mensagens-de-rejeicao':'Mensagens de rejeição','saude-do-sistema':'Saúde do sistema',cobranca:'Cobrança'};
export const Route=createFileRoute('/_authenticated/admin/$section')({head:({params})=>pageHead(`Administração · ${titles[params.section]??'Indisponível'}`),loader:async({context,params})=>{const w=await context.queryClient.ensureQueryData(workspaceQuery());if(!w.isAdmin||!titles[params.section])throw new Error('Acesso não autorizado.');},component:AdminSection});
function AdminSection(){const {section}=Route.useParams();return <ComingSoon title={titles[section]??'Indisponível'}/>;}