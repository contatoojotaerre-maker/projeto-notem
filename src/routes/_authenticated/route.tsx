import { createFileRoute, redirect } from '@tanstack/react-router';
import { supabase } from '@/integrations/supabase/client';
import { AppShell } from '@/components/notem/app-shell';
import { workspaceQuery } from '@/lib/notem.queries';
export const Route = createFileRoute('/_authenticated')({ssr:false,beforeLoad:async()=>{const {data,error}=await supabase.auth.getUser();if(error||!data.user)throw redirect({to:'/auth'});},loader:({context})=>context.queryClient.ensureQueryData(workspaceQuery()),component:AppShell});