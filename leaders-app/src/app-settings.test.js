// الإعدادات العامة (قاعدة المالك 2026-11-11): مخزن واحد لكل قيمة يضبطها المالك، بتعريف واحد يتحقق به الخادم واللوحة،
// وحدود زمن الإجابة في مراجعة القياس تُقرأ منه لا من ثوابت في الوحدة.
import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { cleanField, cleanGroup, DEFAULTS, resolveSettings, SETTINGS } from '../../supabase/functions/leaders-api/settings.js';
import { estimateTimes, FAST_FLOOR_SECONDS, IDLE_SECONDS, reviewAnswers } from '../../supabase/functions/leaders-api/answer-review.js';

const read = (p) => readFileSync(join(__dirname, '../..', p), 'utf8');

describe('التعريف والقيم الافتراضية', () => {
  it('كل حقل له افتراضي يمر بتحققه نفسه', () => {
    for (const [g, def] of Object.entries(SETTINGS)) {
      for (const [k, f] of Object.entries(def.fields)) expect(cleanField(f, f.default), `${g}.${k}`).toMatchObject({ ok: true });
      expect(cleanGroup(g, {}).ok).toBe(true);
    }
  });
  it('افتراضيات تقييم 360 كما في التصور المعتمد', () => {
    expect(DEFAULTS.feedback360).toMatchObject({ enabled: false, min_group: 3, min_others: 3, org_min: 5, window_days: 14, remind_days: [5, 10], round_gap_days: 90, gap_points: 0.5 });
    expect(DEFAULTS.feedback360.scale_labels).toHaveLength(5);
  });
  it('حدود الزمن الافتراضية هي قرارات المالك السابقة نفسها', () => {
    expect(DEFAULTS.answer_review).toEqual({ idle_seconds: 300, fast_ratio: 0.3, fast_min_sample: 3, fast_floor_choice: 3, fast_floor_likert: 1.5, effort_floor_choice: 5, effort_floor_likert: 2, effort_low_share: 0.25 });
    expect(IDLE_SECONDS).toBe(300);
    expect(FAST_FLOOR_SECONDS).toEqual({ choice: 3, likert: 1.5 });
  });
});

describe('التحقق', () => {
  it('يرفض خارج الحدود والنوع الخاطئ والحقل المجهول', () => {
    expect(cleanGroup('feedback360', { min_group: 1 }).errors.min_group).toMatch(/بين/);
    expect(cleanGroup('feedback360', { min_group: 3.5 }).errors.min_group).toMatch(/صحيح/);
    expect(cleanGroup('feedback360', { nope: 1 }).errors.nope).toBeTruthy();
    expect(cleanGroup('nope', {}).ok).toBe(false);
  });
  it('أيام التذكير نصًا أو قائمة، مرتبة بلا تكرار، وداخل النافذة', () => {
    expect(cleanGroup('feedback360', { remind_days: '10، 3 ,3' }).value.remind_days).toEqual([3, 10]);
    expect(cleanGroup('feedback360', { remind_days: [20] }).errors._).toMatch(/داخل نافذة/);
    expect(cleanGroup('feedback360', { window_days: 30, remind_days: [20] }).ok).toBe(true);
  });
  it('حد الإصدار لا يقل عن حد الإخفاء', () => {
    expect(cleanGroup('feedback360', { min_group: 5, min_others: 4 }).errors._).toMatch(/لا يقل/);
  });
  it('المراسي خمس غير فارغة', () => {
    expect(cleanGroup('feedback360', { scale_labels: ['أ', 'ب'] }).ok).toBe(false);
    expect(cleanGroup('feedback360', { scale_labels: ['أ', 'ب', '', 'د', 'هـ'] }).ok).toBe(false);
  });
});

describe('قراءة المخزن', () => {
  it('المحرَّر الصالح فوق الافتراضي، والتالف يبقى افتراضيًا', () => {
    const s = resolveSettings([{ key: 'feedback360', value: { min_others: 4, window_days: 'x', ghost: 1 } }, { key: 'answer_review', value: { idle_seconds: 600 } }, { key: 'nope', value: {} }]);
    expect(s.feedback360.min_others).toBe(4);
    expect(s.feedback360.window_days).toBe(14);
    expect(s.answer_review.idle_seconds).toBe(600);
    expect(s.answer_review.fast_ratio).toBe(0.3);
  });
  it('مجموعة تخالف قاعدة بين حقولها تعود كلها إلى الافتراضي', () => {
    expect(resolveSettings([{ key: 'feedback360', value: { window_days: 6, remind_days: [10] } }]).feedback360.window_days).toBe(14);
  });
  it('لا يغير القيم الافتراضية المشتركة', () => {
    resolveSettings([{ key: 'answer_review', value: { idle_seconds: 900 } }]);
    expect(DEFAULTS.answer_review.idle_seconds).toBe(300);
  });
});

describe('مراجعة القياس تقرأ حدودها من الإعدادات', () => {
  const q = (id) => ({ id, dimension: 'milestone', tier: 'skill', kind: 'choice', options: [{ score: 0 }, { score: 2 }] });
  const s = (n) => Date.parse('2026-11-11T08:00:00Z') + n * 1000;
  it('حد الانقطاع المحرَّر يغير الحكم بالانقطاع', () => {
    const list = [{ ...q('a'), at: s(0) }, { ...q('b'), at: s(400) }];
    expect(estimateTimes(list, s(-5))[1].note).toBe('gap');
    expect(estimateTimes(list, s(-5), { ...DEFAULTS.answer_review, idle_seconds: 600 })[1].seconds).toBe(400);
  });
  it('الحد الأدنى للقراءة المحرَّر يغير «سريع»', () => {
    const rows = ['a', 'b', 'c'].map((id, i) => ({ question_id: id, value: { k: 1 }, answered_at: new Date(s(i * 4)).toISOString() }));
    const qs = ['a', 'b', 'c'].map(q);
    expect(reviewAnswers({ questions: qs, rows, startedAt: new Date(s(-4)).toISOString() }).totals.fast).toBe(0);
    expect(reviewAnswers({ questions: qs, rows, startedAt: new Date(s(-4)).toISOString(), timing: { fast_floor_choice: 5 } }).totals.fast).toBe(2);
  });
  it('لا ثابت رقمي للحدود في الوحدة، والخادم يمرر الإعدادات', () => {
    const src = read('supabase/functions/leaders-api/answer-review.js');
    expect(src).not.toMatch(/IDLE_SECONDS = \d|FAST_RATIO = |FAST_MIN_SAMPLE = |likert: 1\.5/);
    expect(src).toMatch(/import \{ DEFAULTS \} from '\.\/settings\.js';/);
    expect(read('supabase/functions/leaders-api/admin.ts')).toMatch(/const timing = \(await appSettings\(\)\)\.answer_review;[\s\S]{0,300}reviewAnswers\(\{[^}]*timing \}/);
  });
});

describe('الخادم واللوحة', () => {
  it('الحفظ للمدير ذي الكتابة، بالتحقق نفسه، ويُسجَّل', () => {
    const ts = read('supabase/functions/leaders-api/settings.ts');
    expect(ts).toMatch(/export async function adminSave\(a: Admin, b: Body\) \{\n  requireWrite\(a\);/);
    expect(ts).toMatch(/cleanGroup\(group, b\.values, before\)/);
    expect(ts).toMatch(/audit\('admin', a\.email, 'admin\.settings-save'/);
    const idx = read('supabase/functions/leaders-api/index.ts');
    expect(idx).toMatch(/'admin\.settings': \(\) => ST\.adminGet\(\)/);
    expect(idx).toMatch(/'admin\.settings-save': \(a, b\) => A\.writer\(a, ST\.adminSave, b\)/);
  });
  it('المحرر يُرسم من التعريف نفسه ويتحقق به قبل الإرسال', () => {
    const ui = read('admin-app/src/screens/AppSettings.jsx');
    expect(ui).toMatch(/import \{ cleanGroup, SETTINGS \} from '\.\.\/\.\.\/\.\.\/supabase\/functions\/leaders-api\/settings\.js';/);
    expect(ui).toMatch(/Object\.entries\(def\.fields\)/);
  });
  it('الترحيل متسامح وآمن لإعادة التشغيل', () => {
    const sql = read('supabase/migrations/20261111130100_leaders_app_settings.sql');
    expect(sql).toMatch(/^-- deploy-gate: tolerant /m);
    expect(sql).toMatch(/create table if not exists leaders\.app_settings/);
    expect(sql).toMatch(/enable row level security/);
    expect(sql).toMatch(/insert into leaders\.schema_migrations \(name\) values \('20261111130100_leaders_app_settings'\) on conflict do nothing;/);
  });
});
