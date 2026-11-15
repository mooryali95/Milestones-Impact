// الاعتماد الجماعي بالاستثناء (تصور 2026-11-15، المرحلة 1): من يُعتمد بمستواه المحسوب ومن يُستبقى ولماذا
import { describe, expect, it } from 'vitest';
import { approvalHolds, mailPlan, splitForApproval } from '../../supabase/functions/leaders-api/approval.js';

const placements = [{ dimension: 'milestone', level: 'beginner' }, { dimension: 'impact', level: 'intermediate' }, { dimension: 'leadership', level: 'beginner' }];
const ev = (level, extra = {}) => ({ level, borderline: false, flags: [], ...extra });
const clean = { status: 'pending_approval', placements, evaluations: { milestone: ev('beginner'), impact: ev('intermediate'), leadership: ev('beginner') } };
const keys = (h) => h.map((x) => x.key);

describe('من يُعتمد جماعيًا ومن يُستبقى', () => {
  it('المتسق في الأبعاد الثلاثة بلا إشارة يُعتمد', () => {
    expect(approvalHolds(clean)).toEqual([]);
  });
  it('الحالة الحدّية تُستبقى (قرار المالك)، والأعلام كلها، كلٌّ ببُعده', () => {
    const h = approvalHolds({ ...clean, evaluations: { ...clean.evaluations,
      milestone: ev('beginner', { borderline: true }),
      impact: ev('intermediate', { flags: [{ key: 'low_practice', reason_ar: 'ممارسة ذاتية دون أرضية المستوى' }] }) } });
    expect(keys(h)).toEqual(['borderline', 'low_practice']);
    expect(h[0]).toMatchObject({ dim: 'milestone' });
    expect(h[1].text).toContain('ممارسة ذاتية دون أرضية المستوى');
  });
  it('جدية الإجابة المنخفضة أو تحت المراجعة، وطلب الإعادة المعلّق، تُستبقى', () => {
    expect(keys(approvalHolds({ ...clean, effort: { level: 'low' } }))).toEqual(['effort']);
    expect(keys(approvalHolds({ ...clean, effort: { level: 'watch' } }))).toEqual(['effort']);
    expect(keys(approvalHolds({ ...clean, effort: { level: 'ok' } }))).toEqual([]);
    expect(keys(approvalHolds({ ...clean, retake: { requested_at: '2026-11-14' } }))).toEqual(['retake']);
  });
  it('المستوى الناقص، أو المحفوظ المخالف للمحسوب الآن، يُستبقى', () => {
    expect(keys(approvalHolds({ ...clean, placements: placements.slice(0, 2) }))).toEqual(['missing']);
    expect(keys(approvalHolds({ ...clean, evaluations: { ...clean.evaluations, leadership: ev('intermediate') } }))).toEqual(['drift']);
  });
  it('من ليس بانتظار الاعتماد لا يُعتمد جماعيًا', () => {
    expect(keys(approvalHolds({ ...clean, status: 'placed' }))).toEqual(['status']);
  });
});

describe('التقسيم وأثر البريد', () => {
  it('يقسم المحددين إلى من يُعتمد بمستوياته ومن يُستبقى بأسبابه', () => {
    const { ready, held } = splitForApproval([
      { id: 'p1', full_name: 'أ', ...clean },
      { id: 'p2', full_name: 'ب', ...clean, effort: { level: 'low' } },
    ]);
    expect(ready).toEqual([{ id: 'p1', full_name: 'أ', levels: { milestone: 'beginner', impact: 'intermediate', leadership: 'beginner' } }]);
    expect(held).toHaveLength(1);
    expect(held[0]).toMatchObject({ id: 'p2', holds: [{ key: 'effort' }] });
  });
  it('السقف اليومي يصفّ الزائد ولا يُسقطه', () => {
    expect(mailPlan(9, { used: 75, cap: 80 })).toEqual({ now: 5, queued: 4 });
    expect(mailPlan(9, { used: 0, cap: 80 })).toEqual({ now: 9, queued: 0 });
    expect(mailPlan(3, { used: 90, cap: 80 })).toEqual({ now: 0, queued: 3 });
  });
});

import { readFileSync } from 'node:fs';
import { join } from 'node:path';
describe('الخادم: مصدر واحد للاعتماد، والحكم يُعاد عند التنفيذ', () => {
  const admin = readFileSync(join(__dirname, '../../supabase/functions/leaders-api/admin.ts'), 'utf8');
  const fn = admin.slice(admin.indexOf('export async function approveBulk'), admin.indexOf('// تغيير الحالة، المدخل الواحد'));
  it('الاعتماد الفردي والجماعي يمران بقلب واحد (approveOne)، فلا نسخة ثانية من قواعده وبريده', () => {
    expect(admin).toMatch(/export async function approve\(a: Admin, b: Body\) \{[\s\S]*?await approveOne\(a, p, b\.levels \|\| \{\}, b\.notes \|\| \{\}\);/);
    expect(fn).toContain('await approveOne(a, p, r.levels, {}, { bulk: true })');
  });
  it('صلاحية الكتابة، والحد، والحكم من الخادم في المعاينة والتنفيذ معًا، وسجل جامع للعملية', () => {
    expect(fn).toContain('requireWrite(a);');
    expect(fn).toContain('ids.length > BULK_APPROVE_MAX');
    expect(fn.indexOf('splitForApproval(signals)')).toBeLessThan(fn.indexOf('if (b.dry_run)'));
    expect(fn).toContain("'placement.approve-bulk'");
  });
  it('الإشارات بتقييم ملف المشارك نفسه: evaluatePlacement والموافقة المطلقة من إجابات الممارسة', () => {
    const sig = admin.slice(admin.indexOf('async function approvalSignals'), admin.indexOf('export async function approveBulk'));
    expect(sig).toContain('evaluatePlacement(');
    expect(sig).toContain('acquiescenceFor(');
    expect(sig).toContain('baselineProgress(ids)');
  });
});

import { notesFor, planUniform } from '../../supabase/functions/leaders-api/approval.js';
describe('المرحلة 2: اعتماد المحددين بمستوى واحد', () => {
  const pend = (id, levels) => ({ id, full_name: id, status: 'pending_approval', placements: Object.entries(levels).map(([dimension, level]) => ({ dimension, level })) });
  const a = pend('a', { milestone: 'advanced', impact: 'beginner', leadership: 'beginner' });
  const b = pend('b', { milestone: 'beginner', impact: 'beginner', leadership: 'beginner' });
  it('المفروض يستبدل بُعده وحده، والفارغ يبقى على المحسوب، وتُسمّى كل مخالفة', () => {
    const p = planUniform([a, b], { milestone: 'beginner' }, '');
    expect(p.ready.map((r) => r.levels.milestone)).toEqual(['beginner', 'beginner']);
    expect(p.ready[0].changes).toEqual([{ dim: 'milestone', from: 'advanced', to: 'beginner' }]);
    expect(p.ready[1].changes).toEqual([]);
    expect(p.needs_reason).toBe(true);
    expect(p.reason_ok).toBe(false);
  });
  it('التعليل الكافي يقبل، ويُكتب لكل بُعد خالفه وحده', () => {
    const p = planUniform([a, b], { milestone: 'beginner' }, 'قرار اللجنة: بداية موحّدة للدفعة');
    expect(p.reason_ok).toBe(true);
    expect(notesFor(p.ready[0], ' قرار اللجنة ')).toEqual({ milestone: 'قرار اللجنة' });
    expect(notesFor(p.ready[1], 'قرار')).toEqual({});
  });
  it('بلا مخالفة لا يلزم تعليل، وغير المنتظر للاعتماد والناقص بلا فرض يُستبقيان', () => {
    expect(planUniform([b], { milestone: 'beginner' }, '').reason_ok).toBe(true);
    const p = planUniform([{ ...a, status: 'placed' }, pend('c', { milestone: 'beginner', impact: 'beginner' })], { milestone: 'beginner' }, '');
    expect(p.held.map((h) => h.holds[0].key)).toEqual(['status', 'missing']);
    expect(planUniform([pend('c', { milestone: 'beginner', impact: 'beginner' })], { leadership: 'intermediate' }, '').ready).toHaveLength(1);
  });
  it('الخادم: للمدير العام وحده، والتعليل يُرفض ناقصًا قبل أي اعتماد، ويمر بـapproveOne', () => {
    const src = readFileSync(join(__dirname, '../../supabase/functions/leaders-api/admin.ts'), 'utf8');
    const body = src.slice(src.indexOf('async function approveBulkSet'), src.indexOf('// تغيير الحالة، المدخل الواحد'));
    expect(body).toContain('requireSuper(a);');
    expect(body.indexOf("if (!plan.reason_ok)")).toBeLessThan(body.indexOf('approveOne('));
    expect(body).toContain('await approveOne(a, p, r.levels, notesFor(r, reason)');
  });
});

import { pickSample } from '../../supabase/functions/leaders-api/approval.js';
describe('المرحلة 3: التحقق بالعينة', () => {
  const ids = Array.from({ length: 23 }, (_, i) => `p${i}`);
  it('10% مقرّبة إلى أعلى وواحد على الأقل، بلا تكرار، ومن المعتمدين وحدهم', () => {
    expect(pickSample(ids)).toHaveLength(3);
    expect(pickSample(['a'])).toEqual(['a']);
    expect(pickSample([])).toEqual([]);
    const s = pickSample(ids);
    expect(new Set(s).size).toBe(s.length);
    expect(s.every((x) => ids.includes(x))).toBe(true);
  });
  it('عشوائية فعلًا: مولّد مختلف يعطي عينة مختلفة', () => {
    let k = 0.1; const a = pickSample(ids, { rnd: () => (k = (k * 7.3) % 1) });
    let m = 0.9; const b = pickSample(ids, { rnd: () => (m = (m * 3.1) % 1) });
    expect(a).not.toEqual(b);
  });
  it('الخادم يختارها مما نجح اعتماده ويحفظها في السجل الجامع', () => {
    const src = readFileSync(join(__dirname, '../../supabase/functions/leaders-api/admin.ts'), 'utf8');
    expect(src).toContain('const sample = pickSample(approved.map((x) => x.id))');
    expect(src).toContain('sample: sample.map((x: any) => x.id),');
  });
});

describe('بريد قرار المراجعة يحوّل رموز العنوان ولا يرسلها خامًا (تنسيق الزميل)', () => {
  it('notifyReview يمر بـrenderJourneyText بإعداد متطلبات البرنامج نفسه', () => {
    const src = readFileSync(join(__dirname, '../../supabase/functions/leaders-api/admin.ts'), 'utf8');
    const fn = src.slice(src.indexOf('async function notifyReview'), src.indexOf('async function notifyReview') + 1500);
    expect(fn).toContain("renderJourneyText(r?.title_ar || '', { reqs })");
    expect(fn).toContain(".select('code, config').eq('program_id', r.program_id)");
    expect(fn).not.toMatch(/reviewMail\(p\.full_name, r\?\.title_ar/);
  });
});
