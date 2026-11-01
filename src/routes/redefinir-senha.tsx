import { createFileRoute } from '@tanstack/react-router';
import { AuthScreen } from '@/components/notem/auth-screen';
import { pageHead } from '@/lib/notem';
export const Route = createFileRoute('/redefinir-senha')({head:()=>pageHead('Nova senha'),component:()=> <AuthScreen mode="reset"/>});