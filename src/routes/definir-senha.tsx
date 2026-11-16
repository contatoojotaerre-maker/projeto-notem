import { createFileRoute } from '@tanstack/react-router';
import { AuthScreen } from '@/components/notem/auth-screen';
import { pageHead } from '@/lib/notem';
export const Route = createFileRoute('/definir-senha')({head:()=>pageHead('Aceitar convite'),validateSearch:(search:Record<string,unknown>):{destino?:string}=>typeof search['destino']==='string'?{destino:search['destino']}:{},component:Invite});
function Invite(){const {destino}=Route.useSearch();return <AuthScreen mode="invite" destination={destino}/>;}
