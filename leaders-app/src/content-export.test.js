// حراس الحزمة 2 (D01 وD10): كشف الانحراف بين الإنتاج والمستودع، والمولّد القابل لإعادة الاستعمال لكل
// إصدار من الكتاب، وسجل المفاهيم بمعرّفاته الثابتة وربط كل فقرة محتسبة بجدارة وباب.
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { chapterFile, diffContent, renderReport, repoContent } from '../../scripts/content/live.mjs';
import { QUERIES } from '../../scripts/content/export-live.mjs';
import { buildVersion } from '../../scripts/handbook/build-version.mjs';
import { loadChapters, versions, VERSION } from '../../scripts/handbook/content.mjs';
import { bankItems, check, CORE, seed, SCORED_TIERS } from '../../scripts/concepts/registry.mjs';

const root = join(__dirname, '../..');
const read = (p) => readFileSync(join(root, p), 'utf8');
const repo = repoContent();
const clone = (x) => JSON.parse(JSON.stringify(x));
// صورة إنتاج تطابق المستودع تمامًا
const liveOf = () => ({
  handbook_modules: [...repo.handbook.values()].map((c) => ({ dimension: c.dimension, chapter_key: c.chapter_key, body_md: c.body_md, quiz_md: `${c.quiz_md}\n`, reflection_ar: c.reflection_ar, min_level: 'beginner' })),
  questions: [...repo.questions.values()].map(({ source: _s, instrument, ...q }) => ({ ...clone(q), instrument_key: instrument, weight: Number(q.weight) })),
  katon_topics: [...repo.katon.values()].map((t) => ({ key: t.key, title_ar: t.title_ar })),
  katon_sentences: [...repo.katon.values()].flatMap((t) => t.sentences.map((s, i) => ({ topic_key: t.key, sort: i + 1, text_ar: s.text_ar, key: s.key, question: s.question }))),
});

describe('كشف الانحراف بين الإنتاج والمستودع', () => {
  it('إنتاج يطابق المستودع: كله مطابق، والمسافات والأرقام النصية ليست فرقًا', () => {
    const d = diffContent(liveOf(), repo);
    expect(d.filter((x) => x.status !== 'same')).toEqual([]);
    expect(d.filter((x) => x.kind === 'handbook')).toHaveLength(27);
    expect(d.filter((x) => x.kind === 'question').length).toBe(repo.questions.size);
    expect(renderReport(d)).toContain('لا فرق: الإنتاج يطابق المستودع.');
  });
  it('تعديل المتن نص غير مُقاس، وتعديل الاختبار أو الخيارات مُقاس، ومعهما من عدّل ومتى', () => {
    const live = liveOf();
    live.handbook_modules[0].body_md += '\nسطر من اللوحة';
    Object.assign(live.handbook_modules[0], { updated_by: 'admin@x.sa', updated_at: '2026-11-07T10:00:00Z' });
    live.handbook_modules[1].quiz_md = 'س: آخر\n- *أ\n- ب';
    live.questions[0].options = [...live.questions[0].options].reverse();
    live.questions[1].help_ar = 'تلميح جديد';
    live.katon_sentences[0].key = live.katon_sentences[0].key === 'true' ? 'false' : 'true';
    live.questions.push({ ...live.questions[2], id: 'new-id', code: 'X-NEW' });
    const d = diffContent(live, repo).filter((x) => x.status !== 'same');
    const by = (kind, s) => d.filter((x) => x.kind === kind && x.status === s);
    expect(by('handbook', 'changed').map((x) => [x.fields, x.measured])).toEqual([[['body_md'], false], [['quiz_md'], true]]);
    expect(by('handbook', 'changed')[0]).toMatchObject({ updated_by: 'admin@x.sa' });
    expect(by('question', 'changed').map((x) => [x.fields, x.measured])).toEqual([[['options'], true], [['help_ar'], false]]);
    expect(by('question', 'live_only').map((x) => x.id)[0]).toMatch(/\/X-NEW$/);
    expect(by('katon', 'changed')[0].fields).toEqual(['sentence.key']);
    const md = renderReport(d);
    expect(md).toContain('مختلف، مُقاس');
    expect(md).toContain('admin@x.sa 2026-11-07T10:00');
  });
  it('باب غاب من الإنتاج يظهر في المستودع وحده، وأداة لا تُقرأ في الإنتاج لا تُحسب فقراتها ناقصة', () => {
    const live = liveOf();
    live.handbook_modules.pop();
    live.questions = live.questions.filter((q) => q.instrument_key !== 'post-v3');
    const d = diffContent(live, repo);
    expect(d.filter((x) => x.status === 'repo_only').map((x) => x.kind)).toEqual(['handbook']);
  });
  it('ملف الباب يُعاد بناؤه بلا فرق، ويحمل مستوى الإنتاج وحقوله المعتمدة فقط', () => {
    for (const c of loadChapters()) expect(chapterFile(c, null, [])).toBe(read(`supabase/content/handbook/${VERSION}/${c.file}`));
    const c = loadChapters()[0];
    const out = chapterFile(c, { body_md: 'متن حي', quiz_md: 'س: حي', reflection_ar: 'تأمل حي', min_level: 'intermediate' }, ['body']);
    expect(out).toMatch(/^---\nchapter_key: .+\ndimension: .+\nmin_level: intermediate\n---\nمتن حي\n---QUIZ---\n/);
    expect(out).toContain(c.quiz_md);
    expect(out).not.toContain('س: حي');
  });
  it('التصدير قراءة فقط عبر select، ومجلده خارج Git', () => {
    for (const sql of Object.values(QUERIES)) expect(sql.trim()).toMatch(/^select\b/i);
    expect(read('scripts/content/export-live.mjs')).toMatch(/if \(!\/\^\\s\*select\\b\/i\.test\(sql\)\) throw new Error\('قراءة فقط'\)/);
    expect(read('.gitignore')).toContain('.content-live/');
  });
});

describe('مولّد إصدارات الكتاب', () => {
  it('الإصدارات مرتبة ترتيبًا رقميًا، والحالي أحدثها', () => {
    expect(versions()).toEqual(['v2', 'v3']);
    expect(VERSION).toBe('v3');
  });
  it('v2 إلى v3 بالمولّد الجديد يغيّر الأبواب نفسها التي غيّرها ترحيل v3، بحارس البصمة', () => {
    const sql = buildVersion('v2', 'v3', '20991231000000_leaders_handbook_test');
    const n = Number(read('supabase/migrations/20261102110000_leaders_handbook_v3.sql').match(/الأبواب المتغيرة: (\d+) من 27/)[1]);
    expect((sql.match(/^ {2}update leaders\.handbook_modules set$/gm) || []).length).toBe(n);
    expect(sql).toMatch(/and md5\(body_md \|\| quiz_md \|\| reflection_ar\) = '[0-9a-f]{32}';/);
    expect(sql).toContain("insert into leaders.schema_migrations (name) values ('20991231000000_leaders_handbook_test') on conflict do nothing;");
    expect(buildVersion('v3', 'v3', '20991231000000_leaders_handbook_same')).toContain('الأبواب المتغيرة: 0 من 27');
  });
  it('في CI وnpm run verify: كل إصدار يطابق ترحيله، وسجل المفاهيم يجتاز متحققه', () => {
    const ci = read('.github/workflows/ci.yml');
    expect(ci).toContain('node scripts/handbook/build-version.mjs --check');
    expect(ci).toContain('node scripts/concepts/registry.mjs --check');
  });
});

describe('سجل المفاهيم (D10، المرحلة الأولى)', () => {
  const reg = JSON.parse(read('supabase/content/concepts/registry.json'));
  const lock = read('supabase/content/concepts/ids.lock').split('\n').filter(Boolean);
  const items = bankItems();
  const chapters = loadChapters();
  it('المسجل يطابق بذرته من البنك، وكل معرّف في القفل، والمفاهيم الحاكمة السبعة بانتظار الخبراء', () => {
    expect(reg.competencies).toEqual(seed(items).competencies.map((c) => ({ ...c, ...reg.competencies.find((x) => x.id === c.id) })));
    expect(lock).toEqual(expect.arrayContaining([...reg.competencies, ...reg.concepts].map((c) => c.id)));
    expect(reg.concepts.map((c) => c.id)).toEqual(CORE.map((c) => c[0]));
    expect(check(reg, items, chapters, lock)).toEqual([]);
  });
  it('يرفض وسمًا بلا جدارة، وبابًا غير موجود أو ليس من أبوابها، ومعرّفًا محذوفًا، وفقرة لمستوى لا يرى بابها', () => {
    const it0 = items.find((x) => SCORED_TIERS.has(x.tier) && x.competency_ar);
    const bad = [{ ...it0, competency_ar: 'وسم لا وجود له' }, { ...it0, chapter_key: 'ch99' }];
    expect(check(reg, bad, chapters, lock).map((x) => x.msg)).toEqual([expect.stringContaining('لا يقابله معرّف'), expect.stringContaining('غير موجود')]);
    const r2 = clone(reg);
    r2.competencies = r2.competencies.slice(1);
    expect(check(r2, [], chapters, lock)[0].msg).toContain('deprecated لا حذف');
    const leveled = chapters.map((c) => (c.dimension === it0.dimension && c.chapter_key === it0.chapter_key ? { ...c, min_level: 'advanced' } : c));
    expect(check(reg, [{ ...it0, min_level: null }], leveled, lock)[0].msg).toContain('يبدأ من advanced');
    expect(check(reg, [{ ...it0, min_level: 'advanced' }], leveled, lock)).toEqual([]);
  });
  it('تقرير الربط مولّد من السجل، ويطلب من الخبراء الصيغ والتعريفات', () => {
    const doc = read('docs/content/سجل-المفاهيم-تقرير-الربط.md');
    expect(doc).toContain('لا يُحرَّر يدويًا');
    for (const c of reg.competencies.slice(0, 5)) expect(doc).toContain(`| ${c.id} | ${c.label_ar} |`);
  });
});
