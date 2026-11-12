// بطاقة المستوى في ملف المشارك (تصور 2026-11-11، المرحلة 1): حالة الصف (مفتوح أو مطوي)، وما يمنع الاعتماد، ومقياس المؤشر
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { approveBlocker, attentionCount, compositeScale, rowState } from './placement-card.js';
import { DEFAULT_MODEL } from '../../supabase/functions/leaders-api/logic.js';

const read = (p) => readFileSync(join(__dirname, '../..', p), 'utf8');

describe('rowState: الصف يُفتح تلقائيًا للحدّي والمعلَّم والمخالف بلا تعليل، ويُطوى في غيرها', () => {
  it('صف هادئ (لا حدّية ولا أعلام ولا مخالفة) مطوي', () => {
    expect(rowState({ ev: { level: 'intermediate', borderline: false, flags: [] }, current: 'intermediate', chosen: 'intermediate', note: '' }))
      .toEqual({ override: false, needsReason: false, attention: 0, open: false });
  });
  it('الحدّي مفتوح، وعدد ما يستحق الانتباه يجمع الحدّية والأعلام', () => {
    const ev = { borderline: true, flags: [{ key: 'low_practice' }, { key: 'acquiescence' }] };
    expect(attentionCount(ev)).toBe(3);
    expect(rowState({ ev, current: 'beginner', chosen: 'beginner' }).open).toBe(true);
  });
  it('علم وحده يفتح الصف', () => {
    expect(rowState({ ev: { flags: [{ key: 'acquiescence' }] }, current: 'beginner', chosen: 'beginner' }).open).toBe(true);
  });
  it('مخالفة المستوى القائم بلا تعليل تفتحه وتلزم التعليل، وبتعليل كافٍ تبقى مخالفة بلا إلزام', () => {
    const bare = rowState({ ev: {}, current: 'beginner', chosen: 'advanced', note: 'قصير' });
    expect(bare).toMatchObject({ override: true, needsReason: true, open: true });
    const ok = rowState({ ev: {}, current: 'beginner', chosen: 'advanced', note: 'تقاريره الميدانية تفوق المحسوب' });
    expect(ok).toMatchObject({ override: true, needsReason: false, open: false });
  });
  it('دور العرض لا يخالف ولا يُلزَم بشيء', () => {
    expect(rowState({ ev: {}, current: 'beginner', chosen: 'advanced', note: '', canWrite: false })).toMatchObject({ override: false, needsReason: false });
  });
});

describe('approveBlocker: سبب ظاهر تحت زر الاعتماد بدل إشعار عابر', () => {
  const dims = ['milestone', 'impact', 'leadership'];
  const cur = { milestone: 'beginner', impact: 'beginner', leadership: 'intermediate' };
  const base = { notes: {}, currentLevel: (d) => cur[d], dimName: (d) => d.toUpperCase() };
  it('مستوى ناقص يُسمّى بُعده', () => {
    expect(approveBlocker(dims, { ...base, levels: { ...cur, impact: '' } })).toMatchObject({ dim: 'impact', field: 'level', text: 'حدّد مستوى IMPACT' });
  });
  it('مخالفة بلا تعليل تُسمّى بالشرط نفسه الذي يرفض به الخادم', () => {
    const b = approveBlocker(dims, { ...base, levels: { ...cur, impact: 'advanced' } });
    expect(b).toMatchObject({ dim: 'impact', field: 'note' });
    expect(b.text).toBe('اكتب سبب مخالفة المستوى المحسوب في IMPACT (10 أحرف على الأقل)');
  });
  it('اكتمال كل شيء لا يمنع', () => {
    expect(approveBlocker(dims, { ...base, levels: { ...cur, impact: 'advanced' }, notes: { impact: 'تقاريره الميدانية تفوق المحسوب' } })).toBeNull();
    expect(approveBlocker(dims, { ...base, levels: cur })).toBeNull();
  });
});

describe('compositeScale: حدود المقياس من نموذج التسكين لا من أرقام في الواجهة', () => {
  it('النموذج الافتراضي: حد المتوسط 55 والاحترافي 80، وهامش الحدّية 8 قبل كل حد', () => {
    const s = compositeScale(null);
    expect(s.marks).toEqual([{ key: 'intermediate', at: DEFAULT_MODEL.min_intermediate }, { key: 'advanced', at: DEFAULT_MODEL.min_advanced }]);
    expect(s.zones).toEqual([{ key: 'intermediate', from: 47, to: 55 }, { key: 'advanced', from: 72, to: 80 }]);
  });
  it('نموذج معدّل في القاعدة يحرك العلامات', () => {
    expect(compositeScale({ min_intermediate: 60, min_advanced: 85, borderline: 5 }).zones).toEqual([{ key: 'intermediate', from: 55, to: 60 }, { key: 'advanced', from: 80, to: 85 }]);
  });
});

describe('حراسة المصدر: البطاقة عرض وحده، والمنطق في مصدره', () => {
  const card = read('admin-app/src/screens/LevelCard.jsx');
  const person = read('admin-app/src/screens/Participants.jsx');
  it('الخادم يرسل نموذج التسكين مع ملف المشارك، والبطاقة تبني مقياسها منه', () => {
    expect(read('supabase/functions/leaders-api/admin.ts')).toMatch(/placement_model: model \|\| DEFAULT_MODEL/);
    expect(person).toMatch(/model=\{r\.placement_model\}/);
    expect(card).toMatch(/compositeScale\(model\)/);
  });
  it('الأعلام قائمة بنص عادي في التفاصيل، لا شارات مكدسة في خلية', () => {
    expect(card).not.toMatch(/la-chip warn" title=\{f\.reason_ar\}/);
    expect(card).toMatch(/<ul className="lc-flags">/);
  });
  it('الاعتماد كما هو: admin.approve بالمستويات والملاحظات، وشرط التعليل من overrideNeedsReason', () => {
    expect(person).toMatch(/act\('admin\.approve', \{ participant_id: p\.id, levels, notes \}/);
    expect(read('admin-app/src/placement-card.js')).toMatch(/overrideNeedsReason\(currentLevel\(d\), levels\[d\], notes\?\.\[d\]\)/);
  });
});
