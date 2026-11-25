-- قراءة فقط: أخطاء تحميل الأقسام والعرض في تطبيق القادة خلال 48 ساعة (بلاغ المالك: تعذّر دخول الخبير من رابط البريد على آيفون). لا يكتب شيئًا.
-- 0) أحدث أخطاء الرسم وتحميل الملفات: النوع، والإجراء، والبناء، والرسالة المنقّاة، والوقت
select true as ok, coalesce(string_agg(to_char(at, 'MM-DD HH24:MI') || ' ' || kind || ' · ' || coalesce(nullif(act, ''), '-') || ' · ' || coalesce(build, '-') || ' · ' || coalesce(message, ''), ' | ' order by at desc), 'لا أخطاء') as detail
from (select * from leaders.client_events where kind in ('chunk', 'render', 'error', 'rejection') and created_at > now() - interval '48 hours' order by at desc limit 40) e;
-- 1) العدد بحسب النوع والبناء في 48 ساعة
select true as ok, coalesce(string_agg(kind || '@' || coalesce(build, '-') || '=' || n, ' · ' order by n desc), 'لا شيء') as detail
from (select kind, build, count(*) n from leaders.client_events where created_at > now() - interval '48 hours' group by 1, 2) s;
