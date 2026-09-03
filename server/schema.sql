-- ════════════════════════════════════════════════════════════════
-- Milestone Impact — مخطط الصلاحيات والتحليلات
-- ════════════════════════════════════════════════════════════════
-- شغّل هذا الملف مرّة واحدة في Supabase:
--   Dashboard ← SQL Editor ← New query ← الصق ← Run
--
-- آمنٌ للتكرار: كل شيء IF NOT EXISTS، فتشغيله مرّتين لا يضرّ.
--
-- ══ لماذا يكتبه المستخدم لا الوكيل ══
-- الوكيل لا يملك وصولاً إلى مشروع eormhcupwgwpllhrfxxg (الموصِّل
-- مربوط بمؤسسة أخرى)، فهذا الملف عقدٌ مكتوب لا تنفيذٌ مُدَّعى.


-- ════════════════════════════════════════════════════════════════
-- ١. الصلاحيات
-- ════════════════════════════════════════════════════════════════
-- صلاحيات مفصّلة بلا أدوار: لكل مستشارٍ مصفوفةُ أذونات صريحة
-- على كل مصدر. sources مثال:
--
--   {"matrix": ["view","edit","export"], "home-contact": ["view"]}
--
-- المفاتيح هي id في src/config/sources.js، والقيم من CAN في
-- src/lib/permissions.js. الاثنان مصدرٌ واحد للحقيقة في الواجهة،
-- وهذا الجدول مصدرها في الخادم.

create table if not exists public.admin_permissions (
  admin_email   text primary key,
  manage_access boolean     not null default false,
  sources       jsonb       not null default '{}'::jsonb,
  updated_at    timestamptz not null default now(),
  updated_by    text
);

-- RLS مُفعَّل بلا سياسة واحدة = لا أحد يصل إليه عبر REST أو المفتاح
-- العام. لا يقرؤه ولا يكتبه إلا service_role من داخل Edge Function.
-- وهذا مقصود: جدولُ الصلاحيات لا يُقرأ من المتصفّح بحال.
alter table public.admin_permissions enable row level security;

comment on table public.admin_permissions is
  'أذونات المستشارين. لا يُقرأ إلا بـ service_role من admin-api.';


-- ── أوّل مدير ──
-- بدّل البريد ببريدك ثم شغّل. بلا هذا السطر لن يملك أحدٌ إدارة
-- الوصول، فتُقفل اللوحة على الجميع.
insert into public.admin_permissions (admin_email, manage_access, sources)
values (
  'CHANGE-ME@example.com',
  true,
  '{"matrix": ["view","edit","export","delete"], "home-contact": ["view","edit","export","delete"]}'::jsonb
)
on conflict (admin_email) do nothing;


-- ════════════════════════════════════════════════════════════════
-- ٢. التحليلات
-- ════════════════════════════════════════════════════════════════
-- ══ ما يُخزَّن وما لا يُخزَّن ══
-- لا IP، ولا كوكي، ولا بصمة متصفّح. المعرّف الوحيد visit_id:
-- رقم عشوائي يُولَّد في sessionStorage ويموت بإغلاق التبويب.
--
-- وأثره أن ما يُعدّ زياراتٌ لا أشخاص: من يفتح الموقع من الجوال
-- ثم الحاسوب زيارتان، ومن يعود غداً زيارةٌ أخرى. لا نظام تحليلات
-- يعدّ الأشخاص حقاً، والتسمية في اللوحة تقول «زيارات» لهذا السبب.

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
  with check (true);

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


-- ════════════════════════════════════════════════════════════════
-- ٣. حدّ إعادة إرسال الرمز — الجانب الذي يحمي فعلاً
-- ════════════════════════════════════════════════════════════════
-- المهلة التي أُضيفت في الواجهة تحسّن التجربة ولا تحمي: من يفتح
-- أدوات المطوّر يتجاوزها. هذا الجدول يجعل الحدّ حقيقياً، ويُفحص
-- داخل user-api قبل الإرسال.

create table if not exists public.otp_send_log (
  id         bigint generated always as identity primary key,
  identifier text        not null,   -- البريد أو الجوال المطلوب إرساله
  kind       text        not null,   -- register · resume · admin
  created_at timestamptz not null default now()
);

create index if not exists otp_send_log_idx on public.otp_send_log (identifier, created_at desc);

alter table public.otp_send_log enable row level security;  -- بلا سياسة: service_role فقط

-- كم مرّة أُرسل لهذا المُعرّف خلال نافذة؟ يُنادى من user-api.
create or replace function public.otp_sends_since(
  p_identifier text,
  p_since      timestamptz
)
returns bigint
language sql
security definer
set search_path = public
as $$
  select count(*) from public.otp_send_log
  where identifier = p_identifier and created_at >= p_since;
$$;

revoke all on function public.otp_sends_since(text, timestamptz) from public, anon, authenticated;


-- ════════════════════════════════════════════════════════════════
-- ٤. تنظيف دوريّ (اختياري)
-- ════════════════════════════════════════════════════════════════
-- الزيارات تتراكم. احذف ما تجاوز سنة، وسجلّ الرموز ما تجاوز يوماً.
-- شغّلها يدوياً أو بـ pg_cron إن كان مفعّلاً عندك.
--
--   delete from public.page_views   where created_at < now() - interval '365 days';
--   delete from public.otp_send_log where created_at < now() - interval '1 day';
