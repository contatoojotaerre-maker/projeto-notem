import { createFileRoute } from '@tanstack/react-router';
import { AuthScreen } from '@/components/notem/auth-screen';
import { pageHead } from '@/lib/notem';
export const Route = createFileRoute('/reset-password')({head:()=>pageHead('Redefinir senha'),component:()=> <AuthScreen mode="reset"/>});