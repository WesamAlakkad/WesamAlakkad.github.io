-- =====================================================================
--  عدّاد الزيارات — شغّله مرة واحدة من: SQL Editor → New query → Run
--  يعتمد على الدالة is_admin() من setup.sql
-- =====================================================================

create table if not exists public.visits (
  id bigint generated always as identity primary key,
  created_at timestamptz not null default now(),
  visitor text not null check (char_length(visitor) between 1 and 40),
  source text not null default '' check (char_length(source) <= 100),
  device text not null check (device in ('mobile', 'tablet', 'desktop')),
  lang text not null default '' check (char_length(lang) <= 20),
  tz text not null default '' check (char_length(tz) <= 60),
  check (created_at <= now() + interval '5 minutes')
);

create index if not exists visits_created_at_idx on public.visits (created_at desc);

alter table public.visits enable row level security;

-- أي زائر يستطيع تسجيل زيارة فقط، ولا يستطيع قراءة الزيارات
drop policy if exists "visits public insert" on public.visits;
create policy "visits public insert" on public.visits
  for insert to anon, authenticated with check (true);

-- القراءة والحذف للمدير فقط
drop policy if exists "visits admin read" on public.visits;
create policy "visits admin read" on public.visits
  for select to authenticated using (public.is_admin());

drop policy if exists "visits admin delete" on public.visits;
create policy "visits admin delete" on public.visits
  for delete to authenticated using (public.is_admin());

-- العدد الإجمالي فقط (بدون أي تفاصيل) لإظهاره للزوار إن فُعّل العداد العام
create or replace function public.visit_count()
returns bigint
language sql
stable
security definer
set search_path = public
as $$
  select count(*) from public.visits;
$$;

revoke all on function public.visit_count() from public;
grant execute on function public.visit_count() to anon, authenticated;
