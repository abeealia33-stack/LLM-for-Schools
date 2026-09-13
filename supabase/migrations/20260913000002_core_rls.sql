-- supabase/migrations/20260913000002_core_rls.sql

create schema if not exists private;
revoke all on schema private from public;
grant usage on schema private to authenticated;

create function private.is_admin_of_user(p_user uuid)
returns boolean
language sql stable security definer set search_path = ''
as $$
  select exists (
    select 1
    from public.memberships me
    join public.schools s on s.id = me.school_id and s.status = 'active'
    join public.memberships them on them.school_id = me.school_id
    where me.user_id = auth.uid()
      and me.role = 'admin'
      and me.active
      and them.user_id = p_user
  );
$$;

create function private.is_any_school_admin(p_user uuid)
returns boolean
language sql stable security definer set search_path = ''
as $$
  select exists (
    select 1 from public.memberships m
    where m.user_id = p_user and m.role = 'admin' and m.active
  );
$$;

revoke execute on function private.is_admin_of_user(uuid) from public, anon;
revoke execute on function private.is_any_school_admin(uuid) from public, anon;
grant execute on function private.is_admin_of_user(uuid) to authenticated;
grant execute on function private.is_any_school_admin(uuid) to authenticated;

-- schools: read only
create policy schools_select on public.schools
  for select to authenticated
  using (public.is_super_admin() or public.my_role_in(id) is not null);

-- memberships: read only
create policy memberships_select_own on public.memberships
  for select to authenticated
  using (user_id = auth.uid() and public.my_role_in(school_id) is not null);

create policy memberships_select_school_admin on public.memberships
  for select to authenticated
  using (public.my_role_in(school_id) = 'admin');

create policy memberships_select_super_admin on public.memberships
  for select to authenticated
  using (role = 'admin' and public.is_super_admin());

-- profiles: read only
create policy profiles_select_own on public.profiles
  for select to authenticated
  using (id = auth.uid());

create policy profiles_select_school_admin on public.profiles
  for select to authenticated
  using (private.is_admin_of_user(id));

create policy profiles_select_super_admin on public.profiles
  for select to authenticated
  using (public.is_super_admin() and private.is_any_school_admin(id));
