-- ════════════════════════════════════════════════════════════════
-- تطبيق القادة: القياس البعدي وقياس الأثر (post-v1)
-- ════════════════════════════════════════════════════════════════
-- آمن لإعادة التشغيل، ولا يمس القياس المبدئي ولا نتائجه.
-- الأداة تُنشأ غير مفعّلة، وتُفعَّل من لوحة الإدارة بعد اكتمال بنك أسئلتها.
--
-- لماذا ليست نسخة من القياس المبدئي؟ لأن إعادة الأسئلة نفسها تقيس التذكر
-- لا التعلم، ولأن التقدير الذاتي وحده لا يثبت تغيرًا. لذلك يجمع القياس
-- البعدي أربعة مصادر مستقلة، لا تعتمد على منهجية واحدة:
--   1. اختبار موازٍ: المواقف وعبارات الممارسة نفسها (أسئلة ربط anchor_code)
--      وأسئلة معرفة موازية لا متطابقة (يضيفها ترحيل بنك الأسئلة برمز P-).
--   2. قياس رجعي (Howard 1980): لكل عبارة ممارسة تقديران، الآن وقبل البرنامج.
--   3. تقدير خارجي: المدير المباشر يقدّر العبارات نفسها بصيغة الغائب.
--   4. انتقال التعلم (Kirkpatrick المستوى 3، وLTEM لـ Thalheimer): فرص التطبيق
--      ودعم البيئة، ولا تدخل في الدرجة.
-- ويُحكم بالتغير بمؤشر التغير الموثوق (Jacobson و Truax 1991) لا بالفرق الخام.

-- 1) أعمدة الأسئلة
alter table leaders.questions add column if not exists anchor_code   text;     -- رمز سؤال القياس المبدئي الذي يطابقه هذا السؤال
alter table leaders.questions add column if not exists retro         boolean not null default false;  -- يُسأل أيضًا: كيف كنت قبل البرنامج؟
alter table leaders.questions add column if not exists text_rater_ar text;     -- صيغة الغائب للمقيّم الخارجي

alter table leaders.questions drop constraint if exists questions_tier_check;
alter table leaders.questions add constraint questions_tier_check
  check (tier in ('knowledge', 'skill', 'behavior', 'transfer'));

-- 2) نتيجة الممارسة "قبل البرنامج" في القياس البعدي
alter table leaders.assessment_results add column if not exists behavior_before_pct numeric(5,2);

-- 3) إعدادات الحكم بالتغير، تُضبط من لوحة الإدارة مع نموذج التسكين.
-- الثبات والانحراف المعياري افتراضيان محافظان، ويُستبدلان بقيم الدفعة
-- الفعلية حين تبلغ min_n مشاركًا (يحسبها الخادم من الإجابات).
alter table leaders.placement_model add column if not exists rci_reliability numeric(4,2) not null default 0.75
  check (rci_reliability > 0 and rci_reliability < 1);
alter table leaders.placement_model add column if not exists rci_sd numeric(5,2) not null default 15
  check (rci_sd > 0);
alter table leaders.placement_model add column if not exists impact_min_n smallint not null default 20
  check (impact_min_n >= 5);
alter table leaders.placement_model add column if not exists rater_threshold numeric(5,2) not null default 10
  check (rater_threshold >= 0 and rater_threshold <= 50);

-- 4) المقيّمون الخارجيون (المدير المباشر أولًا)
create table if not exists leaders.raters (
  id              uuid primary key default gen_random_uuid(),
  participant_id  uuid not null references leaders.participants(id) on delete cascade,
  instrument_id   uuid not null references leaders.instruments(id),
  email           text not null check (email = lower(email) and char_length(email) <= 254),
  full_name       text check (full_name is null or char_length(full_name) <= 120),
  relation        text not null default 'manager' check (relation in ('manager', 'peer', 'report')),
  token_hash      text not null unique,
  status          text not null default 'invited' check (status in ('invited', 'submitted', 'revoked')),
  answers         jsonb,          -- { question_id: { now: k, before: k } }
  comment         text check (comment is null or char_length(comment) <= 2000),
  invited_at      timestamptz not null default now(),
  expires_at      timestamptz not null default now() + interval '30 days',
  opened_at       timestamptz,
  submitted_at    timestamptz,
  unique (participant_id, email)
);
create index if not exists raters_participant_idx on leaders.raters (participant_id);

alter table leaders.raters enable row level security;
revoke all on leaders.raters from anon, authenticated;

-- 5) الأداة
insert into leaders.instruments (key, title_ar, kind, active, version, intro_ar, est_minutes)
values ('post-v1', 'القياس البعدي لبرنامج القادة', 'post', false, 1,
  'وصلت إلى نهاية الرحلة. هذا القياس يبيّن ما تغيّر فعلًا في ممارستك وحكمك، لا ما حفظته. في عبارات الممارسة تقديران: كيف تمارسها الآن، وكيف كنت تمارسها قبل البرنامج، فأجب عن الاثنين بصدق كما تراهما اليوم. ونتيجتك لا تُشارك مع جهتك إلا مجمّعة مع غيرك.',
  18)
on conflict (key) do nothing;

-- 6) أسئلة الربط: المواقف وعبارات الممارسة من أحدث قياس مبدئي (baseline-v3
-- حين يوجد) كما هي نصًا ودرجات، حتى يقارن الفرق أداء الشخص لا اختلاف
-- الأسئلة. أسئلة المعرفة موازية لا متطابقة، ويضيفها ترحيل بنك الأسئلة برمز P-.
insert into leaders.questions (instrument_id, dimension, code, tier, text_ar, help_ar, kind, options, weight, sort,
  competency_ar, chapter_key, anchor_code, retro)
select post.id, q.dimension, q.code, q.tier, q.text_ar,
  case when q.tier = 'behavior'
    then 'قدّر ممارستك الآن، في الأشهر الثلاثة الأخيرة، ثم قدّر كيف كانت قبل بدء البرنامج. اختر «لا ينطبق على عملي» إن لم تمرّ بهذا الموقف.'
    else q.help_ar end,
  q.kind, q.options, q.weight, q.sort, q.competency_ar, q.chapter_key, q.code, q.tier = 'behavior'
from leaders.questions q
join (select id from leaders.instruments where kind = 'baseline' order by version desc limit 1) base on base.id = q.instrument_id
cross join (select id from leaders.instruments where key = 'post-v1') post
where q.tier in ('skill', 'behavior') and q.active
on conflict (instrument_id, code) do nothing;

-- صيغة الغائب للمدير
update leaders.questions q set text_rater_ar = v.t
from (values
  ('M-B1', 'يختم اجتماعات المتابعة التي يقودها بقرار موثق له مسؤول وموعد.'),
  ('M-B2', 'يتفق مع الجهة المستلمة على معايير قبول المخرج قبل تسليمه.'),
  ('M-B3', 'يراجع مبرر استمرار المشروع عند كل بوابة، حتى لو كان سير العمل جيدًا.'),
  ('M-B4', 'يقترح إيقاف عمل حين يتضح أنه لم يعد يخدم الهدف، ولو كان مكتملًا جزئيًا.'),
  ('I-B1', 'يطلب في مراجعات المشروعات بيانات عما تغيّر لدى المستفيدين، لا عن الأنشطة فقط.'),
  ('I-B2', 'يتأكد أن لكل منفعة يقترحها أو يعتمدها مالكًا محددًا.'),
  ('I-B3', 'يذكر حدود الأدلة في تقارير الأثر التي يعدّها أو يعتمدها.'),
  ('I-B4', 'يستخدم مؤشرات الأثر عند ترتيب أولويات المشروعات.'),
  ('L-B1', 'يغيّر طريقة قيادته للشخص بحسب خبرته في المهمة.'),
  ('L-B2', 'يحافظ على هدوئه في الاجتماعات المتوترة.'),
  ('L-B3', 'يوثّق المخاطر والقرارات المعلقة عند تسليم أي عهدة.'),
  ('L-B4', 'يشرح لفريقه سبب التغيير قبل توزيع المهام.')
) as v(code, t)
where q.code = v.code and q.text_rater_ar is null
  and q.instrument_id = (select id from leaders.instruments where key = 'post-v1');

-- 7) انتقال التعلم: بيئة التطبيق، لا تدخل في الدرجة ولا المستوى
insert into leaders.questions (instrument_id, dimension, code, tier, text_ar, help_ar, kind, options, sort)
select post.id, 'leadership', v.code, 'transfer', v.t, 'عن تجربتك في البرنامج وبيئة عملك، لا عن أدائك.', 'likert',
  '[{"label": "لا أوافق بشدة", "score": 0}, {"label": "لا أوافق", "score": 1}, {"label": "محايد", "score": 2}, {"label": "أوافق", "score": 3}, {"label": "أوافق بشدة", "score": 4}]'::jsonb, v.s
from (values
  ('T-1', 'ما تعلمته في البرنامج يرتبط مباشرة بتحديات عملي الفعلية.', 101),
  ('T-2', 'أتيحت لي فرص حقيقية لتطبيق ما تعلمته خلال البرنامج.', 102),
  ('T-3', 'دعمني مديري المباشر في تطبيق ما تعلمته.', 103),
  ('T-4', 'أستطيع أن أذكر قرارًا محددًا اتخذته بطريقة مختلفة بسبب البرنامج.', 104),
  ('T-5', 'سأستمر في استخدام أدوات البرنامج بعد انتهائه.', 105)
) as v(code, t, s)
cross join (select id from leaders.instruments where key = 'post-v1') post
on conflict (instrument_id, code) do nothing;

-- 8) إفادة المدير صارت تقديرًا منظمًا بدل ملف مرفوع، ويبقى الرفع بديلًا
update leaders.stage_requirements
set help_ar = 'أرسل دعوة لمديرك من القياس البعدي ليقدّر تغير ممارستك في دقائق، أو ارفع إفادته مكتوبة.'
where code = 'E-MGR';

-- 9) ثبات الأداة من إجابات الدفعة الفعلية: ألفا كرونباخ والانحراف المعياري
-- للمؤشر المركّب في كل إطار. تُحسب من المشاركين الذين أجابوا كل الأسئلة
-- دون "لا ينطبق" فقط، حتى لا يختل الحساب بالقيم الناقصة.
create or replace function leaders.instrument_reliability(p_instrument uuid)
returns table (dimension text, n integer, k integer, alpha numeric, sd numeric)
language sql stable security definer set search_path = leaders, pg_temp as $$
  with s as (
    select a.id as aid, q.dimension, q.id as qid, aa.score
    from leaders.assessments a
    join leaders.assessment_answers aa on aa.assessment_id = a.id
    join leaders.questions q on q.id = aa.question_id
    where a.instrument_id = p_instrument and a.status = 'submitted'
      and q.active and q.tier in ('knowledge', 'skill', 'behavior')
  ),
  kk as (
    select q.dimension, count(*)::int as k from leaders.questions q
    where q.instrument_id = p_instrument and q.active and q.tier in ('knowledge', 'skill', 'behavior')
    group by q.dimension
  ),
  complete as (
    select s.dimension, s.aid from s join kk using (dimension)
    group by s.dimension, s.aid, kk.k
    having count(*) = kk.k and min(s.score) >= 0
  ),
  cs as (select s.* from s join complete c using (dimension, aid)),
  items as (select dimension, qid, var_samp(score) as v from cs group by dimension, qid),
  tot as (select dimension, aid, sum(score) as t from cs group by dimension, aid),
  agg as (
    select kk.dimension, kk.k,
      (select count(*)::int from tot where tot.dimension = kk.dimension) as n,
      (select sum(v) from items where items.dimension = kk.dimension) as iv,
      (select var_samp(t) from tot where tot.dimension = kk.dimension) as tv
    from kk
  )
  select agg.dimension, agg.n, agg.k,
    case when agg.k > 1 and agg.n >= 3 and agg.tv > 0
      then round((agg.k::numeric / (agg.k - 1)) * (1 - agg.iv / agg.tv), 2) end,
    (select round(stddev_samp(r.composite_pct), 2) from leaders.assessment_results r
      join leaders.assessments a on a.id = r.assessment_id
      where a.instrument_id = p_instrument and a.status = 'submitted' and r.dimension = agg.dimension)
  from agg;
$$;
revoke all on function leaders.instrument_reliability(uuid) from public, anon, authenticated;
grant execute on function leaders.instrument_reliability(uuid) to service_role;

notify pgrst, 'reload schema';
