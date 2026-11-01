import { createFileRoute } from '@tanstack/react-router';
import { AuthScreen } from '@/components/notem/auth-screen';
import { pageHead } from '@/lib/notem';
export const Route = createFileRoute('/')({ head:()=>pageHead('notem','Plataforma de emissão via API e gestão de NFS-e padrão nacional.'), component:AuthScreen });
