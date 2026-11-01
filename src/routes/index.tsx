import { createFileRoute, redirect } from '@tanstack/react-router';
import { pageHead } from '@/lib/notem';
export const Route = createFileRoute('/')({ head:()=>pageHead('notem','Plataforma de emissão via API e gestão de NFS-e padrão nacional.'), beforeLoad:()=>{throw redirect({to:'/entrar',replace:true});} });
