import { createFileRoute } from '@tanstack/react-router';
import { AuthScreen } from '@/components/notem/auth-screen';
import { pageHead } from '@/lib/notem';
export const Route = createFileRoute('/auth')({head:()=>pageHead('Acesse sua conta','Acesso por convite à plataforma notem de gestão de NFS-e.'),component:AuthScreen});