-- المرحلة 32 (نزاهة رمز التحقق): قراءة فقط. يعدّ الوثائق المعتمدة التي لا تحمل بصمة مجمّدة في snapshot.issued،
-- فلا يُطبع لها رمز تحقق (verify-mark.js) لأن verifyDoc (capstone.ts) لا يبحث إلا في snapshot.issued.fingerprint.
-- لا يغيّر شيئًا. الإصلاح (تجميد البصمة مرة واحدة من لقطتها) قرار المالك في ترحيل لاحق، لا في هذه المرحلة.
-- التشغيل: psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f scripts/db/verify-issued.sql
begin transaction read only;

-- 1) الخلاصة: كل المعتمدة، وما بلا issued، وما يحمل issued بلا بصمة صالحة، مفصولة بين الحسابات المعدودة والعرض والاختبار
select
  coalesce(p.is_demo, false) as is_demo,
  coalesce(p.is_test, false) as is_test,
  count(*) as approved_total,
  count(*) filter (where c.snapshot -> 'issued' is null) as without_issued,
  count(*) filter (where c.snapshot -> 'issued' is not null
                     and coalesce(c.snapshot -> 'issued' ->> 'fingerprint', '') !~ '^[0-9A-F]{4}(-[0-9A-F]{4}){3}$') as issued_without_valid_fingerprint,
  min(c.approved_at) filter (where c.snapshot -> 'issued' is null) as oldest_without_issued,
  max(c.approved_at) filter (where c.snapshot -> 'issued' is null) as newest_without_issued
from leaders.capstones c
left join leaders.participants p on p.id = c.participant_id
where c.status = 'approved'
group by 1, 2
order by 1, 2;

-- 2) القائمة: المعرّف وتاريخ الاعتماد وحده، بلا اسم ولا بريد ولا محتوى
select c.participant_id, c.approved_at,
  (c.snapshot -> 'issued' is not null) as has_issued
from leaders.capstones c
left join leaders.participants p on p.id = c.participant_id
where c.status = 'approved'
  and coalesce(p.is_demo, false) = false
  and coalesce(c.snapshot -> 'issued' ->> 'fingerprint', '') !~ '^[0-9A-F]{4}(-[0-9A-F]{4}){3}$'
order by c.approved_at;

rollback;
