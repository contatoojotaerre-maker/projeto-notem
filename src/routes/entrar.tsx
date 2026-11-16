import { createFileRoute } from '@tanstack/react-router';
import { AuthScreen } from '@/components/notem/auth-screen';
import { pageHead } from '@/lib/notem';
export const Route = createFileRoute('/entrar')({head:()=>pageHead('Entrar'),validateSearch:(search:Record<string,unknown>):{destino?:string}=>typeof search['destino']==='string'?{destino:search['destino']}:{},component:Login});
function Login(){const {destino}=Route.useSearch();return <AuthScreen destination={destino}/>;}
