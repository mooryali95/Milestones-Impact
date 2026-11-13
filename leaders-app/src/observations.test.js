import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { auditAr, cleanObservation, flagsOf, timelineOf } from '../../supabase/functions/leaders-api/observations.js';

const read = (p) => readFileSync(join(__dirname, '../..', p), 'utf8');
const NOW = Date.parse('2026-11-13T12:00:00Z');

describe('ملف المشارك: الملاحظات والأعلام والخط الزمني', () => {
  it('الملاحظة اليدوية: نوعها مضبوط، ونصها مطلوب ومحدود، والمرئية بطلب صريح', () => {
    expect(cleanObservation({ body: ' ' }).error).toBeTruthy();
    expect(cleanObservation({ body: 'x'.repeat(2001) }).error).toContain('2000');
    expect(cleanObservation({ kind: 'hack', body: 'حضر متأخرًا', visible: 'yes' })).toEqual({ kind: 'note', body: 'حضر متأخرًا', title: null, visible: false });
    expect(cleanObservation({ kind: 'commendation', title: '  عرض   ممتاز ', body: 'قدّم عرضًا واضحًا', visible: true })).toMatchObject({ kind: 'commendation', title: 'عرض ممتاز', visible: true });
  });
  it('الأعلام تُشتق من مصادرها: استعجال، إعادة، تأخر، غياب، نماذج معادة، توقف، وتنبيهات السجل', () => {
    const f = flagsOf({
      participant: { status: 'placed', last_login_at: '2026-10-20T00:00:00Z' },
      effort: { level: 'low', note: '46 من 60' }, retake: { requested_at: '2026-11-13' },
      milestone_summary: { late: 2, max_late: 9 }, sessions: [{ status: 'no_show' }, { status: 'attended' }],
      models: [{ status: 'returned' }], observations: [{ kind: 'warning' }, { kind: 'commendation' }],
    }, NOW);
    expect(f.map((x) => x.key)).toEqual(['retake', 'effort', 'late', 'no_show', 'returned', 'idle', 'warnings', 'praise']);
    expect(f.find((x) => x.key === 'late')).toMatchObject({ tone: 'bad', label: '2 معالم متأخرة', detail: 'أقصاها 9 يومًا' });
    expect(f.find((x) => x.key === 'no_show').label).toBe('غاب عن جلسة توجيه');
  });
  it('ملف نظيف بلا أعلام، ومن لم يُعتمد بعد لا يُعدّ متوقفًا', () => {
    expect(flagsOf({ participant: { status: 'placed', last_login_at: '2026-11-12T00:00:00Z' }, effort: { level: 'ok' } }, NOW)).toEqual([]);
    expect(flagsOf({ participant: { status: 'profiled', last_login_at: null } }, NOW)).toEqual([]);
  });
  it('الخط الزمني: السجل والملاحظات معًا، الأحدث أولًا، بتسمية عربية وسبب تغيير الحالة', () => {
    const t = timelineOf({
      history: [{ created_at: '2026-11-10T10:00:00Z', action: 'assessment.submit', actor_type: 'participant' },
        { created_at: '2026-11-12T10:00:00Z', action: 'participant.status', actor_type: 'admin', after: { status: 'suspended', reason: 'طلب الجهة' } }],
      observations: [{ created_at: '2026-11-11T10:00:00Z', kind: 'warning', source: 'system', title: 'غياب عن جلسة توجيه', body: 'سُجّل غيابك.' }],
    });
    expect(t.map((x) => x.text)).toEqual(['تغيّرت حالته', 'تنبيه: غياب عن جلسة توجيه', 'سلّم القياس']);
    expect(t[0].detail).toContain('السبب: طلب الجهة');
    expect(t[1]).toMatchObject({ tone: 'warn', by: 'النظام' });
    expect(auditAr('unknown.action')).toBe('unknown.action');
  });
  it('مصدر واحد: الملف يقرأ الأعلام والخط الزمني من observations.js، ونسخة المشارك تحمل المرئي وحده', () => {
    const file = read('supabase/functions/leaders-api/file.ts');
    expect(file).toContain('flags: flagsOf(file), timeline: timelineOf(');
    const priv = read('supabase/functions/leaders-api/privacy.ts');
    expect(priv).toMatch(/participant_observations'\)\.select\('kind, title, body, created_at, acknowledged_at'\)[^\n]*\.eq\('visible', true\)/);
    // ملاحظات النظام لا تُحذف، والكتابة للإدارة بغلاف writer
    expect(read('supabase/functions/leaders-api/observations.ts')).toContain("if (row.source === 'system') throw new Fail(");
    expect(read('supabase/functions/leaders-api/index.ts')).toContain("'admin.observation-add': (a, b) => A.writer(a, OB.adminAdd, b),");
  });
});

import { cleanStatusReason, quizLowCount, RULES, statusNeedsReason, QUIZ_LOW_COUNT } from '../../supabase/functions/leaders-api/notice-rules.js';

describe('قواعد التنبيه الآلي', () => {
  it('ست قواعد لا أكثر، وكل نص يصف الواقعة وما يُنتظر بعدها بلا اتهام', () => {
    expect(Object.keys(RULES)).toEqual(['coaching_no_show', 'milestone_late', 'model_returned_again', 'peer_hidden', 'account_status', 'quiz_low']);
    const all = [RULES.coaching_no_show({ starts_at: '2026-11-15T09:00:00Z' }), RULES.milestone_late({ title: 'خطة التطبيق', late_days: 6 }),
      RULES.model_returned_again({ title: 'سجل المخاطر', times: 2 }), RULES.peer_hidden(), RULES.account_status({ status: 'suspended', reason: 'طلب الجهة الراعية' }), RULES.quiz_low({ count: 3 })];
    for (const r of all) {
      expect(r.title && r.body.length > 20 && r.visible === true).toBe(true);
      expect(`${r.title} ${r.body}`).not.toMatch(/غش|إهمال|تقصير|اكتشف/);
    }
    expect(all[1].body).toContain('«خطة التطبيق» تجاوز موعده بـ6 يومًا');
    expect(all[2].body).toContain('للمرة الثانية');
    expect(all[4].body).toContain('السبب: طلب الجهة الراعية');
  });
  it('الأبواب المنخفضة: دون النصف، والتنبيه عند الثالث وحده', () => {
    const rows = [{ quiz_score: 0, quiz_total: 2 }, { quiz_score: 1, quiz_total: 3 }, { quiz_score: 1, quiz_total: 2 }, { quiz_score: 0, quiz_total: 0 }];
    expect(quizLowCount(rows)).toBe(2);
    expect(quizLowCount([...rows, { quiz_score: 0, quiz_total: 3 }])).toBe(QUIZ_LOW_COUNT);
  });
  it('الإيقاف والانسحاب بسبب مكتوب، وغيرهما بلا سبب', () => {
    expect(statusNeedsReason('suspended') && statusNeedsReason('withdrawn')).toBe(true);
    expect(statusNeedsReason('placed')).toBe(false);
    expect(cleanStatusReason('  x ')).toBeNull();
    expect(cleanStatusReason('طلب   الجهة الراعية')).toBe('طلب الجهة الراعية');
  });
  it('كل قاعدة تُكتب عبر المدخل الواحد record() بمفتاحها ومرجع واقعتها', () => {
    const src = ['activities.ts', 'admin.ts', 'peer.ts', 'participant.ts'].map((f) => read(`supabase/functions/leaders-api/${f}`)).join('\n');
    for (const code of Object.keys(RULES)) expect(src, code).toMatch(new RegExp(`code: '${code}', ref: [^\\n]+?\\.\\.\\.RULES\\.${code}\\(`));
  });
});

import { chapterPoints, fieldFilled, meaningful, missingFields, POINTS, REFLECTION_MIN, TEXTAREA_MIN } from '../../supabase/functions/leaders-api/logic.js';

describe('جودة المدخلات', () => {
  it('النص ذو المعنى: طول أدنى وكلمات مختلفة، فلا يمر حرف مكرر ولا كلمة واحدة مكررة', () => {
    expect(meaningful('ااااااااااااااااااااااا', REFLECTION_MIN)).toBe(false);
    expect(meaningful('جيد جيد جيد جيد جيد جيد', REFLECTION_MIN)).toBe(false);
    expect(meaningful('سأطبّق سجل المخاطر في مشروعي القادم', REFLECTION_MIN)).toBe(true);
  });
  it('نقاط التأمل لمن كتب تأملًا له معنى وحده، وباقي نقاط الباب كما هي', () => {
    const base = POINTS.chapter + 2 * POINTS.perCorrect;
    expect(chapterPoints(2, 'xxxxxxxxxxxxxxxxxxxxxxxx')).toBe(base);
    expect(chapterPoints(2, 'سأطبّق سجل المخاطر في مشروعي القادم')).toBe(base + POINTS.reflection);
  });
  it('الحقل النصي الطويل في النموذج يكتمل بجملة، والقصير والجدول كما كانا', () => {
    expect(fieldFilled({ type: 'textarea' }, 'ن')).toBe(false);
    expect(fieldFilled({ type: 'textarea' }, 'نرفع رضا المستفيدين عن الخدمة')).toBe(true);
    expect(fieldFilled({ type: 'text' }, 'منصة')).toBe(true);
    expect(fieldFilled({ type: 'table', min_rows: 1 }, [['صف', 'قيمة']])).toBe(true);
    expect(TEXTAREA_MIN.chars).toBeLessThan(REFLECTION_MIN.chars);
  });
  it('رسالة النقص تفرّق بين حقل فارغ وحقل كُتب فيه ما لا يكفي', () => {
    const fields = [{ key: 'a', type: 'textarea', label: 'الهدف' }, { key: 'b', type: 'textarea', label: 'الأثر' }];
    expect(missingFields(fields, { a: 'ن', b: '' })).toEqual(['الهدف: اكتب جملة كاملة على الأقل', 'الأثر']);
  });
});
