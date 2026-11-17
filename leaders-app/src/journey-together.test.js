// التوازي 2 عند المشارك (R3b في تصور محرر رحلة الدفعة): قيمة واحدة لـ«المرحلة الحالية» تقرؤها الخريطة والتذكير وشاشة
// الرحلة، ويوم الدخول من أول المجموعة، وموقع الدفعة اليوم، ومدة الرحلة من خطتها لا مجموع مددها.
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { currentStages, groupAt, journeyMap, stageEntry, todayStage, todayStages } from '../../supabase/functions/leaders-api/journey-map.js';
import { cohortPlan, planSpanDays, stageWindows } from '../../supabase/functions/leaders-api/stage-windows.js';
import { cohortDefinition } from '../../supabase/functions/leaders-api/logic.js';
import { nudgeFor, stageText } from '../../supabase/functions/leaders-api/nudge.js';
import { pathOf } from './screens/Paywall.jsx';

const read = (p) => readFileSync(join(__dirname, '../..', p), 'utf8');
const S = (key, sort, days, rules = null, phase = 'qualification') => ({ key, sort, title_ar: key, duration_days: days, phase, ...(rules ? { rules } : {}) });
const W = (k, offset) => ({ unlock: 'with', with: k, ...(offset ? { offset } : {}) });
const item = (status, completed_at = null) => ({ title_ar: `بند ${status}`, status, completed_at, required: true });
// رحلة مشارك: profile ثم a وb تسيران معًا ثم c
const STAGES = [S('profile', 1, 0, null, 'admission'), S('a', 2, 14), S('b', 3, 28, W('a', 7)), S('c', 4, 14)];
const J = (st, done = {}) => STAGES.map((s) => ({ ...s, stage_mode: 'required', status: st[s.key] || 'locked', items: [item(st[s.key] === 'done' ? 'done' : 'pending', done[s.key] || null)] }));

describe('المرحلة الحالية للمشارك (currentStages)', () => {
  it('الجاريتان معًا: الموضع أول المجموعة، والجارية معه، وstart أول المجموعة', () => {
    const j = J({ profile: 'done', a: 'active', b: 'active' });
    const c = currentStages(j);
    expect(c.stage.key).toBe('a');
    expect(c.stages.map((s) => s.key)).toEqual(['a', 'b']);
    expect(c.together).toBe(true);
    expect(c.start).toBe(1);
    expect(groupAt(j, 2).map((s) => s.key)).toEqual(['a', 'b']);
  });
  it('اكتمل المرجع وبقي التابع: الموضع التابع وحده، والمجموعة كاملة للعرض', () => {
    const c = currentStages(J({ profile: 'done', a: 'done', b: 'active' }));
    expect(c.stage.key).toBe('b');
    expect(c.stages.map((s) => s.key)).toEqual(['b']);
    expect(c.group.map((s) => s.key)).toEqual(['a', 'b']);
    expect(c.together).toBe(false);
  });
  it('بلا توازٍ لا يتغير شيء: مرحلة واحدة هي positionOf، ومن أنهى -1', () => {
    const plain = J({ profile: 'done', a: 'active', b: 'active' }).map(({ rules: _r, ...s }) => s);
    expect(currentStages(plain).stages.map((s) => s.key)).toEqual(['a']);
    expect(currentStages(J({ profile: 'done', a: 'done', b: 'done', c: 'done' }))).toMatchObject({ idx: -1, stage: null, stages: [] });
  });
  it('المتاحة (اختيارية) في المجموعة لا تُعدّ جارية، والموضع المقفل وحده', () => {
    const j = J({ profile: 'done', a: 'active', b: 'available' });
    expect(currentStages(j).stages.map((s) => s.key)).toEqual(['a']);
    const waiting = J({ profile: 'done' });
    expect(currentStages(waiting).stages.map((s) => s.key)).toEqual(['a']);
  });
  it('الموقوفة لهذه الدفعة خارج الرحلة (R2b): مجموعتها بلا عضوها، و«تسير مع» موقوفة لا تصنع مجموعة', () => {
    const def = cohortDefinition({ live: { stages: STAGES, requirements: [] }, version: null, cohort: { schedule: { b: { off: true } } } });
    expect(def.stages.map((s) => s.key)).toEqual(['profile', 'a', 'c']);
    const j = def.stages.map((s) => ({ ...s, stage_mode: 'required', status: s.key === 'profile' ? 'done' : s.key === 'a' ? 'active' : 'locked', items: [] }));
    expect(currentStages(j).stages.map((s) => s.key)).toEqual(['a']);
  });
  it('توازي الدفعة (with في خطتها، R3a) يصنع المجموعة نفسها في رحلة المشارك', () => {
    const def = cohortDefinition({ live: { stages: [S('a', 1, 14), S('b', 2, 14), S('c', 3, 7)], requirements: [] }, version: null, cohort: { schedule: { b: { with: 'a', offset: 3 } } } });
    const j = def.stages.map((s) => ({ ...s, stage_mode: 'required', status: s.key === 'c' ? 'locked' : 'active', items: [] }));
    expect(currentStages(j).stages.map((s) => s.key)).toEqual(['a', 'b']);
  });
});

describe('يوم الدخول من أول المجموعة (stageEntry)', () => {
  it('إتمام مرحلة تسير معها لا يجعله «دخل للتو»', () => {
    const j = J({ profile: 'done', a: 'done', b: 'active' }, { profile: '2026-11-01T09:00:00Z', a: '2026-11-20T09:00:00Z' });
    expect(stageEntry(j, 2)).toBe('2026-11-01T09:00:00Z');
    expect(stageEntry(j, 2, ['2026-11-03T00:00:00Z'])).toBe('2026-11-03T00:00:00Z');
    // وما بعد المجموعة يرى إتمام أعضائها كلها
    expect(stageEntry(j, 3)).toBe('2026-11-20T09:00:00Z');
  });
});

describe('الخريطة تعدّ ما يراه المشارك', () => {
  const today = new Date('2026-11-10T10:00:00Z');
  const cohort = { name: 'دفعة', starts_on: '2026-11-01' };
  const people = [
    { id: 'x', name: 'سارة', created_at: '2026-10-01T00:00:00Z', journey: J({ profile: 'done', a: 'active', b: 'active' }, { profile: '2026-11-01T09:00:00Z' }) },
    { id: 'y', name: 'خالد', created_at: '2026-10-01T00:00:00Z', journey: J({ profile: 'done', a: 'done', b: 'active' }, { profile: '2026-11-01T09:00:00Z', a: '2026-11-08T00:00:00Z' }) },
    { id: 'z', name: 'نورة', created_at: '2026-10-01T00:00:00Z', journey: J({ profile: 'done', a: 'done', b: 'done', c: 'active' }) },
  ];
  it('من يقف في مرحلتين تسيران معًا يُعدّ «هنا» في كل منهما، ومرة واحدة في محوره وفي الإجمالي', () => {
    const m = journeyMap({ stages: STAGES, people, cohort, today, list: true });
    const by = Object.fromEntries(m.stages.map((s) => [s.key, s]));
    expect([by.a.here, by.b.here, by.c.here]).toEqual([1, 2, 1]);
    expect([by.a.done, by.b.done, by.c.done]).toEqual([2, 1, 0]);
    expect(m.here_by_phase).toEqual({ qualification: 3 });
    expect(by.b.people.map((p) => p.name).sort()).toEqual(['خالد', 'سارة']);
    // خالد دخل المجموعة يوم أتم الملف لا يوم أتم «a»
    expect(by.b.people.find((p) => p.name === 'خالد').days).toBe(9);
  });
  it('المتأخر يُعدّ مرة واحدة في الإجمالي ولو تأخر في مرحلتين جاريتين', () => {
    const late = new Date('2026-12-20T10:00:00Z');
    const m = journeyMap({ stages: STAGES, people: [people[0]], cohort, today: late });
    const by = Object.fromEntries(m.stages.map((s) => [s.key, s]));
    expect([by.a.late, by.b.late]).toEqual([1, 1]);
    expect(m.totals.late).toBe(1);
  });
  it('موقع الدفعة اليوم: الجاريتان معًا، وقيمة واحدة أولهما', () => {
    const w = stageWindows(STAGES, cohort);
    expect(todayStages(STAGES, w, '2026-11-10')).toEqual(['a', 'b']);
    expect(todayStage(STAGES, w, '2026-11-10')).toBe('a');
    expect(todayStages(STAGES, w, '2026-11-20')).toEqual(['b']);
    expect(journeyMap({ stages: STAGES, people, cohort, today }).cohort.today_stages).toEqual(['a', 'b']);
  });
});

describe('التذكير من المرحلة الحالية نفسها', () => {
  const p = { id: 'p', email: 'p@x.sa', status: 'enrolled', created_at: '2026-10-01T00:00:00Z' };
  it('يسمّي الجاريتين معًا وخطوته فيهما، والعدّ عبرهما', () => {
    const j = J({ profile: 'done', a: 'active', b: 'active' }, { profile: '2026-11-01T00:00:00Z' });
    j[1] = { ...j[1], items: [] };
    const n = nudgeFor({ p, journey: j, progress: 30, now: '2026-11-04T00:00:00Z' });
    expect(n.ok).toBe(true);
    expect(n.key).toBe('stage:a');
    expect(n.step).toBe('بند pending');
    expect(n.subject).toBe('خطوتك التالية في «b»');
    expect(n.text).toContain('أنت في مرحلتين تسيران معًا: «a» و«b»');
    expect(n.text).toContain('خطوتك التالية في «b»: بند pending.');
    expect(n.remaining).toBe('أنجز 0 من 1 في «a» و«b» معًا');
    expect(n.days).toBe(3);
  });
  it('ما أُعيد بملاحظة في التابع يتقدم، وبلا توازٍ النص كما كان', () => {
    const j = J({ profile: 'done', a: 'active', b: 'active' });
    j[2] = { ...j[2], items: [{ title_ar: 'خطة التطبيق', status: 'returned', required: true, note: 'أضف المؤشر' }] };
    const n = nudgeFor({ p, journey: j, progress: 30 });
    expect(n.kind).toBe('returned');
    expect(n.text).toContain('خطوة في «b»');
    expect(stageText({ stage: 'التدريب', need: 'قراءة', progress: 10, days: 0 })).toBe('أنت في مرحلة «التدريب»، وقطعت 10% من رحلتك. خطوتك التالية: قراءة. أنت على الطريق الصحيح، فواصل.');
  });
});

describe('مدة الرحلة من خطتها (planSpanDays)', () => {
  it('المجموعة أطول أعضائها بإزاحتها لا مجموعها، والمرحلة بلا مدة لا تأخذ يومًا', () => {
    expect(planSpanDays(STAGES)).toBe(7 + 28 + 14);
    expect(planSpanDays(STAGES.map(({ rules: _r, ...s }) => s))).toBe(14 + 28 + 14);
    expect(planSpanDays([S('x', 1, 0)])).toBe(0);
    expect(planSpanDays([])).toBe(0);
  });
  it('خطة الدفعة (مدد وتوازٍ وإيقاف) تُقرأ بلا تواريخ مثبتة، وتطابق cohortPlan بتاريخ', () => {
    const plain = STAGES.map(({ rules: _r, ...s }) => s);
    expect(planSpanDays(plain, { b: { with: 'a' }, c: { off: true } })).toBe(28);
    expect(planSpanDays(plain, { b: { start: '2030-01-01' } })).toBe(14 + 28 + 14);
    const dated = cohortPlan(STAGES, { starts_on: '2026-11-01' });
    expect(dated.total_days).toBe(planSpanDays(STAGES));
  });
  it('بوابة الدفع: «نحو N أسابيع» من الخطة، فالمتوازية لا تضاعف المعلن', () => {
    expect(pathOf(STAGES.map((s) => ({ ...s, items: [] }))).weeks).toBe(7);
    expect(pathOf([{ title_ar: 'أ', duration_days: 14, items: [] }, { title_ar: 'ب', duration_days: 70, items: [] }]).weeks).toBe(12);
  });
  it('مصدر واحد: لا جمع لمدد المراحل في Paywall، والخريطة والتذكير والشاشة من currentStages', () => {
    const pay = read('leaders-app/src/screens/Paywall.jsx');
    expect(pay).toContain('planSpanDays(journey)');
    expect(pay).not.toMatch(/reduce\([^)]*duration_days/);
    expect(read('leaders-app/src/screens/Journey.jsx')).toContain('currentStages(journey)');
    expect(read('supabase/functions/leaders-api/nudge.js')).toContain('currentStages(journey)');
    expect(read('supabase/functions/leaders-api/journey-map.js')).toContain('const cur = currentStages(j);');
  });
});
