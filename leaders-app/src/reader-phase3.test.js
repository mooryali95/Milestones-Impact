// القارئ، المرحلة 3 (تصور «فصل خبراء الرحلة عن لجان المحتوى» §4.4 و§6): علة «تابع القراءة» في الباب الأول،
// وتفضيلات العرض لكل قارئ، والعلامات، والبحث بالتطبيع، واستثناء ما يتمرر أفقيًا من السحب، ومناطق اللمس
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { canResume, cleanPrefs, DEFAULT_PREFS, findAr, foldMap, inHScroll, isMarked, KEY_PREFIX, LEGACY_KEY, lineHeight, liveMarks, MARKS_MAX, normalizeAr, plainMd, readerKey, resumeAt, searchBook, snippet, toggleMark } from '../../shared/master-book/reader.js';
import { bookSections } from '../../supabase/functions/leaders-api/master-book.js';

const read = (p) => readFileSync(join(__dirname, '../..', p), 'utf8');
const CH = [
  { id: 'a1', dimension: 'milestone', title: 'تمهيد المعالم', md: '## المدخل\n\nالمَعْلَمُ **نقطة قرار** يقف عندها الفريق.\n\n## الأسئلة\n\nإدارة المخاطر مسؤولية الفريق كله.' },
  { id: 'a2', dimension: 'milestone', title: 'خاتمة المعالم', md: 'مدخل بلا عنوان.\n\n## الخلاصة\n\nالأثر قبل المخرجات، والقيمة قبل الجدول.' },
];
const sectionsOf = (c) => bookSections(c.md).map((s) => ({ key: s.key, title: s.title, md: s.parts.map((p) => p.md).join('\n') }));

describe('«تابع القراءة»: الباب الأول يُستأنف كغيره', () => {
  test('الموضع معرّف الباب لا رقم ترتيبه، فالباب الأول (الترتيب 0) يُستأنف', () => {
    expect(resumeAt(CH, { id: 'a1', section: '' })).toBe(0);
    expect(canResume(CH, { id: 'a1', section: '' })).toBe(true);
    expect(canResume(CH, null)).toBe(false);
  });
  test('باب حُذف من الكتاب لا يُستأنف، ورقم ترتيب قديم بلا معرّف لا يُقبل', () => {
    expect(canResume(CH, { id: 'gone', section: '' })).toBe(false);
    expect(cleanPrefs({ idx: 3 }).pos).toBeNull();
  });
  test('القارئ لا يقرر «تابع القراءة» برقم الترتيب بعد اليوم، ولا يحفظ موضعًا عند فتح القارئ', () => {
    const src = read('shared/master-book/MasterBook.jsx');
    expect(src).not.toMatch(/saved\.idx \?/);
    expect(src).toMatch(/canResume\(data\.chapters, prefs\.pos\) \? 'تابع القراءة' : 'افتح الكتاب'/);
    expect(src).not.toMatch(/store\.set\(KEY, \{ idx/);
  });
});

describe('التفضيلات لكل قارئ', () => {
  test('مفتاح لكل قارئ ببصمة لا ببريد صريح، ويختلف بين شخصين وبين الإدارة والخبير', () => {
    const a = readerKey({ kind: 'expert', email: 'H@x.com' });
    expect(a.startsWith(KEY_PREFIX)).toBe(true);
    expect(a).not.toContain('x.com');
    expect(readerKey({ kind: 'expert', email: 'h@x.com ' })).toBe(a);
    expect(readerKey({ kind: 'expert', email: 'z@x.com' })).not.toBe(a);
    expect(readerKey({ kind: 'admin', email: 'h@x.com' })).not.toBe(a);
    expect(a).not.toBe(LEGACY_KEY);
  });
  test('القرار 9 افتراضيًا: نسخ بحجم 18، وكل حقل مقروء من التخزين يُتحقق منه', () => {
    expect(cleanPrefs(null)).toEqual({ ...DEFAULT_PREFS, marks: [] });
    expect(DEFAULT_PREFS).toMatchObject({ font: 'naskh', size: 18 });
    expect(cleanPrefs({ font: 'comic', size: 99, spacing: 'x', theme: '<script>', level: 'god', scope: 'x', pos: { id: 5 }, marks: 'x' }))
      .toEqual({ ...DEFAULT_PREFS, marks: [] });
    expect(cleanPrefs({ font: 'kufi', size: 22, spacing: 'wide', theme: 'night', level: 'advanced', scope: 'part', pos: { id: 'a2', section: 'الخلاصة' } }))
      .toMatchObject({ font: 'kufi', size: 22, spacing: 'wide', theme: 'night', level: 'advanced', scope: 'part', pos: { id: 'a2', section: 'الخلاصة' } });
    expect(lineHeight('wide')).toBeGreaterThan(lineHeight('snug'));
    expect(lineHeight('bogus')).toBe(lineHeight('normal'));
  });
  test('المفتاح القديم المشترك على الجهاز يُمسح ولا يُنقل لأول من يفتح', () => {
    expect(read('shared/master-book/MasterBook.jsx')).toMatch(/store\.del\(LEGACY_KEY\); setPrefs\(cleanPrefs\(store\.get\(key\)\)\)/);
  });
});

describe('العلامات', () => {
  test('الزر نفسه يضع العلامة ويزيلها، والأحدث أولًا، وبسقف', () => {
    let m = toggleMark([], { id: 'a1', section: 'الأسئلة' }, 1);
    m = toggleMark(m, { id: 'a2', section: 'الخلاصة' }, 2);
    expect(m.map((x) => x.id)).toEqual(['a2', 'a1']);
    expect(isMarked(m, { id: 'a1', section: 'الأسئلة' })).toBe(true);
    m = toggleMark(m, { id: 'a1', section: 'الأسئلة' });
    expect(isMarked(m, { id: 'a1', section: 'الأسئلة' })).toBe(false);
    let many = [];
    for (let i = 0; i < MARKS_MAX + 5; i++) many = toggleMark(many, { id: `c${i}`, section: '' }, i);
    expect(many).toHaveLength(MARKS_MAX);
  });
  test('علامة على باب حُذف أو قسم تغيّر عنوانه لا تُعرض', () => {
    const marks = [{ id: 'a1', section: 'الأسئلة', at: 1 }, { id: 'a1', section: 'قسم قديم', at: 2 }, { id: 'gone', section: '', at: 3 }];
    const live = liveMarks(marks, CH, (c) => bookSections(c.md).filter((s) => s.title).map((s) => s.key));
    expect(live.map((x) => [x.id, x.section, x.idx])).toEqual([['a1', 'الأسئلة', 0]]);
  });
});

describe('البحث بالتطبيع', () => {
  test('الحركات والتطويل وصور الألف والمقصورة والتاء المربوطة لا تفرق، والأرقام الهندية كالعربية', () => {
    expect(normalizeAr('المَعْلَمُ')).toBe('المعلم');
    expect(normalizeAr('إدارة')).toBe(normalizeAr('اداره'));
    expect(normalizeAr('آمال أمل')).toBe('امال امل');
    expect(normalizeAr('مستشفى')).toBe(normalizeAr('مستشفي'));
    expect(normalizeAr('الـــقيمة')).toBe(normalizeAr('القيمه'));
    expect(normalizeAr('٢٠٢٦ ۳')).toBe('2026 3');
    expect(normalizeAr('Milestone  Impact')).toBe('milestone impact');
    // الهمزة على الواو لا تُوحَّد (نهج مرشِّح Lucene)
    expect(normalizeAr('سؤال')).not.toBe(normalizeAr('سوال'));
  });
  test('المقتطف من النص كما كُتب بحركاته، والتطابق في موضعه', () => {
    const t = 'قال: المَعْلَمُ نقطة قرار';
    const hit = findAr(t, 'المعلم');
    expect(t.slice(hit.start, hit.end)).toBe('المَعْلَمُ');
    const sn = snippet(t, hit, 3);
    expect(sn.match).toBe('المَعْلَمُ');
    expect(sn.before.startsWith('…')).toBe(true);
    expect(findAr(t, 'ا')).toBeNull();
    expect(foldMap('  أ  ب ').text).toBe('ا ب');
  });
  test('المتن بلا رموز تنسيق', () => {
    expect(plainMd('## عنوان\n\n- بند **عريض**\n:::min=advanced\n> اقتباس [رابط](https://x)')).toBe('عنوان بند عريض اقتباس رابط');
  });
  test('البحث في الأبواب: بلا حركات وبصور الألف، وعنوان الباب يطابق مدخله بلا عنوان', () => {
    expect(searchBook(CH, 'اداره المخاطر', sectionsOf).map((h) => [h.c.id, h.s.key])).toEqual([['a1', 'الأسئلة']]);
    const r = searchBook(CH, 'المعلم', sectionsOf);
    expect(r[0].snip.match).toBe('المَعْلَمُ');
    expect(searchBook(CH, 'خاتمه', sectionsOf).map((h) => [h.c.id, h.s.key, h.title])).toEqual([['a2', '', true]]);
    expect(searchBook(CH, 'ا', sectionsOf)).toEqual([]);
  });
  test('الفهرس يبحث بالتطبيع ويعرض المقتطف، لا بمطابقة حرفية', () => {
    const src = read('shared/master-book/MasterBook.jsx');
    expect(src).toMatch(/searchBook\(pool, q, sectionsOf\)/);
    expect(src).not.toMatch(/\.includes\(needle\)\)\.map\(\(s\) => \(\{ c, s \}\)\)/);
    expect(src).toMatch(/<mark>\{snip\.match\}<\/mark>/);
  });
});

describe('السحب ومناطق اللمس', () => {
  test('لمسة داخل جدول المقارنة أو شريط المستوى لا تقلب الباب', () => {
    document.body.innerHTML = '<div id="r"><div class="f-compare-w"><table><tbody><tr><td><span id="in">خلية</span></td></tr></tbody></table></div><p id="out">نص</p><div class="mb-levels"><button id="lv">مستوى</button></div></div>';
    const stop = document.getElementById('r');
    expect(inHScroll(document.getElementById('in'), stop)).toBe(true);
    expect(inHScroll(document.getElementById('lv'), stop)).toBe(true);
    expect(inHScroll(document.getElementById('out'), stop)).toBe(false);
    expect(read('shared/master-book/MasterBook.jsx')).toMatch(/if \(inHScroll\(e\.target, reader\.current\)\)/);
  });
  test('أزرار القارئ 44 بكسل على الأقل، وخط النسخ مستضاف مع القارئ', () => {
    const css = read('shared/master-book/master-book.css');
    expect(css).toMatch(/\.mb-ic, \.mb-x \{ width: 44px; height: 44px; \}/);
    expect(css).toMatch(/\.mb-levels button, \.mb-sec-c, \.mb-sec-p, \.mb-sec-m, \.mb-sec-ref \{ min-height: 44px; \}/);
    expect(css).toMatch(/font-family: 'Noto Naskh Arabic'[^}]+url\(\.\/fonts\/NotoNaskhArabic-400-arabic\.woff2\)/);
    expect(readFileSync(join(__dirname, '../../shared/master-book/fonts/NotoNaskhArabic-400-arabic.woff2')).length).toBeGreaterThan(20000);
  });
});
