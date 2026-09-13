-- supabase/migrations/20260913000003_platform_rpc.sql

create function public.platform_school_overview()
returns table (
  id uuid,
  name text,
  slug text,
  city text,
  contact_name text,
  contact_phone text,
  status public.school_status,
  created_at timestamptz,
  admin_count int,
  teacher_count int,
  student_count int,
  last_activity timestamptz
)
language plpgsql stable security definer set search_path = ''
as $$
begin
  if not public.is_super_admin() then
    raise exception 'forbidden' using errcode = '42501';
  end if;

  return query
  select
    s.id, s.name, s.slug, s.city, s.contact_name, s.contact_phone, s.status, s.created_at,
    (count(*) filter (where m.role = 'admin' and m.active))::int,
    (count(*) filter (where m.role = 'teacher' and m.active))::int,
    (count(*) filter (where m.role = 'student' and m.active))::int,
    greatest(s.created_at, max(m.created_at))
  from public.schools s
  left join public.memberships m on m.school_id = s.id
  group by s.id
  order by s.name;
end;
$$;

revoke execute on function public.platform_school_overview() from public, anon;
grant execute on function public.platform_school_overview() to authenticated;
