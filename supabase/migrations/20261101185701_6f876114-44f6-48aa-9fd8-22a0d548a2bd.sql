revoke all on public.platform_admins from anon,authenticated;grant select on public.platform_admins to authenticated;
revoke all on public.organization_members from anon,authenticated;grant select on public.organization_members to authenticated;
revoke all on public.municipalities,public.countries from anon,authenticated;grant select on public.municipalities,public.countries to authenticated;
revoke all on public.profiles,public.organizations,public.invitations,public.companies from anon;
revoke insert,delete on public.profiles from authenticated;
revoke update,delete on public.invitations from authenticated;
revoke delete on public.organizations,public.companies from authenticated;
comment on function public.organization_team(uuid) is 'Authenticated-only manager-scoped team lookup. Rejects callers without global admin or owner/admin membership. Intentional security definer to avoid exposing auth.users.';