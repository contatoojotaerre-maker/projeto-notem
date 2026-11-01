import { createFileRoute } from '@tanstack/react-router';
import { AuthScreen } from '@/components/notem/auth-screen';
import { pageHead } from '@/lib/notem';
export const Route = createFileRoute('/esqueci-senha')({head:()=>pageHead('Recuperar acesso'),component:()=> <AuthScreen mode="forgot"/>});