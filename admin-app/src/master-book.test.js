import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  authorRole, bookAccess, bookSections, canDelete, canResolve, chapterVisible, cleanComment, markTiers, openCounts, orderChapters,
  commentTarget, draftChapters, rowChapterId, sectionsOf, shareRoster, threads, tierAr, tierVisible, toggleCommittee, versionFromMigration,
  chapterPart, outOfSeat, seatOf,
} from '../../supabase/functions/leaders-api/master-book.js';
import { DRAFTS } from '../../supabase/functions/leaders-api/master-book-drafts.js';

const MD = `## أولًا
نص عام
:::min=intermediate
للمتوسط فأعلى
:::
## ثانيًا
:::only=advanced
## عنوان داخل كتلة
للاحترافي فقط
:::
خاتمة`;
const MOD = { id: '11111111-1111-4111-8111-111111111111', body_md: MD };

describe('الكتاب الأم: من يقرؤه', () => {
  it('عضو فاعل في لجنة المحتوى أو القياس يقرأ، وغيره لا', () => {
    expect(bookAccess({ status: 'active', committees: ['content'] })).toBe(true);
    expect(bookAccess({ status: 'paused', committees: ['measurement'] })).toBe(true);
    expect(bookAccess({ status: 'active', committees: [] })).toBe(false);
    expect(bookAccess({ status: 'invited', committees: ['content'] })).toBe(false);
    expect(bookAccess(null)).toBe(false);
  });
  it('صفة المعلّق من لجنته أو دوره', () => {
    expect(authorRole('expert', { committees: ['content'] })).toBe('لجنة المحتوى');
    expect(authorRole('expert', { committees: ['content', 'measurement'] })).toBe('لجنتا المحتوى والقياس');
    expect(authorRole('admin', { role: 'super_admin' })).toBe('المدير العام');
    expect(authorRole('admin', { role: 'admin' })).toBe('الإدارة');
  });
});

describe('الكتاب الأم: البنية', () => {
  it('الإصدار من اسم آخر ترحيل للكتاب', () => {
    expect(versionFromMigration('20261115150000_leaders_handbook_v3_1')).toBe('v3.1');
    expect(versionFromMigration('20261102110000_leaders_handbook_v3')).toBe('v3');
    expect(versionFromMigration('20261115160000_leaders_book_comments')).toBe(null);
  });
  it('الأبواب بالترتيب الثابت للأطر: المعالم ← الأثر ← القيادة، ثم ترتيب الباب', () => {
    const rows = [{ dimension: 'leadership', sort: 1 }, { dimension: 'milestone', sort: 2 }, { dimension: 'impact', sort: 1 }, { dimension: 'milestone', sort: 1 }];
    expect(orderChapters(rows).map((r) => `${r.dimension}${r.sort}`)).toEqual(['milestone1', 'milestone2', 'impact1', 'leadership1']);
  });
  it('الأقسام عناوين ## كلها، والمقاطع تحمل مستوى كتلتها، والعنوان داخل كتلة يبقى بمستواها', () => {
    expect(sectionsOf(MD)).toEqual(['أولًا', 'ثانيًا', 'عنوان داخل كتلة']);
    const s = bookSections(MD);
    expect(s.map((x) => x.title)).toEqual(['أولًا', 'ثانيًا', 'عنوان داخل كتلة']);
    expect(s.map((x) => x.tier)).toEqual([null, null, 'only=advanced']);
    expect(s[0].parts.map((p) => p.tier)).toEqual([null, 'min=intermediate']);
    expect(s[2].key).toBe('عنوان داخل كتلة');
    expect(s[2].parts).toEqual([{ tier: 'only=advanced', md: '## عنوان داخل كتلة\nللاحترافي فقط' }, { tier: null, md: 'خاتمة' }]);
    expect(s[1].parts).toEqual([{ tier: null, md: '## ثانيًا' }]);
  });
  it('العنوان المكرر لكل مستوى يتميز بمستواه، فلكل قسم مرساة تعليق واحدة', () => {
    const md = '## تركيزك\n:::only=beginner\n## تركيزك\nأ\n:::\n:::only=advanced\n## تركيزك\nب\n:::';
    expect(sectionsOf(md)).toEqual(['تركيزك', 'تركيزك · للتأسيسي فقط', 'تركيزك · للاحترافي فقط']);
    expect(cleanComment({ module_id: MOD.id, section: 'تركيزك · للاحترافي فقط', body: 'نص واضح' }, { modules: [{ id: MOD.id, body_md: md }] }).value.section).toBe('تركيزك · للاحترافي فقط');
  });
  it('رؤية الفقرة بقاعدة الكتاب نفسها، و«الكتاب كاملًا» يعرض كل شيء', () => {
    expect(tierVisible('min=intermediate', 'beginner')).toBe(false);
    expect(tierVisible('min=intermediate', 'advanced')).toBe(true);
    expect(tierVisible('only=advanced', 'intermediate')).toBe(false);
    expect(tierVisible('scope=portfolio', 'beginner')).toBe(true);
    expect(tierVisible('only=beginner', 'all')).toBe(true);
    expect(chapterVisible({ min_level: 'advanced' }, 'intermediate')).toBe(false);
    expect(chapterVisible({ min_level: 'advanced' }, 'all')).toBe(true);
  });
  it('شارة المستوى بالعربية، والنسخة المطبوعة تسمي المستوى بدل الوسم', () => {
    expect(tierAr('min=advanced scope=portfolio')).toBe('للاحترافي · لقادة المحافظ');
    const out = markTiers(MD);
    expect(out).not.toMatch(/^:::/m);
    expect(out).toContain('**◆ للمتوسط فأعلى**');
    expect(out).toContain('**◆ للاحترافي فقط**');
    expect(out.match(/\*\*◇ عودة إلى النص العام\*\*/g)).toHaveLength(2);
  });
});

describe('الكتاب الأم: التعليقات', () => {
  const ok = (b) => cleanComment({ module_id: MOD.id, body: 'ملاحظة واضحة', ...b }, { modules: [MOD] });
  it('يُقبل على قسم موجود أو على الباب كله، والاقتباس والتعليق في حدودهما', () => {
    expect(ok({ section: 'ثانيًا', quote: '  نص   عام ' }).value).toMatchObject({ section: 'ثانيًا', quote: 'نص عام', parent_id: null });
    expect(ok({}).value.section).toBe('');
  });
  it('يُرفض: باب أو قسم غير موجود، وتعليق فارغ أو طويل، واقتباس طويل، ورد بمعرّف تالف', () => {
    expect(cleanComment({ module_id: 'x', body: 'نص' }, { modules: [MOD] }).error).toBe('الباب غير محدد');
    expect(cleanComment({ module_id: '22222222-2222-4222-8222-222222222222', body: 'نص' }, { modules: [MOD] }).error).toBe('الباب غير موجود');
    expect(ok({ section: 'قسم آخر' }).error).toMatch(/القسم غير موجود/);
    expect(ok({ body: ' ' }).error).toBe('اكتب تعليقك');
    expect(ok({ body: 'ب'.repeat(4001) }).error).toMatch(/أطول/);
    expect(ok({ quote: 'ق'.repeat(601) }).error).toMatch(/المقتبس/);
    expect(ok({ parent_id: 'x' }).error).toMatch(/المردود/);
  });
  it('السلاسل: الردود تحت أصلها بترتيب الزمن، والمحذوف بلا ردود يختفي، وبردود يبقى «محذوفًا»، والنص المتغيّر يُعلَّم', () => {
    const rows = [
      { id: 'a', module_id: 'm', section: 's', body: 'أ', created_at: '2026-11-15T10:00:00Z', status: 'open', fingerprint: 'old' },
      { id: 'b', module_id: 'm', section: 's', body: 'ب', created_at: '2026-11-15T09:00:00Z', status: 'open', fingerprint: 'now', deleted_at: '2026-11-15T11:00:00Z' },
      { id: 'c', module_id: 'm', section: 's', body: 'ج', created_at: '2026-11-15T08:00:00Z', status: 'resolved', fingerprint: 'now', deleted_at: '2026-11-15T11:00:00Z' },
      { id: 'r2', parent_id: 'a', module_id: 'm', body: 'رد2', created_at: '2026-11-15T12:00:00Z' },
      { id: 'r1', parent_id: 'a', module_id: 'm', body: 'رد1', created_at: '2026-11-15T11:00:00Z' },
      { id: 'r3', parent_id: 'b', module_id: 'm', body: 'رد على محذوف', created_at: '2026-11-15T12:00:00Z' },
    ];
    const t = threads(rows, { m: 'now' });
    expect(t.map((x) => x.id)).toEqual(['b', 'a']);
    expect(t[0]).toMatchObject({ deleted: true, body: '', replies: [{ id: 'r3' }] });
    expect(t[1].replies.map((r) => r.id)).toEqual(['r1', 'r2']);
    expect(t[1].stale).toBe(true);
    expect(openCounts(t)).toEqual({ byModule: { m: 1 }, bySection: { 'm|s': 1 }, total: 1 });
  });
  it('الحذف لكاتبه وحده، والحسم للمدير الكاتب', () => {
    const c = { author_kind: 'expert', author_ref: 'e1' };
    expect(canDelete({ kind: 'expert', ref: 'e1' }, c)).toBe(true);
    expect(canDelete({ kind: 'expert', ref: 'e2' }, c)).toBe(false);
    expect(canDelete({ kind: 'admin', ref: 'e1' }, c)).toBe(false);
    expect(canResolve({ kind: 'admin', write: true })).toBe(true);
    expect(canResolve({ kind: 'admin', write: false })).toBe(false);
    expect(canResolve({ kind: 'expert', write: true })).toBe(false);
  });
});

describe('الكتاب الأم: المشاركة مع الخبراء', () => {
  const ex = [
    { id: '1', full_name: 'بدر', status: 'active', committees: ['content'] },
    { id: '2', full_name: 'أحمد', status: 'active', committees: [] },
    { id: '3', full_name: 'جود', status: 'suspended', committees: ['measurement'] },
    { id: '4', full_name: 'دانة', status: 'applied', committees: [] },
    { id: '5', full_name: 'سالم', status: 'active', roles: ['coach'], committees: [] },
    { id: '6', full_name: 'نورة', status: 'active', roles: ['coach'], committees: ['content'] },
    { id: '7', full_name: 'لمى', status: 'paused', roles: [], committees: ['measurement'] },
  ];
  it('من يقرأ، ومن في لجنة وملفه غير فعّال، ومن يمكن إضافته (الفاعل خارج الرحلة وحده)', () => {
    const r = shareRoster(ex);
    // من جمع الخدمتين يقرأ بعضويته، والموقوف مؤقتًا يقرأ ولا يكتب (expertViewer)
    expect(r.readers.map((x) => x.name)).toEqual(['بدر', 'لمى', 'نورة']);
    expect(r.blocked.map((x) => x.name)).toEqual(['جود']);
    // خبير الرحلة (سالم) لا يُعرض للمشاركة أبدًا؛ المنح الاستثنائي في المرحلة 4
    expect(r.candidates.map((x) => x.name)).toEqual(['أحمد']);
  });
  it('إضافة اللجنة وإزالتها بلا تكرار، واللجنة غير المعروفة تُرفض', () => {
    expect(toggleCommittee(['content'], 'measurement', true)).toEqual(['content', 'measurement']);
    expect(toggleCommittee(['content'], 'content', true)).toEqual(['content']);
    expect(toggleCommittee(['content', 'x'], 'content', false)).toEqual([]);
    expect(toggleCommittee([], 'board', true)).toBe(null);
  });
});

describe('الكتاب الأم: الربط', () => {
  const index = readFileSync(join(process.cwd(), 'supabase/functions/leaders-api/index.ts'), 'utf8');
  const sql = readFileSync(join(process.cwd(), 'supabase/migrations/20261115160000_leaders_book_comments.sql'), 'utf8');
  it('أفعال الخبير تمر بشرط اللجنة، وكتابة المدير بالعامل الثاني (writer)', () => {
    for (const a of ['xp.book', 'xp.book-comment', 'xp.book-comment-delete']) expect(index).toMatch(new RegExp(`'${a.replace('.', '\\.')}': \\(e[^)]*\\) => MB\\.\\w+\\(MB\\.expertViewer\\(e\\)`));
    for (const a of ['admin.book-comment', 'admin.book-comment-delete', 'admin.book-comment-status', 'admin.book-reader']) expect(index).toMatch(new RegExp(`'${a.replace('.', '\\.')}': \\(a, b\\) => A\\.writer\\(`));
    expect(index).toContain('d.book_access = bookAccess(e);');
  });
  it('الجدول لدور الخدمة وحده، وترحيله لا يحجب النشر', () => {
    expect(sql).toMatch(/^-- deploy-gate: tolerant/m);
    expect(sql).toContain('enable row level security');
    expect(sql).toContain('revoke all on leaders.book_comments from anon, authenticated');
  });
});

describe('الكتاب الأم: المسودات المعروضة على اللجنة', () => {
  it('المسودة باب في جزء «مسودات» بمعرّف draft:مفتاحها، ويُعلَّق على أقسامها', () => {
    const [d] = draftChapters([{ key: 'seven-competencies', title: 'مسودة', md: '## الجدارة 1: تلقّي الأمر\nنص' }]);
    expect(d).toMatchObject({ id: 'draft:seven-competencies', dimension: 'draft', draft: true, min_level: 'beginner' });
    expect(cleanComment({ module_id: d.id, section: 'الجدارة 1: تلقّي الأمر', body: 'ملاحظة واضحة' }, { modules: [{ id: d.id, body_md: d.md }] }).value.module_id).toBe(d.id);
    expect(cleanComment({ module_id: 'draft:Bad Key', body: 'نص' }, { modules: [] }).error).toBe('الباب غير محدد');
  });
  it('هدف التعليق في الجدول باب أو مسودة، ويعود معرّفًا واحدًا في القارئ', () => {
    expect(commentTarget('draft:seven-competencies')).toEqual({ module_id: null, draft_key: 'seven-competencies' });
    expect(commentTarget(MOD.id)).toEqual({ module_id: MOD.id, draft_key: null });
    expect(rowChapterId({ module_id: null, draft_key: 'x-y' })).toBe('draft:x-y');
    expect(rowChapterId({ module_id: MOD.id })).toBe(MOD.id);
  });
  it('المسودة المولَّدة تطابق وثيقتها، وجداولها رسوم مقارنة وعناوينها الفرعية أقسام', async () => {
    const { build, toBookMd } = await import('../../scripts/master-book/drafts.mjs');
    expect(readFileSync(join(process.cwd(), 'supabase/functions/leaders-api/master-book-drafts.js'), 'utf8')).toBe(build());
    const md = toBookMd('# عنوان\n\n### الجدارة 1\n| أ | ب | ج |\n|---|---|---|\n| س | ص | `ع` |\n---\nنص');
    expect(md).toBe('## الجدارة 1\n\n@compare\nب | ج\nس | ص | ع\n\nنص');
  });
});

// تصور «أجزاء الكتاب وخبير المحتوى» (اعتمده المالك 2026-11-16)، المرحلة 1: المقعد والتعليق من خارج الإطار
describe('الكتاب الأم: المقعد والتعليق من خارج الإطار', () => {
  const ch = (dimension) => ({ id: '22222222-2222-4222-8222-222222222222', dimension });
  const draft = (part) => draftChapters([{ key: 'x-draft', title: 'مسودة', md: '## أ\nنص', part }])[0];
  it('المقعد من experts.dimensions لعضو المحتوى، والكتاب كله لعضو القياس ولمن في اللجنتين', () => {
    expect(seatOf({ committees: ['content'], dimensions: ['leadership', 'milestone'] })).toEqual(['milestone', 'leadership']);
    expect(seatOf({ committees: ['content'], dimensions: ['impact', 'غريب'] })).toEqual(['impact']);
    expect(seatOf({ committees: ['content'], dimensions: [] })).toEqual([]);
    expect(seatOf({ committees: ['measurement'], dimensions: ['impact'] })).toBe('all');
    expect(seatOf({ committees: ['content', 'measurement'], dimensions: ['impact'] })).toBe('all');
    expect(seatOf({ committees: [], roles: ['coach'], dimensions: ['impact'] })).toBe(null);
    expect(seatOf(null)).toBe(null);
  });
  it('عضو المحتوى: باب من إطار آخر خارج مقعده، وبابه في مقعده', () => {
    const e = { committees: ['content'], dimensions: ['leadership'] };
    expect(outOfSeat(e, ch('impact'))).toBe(true);
    expect(outOfSeat(e, ch('milestone'))).toBe(true);
    expect(outOfSeat(e, ch('leadership'))).toBe(false);
    // بلا إطار مسجل: كل باب خارج مقعده
    expect(outOfSeat({ committees: ['content'], dimensions: [] }, ch('leadership'))).toBe(true);
  });
  it('عضو القياس ومن في اللجنتين: لا وسم في أي جزء', () => {
    for (const d of ['milestone', 'impact', 'leadership']) {
      expect(outOfSeat({ committees: ['measurement'], dimensions: [] }, ch(d))).toBe(false);
      expect(outOfSeat({ committees: ['content', 'measurement'], dimensions: ['impact'] }, ch(d))).toBe(false);
    }
  });
  it('المسودة بإطارها إن عُرف، وبلا إطار في نطاق الجميع', () => {
    const e = { committees: ['content'], dimensions: ['impact'] };
    expect(draft('leadership')).toMatchObject({ dimension: 'draft', part: 'leadership' });
    expect(chapterPart(draft('leadership'))).toBe('leadership');
    expect(outOfSeat(e, draft('leadership'))).toBe(true);
    expect(outOfSeat(e, draft('impact'))).toBe(false);
    expect(draft(null).part).toBe(null);
    expect(draft('غريب').part).toBe(null);
    expect(outOfSeat(e, draft(null))).toBe(false);
    // والمسودة كما يمررها الخادم إلى addComment (معرّف draft: وإطارها)
    expect(outOfSeat(e, { id: 'draft:x-draft', body_md: '', part: 'milestone' })).toBe(true);
  });
  it('الإدارة لا يُوسم تعليقها أبدًا، والقارئ بمقعده من الخادم يُحسب بالقاعدة نفسها', () => {
    expect(outOfSeat({ kind: 'admin', committees: ['content'], dimensions: [] }, ch('impact'))).toBe(false);
    expect(outOfSeat({ kind: 'admin', seat: ['milestone'] }, ch('impact'))).toBe(false);
    expect(outOfSeat({ kind: 'expert', seat: ['milestone'] }, ch('impact'))).toBe(true);
    expect(outOfSeat({ kind: 'expert', seat: ['impact'] }, ch('impact'))).toBe(false);
    expect(outOfSeat({ kind: 'expert', seat: 'all' }, ch('impact'))).toBe(false);
    expect(outOfSeat({ kind: 'expert', seat: null }, ch('impact'))).toBe(false);
    expect(outOfSeat(null, ch('impact'))).toBe(false);
  });
  it('السلسلة تحمل الوسم كما حُفظ، والغائب قبل الترحيل false', () => {
    const [t] = threads([
      { id: 'a', module_id: 'm', author_kind: 'expert', author_ref: 'x', body: 'أصل', status: 'open', created_at: '2026-11-16T10:00:00Z', out_of_seat: true },
      { id: 'b', parent_id: 'a', module_id: 'm', author_kind: 'expert', author_ref: 'y', body: 'رد', status: 'open', created_at: '2026-11-16T11:00:00Z' },
    ]);
    expect(t.out_of_seat).toBe(true);
    expect(t.replies[0].out_of_seat).toBe(false);
  });
  it('مسودة الجدارات القيادية السبع في إطار القيادة', () => {
    expect(DRAFTS.find((d) => d.key === 'seven-competencies').part).toBe('leadership');
  });
});

// نصوص طبعة الجزء (المرحلة 2): ملف محتوى واحد تقرؤه الطبعة، ويُعرض على لجنة المحتوى مسودةً في الكتاب الأم
describe('parts.json: نصوص طبعة الجزء', () => {
  const PARTS_JSON = JSON.parse(readFileSync(join(__dirname, '../../supabase/content/handbook/parts.json'), 'utf8'));
  const KEYS = ['milestone', 'impact', 'leadership'];
  it('لكل إطار about وbridges كاملة، وbridges تعرّف بالجزأين الآخرين وحدهما', () => {
    expect(Object.keys(PARTS_JSON.parts)).toEqual(KEYS);
    for (const k of KEYS) {
      const p = PARTS_JSON.parts[k];
      expect(p.about.lead.length).toBeGreaterThan(80);
      expect(p.about.read.length).toBeGreaterThanOrEqual(2);
      expect(p.bridges.place.length).toBeGreaterThan(20);
      expect(Object.keys(p.bridges.with).sort()).toEqual(KEYS.filter((x) => x !== k).sort());
      expect(p.bridges.next.length).toBeGreaterThan(20);
    }
    expect(PARTS_JSON.legend.length).toBeGreaterThan(40);
  });
  it('بلا شرطة طويلة ولا متوسطة', () => {
    expect(JSON.stringify(PARTS_JSON)).not.toMatch(/[\u2013\u2014]/);
  });
  it('معروض على اللجنة مسودةً في الكتاب الأم: قسمان لكل جزء، ولا إطار له فهو في نطاق الجميع', () => {
    const d = DRAFTS.find((x) => x.key === 'book-parts');
    expect(d.source).toBe('supabase/content/handbook/parts.json');
    expect(d.part).toBe(null);
    const heads = bookSections(d.md).map((s) => s.title).filter(Boolean);
    expect(heads).toContain('الجزء الثاني · تحويل المشروع إلى أثر: عن هذا الجزء');
    expect(heads).toContain('الجزء الثاني · تحويل المشروع إلى أثر: يتكامل مع');
    expect(heads.filter((h) => /: (عن هذا الجزء|يتكامل مع)$/.test(h))).toHaveLength(6);
    expect(d.md).toContain(PARTS_JSON.parts.impact.about.lead);
    const [ch] = draftChapters([d]);
    expect(outOfSeat({ kind: 'expert', seat: ['impact'] }, ch)).toBe(false);
  });
});
