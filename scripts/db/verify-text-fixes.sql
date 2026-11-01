-- ════════════════════════════════════════════════════════════════════
-- تحقق بعد تطبيق 20261101120000_leaders_text_fixes.sql
-- كل استعلام يعيد الصفوف المخالفة المتبقية؛ المتوقع: 0 صفوف في كل منها.
-- يُشغَّل في محرر SQL أو: psql "$DATABASE_URL" -f scripts/db/verify-text-fixes.sql
-- ════════════════════════════════════════════════════════════════════

-- أ) journey_ar: لا أسماء قديمة للأطر ولا «محور»
select 'journey_ar' check_name, key, journey_ar from leaders.tracks
 where journey_ar ~ 'إدارة التنفيذ والمعالم|تحويل المخرجات إلى أثر|قيادة الناس والتغيير|محور';

-- أ) journey_ar: كل مسار يذكر اسم القاموس لإطار أولويته (حارس ضد استبدال ناقص)
select 'journey_ar_priority' check_name, key, priority_dimension from leaders.tracks t
 where not (t.journey_ar like '%' || (case t.priority_dimension
             when 'milestone' then 'إدارة المشروعات'
             when 'impact' then 'تحويل المشروع إلى أثر'
             when 'leadership' then 'تمكين القائد' end) || '%');

-- ب) focus_ar: لا نطاق في جمل المستوى
select 'focus_ar' check_name, key, focus_ar from leaders.tracks
 where focus_ar ~ 'على مستوى (المحفظة|البرامج والمحافظ|المحافظ|البرامج)';

-- ج) help_ar لعبارات الممارسة في الأدوات المفعّلة: نافذة واحدة
select 'question_help_window' check_name, i.key instrument, q.code, q.help_ar
  from leaders.questions q join leaders.instruments i on i.id = q.instrument_id
 where i.active and q.tier = 'behavior' and q.help_ar ~ '12 شهر|اثني عشر شهر';

-- د) المراحل
select 'stage_terms' check_name, key, program_id from leaders.journey_stages
 where description_ar ~ 'مشروع التطبيق|الكوتشنغ|الكوتشينغ'
    or activities_ar ~ 'مشروع التطبيق|تقييم 360 درجة|للمستويين|المحاور نفسها'
    or outcome_ar ~ 'مشروع تطبيق';

-- د) المتطلبات: القوس المزدوج و«مشروع التطبيق» و«كتابك» والأدوار
select 'req_terms' check_name, code, title_ar, help_ar from leaders.stage_requirements
 where title_ar ~ '\(عند الحاجة\)|مشروع التطبيق'
    or (code = 'T-HB' and help_ar ~ 'كتابك')
    or (code = 'C-MEET' and help_ar ~ 'المستشار')
    or (code = 'T-360' and help_ar ~ 'المستشار');

-- د) القالب المكرر في بنود النماذج السبعة
select 'req_boilerplate' check_name, code, help_ar from leaders.stage_requirements
 where code in ('O-MREG', 'O-GATE', 'O-CHAIN', 'L-MAP', 'L-DIRECT', 'T-AGREE', 'S-UPDATE')
   and (help_ar ~ 'مكتبة النماذج|يقيّمه المستشار|يقيّمها المستشار|فصل في وثيقة');

-- د) صيغة واحدة لتقييم 360
select 'req_360' check_name, code, title_ar from leaders.stage_requirements
 where code in ('T-360', 'L-360I', 'L-360A', 'E-360')
   and (title_ar !~ '^تقييم 360 مختصر' or title_ar ~ '360 درجة|قبلي|بعدي|القبلية');

-- النسخة الاحتياطية موجودة ومحمية بـRLS (صف واحد هنا يعني أنها غائبة أو بلا RLS)
select 'backup_missing_or_open' check_name
 where not exists (select 1 from pg_class c join pg_namespace n on n.oid = c.relnamespace
                    where n.nspname = 'leaders' and c.relname = 'backup_20261101_text_fixes' and c.relrowsecurity);
