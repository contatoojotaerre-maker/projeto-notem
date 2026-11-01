revoke all on function public.create_user_profile() from public,anon,authenticated;
revoke all on function public.is_platform_admin(),public.is_org_member(uuid),public.has_org_role(uuid,public.org_role[]),public.accept_invitation(uuid),public.pending_invitations() from anon;
