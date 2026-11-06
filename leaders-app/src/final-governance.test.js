// حراس المرحلة ح (قرارات القياس): ربط المنطق النقي بالخادم والشاشات
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const root = join(__dirname, '../..');
const read = (p) => readFileSync(join(root, p), 'utf8');
const api = (f) => read(`supabase/functions/leaders-api/${f}`);

describe('الختامي على الخادم', () => {
  const final = api('final.ts');
  it('القياس النهائي من تقرير الأثر (اتجاه RCI والاختبار الموضوعي)، وسياق انتهاء الدفعة', () => {
    expect(final).toMatch(/compareFor\(\[p\.id\]\)/);
    expect(final).toMatch(/direction: row\?\.overall\?\.direction \?\? null/);
    expect(final).toMatch(/const ended = !!ends && /);
    expect(final).toMatch(/computeFinal\(components, program\.final_eval, adjust, ctx\)/);
  });
  it('بعد الرفع لقطة لا حساب حي، والمُعدِّل لا يعتمد نفسه، والإعداد يرفع إصداره', () => {
    expect(final).toMatch(/const frozen = !!record && \['pending', 'approved'\]\.includes\(record\.status\) && !!record\.snapshot/);
    expect(final).toMatch(/voteBlock\(a\.email, record, program\.final_eval\)/);
    expect(final).toMatch(/largeAdjust: !!record\.snapshot\?\.large_adjust/);
    expect(final).toMatch(/cleanFinalConfig\(b\.config, prev\)/);
    expect(api('index.ts')).toMatch(/'admin\.final-eval': \(a, b\) => F\.get\(b, a\)/);
  });
  it('المشارك يرى ملاحظات خبيره مع القرار، والتقييم المستمر بحدّي أحداثه من الإعداد', () => {
    const p = api('participant.ts');
    expect(p).toMatch(/notes: fe\.adjust\?\.notes_to_participant \|\| null/);
    expect(p).toMatch(/min_events: fc\.min_events, min_quiz_items: fc\.min_quiz_items/);
  });
});

describe('تقرير رد الفعل (كيركباتريك 1)', () => {
  it('T-REACT مجمّعة في تقرير الأثر وتظهر في الشاشة', () => {
    const impact = api('impact.ts');
    expect(impact).toMatch(/eq\('code', 'T-REACT'\)\.eq\('kind', 'survey'\)/);
    expect(impact).toMatch(/cohort, overall, transfer, reaction, config: cfg/);
    expect(read('admin-app/src/screens/Impact.jsx')).toMatch(/<Reaction s=\{r\.reaction\} \/>/);
  });
});

describe('الشاشات', () => {
  it('الإعداد يعرض طريقة القياس واللجنة والإصدار، والبطاقة تطلب الملاحظات وتمنع التصويت الممنوع', () => {
    const fe = read('admin-app/src/screens/FinalEval.jsx');
    for (const s of ['FINAL_MEASURE_AR', 'mastery_cut', 'fail_min_coverage', 'large_adjust', 'إصدار المعادلة', 'notes_to_participant', 'd.vote_block', 'لقطة الرفع']) expect(fe).toContain(s);
    const ms = read('admin-app/src/screens/Milestones.jsx');
    expect(ms).toContain('خارج المؤشر');
    expect(ms).toContain('c.engagement');
    expect(read('leaders-app/src/screens/Journey.jsx')).toContain('me.final.notes');
  });
});
