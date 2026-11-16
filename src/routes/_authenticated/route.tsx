import { createFileRoute, redirect } from '@tanstack/react-router';
import { supabase } from '@/integrations/supabase/client';
import { AppShell } from '@/components/notem/app-shell';
import { workspaceQuery } from '@/lib/notem.queries';
import { safeInternalPath } from '@/lib/safe-redirect';
// The requested address travels as ?destino= (internal paths only) so sign-in can return to it.
export const Route = createFileRoute('/_authenticated')({ssr:false,beforeLoad:async({location})=>{const {data,error}=await supabase.auth.getUser();if(error||!data.user){const destino=safeInternalPath(location.href);throw redirect({to:'/entrar',search:destino?{destino}:{}});}},loader:({context})=>context.queryClient.ensureQueryData(workspaceQuery()),component:AppShell});
