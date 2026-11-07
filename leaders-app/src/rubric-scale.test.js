// حراس الحزمة 10 (D08): سلّم رباعي واحد لكل ما يقيّمه إنسان، مصدره labels.js، والخماسية لتقييمات الخبراء وحدها،
// وحصر الخادم في 1..4، وأداتا المراجعة تقرآن السلّم، وتقابل المختبر معلن، وتحويل التقييمات القائمة آمن لإعادة التشغيل.
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { PGlite } from '@electric-sql/pglite';
import { describe, expect, it } from 'vitest';
import * as labels from '../../supabase/functions/leaders-api/labels.js';
import { EXPERT_RATING_PCT, RUBRIC_LEVEL_AR, RUBRIC_PCT, RUBRIC_SCALE, rubricLevelAr } from '../../supabase/functions/leaders-api/labels.js';
import { expertRatingPct, modelPct, rubricPct } from '../../supabase/functions/leaders-api/continuous.js';
import { EXCELLENCE, LAB_LEVEL_CUTS, labLevel, MASTERY } from '../../supabase/functions/leaders-api/lab.js';
import { gateOf } from '../../scripts/ops/pending-migrations.mjs';

const root = join(__dirname, '../..');
const read = (p) => readFileSync(join(root, p), 'utf8');

describe('السلّم الواحد', () => {
  it('أربع درجات بأسمائها ونسبها وحد استيفاء «متقن» وإصدار', () => {
    expect(RUBRIC_SCALE.levels.map((l) => [l.n, l.ar, l.pct])).toEqual([[1, 'دون المطلوب', 0], [2, 'مقبول', 40], [3, 'متقن', 75], [4, 'متميز', 100]]);
    expect(RUBRIC_SCALE.pass).toBe(3);
    expect(RUBRIC_SCALE.version).toBe(1);
    for (const l of RUBRIC_SCALE.levels) expect(l.anchor_ar.length).toBeGreaterThan(20);
    expect(Object.isFrozen(RUBRIC_SCALE.levels)).toBe(true);
  });
  it('RUBRIC_PCT والأسماء مشتقة من السلّم، ولا خريطة خماسية للنماذج', () => {
    expect(RUBRIC_PCT).toEqual({ 1: 0, 2: 40, 3: 75, 4: 100 });
    expect(RUBRIC_LEVEL_AR[3]).toBe('متقن');
    expect(labels).not.toHaveProperty('RATING_PCT');
    expect(read('supabase/functions/leaders-api/labels.js')).toMatch(/export const RUBRIC_PCT = Object\.freeze\(Object\.fromEntries\(RUBRIC_SCALE\.levels\.map/);
  });
  it('النموذج بالسلّم الرباعي، و5 القديمة «متميز»، والمعلم بالخريطة نفسها', () => {
    expect([1, 2, 3, 4, 5].map(modelPct)).toEqual([0, 40, 75, 100, 100]);
    expect(modelPct(0)).toBeNull();
    expect(rubricPct({ a: 3, b: 4 })).toBe(88);
  });
  it('تقييمات الخبراء خماسية بخريطتها الصريحة وحدها', () => {
    expect(EXPERT_RATING_PCT).toEqual({ 1: 0, 2: 25, 3: 50, 4: 75, 5: 100 });
    expect(expertRatingPct(3)).toBe(50);
    const c = read('supabase/functions/leaders-api/continuous.js');
    expect(c).toMatch(/pct: modelPct\(m\.rating\)/);
    expect(c).toMatch(/pct: expertRatingPct\(Number\(r\.overall\)\)/);
  });
});

describe('الخادم والأدوات', () => {
  it('الخادم يحصر تقدير النموذج في 1..4 ويسجل إصدار السلّم', () => {
    const a = read('supabase/functions/leaders-api/admin.ts');
    expect(a).toMatch(/Math\.max\(1, Math\.min\(RUBRIC_SCALE\.levels\.length, Math\.round\(Number\(b\.rating\)\)\)\)/);
    expect(a).toMatch(/'submission\.review', 'model_submissions', s\.id, null, \{ status, rating, bonus, scale: RUBRIC_SCALE\.version \}/);
  });
  it('أداة اللوحة وبوابة المستشار تقرآن السلّم بلا نجوم', () => {
    const h = read('admin-app/src/screens/Handbook.jsx');
    expect(h).toMatch(/RUBRIC_SCALE\.levels\.map/);
    expect(h).not.toMatch(/★/);
    expect(read('leaders-app/src/screens/ExpertPortal.jsx')).toMatch(/RUBRIC_SCALE\.levels\.map/);
  });
  it('تقدير النموذج يُعرض باسم درجته لا بنجوم خمس، للمشارك والمستشار', () => {
    expect([1, 2, 3, 4, 5].map(rubricLevelAr)).toEqual(['دون المطلوب', 'مقبول', 'متقن', 'متميز', 'متميز']);
    const m = read('leaders-app/src/screens/Models.jsx');
    expect(m).not.toMatch(/★/);
    expect((m.match(/rubricLevelAr\(/g) || []).length).toBe(2);
    for (const f of ['leaders-app/src/screens/ExpertPortal.jsx', 'leaders-app/src/screens/ExpertFile.jsx']) {
      expect(read(f)).toMatch(/rubricLevelAr\((x|m)\.rating\)/);
      expect(read(f)).not.toMatch(/rating\}\/5/);
    }
  });
  it('معيارا المعلم والوثيقة يعرضان اسم الدرجة من السلّم', () => {
    expect(read('admin-app/src/screens/Capstones.jsx')).toMatch(/RUBRIC_LEVEL_AR\[i \+ 1\]/);
    expect(read('admin-app/src/screens/Milestones.jsx')).toMatch(/RUBRIC_LEVEL_AR\[i \+ 1\]/);
    expect(read('leaders-app/src/screens/ExpertFile.jsx')).toMatch(/RUBRIC_LEVEL_AR\[i \+ 1\]/);
  });
  it('تقابل المختبر معلن من عتبتيه', () => {
    expect(LAB_LEVEL_CUTS).toEqual([0, 40, MASTERY, EXCELLENCE]);
    expect([0, 39, 40, 69, 70, 89, 90, 100].map(labLevel)).toEqual([1, 1, 2, 2, 3, 3, 4, 4]);
    expect(read('leaders-app/src/screens/Lab.jsx')).toMatch(/RUBRIC_LEVEL_AR\[labLevel\(finish\.pct\)\]/);
  });
  it('الوثيقة تطابق السلّم والتحويل', () => {
    const doc = read('docs/content/السلم-الرباعي-الموحد-v1.md');
    for (const l of RUBRIC_SCALE.levels) expect(doc).toContain(`| ${l.n} | ${l.ar}`);
    for (const s of ['1←1، 2←2، 3←2، 4←3، 5←4', '20261107150000_leaders_rubric_scale', 'EXPERT_RATING_PCT', 'LAB_LEVEL_CUTS']) expect(doc).toContain(s);
  });
});

describe('ترحيل 20261107150000_leaders_rubric_scale', () => {
  const SQL = read('supabase/migrations/20261107150000_leaders_rubric_scale.sql');
  const schema = `create schema leaders; create table leaders.schema_migrations (name text primary key);
    create table leaders.audit_log (id bigint generated always as identity primary key, actor_type text not null, actor text,
      action text not null, entity text not null, entity_id text, before jsonb, after jsonb, created_at timestamptz default now() not null);
    create table leaders.model_submissions (id uuid primary key, rating smallint,
      constraint model_submissions_rating_check check (rating is null or (rating >= 1 and rating <= 5)));`;
  it('مؤجل بقرار D08، ويحوّل القديم وحده بالجدول، ويسجله، وإعادته لا تحوّل ثانية', async () => {
    expect(gateOf(SQL).gate).toBe('deferred');
    const db = new PGlite();
    await db.exec(schema);
    const id = (n) => `00000000-0000-0000-0000-00000000000${n}`;
    await db.exec(`insert into leaders.model_submissions values ('${id(1)}', 1), ('${id(2)}', 2), ('${id(3)}', 3), ('${id(4)}', 4), ('${id(5)}', 5), ('${id(6)}', 3), ('${id(7)}', null);
      insert into leaders.audit_log (actor_type, action, entity, entity_id, after) values
        ('admin', 'submission.review', 'model_submissions', '${id(3)}', '{"rating": 3}'),
        ('admin', 'submission.review', 'model_submissions', '${id(6)}', '{"rating": 3, "scale": 1}');`);
    await db.exec(SQL);
    await db.exec(SQL);
    const { rows } = await db.query('select id, rating from leaders.model_submissions order by id');
    expect(rows.map((r) => r.rating)).toEqual([1, 2, 2, 3, 4, 3, null]);
    const log = await db.query("select entity_id, before, after from leaders.audit_log where action = 'submission.rescale' order by entity_id");
    expect(log.rows).toHaveLength(5);
    expect(log.rows.find((r) => r.entity_id === id(5))).toMatchObject({ before: { rating: 5, scale: 0 }, after: { rating: 4, scale: 1 } });
    await expect(db.exec(`insert into leaders.model_submissions values ('${id(8)}', 5)`)).rejects.toThrow();
    await db.exec(`insert into leaders.model_submissions values ('${id(8)}', 4)`);
  });
});
