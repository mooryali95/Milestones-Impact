// حراس الحزمة 2 (D01 في سجل قرارات لجنة الخبراء): المستودع أصل المحتوى المُقاس، واللوحة كاتب مسودة
// لما سواه، وكل حفظ يحمل مصدره (updated_at وupdated_by) وقيمته السابقة في السجل.
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { PGlite } from '@electric-sql/pglite';
import { describe, expect, it } from 'vitest';
import { CONTENT_LOCK, lockedChanges, removeLocked, SYSTEM_REQUIREMENT_CODES } from '../../supabase/functions/leaders-api/content-lock.js';
import { AUTO_CHECKS } from '../../supabase/functions/leaders-api/logic.js';
import { gateOf } from '../../scripts/ops/pending-migrations.mjs';

const root = join(__dirname, '../..');
const read = (p) => readFileSync(join(root, p), 'utf8');

describe('قفل المحتوى المُقاس', () => {
  const q = { id: 'q1', text_ar: 'ما المعلم؟', help_ar: '', options: [{ label: 'أ', score: 0 }, { label: 'ب', score: 4 }], sort: 1, weight: 1, active: true };
  it('الفقرة: التلميح والترتيب وحدهما، والصف المرسل بقيمه المخزنة لا يُعد تغييرًا', () => {
    expect(lockedChanges('questions', { help_ar: 'تلميح', sort: 2 }, q)).toEqual([]);
    expect(lockedChanges('questions', { ...q, help_ar: 'تلميح' }, q)).toEqual([]);
    for (const row of [{ text_ar: 'نص آخر' }, { options: [{ label: 'أ', score: 4 }, { label: 'ب', score: 0 }] }, { weight: 2 }, { active: false }]) {
      expect(lockedChanges('questions', row, q).map((x) => x.field)).toEqual(Object.keys(row));
    }
    expect(lockedChanges('questions', { text_ar: 'جديد' }, null)[0].field).toBe('*');
    expect(removeLocked('questions')).toBe(true);
  });
  it('الباب: الاختبار والمستوى والهوية مقفلة، والمتن والتأمل والعنوان تُحرَّر، ولا إنشاء ولا حذف', () => {
    const m = { id: 'h1', title_ar: 'المعلم', body_md: 'متن', quiz_md: 'س: ؟\n- *أ\n- ب', reflection_ar: 'تأمل', min_level: 'beginner', dimension: 'milestone', chapter_key: 'ch1' };
    expect(lockedChanges('handbook_modules', { title_ar: 'جديد', body_md: 'متن آخر', reflection_ar: 'تأمل آخر' }, m)).toEqual([]);
    expect(lockedChanges('handbook_modules', { quiz_md: `${m.quiz_md}\n` }, m)).toEqual([]);   // المسافات ليست تغييرًا
    expect(lockedChanges('handbook_modules', { quiz_md: 'س: آخر' }, m).map((x) => x.field)).toEqual(['quiz_md']);
    expect(lockedChanges('handbook_modules', { min_level: 'advanced' }, m).map((x) => x.field)).toEqual(['min_level']);
    expect(lockedChanges('handbook_modules', { reflection_ar: '' }, { ...m, reflection_ar: null })).toEqual([]);
    expect(lockedChanges('handbook_modules', { title_ar: 'باب' }, null)).toHaveLength(1);
    expect(removeLocked('handbook_modules')).toBe(true);
  });
  it('المتطلب: الرمز ثابت بعد إنشائه، والرمز النظامي محجوز ونوعه ثابت', () => {
    const r = { id: 'r1', code: 'P-INFO', kind: 'form', title_ar: 'الملف' };
    expect(lockedChanges('stage_requirements', { title_ar: 'ملفك الشخصي' }, r)).toEqual([]);
    expect(lockedChanges('stage_requirements', { code: 'P-INFO2' }, r).map((x) => x.field)).toEqual(['code']);
    expect(lockedChanges('stage_requirements', { kind: 'upload' }, r).map((x) => x.field)).toEqual(['kind']);
    expect(lockedChanges('stage_requirements', { kind: 'upload' }, { ...r, code: 'X-1' })).toEqual([]);
    expect(lockedChanges('stage_requirements', { code: 'E-POST', title_ar: 'x' }, null).map((x) => x.field)).toEqual(['code']);
    expect(lockedChanges('stage_requirements', { code: 'T-NEW', title_ar: 'x' }, null)).toEqual([]);
  });
  it('مفتاح النموذج وتفعيل الأداة مقفلان، وما لا قفل له يمر', () => {
    expect(lockedChanges('learning_models', { key: 'other' }, { key: 'wbs' }).map((x) => x.field)).toEqual(['key']);
    expect(lockedChanges('learning_models', { title_ar: 'هيكل' }, { key: 'wbs', title_ar: 'قديم' })).toEqual([]);
    expect(lockedChanges('instruments', { active: true }, { active: false }).map((x) => x.field)).toEqual(['active']);
    expect(lockedChanges('instruments', { intro_ar: 'مقدمة' }, { active: true, intro_ar: '' })).toEqual([]);
    expect(lockedChanges('tracks', { title_ar: 'x' }, { title_ar: 'y' })).toEqual([]);
  });
  it('الرموز النظامية مصدرها AUTO_CHECKS وما يقرؤه الخادم باسمه، ولا رمز يقرؤه الخادم خارجها', () => {
    for (const c of Object.keys(AUTO_CHECKS)) expect(SYSTEM_REQUIREMENT_CODES).toContain(c);
    const files = ['impact.ts', 'participant.ts', 'journey.js', 'logic.js', 'final.ts', 'capstone.ts'].map((f) => read(`supabase/functions/leaders-api/${f}`)).join('\n');
    const used = [...files.matchAll(/(?:eq\('code', |\.code === )'([A-Z]{1,3}-[A-Z0-9-]+)'/g)].map((m) => m[1]);
    expect(used.length).toBeGreaterThan(1);
    for (const c of used) expect(SYSTEM_REQUIREMENT_CODES, c).toContain(c);
  });
});

describe('الخادم يطبّق القفل ويحفظ المصدر والقيمة السابقة', () => {
  const admin = read('supabase/functions/leaders-api/admin.ts');
  const katon = read('supabase/functions/leaders-api/katon.ts');
  it('الحفظ يقرأ الصف المخزن ويرفض التغيير المقفل بـ 409 content_locked، والحذف المقفل كذلك', () => {
    expect(admin).toMatch(/const lock = lockedChanges\(b\.entity, row, current\);\n\s+if \(lock\.length\) throw new Fail\(lock\[0\]\.msg, 409, 'content_locked'/);
    expect(admin).toMatch(/if \(removeLocked\(b\.entity\)\) throw new Fail\(/);
  });
  it('إصدار الأداة وتفعيلها من اللوحة مرفوضان (الإصدار من المولّد والتفعيل بترحيل محروس)', () => {
    for (const fn of ['cloneInstrument', 'activateInstrument']) {
      const body = admin.slice(admin.indexOf(`export async function ${fn}(`)).split('\n}\n')[0];
      expect(body).toMatch(/throw new Fail\(.*409, 'content_locked'\);/);
      expect(body).not.toMatch(/db\.from\('instruments'\)/);
    }
  });
  it('الختم ببريد المشرف مع إعادة متسامحة قبل الترحيل، والقيمة السابقة في السجل', () => {
    expect(admin).toMatch(/updated_by: a\.email/);
    expect(admin).toMatch(/missingColumn\(res\.error\)\) res = await write\(/);
    expect(admin).toMatch(/await audit\('admin', a\.email, `\$\{b\.entity\}\.save`, b\.entity, [^,]+, before, row\)/);
    expect(read('supabase/functions/leaders-api/core.ts')).toMatch(/export const missingColumn = \(err: any\) => err\?\.code === 'PGRST204' \|\| err\?\.code === '42703'/);
  });
  it('كاتون: مفتاح الجملة المجاب عنها ونصها وسؤالها ثابتة، وجدول النقاط ثابت بعد أول حكم بثقة', () => {
    expect(katon).toMatch(/if \(count && changed\.length\) throw new Fail\(.*409, 'content_locked'\)/);
    expect(katon).toMatch(/katon_answers'\)\.select\('sentence_id', \{ count: 'exact', head: true \}\)\.not\('confidence', 'is', null\);\n\s+if \(count\) throw new Fail/);
    expect(katon).toMatch(/updated_by: a\.email/);
    expect(katon).not.toMatch(/يُسمح ويُعلَن في السجل/);
  });
  it('اللوحة لا تعرض إصدار الأداة ولا تفعيلها ولا إنشاء فقرة ولا باب، وتقرأ الحقول المسموحة من المصدر نفسه', () => {
    const meth = read('admin-app/src/screens/Methodology.jsx');
    expect(meth).not.toMatch(/admin\.clone-instrument|admin\.activate-instrument|سؤال جديد في/);
    expect(read('admin-app/src/methodology.js')).toMatch(/Q_SAFE = Q_FIELDS\.filter\(\(f\) => CONTENT_LOCK\.questions\.editable\.includes\(f\.name\)\)/);
    const hb = read('admin-app/src/screens/Handbook.jsx');
    expect(hb).not.toMatch(/\+ باب جديد|entity: 'handbook_modules', id: m\.id/);
    expect(hb).toMatch(/const row = \{ id: m\.id, title_ar: v\.title_ar\.trim\(\), body_md: v\.body_md, reflection_ar: v\.reflection_ar\.trim\(\) \|\| null \};/);
    expect(CONTENT_LOCK.questions.editable).toEqual(['help_ar', 'sort']);
  });
});

describe('ترحيل المصدر 20261107100000_leaders_content_provenance', () => {
  const SQL = read('supabase/migrations/20261107100000_leaders_content_provenance.sql');
  it('متسامح في بوابة النشر، ويسجّل نفسه', () => {
    expect(gateOf(SQL).gate).toBe('tolerant');
    expect(SQL).toContain("insert into leaders.schema_migrations (name) values ('20261107100000_leaders_content_provenance')");
  });
  it('حفظ اللوحة يبقى باسم المشرف، وكل كتابة لا تختم تُنسب إلى دور القاعدة، وإعادة التشغيل آمنة', async () => {
    const db = new PGlite();
    await db.exec(`create schema leaders; create table leaders.schema_migrations (name text primary key);
      create table leaders.handbook_modules (id int primary key, body_md text);
      create table leaders.tracks (key text primary key, title_ar text, updated_at timestamptz);`);
    await db.exec(SQL);
    await db.exec(SQL);
    await db.exec("insert into leaders.handbook_modules (id, body_md) values (1, 'أ')");
    let r = (await db.query('select updated_by, updated_at from leaders.handbook_modules')).rows[0];
    expect(r.updated_by).toBe('db:postgres');
    await db.exec("update leaders.handbook_modules set body_md = 'ب', updated_at = now() + interval '1 second', updated_by = 'admin@x.sa'");
    r = (await db.query('select updated_by from leaders.handbook_modules')).rows[0];
    expect(r.updated_by).toBe('admin@x.sa');
    await db.exec("update leaders.handbook_modules set body_md = 'ج'");   // ترحيل أو SQL يدوي
    r = (await db.query('select updated_by from leaders.handbook_modules')).rows[0];
    expect(r.updated_by).toBe('db:postgres');
    const cols = (await db.query("select column_name from information_schema.columns where table_schema = 'leaders' and table_name = 'tracks' order by 1")).rows.map((x) => x.column_name);
    expect(cols).toEqual(['key', 'title_ar', 'updated_at', 'updated_by']);
    expect((await db.query('select count(*)::int n from leaders.schema_migrations')).rows[0].n).toBe(1);
  });
});
