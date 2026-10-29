-- =====================================================================
--  إعداد قاعدة بيانات الـ Portfolio على Supabase
--  شغّل هذا الملف مرة واحدة من: SQL Editor → New query → Run
--  ⚠️ غيّر البريد في السطر التالي إلى بريد حساب المدير الذي ستنشئه
-- =====================================================================

-- بريد المدير الوحيد المسموح له بالتعديل
create or replace function public.is_admin()
returns boolean
language sql
stable
as $$
  select coalesce(auth.jwt() ->> 'email', '') = 'v.akkad2000@gmail.com';
$$;

-- ---------- محتوى الموقع (صف واحد يحوي كل النصوص) ----------
create table if not exists public.site_content (
  id int primary key default 1 check (id = 1),
  data jsonb not null,
  updated_at timestamptz not null default now()
);

alter table public.site_content enable row level security;

drop policy if exists "content public read" on public.site_content;
create policy "content public read" on public.site_content
  for select using (true);

drop policy if exists "content admin write" on public.site_content;
create policy "content admin write" on public.site_content
  for all to authenticated using (public.is_admin()) with check (public.is_admin());

-- ---------- معرض الأعمال ----------
create table if not exists public.gallery (
  id uuid primary key default gen_random_uuid(),
  title text default '',
  description text default '',
  category text default '',
  image_path text not null,
  image_url text not null,
  sort_order int not null default 0,
  created_at timestamptz not null default now()
);

alter table public.gallery enable row level security;

drop policy if exists "gallery public read" on public.gallery;
create policy "gallery public read" on public.gallery
  for select using (true);

drop policy if exists "gallery admin write" on public.gallery;
create policy "gallery admin write" on public.gallery
  for all to authenticated using (public.is_admin()) with check (public.is_admin());

-- ---------- التخزين: حاوية عامة للصور والملفات ----------
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('works', 'works', true, 10485760,
        array['image/jpeg','image/png','image/webp','image/gif','image/svg+xml','application/pdf'])
on conflict (id) do update set public = true;

drop policy if exists "works public read" on storage.objects;
create policy "works public read" on storage.objects
  for select using (bucket_id = 'works');

drop policy if exists "works admin insert" on storage.objects;
create policy "works admin insert" on storage.objects
  for insert to authenticated with check (bucket_id = 'works' and public.is_admin());

drop policy if exists "works admin update" on storage.objects;
create policy "works admin update" on storage.objects
  for update to authenticated using (bucket_id = 'works' and public.is_admin());

drop policy if exists "works admin delete" on storage.objects;
create policy "works admin delete" on storage.objects
  for delete to authenticated using (bucket_id = 'works' and public.is_admin());

-- ---------- عدّاد الزيارات: انظر supabase/visits.sql ----------
