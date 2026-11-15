import { queryOptions } from '@tanstack/react-query';
import { getPendingInvitations, getSandboxChanges, getWorkspace } from './notem.functions';
export const workspaceQuery = () => queryOptions({queryKey:['workspace'],queryFn:()=>getWorkspace(),staleTime:30_000});
export const pendingInvitationsQuery = () => queryOptions({queryKey:['pending-invitations'],queryFn:()=>getPendingInvitations(),staleTime:15_000});
export const sandboxChangesQuery = (organization_id:string) => queryOptions({queryKey:['sandbox-changes',organization_id],queryFn:()=>getSandboxChanges({data:{organization_id}}),staleTime:30_000});
