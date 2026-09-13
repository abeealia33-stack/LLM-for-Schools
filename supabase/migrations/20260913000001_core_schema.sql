-- supabase/migrations/20260913000001_core_schema.sql

create type public.member_role as enum ('admin', 'teacher', 'student', 'guardian');
create type public.school_status as enum ('active', 'suspended');

create table public.schools (
  id uuid primary key default gen_random_uuid(),
  name text not null check (length(btrim(name)) between 2 and 120),
  slug text not null unique check (slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$' and length(slug) <= 40),
  logo_path text,
  city text,
  contact_name text,
  contact_phone text,
  brand_color text not null default '#2563eb' check (brand_color ~ '^#[0-9a-fA-F]{6}$'),
  time_zone text not null default 'UTC',
  academic_year text,
  status public.school_status not null default 'active',
  created_at timestamptz not null default now()
);

create table public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  full_name text not null check (length(btrim(full_name)) between 1 and 120),
  phone text,
  email text,
  username text unique,
  is_super_admin boolean not null default false,
  must_change_password boolean not null default false,
  created_at timestamptz not null default now()
);

create table public.memberships (
  school_id uuid not null references public.schools (id) on delete cascade,
  user_id uuid not null references public.profiles (id) on delete cascade,
  role public.member_role not null,
  can_create_classes boolean not null default false,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  primary key (school_id, user_id)
);
create index memberships_user_id_idx on public.memberships (user_id);

alter table public.schools enable row level security;
alter table public.profiles enable row level security;
alter table public.memberships enable row level security;

revoke all on table public.schools, public.profiles, public.memberships from anon, authenticated;
grant select on table public.schools, public.profiles, public.memberships to authenticated;
grant all on table public.schools, public.profiles, public.memberships to service_role;

create function public.is_super_admin()
returns boolean
language sql stable security definer set search_path = ''
as $$
  select coalesce(
    (select p.is_super_admin from public.profiles p where p.id = auth.uid()),
    false
  );
$$;

create function public.my_role_in(p_school uuid)
returns public.member_role
language sql stable security definer set search_path = ''
as $$
  select m.role
  from public.memberships m
  join public.schools s on s.id = m.school_id
  where m.school_id = p_school
    and m.user_id = auth.uid()
    and m.active
    and s.status = 'active';
$$;

create function public.my_memberships()
returns table (
  school_id uuid,
  school_name text,
  school_slug text,
  school_status public.school_status,
  role public.member_role,
  can_create_classes boolean
)
language sql stable security definer set search_path = ''
as $$
  select s.id, s.name, s.slug, s.status, m.role, m.can_create_classes
  from public.memberships m
  join public.schools s on s.id = m.school_id
  where m.user_id = auth.uid() and m.active
  order by s.name;
$$;

revoke execute on function public.is_super_admin() from public, anon;
revoke execute on function public.my_role_in(uuid) from public, anon;
revoke execute on function public.my_memberships() from public, anon;
grant execute on function public.is_super_admin() to authenticated;
grant execute on function public.my_role_in(uuid) to authenticated;
grant execute on function public.my_memberships() to authenticated;
