create type public.organization_type as enum ('partner','company');
alter table public.organizations add column type public.organization_type not null default 'company';
alter table public.organizations alter column type drop default;
alter table public.organizations add constraint organizations_slug_length check (char_length(slug) between 3 and 50);
create or replace function public.guard_organization_type() returns trigger language plpgsql set search_path=public as $$
begin
  if new.type is distinct from old.type and not public.is_platform_admin() then
    raise exception 'Only platform administrators can change the organization type';
  end if;
  return new;
end $$;
create trigger organizations_guard_type before update on public.organizations for each row execute function public.guard_organization_type();
create or replace function public.organization_slug_available(value text) returns boolean language sql stable security definer set search_path=public as $$
  select public.is_platform_admin() and not exists(select 1 from public.organizations where slug = value)
$$;
revoke execute on function public.organization_slug_available(text) from public, anon;
grant execute on function public.organization_slug_available(text) to authenticated;