import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  canEdit, canMove, checkProposal, isStale, proposalCounts, proposalView, rawSections, REFLECTION, replaceSection, sectionSource, splitEdit, targetLabel, targetSource, visibleTo, wordDiff,
} from '../../supabase/functions/leaders-api/book-proposals.js';
import { headingsOf } from '../../supabase/functions/leaders-api/master-book.js';
import { loadChapters, VERSION } from '../../scripts/handbook/content.mjs';

const MD = `مقدمة الباب
## أولًا
نص عام
:::min=intermediate
## ثانيًا
للمتوسط فأعلى
:::
## ثالثًا
خاتمة`;
const MOD = { id: 'm1', body_md: MD, min_level: 'beginner' };
const ADMIN = { kind: 'admin', ref: 'a@x', write: true };
const SUPER = { kind: 'admin', ref: 's@x', write: true, superAdmin: true };
const EXPERT = { kind: 'expert', ref: 'e1', write: true };
const P = (o = {}) => ({ id: 'p1', module_id: 'm1', section: 'أولًا', base_md: sectionSource(MD, 'أولًا'), proposed_md: '## أولًا\nنص أوضح', reason: 'سبب واضح للتعديل', status: 'review', author_ref: 'a@x', ...o });

describe('مقترحات الكتاب الأم: تقسيم الباب نصًا خامًا', () => {
  it('الأقسام بمفاتيح headingsOf، والوسم الفاتح قبل العنوان من قسمه، والتجميع يعيد الباب حرفًا بحرف', () => {
    const s = rawSections(MD);
    expect(s.map((x) => x.key)).toEqual(['', 'أولًا', 'ثانيًا', 'ثالثًا']);
    expect(s[2].md.startsWith(':::min=intermediate\n## ثانيًا')).toBe(true);
    expect(s[1].md).not.toContain(':::min');
    expect(s.map((x) => x.md).join('\n')).toBe(MD);
  });
  it('كل باب في الإصدار الحالي يُقسَّم ويُجمَّع بلا فقد، ومفاتيحه مفاتيح الكتاب الأم', () => {
    for (const c of loadChapters(VERSION)) {
      const s = rawSections(c.body_md);
      expect(s.map((x) => x.md).join('\n'), `${c.dimension}/${c.chapter_key}`).toBe(c.body_md);
      expect(s.filter((x) => x.key).map((x) => x.key)).toEqual(headingsOf(c.body_md).filter((h) => h.level === 2).map((h) => h.key));
    }
  });
  it('الاستبدال يمس قسمه وحده', () => {
    const next = replaceSection(MD, 'ثالثًا', '## ثالثًا\nخاتمة جديدة');
    expect(next).toContain('خاتمة جديدة');
    expect(next).toContain(':::min=intermediate\n## ثانيًا');
    expect(replaceSection(MD, 'غير موجود', 'x')).toBe(null);
  });
});

describe('مقترحات الكتاب الأم: التحقق', () => {
  const ok = { section: 'أولًا', proposed_md: '## أولًا\nنص أوضح للمبتدئ', reason: 'توضيح للمبتدئ بمثال' };
  it('المقترح السليم يحفظ أصل القسم وقت الاقتراح', () => {
    const r = checkProposal(ok, MOD);
    expect(r.value).toMatchObject({ module_id: 'm1', section: 'أولًا', base_md: '## أولًا\nنص عام' });
  });
  it('يُرفض: قسم غير موجود، ونص بلا تغيير، وسبب قصير، وحذف العنوان، وكتلة مستوى مفتوحة', () => {
    expect(checkProposal({ ...ok, section: 'رابعًا' }, MOD).error).toMatch(/غير موجود/);
    expect(checkProposal({ ...ok, proposed_md: '## أولًا\nنص عام' }, MOD).error).toMatch(/لم يتغير/);
    expect(checkProposal({ ...ok, reason: 'قصير' }, MOD).error).toMatch(/سبب/);
    expect(checkProposal({ ...ok, proposed_md: 'نص بلا عنوان' }, MOD).error).toMatch(/عنوان القسم/);
    expect(checkProposal({ ...ok, proposed_md: '## أولًا\n:::min=advanced\nمفتوحة' }, MOD).error).toMatch(/يكسر بنية الباب/);
    expect(checkProposal(ok, null).error).toMatch(/الباب/);
  });
  it('مقدمة الباب (قبل أول عنوان) تُقترح بلا عنوان', () => {
    expect(checkProposal({ section: '', proposed_md: 'مقدمة أوضح للباب', reason: 'مقدمة أقصر وأوضح' }, MOD).value?.base_md).toBe('مقدمة الباب');
  });
});

describe('مقترحات الكتاب الأم: من يفعل ماذا', () => {
  it('الكاتب يعرض ويسحب ويعيد مسودة، والمدير العام وحده يعتمد أو يرد ما قيد المراجعة', () => {
    expect(canMove(ADMIN, P({ status: 'draft' }), 'review')).toBe(true);
    expect(canMove(ADMIN, P(), 'withdrawn')).toBe(true);
    expect(canMove(ADMIN, P(), 'approved')).toBe(false);
    expect(canMove(SUPER, P(), 'approved')).toBe(true);
    expect(canMove(SUPER, P({ status: 'draft' }), 'approved')).toBe(false);
    expect(canMove(SUPER, P(), 'withdrawn')).toBe(false);
    expect(canMove(EXPERT, P(), 'approved')).toBe(false);
    expect(canMove({ ...SUPER, write: false }, P(), 'approved')).toBe(false);
    expect(canMove(SUPER, P(), 'released')).toBe(false);
  });
  it('التعديل لكاتبه ما دام مسودة أو قيد المراجعة', () => {
    expect(canEdit(ADMIN, P())).toBe(true);
    expect(canEdit(ADMIN, P({ status: 'approved' }))).toBe(false);
    expect(canEdit(SUPER, P())).toBe(false);
  });
  it('المسودة لكاتبها، والمسحوب للإدارة، وما عُرض للمراجعين كلهم', () => {
    expect(visibleTo(ADMIN, P({ status: 'draft' }))).toBe(true);
    expect(visibleTo(SUPER, P({ status: 'draft' }))).toBe(false);
    expect(visibleTo(EXPERT, P({ status: 'withdrawn' }))).toBe(false);
    expect(visibleTo(EXPERT, P())).toBe(true);
  });
  it('المتقادم لا يُعتمد: القسم تغيّر بعد المقترح', () => {
    const changed = { ...MOD, body_md: MD.replace('نص عام', 'نص عام معدّل') };
    expect(isStale(P(), MOD)).toBe(false);
    expect(isStale(P(), changed)).toBe(true);
    const v = proposalView(SUPER, P(), changed);
    expect(v.stale).toBe(true);
    expect(v.can.approved).toBe(false);
    expect(v.can.rejected).toBe(true);
    expect(proposalView(SUPER, P(), MOD).can.approved).toBe(true);
  });
  it('العدادات: ما قيد المراجعة لكل باب وقسم', () => {
    const c = proposalCounts([P(), P({ id: 'p2', status: 'approved' }), P({ id: 'p3', section: 'ثالثًا' })]);
    expect(c.byModule.m1).toBe(2);
    expect(c.bySection['m1|أولًا']).toBe(1);
    expect(c.review).toBe(2);
    expect(c.approved).toBe(1);
  });
});

describe('محرر الاستوديو ← مقترح لكل قسم تغيّر (الخطوة 3)', () => {
  const B = `مقدمة\n\n## أ\nنص أ\n\n:::min=intermediate\n## ب\nنص ب\n:::\n\n## ج\nنص ج`;
  it('بلا تغيير: لا مقترح', () => expect(splitEdit(B, B)).toEqual({ changes: [] }));
  it('تعديل قسمين: مقترحان، ولكل منهما نص قسمه كاملًا بوسومه', () => {
    const r = splitEdit(B, B.replace('نص أ', 'نص أ معدل').replace('نص ب', 'نص ب معدل'));
    expect(r.changes.map((c) => c.section)).toEqual(['أ', 'ب']);
    expect(r.changes[1].proposed).toBe(':::min=intermediate\n## ب\nنص ب معدل\n:::');
  });
  it('تغيير عنوان قسم: مقترح على القسم بعنوانه القديم', () => {
    expect(splitEdit(B, B.replace('## ج', '## ج الجديد')).changes).toEqual([{ section: 'ج', proposed: '## ج الجديد\nنص ج' }]);
  });
  it('قسم جديد يُلحق بالقسم الذي قبله، ويمر بتحقق المقترح', () => {
    const r = splitEdit(B, B.replace('نص أ', 'نص أ\n\n## أ2\nقسم جديد'));
    expect(r.changes).toEqual([{ section: 'أ', proposed: '## أ\nنص أ\n\n## أ2\nقسم جديد' }]);
    expect(checkProposal({ section: 'أ', proposed_md: r.changes[0].proposed, reason: 'إضافة قسم جديد' }, { id: 'm', body_md: B }).value).toBeTruthy();
    const end = splitEdit(B, `${B}\n\n## د\nآخر`);
    expect(end.changes).toEqual([{ section: 'ج', proposed: '## ج\nنص ج\n\n## د\nآخر' }]);
  });
  it('حذف قسم أو دمج قسمين يُرفض برسالة', () => {
    expect(splitEdit(B, B.replace('\n\n## ج\nنص ج', '')).error).toMatch(/حذف/);
  });
  it('سؤال التأمل هدف مستقل: نصه وتحققه وتقادمه', () => {
    const mod = { id: 'm', body_md: B, reflection_ar: 'ما معلمك؟' };
    expect(targetSource(mod, REFLECTION)).toBe('ما معلمك؟');
    expect(targetLabel(REFLECTION)).toBe('سؤال التأمل');
    const ok = checkProposal({ section: REFLECTION, proposed_md: 'ما المعلم الذي تقرر عنده؟', reason: 'سؤال أقرب للقرار' }, mod);
    expect(ok.value).toMatchObject({ section: REFLECTION, base_md: 'ما معلمك؟' });
    expect(checkProposal({ section: REFLECTION, proposed_md: 'ما معلمك؟', reason: 'سؤال أقرب للقرار' }, mod).error).toMatch(/لم يتغير/);
    expect(checkProposal({ section: REFLECTION, proposed_md: 'x'.repeat(601), reason: 'سؤال أقرب للقرار' }, mod).error).toMatch(/أطول/);
    expect(isStale({ section: REFLECTION, base_md: 'ما معلمك؟' }, mod)).toBe(false);
    expect(isStale({ section: REFLECTION, base_md: 'قديم' }, mod)).toBe(true);
  });
});

describe('إصلاحات مراجعة اليوم (2026-11-15)', () => {
  const M = { id: 'm', body_md: '## A\na\n\n## B\nb\n\n## C\nc' };
  const r = (p, reason = 'سبب واضح للتعديل') => checkProposal({ section: 'B', proposed_md: p, reason }, M);
  it('عنوان بلا نص يُرفض، فلا تنزاح مفاتيح الأقسام', () => {
    expect(r('## \nنص').error).toMatch(/عنوان بلا نص/);
    expect(r('## B\n### ****\nنص').error).toMatch(/عنوان بلا نص/);
    expect(rawSections('## \nx\n## B\ny').map((x) => x.key)).toEqual(['', 'B']);
  });
  it('وسم $…$ محجوز لترحيل الكتاب، والسبب له حد أعلى', () => {
    expect(r('## B\n$v3_2$').error).toMatch(/\$/);
    expect(r('## B\nb2', 'س'.repeat(2001)).error).toMatch(/أطول/);
    expect(r('## B\nسعر 5$ فقط').value).toBeTruthy();
  });
  it('مقترح يغيّر ترقيم عنوان مكرر في قسم آخر يُرفض', () => {
    const D = { id: 'm', body_md: '## مقدمة\n### مثال\nx\n\n## متن\n### مثال\ny' };
    expect(checkProposal({ section: 'مقدمة', proposed_md: '## مقدمة\n### مثال\nx\n### مثال\nz', reason: 'سبب واضح للتعديل' }, D).error).toMatch(/مثال \(2\)/);
    expect(checkProposal({ section: 'مقدمة', proposed_md: '## مقدمة\n### مثال\nx أوضح', reason: 'سبب واضح للتعديل' }, D).value).toBeTruthy();
  });
  it('المعتمد الذي تخطاه الإصدار له مخرج: يعيده كاتبه مسودة، ويسحبه هو أو المدير العام', () => {
    expect(canMove(ADMIN, P({ status: 'approved' }), 'draft')).toBe(true);
    expect(canMove(ADMIN, P({ status: 'approved' }), 'withdrawn')).toBe(true);
    expect(canMove(SUPER, P({ status: 'approved' }), 'withdrawn')).toBe(true);
    expect(canMove(SUPER, P({ status: 'approved' }), 'draft')).toBe(false);
    expect(canMove(ADMIN, P({ status: 'review' }), 'review')).toBe(false);
    expect(canMove(ADMIN, P({ status: 'released' }), 'draft')).toBe(false);
  });
});

describe('مقترحات الكتاب الأم: الفرق', () => {
  it('كلمة بكلمة، والتجميع يعيد النصين', () => {
    const d = wordDiff('المعلم نقطة تحقق واضحة', 'المعلم نقطة قرار واضحة');
    expect(d.filter((x) => x.t !== 'add').map((x) => x.s).join('')).toBe('المعلم نقطة تحقق واضحة');
    expect(d.filter((x) => x.t !== 'del').map((x) => x.s).join('')).toBe('المعلم نقطة قرار واضحة');
    expect(d.find((x) => x.t === 'del').s).toBe('تحقق');
  });
});

describe('مقترحات الكتاب الأم: الربط', () => {
  const index = readFileSync(join(process.cwd(), 'supabase/functions/leaders-api/index.ts'), 'utf8');
  const ts = readFileSync(join(process.cwd(), 'supabase/functions/leaders-api/book-proposals.ts'), 'utf8');
  const sql = readFileSync(join(process.cwd(), 'supabase/migrations/20261116000000_leaders_book_proposals.sql'), 'utf8');
  it('الكتابة بالعامل الثاني (writer)، ولا فعل للخبير، ولا كتابة في نص الكتاب', () => {
    for (const a of ['admin.book-proposal-save', 'admin.book-proposal-status', 'admin.book-proposal-edit']) expect(index).toMatch(new RegExp(`'${a.replace('.', '\\.')}': \\(a, b\\) => A\\.writer\\(`));
    expect(index).not.toMatch(/'xp\.book-proposal/);
    expect(ts).not.toMatch(/from\('handbook_modules'\)\.(update|insert|upsert)/);
  });
  it('الجدول لدور الخدمة وحده، وترحيله لا يحجب النشر', () => {
    expect(sql).toMatch(/^-- deploy-gate: tolerant/m);
    expect(sql).toContain('enable row level security');
    expect(sql).toContain('revoke all on leaders.book_proposals from anon, authenticated');
  });
});
