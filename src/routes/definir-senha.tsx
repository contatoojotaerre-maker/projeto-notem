import { createFileRoute } from '@tanstack/react-router';
import { AuthScreen } from '@/components/notem/auth-screen';
import { pageHead } from '@/lib/notem';
export const Route = createFileRoute('/definir-senha')({head:()=>pageHead('Aceitar convite'),component:()=> <AuthScreen mode="invite"/>});