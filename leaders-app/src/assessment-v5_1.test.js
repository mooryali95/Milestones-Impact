// حراس المرحلة ز: القياس قبل تفعيل v5 (الملحق 5 §1.4، §1.5، §1.7، §2.2، §7.4)
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { anchorShareOf, compareAssessments, overrideNeedsReason, practiceEffect } from '../../supabase/functions/leaders-api/logic.js';
import { EDITS, EST_MINUTES, REPLACE } from '../../scripts/questions/edits-v5_1.mjs';

const root = join(__dirname, '../..');
const read = (p) => readFileSync(join(root, p), 'utf8');
const items = (v) => JSON.parse(read(`supabase/content/questions/${v}/items.json`));
const MIGRATION = '20261105150000_leaders_v5_1_pre_activation';

describe('حصة المشترك من الأداة', () => {
  it('3/6 في baseline-v4 و3/8 في baseline-v5', () => {
    expect(anchorShareOf(items('v4.2').filter((q) => q.instrument === 'baseline-v4'))).toEqual({ milestone: 0.5, impact: 0.5, leadership: 0.5 });
    expect(anchorShareOf(items('v5.1').filter((q) => q.instrument === 'baseline-v5'))).toEqual({ milestone: 0.375, impact: 0.375, leadership: 0.375 });
  });
  it('بلا مواقف 0.5 افتراضًا، وبلا صيغ 1، وفقرات المستوى والتوائم خارج الحساب', () => {
    expect(anchorShareOf([])).toEqual({ milestone: 0.5, impact: 0.5, leadership: 0.5 });
    expect(anchorShareOf([{ dimension: 'milestone', tier: 'skill', code: 'M-S1' }]).milestone).toBe(1);
    const qs = [{ dimension: 'impact', tier: 'skill', code: 'I-S1' }, { dimension: 'impact', tier: 'skill', code: 'I-S2', form: 'A' },
      { dimension: 'impact', tier: 'skill', code: 'I-S1T', anchor_code: 'I-S1' }, { dimension: 'impact', tier: 'skill', code: 'I-S10', form: 'A', min_level: 'intermediate' }];
    expect(anchorShareOf(qs).impact).toBe(0.5);
  });
  it('أثر التكرار يُوزن بالحصة لا بـ0.5 ثابتة', () => {
    const pairs = [{ pre: { anchor: 50, form: 50 }, post: { anchor: 70, form: 60 } }];
    expect(practiceEffect(pairs).points).toBe(5);
    expect(practiceEffect(pairs, { anchorShare: 0.375 }).points).toBe(3.8);
  });
});

describe('طرح التكرار لمجموعة التكرار فقط', () => {
  const pre = { milestone: { knowledge: 50, skill: 50, behavior: 50 } };
  const post = { milestone: { knowledge: 60, skill: 60, behavior: 60 } };
  const impact = { practice: { milestone: 6 } };
  const m = (extra) => compareAssessments({ pre, post, impact, ...extra }).find((d) => d.dimension === 'milestone');
  it('من أعاد المواقف المشتركة يُطرح منه، ومن رأى التوائم لا', () => {
    expect(m({ repeat: true }).practice).toBe(3);
    expect(m({}).practice).toBe(3);
    expect(m({ repeat: false }).practice).toBe(0);
    expect(m({ repeat: false }).rci).toBeGreaterThan(m({ repeat: true }).rci);
  });
});

describe('تعليل تجاوز التسكين', () => {
  it('يلزم حين يخالف المستوى القائم بلا علة من 10 أحرف', () => {
    expect(overrideNeedsReason('beginner', 'intermediate', '')).toBe(true);
    expect(overrideNeedsReason('beginner', 'intermediate', 'قصير')).toBe(true);
    expect(overrideNeedsReason('beginner', 'intermediate', 'أداؤه في اختبارات الباب الرابع يفوق المحسوب')).toBe(false);
    expect(overrideNeedsReason('beginner', 'beginner', '')).toBe(false);
    expect(overrideNeedsReason(null, 'advanced', '')).toBe(false);
  });
  it('الخادم يرفض الاعتماد بلا تعليل، والشاشة تطلبه', () => {
    expect(read('supabase/functions/leaders-api/admin.ts')).toMatch(/overrideNeedsReason\(old\?\.level, level, b\.notes\?\.\[d\]\)/);
    // بطاقة المستوى صارت مكوّنًا مستقلًا (تصور 2026-11-11، المرحلة 1)
    expect(read('admin-app/src/screens/LevelCard.jsx')).toMatch(/سبب المخالفة \(إلزامي/);
  });
});

describe('بنك القياس v5.1', () => {
  it('يجتاز التحقق (الأطوال، مسميات الأُطر، التوأمة، التقارب مع كتيب v3)', () => {
    execFileSync('node', ['scripts/questions/verify-v5_1.mjs'], { cwd: root, stdio: 'pipe' });
    execFileSync('node', ['scripts/questions/verify-v5.mjs'], { cwd: root, stdio: 'pipe' });
  });
  it('12 فقرة معرفية مستبدلة بلا مسميات أُطر، و48 تعديل أطوال، وزمن واقعي', () => {
    expect(Object.keys(REPLACE)).toHaveLength(12);
    for (const r of Object.values(REPLACE)) expect([r.text_ar, ...r.opts.map((o) => o[0])].join(' ')).not.toMatch(/PMI|Axelos|RBM|BRM|MSP|DAC|OKR|SROI|Kotter|الخماسية/);
    expect(Object.keys(EDITS).length).toBeGreaterThanOrEqual(40);
    for (const k of ['baseline-v5', 'post-v3']) { expect(EST_MINUTES[k]).toBeGreaterThanOrEqual(45); expect(EST_MINUTES[k]).toBeLessThanOrEqual(60); }
  });
  it('الترحيل يحدّث أداتي v5 وحدهما، ويسجّل نفسه، والتفعيل يشترطه', () => {
    const mig = read(`supabase/migrations/${MIGRATION}.sql`);
    for (const m of mig.match(/i\.key = '([^']+)'/g)) expect(m).toMatch(/baseline-v5|post-v3/);
    expect(mig).toContain(`insert into leaders.schema_migrations (name) values ('${MIGRATION}') on conflict do nothing;`);
    expect(mig).toMatch(/raise exception 'v5\.1/);
    expect(read('supabase/migrations/20261102100100_leaders_activate_v5.sql')).toContain(MIGRATION);
    expect(read('scripts/questions/verify-v5.mjs')).toMatch(/handbook\/v3\//);
    expect(read('.github/workflows/ci.yml')).toMatch(/verify-v5_1\.mjs/);
  });
});

describe('تقرير الأثر والشاشة', () => {
  it('الحصة من الأداة، والتكرار للمجموعة، والزمن تقدير لا وعد', () => {
    const impact = read('supabase/functions/leaders-api/impact.ts');
    expect(impact).toMatch(/practiceEffect\(pairs, \{ anchorShare: share\[d\]/);
    expect(impact).toMatch(/repeat = twinned\.has\(x\.post\.instrument_id\) \? anchorRepeat\(pid\) : true/);
    const screen = read('leaders-app/src/screens/Assessment.jsx');
    expect(screen).toMatch(/في المتوسط بلا حد زمني/);
    expect(screen).toMatch(/الوقت المنقضي في هذه الجلسة/);
  });
});
