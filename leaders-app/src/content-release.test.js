// حراس الحزمة 7 (D02): بيان إصدار لكل دفعة ببصماته، وتثبيته، وأعمدة الإصدار مع النتائج، وقفل الاختبار والمواصفة
// بعد أول نتيجة لأي كاتب، والتصويب الحرج بتوقيعين يعيد التصحيح دون أن ينقص أحدًا، وبند القراءة على إصدار الدفعة.
import { mkdirSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { PGlite } from '@electric-sql/pglite';
import { describe, expect, it } from 'vitest';
import { buildManifest, canonical, checkReleases, releaseSql, sha } from '../../scripts/content/release.mjs';
import { keyPairs, nextId, patchedManifest, patchSql } from '../../scripts/content/patch.mjs';
import { QUERIES } from '../../scripts/content/export-live.mjs';
import { gateOf } from '../../scripts/ops/pending-migrations.mjs';

const root = join(__dirname, '../..');
const read = (p) => readFileSync(join(root, p), 'utf8');
const api = (f) => read(`supabase/functions/leaders-api/${f}`);
const SQL = read('supabase/migrations/20261107180000_leaders_content_releases.sql');

const OLD_QUIZ = 'س: سؤال أول\n* صحيح أ\n- خطأ أ\nس: سؤال ثانٍ\n- ب1\n* ب2\nس: سؤال ثالث\n* ج1\n- ج2';
const NEW_QUIZ = 'س: سؤال أول\n* صحيح أ\n- خطأ أ\nس: سؤال ثانٍ\n* ب1\n- ب2\nس: سؤال ثالث\n* ج1\n- ج2';
const live = () => ({
  handbook_modules: [{ id: '00000000-0000-0000-0000-0000000000a1', dimension: 'milestone', chapter_key: 'milestone_3', title_ar: 'الباب', body_md: 'متن', quiz_md: OLD_QUIZ, reflection_ar: null, updated_at: '2026-11-01' }],
  questions: [{ id: 'q1', instrument_key: 'baseline-v5', code: 'M1', text_ar: 'س' }], instruments: [{ id: 'i1', key: 'baseline-v5' }],
  lab_items: [{ id: 'l1', key: 'wbs', spec: { steps: [] } }], learning_models: [{ id: 'lm1', key: 'charter', title_ar: 'م' }],
  placement_model: [{ id: 1, min_intermediate: 55 }], programs: [{ id: 'pr1', final_eval: { version: 3 } }],
});

async function schema() {
  const db = new PGlite();
  await db.exec(`create schema leaders; create table leaders.schema_migrations (name text primary key); create role anon; create role authenticated;
    create table leaders.handbook_modules (id uuid primary key, dimension text, chapter_key text, title_ar text, quiz_md text);
    create table leaders.handbook_progress (participant_id uuid, module_id uuid, quiz_score smallint not null default 0, quiz_total smallint not null default 0, primary key (participant_id, module_id));
    create table leaders.lab_items (id uuid primary key, title_ar text, spec jsonb);
    create table leaders.lab_attempts (id uuid primary key, item_id uuid, finished_at timestamptz);
    create table leaders.cohorts (id uuid primary key, name text, status text default 'planned');
    create table leaders.participants (id uuid primary key, email text, is_demo boolean default false);
    create table leaders.mail_queue (id bigserial primary key, to_email text, subject text, html text, ref text, kind text);`);
  await db.exec(SQL);
  return db;
}
const P = (n) => `00000000-0000-0000-0000-00000000000${n}`;

describe('ترحيل 20261107180000_leaders_content_releases', () => {
  it('حاجب بعد تطبيقه وآمن لإعادة التشغيل', async () => {
    expect(gateOf(SQL, '20261107180000_leaders_content_releases').gate).toBe('blocking');   // مطبّق على الإنتاج: الوسم في ملفه منتهٍ ولا يُمس الملف
    const db = await schema();
    await db.exec(SQL);
  });
  it('الاختبار يتغير قبل أول نتيجة، ويُقفل بعدها لأي كاتب، ويُفتح لترحيل الترقيع وحده', async () => {
    const db = await schema();
    await db.exec(`insert into leaders.handbook_modules values ('${P(1)}', 'milestone', 'm3', 'الباب', 'قديم')`);
    await db.exec(`update leaders.handbook_modules set quiz_md = 'معدل' where id = '${P(1)}'`);
    await db.exec(`insert into leaders.handbook_progress values ('${P(2)}', '${P(1)}', 2, 3)`);
    await expect(db.exec(`update leaders.handbook_modules set quiz_md = 'ثالث' where id = '${P(1)}'`)).rejects.toThrow(/مقفل بعد أول نتيجة/);
    await db.exec(`update leaders.handbook_modules set title_ar = 'عنوان آخر' where id = '${P(1)}'`);
    await db.exec(`select set_config('leaders.content_patch', 'on', false); update leaders.handbook_modules set quiz_md = 'مصوَّب' where id = '${P(1)}'; select set_config('leaders.content_patch', '', false);`);
    await expect(db.exec(`update leaders.handbook_modules set quiz_md = 'رابع' where id = '${P(1)}'`)).rejects.toThrow();
  });
  it('مواصفة الأداة تُقفل بعد أول محاولة منتهية، وإصدار الدفعة لا يتغير بعد تثبيته، والسجل لا يُعدَّل', async () => {
    const db = await schema();
    await db.exec(`insert into leaders.lab_items values ('${P(3)}', 'أداة', '{"a":1}'); insert into leaders.lab_attempts values ('${P(4)}', '${P(3)}', null);`);
    await db.exec(`update leaders.lab_items set spec = '{"a":2}' where id = '${P(3)}'`);
    await db.exec(`update leaders.lab_attempts set finished_at = now()`);
    await expect(db.exec(`update leaders.lab_items set spec = '{"a":3}' where id = '${P(3)}'`)).rejects.toThrow(/مقفلة بعد أول محاولة/);
    const m = buildManifest(live(), { id: '2026.11-c1' });
    await db.exec(`insert into leaders.cohorts (id, name) values ('${P(5)}', 'نوفمبر')`);
    await db.exec(releaseSql(m, { cohorts: [P(5)], signedBy: ['a@x.sa', 'b@x.sa'], migration: 'x_release' }));
    expect((await db.query('select content_release from leaders.cohorts')).rows[0].content_release).toBe('2026.11-c1');
    await expect(db.exec(`update leaders.cohorts set content_release = null`)).rejects.toThrow(/مثبت/);
    await expect(db.exec(`update leaders.content_releases set note = 'x'`)).rejects.toThrow(/لا يُعدَّل/);
    await expect(db.exec(`delete from leaders.content_releases`)).rejects.toThrow(/لا يُعدَّل/);
  });
});

describe('بيان الإصدار', () => {
  it('بصمات ثابتة لا تتأثر بالأختام ولا بترتيب الأعمدة، وتتغير بتغير الاختبار', () => {
    const a = buildManifest(live(), { id: '2026.11-c1' });
    const l2 = live(); l2.handbook_modules[0] = { ...Object.fromEntries(Object.entries(l2.handbook_modules[0]).reverse()), updated_at: '2026-12-31' };
    expect(buildManifest(l2, { id: '2026.11-c1' }).sha256).toBe(a.sha256);
    const l3 = live(); l3.handbook_modules[0].quiz_md = NEW_QUIZ;
    const c = buildManifest(l3, { id: '2026.11-c1' });
    expect(c.areas.handbook_modules.sha256).not.toBe(a.areas.handbook_modules.sha256);
    expect(c.areas.questions.sha256).toBe(a.areas.questions.sha256);
    expect(a.areas.handbook_modules.items['milestone/milestone_3']).toMatchObject({ id: '00000000-0000-0000-0000-0000000000a1', quiz_sha256: sha(OLD_QUIZ) });
    for (const k of ['handbook_modules', 'questions', 'instruments', 'lab_items', 'learning_models', 'placement_model', 'final_eval', 'rubric_scale', 'concepts', 'policy']) expect(a.areas[k].sha256).toMatch(/^[0-9a-f]{64}$/);
    const { sha256, ...body } = a;
    expect(sha(canonical(body))).toBe(sha256);
  });
  it('التصدير الحي يجلب المختبر والإعدادات المُقاسة', () => {
    for (const k of ['lab_items', 'placement_model', 'programs']) expect(QUERIES[k]).toMatch(/^select/);
  });
  it('الفحص: البيان المودع يطابق بصمته وترحيله', () => {
    expect(checkReleases()).toEqual([]);
    const tmp = mkdtempSync(join(tmpdir(), 'rel-'));
    mkdirSync(join(tmp, 'supabase/content/releases/2026.11-c1'), { recursive: true });
    mkdirSync(join(tmp, 'supabase/migrations'), { recursive: true });
    const m = buildManifest(live(), { id: '2026.11-c1' });
    writeFileSync(join(tmp, 'supabase/content/releases/2026.11-c1/MANIFEST.json'), JSON.stringify(m));
    expect(checkReleases(tmp)).toEqual(['2026.11-c1: لا ترحيل له']);
    writeFileSync(join(tmp, 'supabase/migrations/20261201000000_leaders_content_release_2026_11_c1.sql'), releaseSql(m, { migration: 'x' }));
    expect(checkReleases(tmp)).toEqual([]);
    writeFileSync(join(tmp, 'supabase/content/releases/2026.11-c1/MANIFEST.json'), JSON.stringify({ ...m, git_ref: 'abcdef1' }));
    expect(checkReleases(tmp)[0]).toMatch(/البصمة الكلية/);
  });
});

describe('التصويب الحرج', () => {
  it('إصدار ترقيعي تالٍ، والمفتاح الجديد نصًا', () => {
    expect(nextId('2026.11-c1', () => false)).toBe('2026.11-c1.1');
    expect(nextId('2026.11-c1.1', (id) => id === '2026.11-c1.1')).toBe('2026.11-c1.2');
    expect(keyPairs(NEW_QUIZ)).toEqual([['سؤال أول', 'صحيح أ'], ['سؤال ثانٍ', 'ب1'], ['سؤال ثالث', 'ج1']]);
  });
  it('يحدّث الاختبار بحارس بصمته، ويرفع من ظُلم ولا ينقص أحدًا، ويسجل بتوقيعين، وينقل الدفعة، ويُخطر المتأثرين', async () => {
    const db = await schema();
    const mod = '00000000-0000-0000-0000-0000000000a1';
    await db.exec(`insert into leaders.handbook_modules values ('${mod}', 'milestone', 'milestone_3', 'الباب', $q$${OLD_QUIZ}$q$);
      insert into leaders.cohorts (id, name) values ('${P(5)}', 'نوفمبر');
      insert into leaders.participants values ('${P(1)}', 'a@x.sa', false), ('${P(2)}', 'b@x.sa', false), ('${P(3)}', 'c@x.sa', false), ('${P(4)}', 'd@x.sa', false);`);
    const base = buildManifest(live(), { id: '2026.11-c1' });
    await db.exec(releaseSql(base, { cohorts: [P(5)], signedBy: ['a@x.sa', 'b@x.sa'], migration: 'x_release' }));
    const ans = (b) => `'${JSON.stringify([{ q: 'سؤال أول', a: 'صحيح أ' }, { q: 'سؤال ثانٍ', a: b }, { q: 'سؤال ثالث', a: 'ج1' }])}'::jsonb`;
    // أ: اختار ب1 فحُسب خطأ بالمفتاح القديم (2/3)، وب: اختار ب2 فحُسب صحيحًا (3/3)، وج: بلا إجابات محفوظة، ود: لم يجب
    await db.exec(`insert into leaders.handbook_progress (participant_id, module_id, quiz_score, quiz_total, quiz_answers) values
      ('${P(1)}', '${mod}', 2, 3, ${ans('ب1')}), ('${P(2)}', '${mod}', 3, 3, ${ans('ب2')}), ('${P(3)}', '${mod}', 1, 3, null);`);
    const id = '2026.11-c1.1';
    const manifest = patchedManifest(base, id, 'milestone/milestone_3', NEW_QUIZ);
    const sqlText = patchSql({ base, id, key: 'milestone/milestone_3', quizMd: NEW_QUIZ, reason: 'المفتاح في السؤال الثاني خاطئ', signedBy: ['a@x.sa', 'b@x.sa'], regrade: 'rekey', manifest, migration: 'x_patch' });
    expect(gateOf(sqlText).gate).toBe('deferred');
    await db.exec(sqlText);
    const rows = Object.fromEntries((await db.query('select participant_id, quiz_score, quiz_total from leaders.handbook_progress')).rows.map((r) => [r.participant_id, [r.quiz_score, r.quiz_total]]));
    expect(rows[P(1)]).toEqual([3, 3]);
    expect(rows[P(2)]).toEqual([3, 3]);
    expect(rows[P(3)]).toEqual([1, 3]);
    expect((await db.query('select quiz_md from leaders.handbook_modules')).rows[0].quiz_md).toBe(NEW_QUIZ);
    expect((await db.query('select content_release from leaders.cohorts')).rows[0].content_release).toBe(id);
    expect((await db.query('select cardinality(signed_by) as n, regrade from leaders.content_patches')).rows[0]).toEqual({ n: 2, regrade: 'rekey' });
    expect((await db.query('select to_email from leaders.mail_queue order by to_email')).rows.map((r) => r.to_email)).toEqual(['a@x.sa', 'b@x.sa', 'c@x.sa']);
    // بعد الترقيع يعود القفل، وإعادة الترحيل نفسه ترفض لأن البصمة تغيرت
    await expect(db.exec(`update leaders.handbook_modules set quiz_md = 'x'`)).rejects.toThrow(/مقفل/);
    await expect(db.exec(sqlText)).rejects.toThrow(/لا يطابق بصمته/);
  });
  it('إسقاط سؤال: يرتفع من أخطأه ولا ينخفض من أصابه', async () => {
    const db = await schema();
    const mod = '00000000-0000-0000-0000-0000000000a1';
    await db.exec(`insert into leaders.handbook_modules values ('${mod}', 'milestone', 'milestone_3', 'الباب', $q$${OLD_QUIZ}$q$);
      insert into leaders.participants values ('${P(1)}', 'a@x.sa', false), ('${P(2)}', 'b@x.sa', false);`);
    const base = buildManifest(live(), { id: '2026.11-c1' });
    await db.exec(releaseSql(base, { signedBy: ['a@x.sa', 'b@x.sa'], migration: 'x_release' }));
    const ans = (b) => `'${JSON.stringify([{ q: 'سؤال أول', a: 'صحيح أ' }, { q: 'سؤال ثانٍ', a: b }, { q: 'سؤال ثالث', a: 'ج2' }])}'::jsonb`;
    await db.exec(`insert into leaders.handbook_progress (participant_id, module_id, quiz_score, quiz_total, quiz_answers) values ('${P(1)}', '${mod}', 1, 3, ${ans('ب1')}), ('${P(2)}', '${mod}', 2, 3, ${ans('ب2')});`);
    const dropped = 'س: سؤال أول\n* صحيح أ\n- خطأ أ\nس: سؤال ثالث\n* ج1\n- ج2';
    const id = '2026.11-c1.1';
    await db.exec(patchSql({ base, id, key: 'milestone/milestone_3', quizMd: dropped, reason: 'السؤال الثاني خطأ علمي يُسقط', signedBy: ['a@x.sa', 'b@x.sa'], regrade: 'drop', manifest: patchedManifest(base, id, 'milestone/milestone_3', dropped), migration: 'x_patch' }));
    const rows = Object.fromEntries((await db.query('select participant_id, quiz_score, quiz_total from leaders.handbook_progress')).rows.map((r) => [r.participant_id, [r.quiz_score, r.quiz_total]]));
    expect(rows[P(1)]).toEqual([1, 2]);
    expect(rows[P(2)]).toEqual([2, 3]);
  });
});

describe('الخادم والواجهة', () => {
  it('نتيجة الباب تحمل الإصدار وبصمة الاختبار والإجابات نصًا، ومحاولة المختبر الإصدار، والختمان إلزاميان', () => {
    const p = api('participant.ts');
    expect(p).toMatch(/quiz_answers: quiz\.map\(\(x: any, i: number\) => \(\{ q: x\.q, a: x\.options\[Number\(b\.answers\?\.\[i\]\)\] \?\? null \}\)\)/);
    expect(p).toMatch(/quiz_fingerprint: await sha256Hex\(String\(m\.quiz_md \|\| ''\)\)/);
    expect(p).toMatch(/must\(await db\.from\('handbook_progress'\)\.insert\(\{ \.\.\.row, \.\.\.stamp \}\)\);/);
    expect(p).not.toMatch(/insert\(row\)|missingColumn/);
    const lab = api('lab.ts');
    // المحاولة تُنشأ بالإصدار مع المستوى، وقبل ترحيل 20261111120200 بالإصدار وحده: الإصدار في الحالين
    expect(lab).toMatch(/const row = \{ participant_id: p\.id, item_id: it\.id, content_release: release \};[\s\S]*?insert\(\{ \.\.\.row, level: it\.level \}\)[\s\S]*?insert\(row\)/);
    expect(lab).not.toMatch(/missingColumn/);
    // الإصدار null لدفعة بلا إصدار وحدها، وخطأ القراءة يرمي فلا يُختم الناتج على المحتوى الحي بصمت
    for (const s of [p, lab]) expect(s).toMatch(/content_release: \(await releaseOf\(p\)\)\?\.id \?\? null|const release = \(await releaseOf\(p\)\)\?\.id \?\? null;/);
    for (const s of [p, lab]) expect(s).not.toMatch(/releaseOf\(p\)\.catch/);
    const prog = api('programs.ts');
    expect(prog).toMatch(/const \{ cohort \} = await cohortOf\(p, \{ strict: true \}\);/);
    expect(prog).toMatch(/if \(strict\) \{ must\(enr\); must\(cohorts\); \}/);
  });
  it('بند القراءة على أبواب إصدار الدفعة، والإصدار في الشهادة وملف المشارك', () => {
    expect(api('programs.ts')).toMatch(/export async function releaseOf\(p: \{ id\?: string \| null; organization_id\?: string \| null \}\)/);
    expect(api('activities.ts')).toMatch(/filter\(\(m: any\) => !inRelease \|\| inRelease\.has\(m\.id\)\)/);
    expect(api('certificates.ts')).toMatch(/const release = \{ content_release: \(cohort as any\)\?\.content_release \?\? null \};/);
    expect(api('file.ts')).toMatch(/content_release: cohort\.content_release \?\? null/);
    expect(read('leaders-app/src/screens/ExpertFile.jsx')).toMatch(/إصدار المحتوى \$\{d\.cohort\.content_release\}/);
    expect(read('admin-app/src/screens/Participants.jsx')).toMatch(/إصدار المحتوى \$\{r\.program\.cohort\.content_release\}/);
  });
});
