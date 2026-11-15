import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  canEdit, canMove, checkProposal, isStale, proposalCounts, proposalView, rawSections, replaceSection, sectionSource, visibleTo, wordDiff,
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
    for (const a of ['admin.book-proposal-save', 'admin.book-proposal-status']) expect(index).toMatch(new RegExp(`'${a.replace('.', '\\.')}': \\(a, b\\) => A\\.writer\\(`));
    expect(index).not.toMatch(/'xp\.book-proposal/);
    expect(ts).not.toMatch(/from\('handbook_modules'\)\.(update|insert|upsert)/);
  });
  it('الجدول لدور الخدمة وحده، وترحيله لا يحجب النشر', () => {
    expect(sql).toMatch(/^-- deploy-gate: tolerant/m);
    expect(sql).toContain('enable row level security');
    expect(sql).toContain('revoke all on leaders.book_proposals from anon, authenticated');
  });
});
