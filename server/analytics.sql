-- ════════════════════════════════════════════════════════════════
-- قياس الزيارات — يُشغَّل مرّة في Supabase SQL Editor
-- ════════════════════════════════════════════════════════════════
-- يكتب فيه shared/js/analytics.js (عبر نسخه المولّدة). لا IP ولا كوكي؛
-- visit_id عشوائي بعمر التبويب، فالمعدود «زيارات» لا «أشخاص».
-- القراءة لـ service_role وحده (لوحة الإدارة عبر admin-api).

create table if not exists public.page_views (
  id         bigint generated always as identity primary key,
  site       text        not null,          -- mi-home · mi-matrix · mi-leaders …
  path       text        not null,          -- /pricing.html
  title      text,
  referrer   text,                          -- المصدر، بلا معاملات الاستعلام
  visit_id   text        not null,          -- عشوائي، عمره عمر التبويب
  device     text,                          -- mobile · tablet · desktop
  lang       text,
  created_at timestamptz not null default now()
);

create index if not exists page_views_created_idx on public.page_views (created_at desc);
create index if not exists page_views_site_path_idx on public.page_views (site, path);
create index if not exists page_views_visit_idx on public.page_views (visit_id);

alter table public.page_views enable row level security;

-- الكتابة فقط للعموم: الصفحة تسجّل زيارتها ولا تقرأ زيارات غيرها.
-- بلا سياسة قراءة، فلا يستطيع أحدٌ سحب الجدول بالمفتاح العام.
drop policy if exists "anon can insert page views" on public.page_views;
create policy "anon can insert page views"
  on public.page_views for insert
  to anon
  -- حدودٌ للأطوال: المفتاح عام، فلا نترك الجدول مكبّاً لنصوصٍ بلا سقف
  with check (
    char_length(site) <= 40 and char_length(path) <= 512
    and coalesce(char_length(title), 0) <= 300
    and coalesce(char_length(referrer), 0) <= 512
    and char_length(visit_id) <= 64
  );

comment on table public.page_views is
  'زيارات الصفحات. بلا IP وبلا كوكي؛ visit_id عشوائي بعمر التبويب.';


-- ── تجميعات جاهزة ──
-- التجميع في قاعدة البيانات لا في المتصفّح: سحب مليون صفٍّ لعدّها
-- في الواجهة يقتل اللوحة، والدالة تعيد عشرات الصفوف.

create or replace function public.analytics_daily(
  p_from timestamptz,
  p_to   timestamptz,
  p_site text default null
)
returns table (day date, views bigint, visits bigint)
language sql
security definer
set search_path = public
as $$
  select date_trunc('day', created_at)::date as day,
         count(*)                            as views,
         count(distinct visit_id)            as visits
  from public.page_views
  where created_at >= p_from
    and created_at <  p_to
    and (p_site is null or site = p_site)
  group by 1
  order by 1;
$$;

create or replace function public.analytics_pages(
  p_from  timestamptz,
  p_to    timestamptz,
  p_site  text default null,
  p_limit int default 20
)
returns table (site text, path text, views bigint, visits bigint)
language sql
security definer
set search_path = public
as $$
  select site, path,
         count(*)                 as views,
         count(distinct visit_id) as visits
  from public.page_views
  where created_at >= p_from
    and created_at <  p_to
    and (p_site is null or site = p_site)
  group by 1, 2
  order by views desc
  limit p_limit;
$$;

-- security definer يتجاوز RLS عمداً، فيُنزع حقّ النداء عن العموم:
-- لا تُستدعى إلا من admin-api بـ service_role بعد فحص الإذن.
revoke all on function public.analytics_daily(timestamptz, timestamptz, text) from public, anon, authenticated;
revoke all on function public.analytics_pages(timestamptz, timestamptz, text, int) from public, anon, authenticated;

-- تنظيف اختياري: delete from public.page_views where created_at < now() - interval '365 days';
