// حراس مفاتيح الميزات P4: ما يقرؤه المستخدم والقاعة والميزات مطفأة لا يسمّي القاعة ولا كاتون ولا 360.
// الخصوصية بصياغة عامة صادقة، ووصف الفيديو في الموقع عام، وبندا الرحلة T-360 وE-360 باسمهما الجديد بترحيل مشروط،
// والتذكير الموحد يسمّي البند باسمه الجديد، وبوابة m4.hall-load مؤجلة لا تحجب ولا تُحتسب، واختبار الحمل يُظهر القاعة.
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { PGlite } from '@electric-sql/pglite';
import { describe, expect, it } from 'vitest';
import { POLICY_CHANGES } from '../../supabase/functions/leaders-api/labels.js';
import { nudgeFor } from '../../supabase/functions/leaders-api/nudge.js';
import { MIGRATIONS } from '../../supabase/functions/leaders-api/migrations.js';
import { evaluate, STAGES } from '../../scripts/ops/stage-gates.mjs';
import { gateOf } from '../../scripts/ops/pending-migrations.mjs';

const root = join(__dirname, '../..');
const read = (p) => readFileSync(join(root, p), 'utf8');
const FEATURE_WORDS = /القاعة|كاتون|360/;
const MIG = '20261116100000_leaders_t360_rename';
const SQL = read(`supabase/migrations/${MIG}.sql`);
const T_OLD = 'تقييم 360 مختصر قبل البرنامج (المدير والزملاء)';
const E_OLD = 'تقييم 360 مختصر بعد البرنامج';
const T_NEW = 'تقدير المدير والزملاء قبل البرنامج';
const E_NEW = 'تقدير المدير والزملاء بعد البرنامج';

describe('الخصوصية: صياغة عامة لأنشطة التعلم', () => {
  const src = read('leaders-app/src/screens/Legal.jsx');
  const html = src.slice(src.indexOf('function Privacy()'), src.indexOf('function Terms()'));
  it('لا تسمّي القاعة ولا كاتون، وتبقى إفصاحًا صادقًا: ما يُجمع ولماذا ولا يدخل التقييم الختامي', () => {
    expect(html).toContain('سياسة خصوصية برنامج القادة');
    expect(html).not.toMatch(/القاعة|كاتون/);
    expect(html).toContain('إجاباتك في أنشطة التعلم التفاعلية، ونقاطك');
    expect(html).toContain('إجاباتك في أنشطة التعلم التفاعلية للتعلم وحده، ولا تدخل تقييمك الختامي');
  });
  it('تغيير الصياغة بنسخة غير جوهرية في السجل، فلا تُعاد الموافقة', () => {
    const c = POLICY_CHANGES[0];
    expect(c.material).toBe(false);
    expect(c.items.join(' ')).toContain('أنشطة التعلم التفاعلية');
    expect(c.items.join(' ')).not.toMatch(/القاعة|كاتون/);
  });
});

describe('الموقع: وصف الفيديو التعريفي عام', () => {
  it('الفيديو باقٍ حتى التسجيل القادم، ووصفه لا يسمّي القاعة', () => {
    const cap = read('home/leaders/index.html').match(/<figcaption>([^<]*)<\/figcaption>/)[1];
    expect(cap).toContain('وأنشطة التعلم التفاعلية');
    expect(cap).not.toMatch(FEATURE_WORDS);
  });
});

describe(`بندا الرحلة باسم لا يُقرأ 360 (${MIG})`, () => {
  it('مسجّل ومتسامح وفي قائمة الترحيلات', () => {
    expect(SQL).toContain(`insert into leaders.schema_migrations (name) values ('${MIG}') on conflict do nothing;`);
    expect(gateOf(SQL).gate).toBe('tolerant');
    expect(MIGRATIONS).toContain(MIG);
  });
  it('النص الأصلي الذي يشترطه هو آخر ما كتبته الترحيلات قبله للبندين', () => {
    const files = readdirSync(join(root, 'supabase/migrations')).filter((f) => f.endsWith('.sql') && f < `${MIG}.sql`).sort();
    const last = (code) => {
      let t = null;
      for (const f of files) for (const m of read(`supabase/migrations/${f}`).matchAll(new RegExp(`\\('${code}',\\s*'([^']+)'\\)`, 'g'))) t = m[1];
      return t;
    };
    expect(last('T-360')).toBe(T_OLD);
    expect(last('E-360')).toBe(E_OLD);
  });
  it('يغيّر ما على النص الأصلي وحده في كل برنامج، ولا يمس ما حرّرته الإدارة، وآمن لإعادة التشغيل', async () => {
    const db = new PGlite();
    await db.exec(`create schema leaders; create role anon; create role authenticated; create table leaders.schema_migrations (name text primary key);
      create table leaders.stage_requirements (program_id int, code text, title_ar text);
      create table leaders.journey_stages (program_id int, key text, activities_ar text);
      insert into leaders.stage_requirements values (1, 'T-360', '${T_OLD}'), (1, 'E-360', '${E_OLD}'), (2, 'T-360', 'عنوان حرّرته الإدارة'), (2, 'E-360', '${E_OLD}');
      insert into leaders.journey_stages values (1, 'leadership_coaching', 'جلسات توجيه، وتقييم 360 مختصر من مديرك وزملائك وفريقك، وخطة تطوير'), (2, 'leadership_coaching', 'نص حرّرته الإدارة');`);
    await db.exec(SQL);
    await db.exec(SQL);
    const reqs = (await db.query('select program_id, code, title_ar from leaders.stage_requirements order by program_id, code')).rows;
    expect(reqs.map((r) => [r.program_id, r.code, r.title_ar])).toEqual([
      [1, 'E-360', E_NEW], [1, 'T-360', T_NEW], [2, 'E-360', E_NEW], [2, 'T-360', 'عنوان حرّرته الإدارة'],
    ]);
    const st = (await db.query('select activities_ar from leaders.journey_stages order by program_id')).rows.map((r) => r.activities_ar);
    expect(st).toEqual(['جلسات توجيه، وتقدير مختصر من مديرك وزملائك وفريقك، وخطة تطوير', 'نص حرّرته الإدارة']);
    expect((await db.query('select name from leaders.schema_migrations')).rows).toEqual([{ name: MIG }]);
  });
  it('ونسخ البرامج المجمدة: الدفعة المثبتة على نسخة لا ترى «تقييم 360»، وما حُرّر يبقى، واللقطة السابقة محفوظة', async () => {
    const db = new PGlite();
    const V1 = '00000000-0000-4000-8000-0000000000a1', V2 = '00000000-0000-4000-8000-0000000000a2', V3 = '00000000-0000-4000-8000-0000000000a3';
    const data = (t, e, act) => JSON.stringify({
      stages: [{ key: 'intake', title_ar: 'القبول', activities_ar: 'قياس' }, { key: 'leadership_coaching', title_ar: 'التوجيه', activities_ar: act }],
      requirements: [{ code: 'T-360', title_ar: t, sort: 1 }, { code: 'X-1', title_ar: 'بند آخر', sort: 2 }, { code: 'E-360', title_ar: e, sort: 3 }],
    });
    await db.exec(`create schema leaders; create role anon; create role authenticated; create table leaders.schema_migrations (name text primary key);
      create table leaders.stage_requirements (program_id int, code text, title_ar text);
      create table leaders.journey_stages (program_id int, key text, activities_ar text);
      create table leaders.program_versions (id uuid primary key, data jsonb not null);
      insert into leaders.program_versions values
        ('${V1}', '${data(T_OLD, E_OLD, 'جلسات، وتقييم 360 مختصر من مديرك وزملائك وفريقك، وخطة')}'),
        ('${V2}', '${data('عنوان حرّرته الإدارة', E_OLD, 'نص حرّرته الإدارة')}'),
        ('${V3}', '${data(T_NEW, E_NEW, 'نص آخر')}');`);
    await db.exec(SQL);
    await db.exec(SQL);
    const rows = Object.fromEntries((await db.query('select id, data from leaders.program_versions')).rows.map((r) => [r.id, r.data]));
    expect(rows[V1].requirements.map((r) => [r.code, r.title_ar, r.sort])).toEqual([['T-360', T_NEW, 1], ['X-1', 'بند آخر', 2], ['E-360', E_NEW, 3]]);
    expect(rows[V1].stages.map((s) => s.activities_ar)).toEqual(['قياس', 'جلسات، وتقدير مختصر من مديرك وزملائك وفريقك، وخطة']);
    expect(rows[V2].requirements.map((r) => r.title_ar)).toEqual(['عنوان حرّرته الإدارة', 'بند آخر', E_NEW]);
    expect(rows[V2].stages[1].activities_ar).toBe('نص حرّرته الإدارة');
    expect(JSON.stringify(rows[V1])).not.toMatch(/360 مختصر/);
    const backup = (await db.query('select version_id, data from leaders.backup_20261116_t360_rename order by version_id')).rows;
    expect(backup.map((b) => b.version_id)).toEqual([V1, V2]);
    expect(backup[0].data.requirements[0].title_ar).toBe(T_OLD);
  });
  it('لا ترحيل لاحق يعيد «360» إلى عنوان بند', () => {
    const later = readdirSync(join(root, 'supabase/migrations')).filter((f) => f.endsWith('.sql') && f > `${MIG}.sql`);
    for (const f of later) expect(read(`supabase/migrations/${f}`)).not.toMatch(/title_ar[^;]*360/);
  });
});

describe('التذكير الموحد والميزات مطفأة', () => {
  const journey = (title) => [{ key: 'evaluation', title_ar: 'التقييم', status: 'active', items: [{ code: 'E-360', title_ar: title, required: true, status: 'pending' }] }];
  const p = { status: 'enrolled', email: 'p@example.org', created_at: '2026-11-01T00:00:00Z' };
  it('يسمّي بند تقدير المدير والزملاء باسمه الجديد، فلا يذكر 360 في الموضوع ولا النص', () => {
    const n = nudgeFor({ p, journey: journey(E_NEW), progress: 80, now: '2026-11-16T00:00:00Z' });
    expect(n.ok).toBe(true);
    expect(n.text).toContain(E_NEW);
    expect(`${n.subject} ${n.text} ${n.step}`).not.toMatch(FEATURE_WORDS);
  });
  it('مصدر التذكير لا يحمل نصًا يسمّي ميزة مخفية', () => {
    const strip = (s) => s.replace(/^\s*\/\/.*$/gm, '').replace(/\/\*[\s\S]*?\*\//g, '');
    for (const f of ['nudge.js', 'nudges.ts', 'onboarding.js', 'journey-map.js']) expect(strip(read(`supabase/functions/leaders-api/${f}`))).not.toMatch(FEATURE_WORDS);
  });
});

describe('بوابة حمل القاعة واختبارها', () => {
  it('m4.hall-load مؤجلة: لا تُحكم ولا تُعد، فلا تحجب المرحلة ولا تُحتسب ناجحة', () => {
    const check = STAGES.flatMap((s) => s.checks).find((c) => c.id === 'm4.hall-load');
    expect(check.deferred_ar).toContain('القاعة مخفية');
    const m4 = evaluate({}, {}).stages.find((s) => s.checks.some((c) => c.id === 'm4.hall-load'));
    const c = m4.checks.find((x) => x.id === 'm4.hall-load');
    expect(c.status).toBe('deferred');
    expect(m4.total).toBe(m4.checks.length - 1);
    expect(m4.passed).toBeLessThanOrEqual(m4.total);
  });
  it('اختبار الحمل في CI يُظهر القاعة في قاعدته قبل القياس، ثم يعيد ما كان', () => {
    const s = read('scripts/integration/hall-load.mjs');
    const on = s.indexOf(`'{"hall": true}'::jsonb`);
    expect(on).toBeGreaterThan(0);
    expect(on).toBeLessThan(s.indexOf('const started = Date.now()'));
    expect(s).toMatch(/featuresWas \? `update leaders\.app_settings set value = \$\{q\(featuresWas\)\}::jsonb where key = 'features'`/);
  });
});

describe('دليل التشغيل: قسم مفاتيح الميزات', () => {
  const rb = read('RUNBOOK.md');
  it('يقول أين المفاتيح وما يخفيه كل منها وكيف تُظهَر', () => {
    expect(rb).toContain('## 9. مفاتيح الميزات');
    for (const s of ['الميزات قيد البناء', 'features.hall', 'features.katon', 'feedback360.enabled', 'hall_off', 'katon_off', 'f360_off', 'تتجمد', 'm4.hall-load', 'كيف تُظهَر ميزة']) expect(rb).toContain(s);
  });
});
