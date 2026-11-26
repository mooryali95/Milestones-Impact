// تخفيف وثيقة المبادرة للتأسيسي، المرحلة 2 (docs/content/2026-11-26-تصور-تخفيف-المبادرة-للتأسيسي-v1.md §5)
// كل ترحيلات المستودع تُعاد على البنية المرجعية (PGlite) كما في level-matrix.test.js، ثم يُطبَّق ترحيل الأعمدة مرتين.
// الحراس: المتوسط والاحترافي لا يتغير لهما حقل ولا عمود، والتأسيسي (M1I1L1) خاناته المطلوبة 81 كما في جدول التصور،
// ومن يملأ ما يراه وحده يبلغ الجاهزية ويُسمح له بالتقديم، وما كُتب في عمود صار مخفيًا يبقى ظاهرًا غير مطلوب.
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { PGlite } from '@electric-sql/pglite';
import { beforeAll, describe, expect, it } from 'vitest';
import { cleanModelFieldsOf, fieldFilled, fieldsFor, reqColumns, viewTable } from '../../supabase/functions/leaders-api/logic.js';
import { bindAnswers, canSubmit, capstoneChecks, capstoneModels, CHARTER_KEY, modelFields, READY_MIN, readiness, sectionState } from '../../supabase/functions/leaders-api/capstone.js';

const ROOT = join(__dirname, '../..');
const read = (p) => readFileSync(join(ROOT, p), 'utf8');
export const LIGHTEN = '20261129140000_leaders_beginner_columns';
const PRELUDE = `create role anon; create role authenticated; create role service_role; create schema auth; create schema extensions;
  create table auth.users (id uuid primary key, email text);
  create function auth.uid() returns uuid language sql as 'select null::uuid';
  create function auth.role() returns text language sql as 'select null::text';
  create function auth.jwt() returns jsonb language sql as 'select null::jsonb';`;
const snap = async (db) => (await db.query('select id, key, dimension, min_level, sort, capstone_sort, scopes, active, title_ar, fields from leaders.learning_models order by key')).rows;
const LV = ['beginner', 'intermediate', 'advanced'];
const DIMS = ['milestone', 'impact', 'leadership'];
const BEGINNER = { milestone: 'beginner', impact: 'beginner', leadership: 'beginner' };
const NEW = '2099-01-01T00:00:00.000Z';
let before, after, again;

beforeAll(async () => {
  const db = new PGlite();
  await db.exec(PRELUDE);
  await db.exec(read('supabase/schema/baseline.sql'));
  for (const x of read('server/leaders-011-book-and-models.sql').match(/insert into leaders\.learning_models[\s\S]*?on conflict \(key\) do nothing;/g)) await db.exec(x);
  const files = readdirSync(join(ROOT, 'supabase/migrations')).filter((x) => x.endsWith('.sql')).sort();
  for (const f of files.filter((x) => x < `${LIGHTEN}.sql`)) {
    try { await db.exec(read(`supabase/migrations/${f}`)); } catch { await db.exec('rollback').catch(() => {}); }
    await db.exec('discard temp').catch(() => {});
  }
  before = await snap(db);
  const sql = read(`supabase/migrations/${LIGHTEN}.sql`);
  await db.exec(sql); await db.exec('discard temp');
  after = await snap(db);
  await db.exec(sql); await db.exec('discard temp');
  again = await snap(db);
}, 180000);

const COMBOS = LV.flatMap((m) => LV.flatMap((i) => LV.map((l) => ({ milestone: m, impact: i, leadership: l }))));

describe('ترحيل أعمدة التأسيسي', () => {
  it('آمن لإعادة التشغيل', () => expect(again).toEqual(after));
  it('المتوسط والاحترافي: الحقول وأعمدتها وصفوفها كما قبل الترحيل في كل فصل ونطاق', () => {
    const by = Object.fromEntries(before.map((m) => [m.key, m]));
    for (const m of after) for (const lv of ['intermediate', 'advanced']) for (const scope of ['project', 'program', 'portfolio']) {
      for (const primary of [false, true]) {
        // الخاصيات الثلاث تُحمل مع الحقل ولا يقرؤها لغير التأسيسي إلا اللوحة، وما عداها مطابق
        const strip = (fs) => fs.map(({ columns_beginner, labels_beginner, min_rows_beginner, ...f }) => f);
        expect(strip(fieldsFor(m.fields, lv, scope, primary, null, false, NEW)), `${m.key} ${lv} ${scope}`).toEqual(strip(fieldsFor(by[m.key].fields, lv, scope, primary, null, false, NEW)));
      }
    }
  });
  it('لا يمس إلا الخاصيات الثلاث على الجداول الاثني عشر', () => {
    const by = Object.fromEntries(before.map((m) => [m.key, m]));
    let touched = 0;
    for (const m of after) {
      const strip = (fs) => fs.map(({ columns_beginner, labels_beginner, min_rows_beginner, ...f }) => f);
      expect(strip(m.fields), m.key).toEqual(strip(by[m.key].fields));
      touched += m.fields.filter((f) => f.columns_beginner).length;
    }
    expect(touched).toBe(12);
  });
  it('حفظ اللوحة (cleanModelFieldsOf) يبقي الخاصيات كما كتبها الترحيل', () => {
    for (const m of after) for (const f of cleanModelFieldsOf(m.fields)) {
      const o = m.fields.find((x) => x.key === f.key);
      if (o.columns_beginner) { expect(f.columns_beginner, `${m.key}.${f.key}`).toEqual(o.columns_beginner); expect(f.labels_beginner).toEqual(o.labels_beginner); }
    }
  });
  it('M1I1L1: الخانات المطلوبة في الجداول 81 بعد أن كانت 204', () => {
    const cells = (rows) => capstoneModels(rows, BEGINNER, 'project').flatMap((m) => modelFields(m, BEGINNER, 'project', null, null, NEW))
      .filter((f) => f.type === 'table' && f.required !== false).reduce((a, f) => a + reqColumns(f).length * (f.min_rows || 1), 0);
    expect(cells(before)).toBe(204);
    expect(cells(after)).toBe(81);
  });
});

// يملأ الأعمدة المطلوبة وحدها، بقيم تجتاز الفحوص (بديل «عدم التدخل»، وأرقام للتكلفة، وأسابيع للمواعيد)
const TEXT = 'إجابة كاملة لها معنى واضح في سياق المبادرة';
function cellFor(f, i, r) {
  const c = String(f.columns[i]);
  if (f.key === 'options' && i === 0) return r === 0 ? 'عدم التدخل' : `بديل ${r}`;
  if (/الموعد|التاريخ|البداية|النهاية/.test(c)) return `الأسبوع ${r + 1}`;
  if (/الإجمالي|التكلفة|سعر|الكمية/.test(c)) return '100';
  if (/خط الأساس|المستهدف|القيمة/.test(c)) return String(10 + r);
  return `${TEXT} ${r + 1}`;
}
const valueFor = (f) => (f.type === 'table'
  ? Array.from({ length: f.min_rows || 1 }, (_, r) => f.columns.map((_, i) => (reqColumns(f).includes(i) ? cellFor(f, i, r) : '')))
  : f.type === 'select' ? (f.options || ['نعم'])[0] : f.key === 'envelope' ? '100000' : f.key === 'end' ? 'الأسبوع 12' : TEXT);

function build(rows, levels, answersOf) {
  const models = capstoneModels(rows, levels, 'project');
  const initiative = 'نادي القراءة';
  const sections = models.map((m) => {
    const raw = answersOf(m, levels);
    const fields = modelFields(m, levels, 'project', null, raw, NEW);
    const answers = bindAnswers(fields, raw, m.key === CHARTER_KEY ? null : initiative);
    const state = sectionState(m, fields, { answers, status: m.key === CHARTER_KEY ? 'reviewed' : 'draft' });
    return { model: m, fields, answers, state };
  });
  const checks = capstoneChecks({ scope: 'project', models: Object.fromEntries(sections.map((s) => [s.model.key, { ...s.model, fields: s.fields }])), answers: Object.fromEntries(sections.map((s) => [s.model.key, s.answers])) });
  const ready = readiness(sections.map((s) => s.state), checks);
  const gate = canSubmit({ status: 'draft', scope: 'project', initiative, card: { status: 'reviewed' }, sections: sections.map((s) => ({ ...s.state, title: s.model.title_ar })), readiness: ready, checks });
  return { sections, checks, ready, gate };
}
const fillRequired = (m, levels) => Object.fromEntries(modelFields(m, levels, 'project', null, null, NEW).filter((f) => f.required !== false).map((f) => [f.key, valueFor(f)]));

describe('التأسيسي يملأ ما يراه وحده', () => {
  it('كل الفصول مكتملة، ولا فحص حاجب، والجاهزية فوق الحد، والتقديم مسموح', () => {
    const r = build(after, BEGINNER, fillRequired);
    expect(r.sections.filter((s) => !s.state.complete).map((s) => `${s.model.key}: ${s.state.missing}`)).toEqual([]);
    expect(r.checks.filter((c) => c.blocking && !c.ok)).toEqual([]);
    expect(r.ready).toBeGreaterThanOrEqual(READY_MIN);
    expect(r.gate).toEqual({ ok: true });
  });
  it('ولا يقرأ فحص عمودًا مخفيًا: المنافع بلا مالك، والمخاطر بلا احتمال وأثر', () => {
    const c = Object.fromEntries(build(after, BEGINNER, fillRequired).checks.map((x) => [x.key, x]));
    expect(c['benefit-owner']).toMatchObject({ ok: true, title: 'لكل منفعة رقم اليوم ومستهدف' });
    expect(c['risk-owner']).toBeUndefined();
    expect(c['risk-response'].ok).toBe(true);
    expect(c.deps.ok).toBe(true);
    expect(c['dep-logic']).toBeUndefined();
  });
  it('المتوسط والاحترافي: الفحوص والجاهزية كما قبل الترحيل لكل تركيبة لا تأسيسي فيها', () => {
    const fillAll = (rows) => (m, levels) => {
      const src = rows.find((x) => x.key === m.key);
      return Object.fromEntries(modelFields(src, levels, 'project', null, null, NEW).map((f) => [f.key, f.type === 'table'
        ? Array.from({ length: Math.max(f.min_rows || 1, 3) }, (_, r) => f.columns.map((_, i) => cellFor(f, i, r))) : valueFor(f)]));
    };
    for (const levels of COMBOS.filter((l) => !Object.values(l).includes('beginner'))) {
      const b = build(before, levels, fillAll(before)), a = build(after, levels, fillAll(before));
      expect(a.checks, JSON.stringify(levels)).toEqual(b.checks);
      expect(a.ready).toBe(b.ready);
    }
  });
});

describe('قاعدة «لا فقد» في الأعمدة', () => {
  it('عمود مخفي كُتب فيه يبقى ظاهرًا وفي الوثيقة، ولا يُطلب ولا يُفحص', () => {
    const raid = after.find((m) => m.key === 'raid');
    const items = [['R1', 'خطر', 'غياب المتطوعين', '5', '5', '', 'قائمة احتياط', ''], ['', '', 'المكان', '', '', '', 'بديل', ''], ['', '', 'الوقت', '', '', '', 'تأجيل', '']];
    const f = fieldsFor(raid.fields, 'beginner', 'project', false, { items }, false, NEW).find((x) => x.key === 'items');
    expect(f.cols_req).toEqual([2, 6]);
    expect(f.cols_view).toEqual([0, 1, 2, 3, 4, 6]);
    expect(fieldFilled(f, items)).toBe(true);
    const t = viewTable(f, items);
    expect(t.columns).toHaveLength(6);
    expect(t.labels[2]).toBe('ما قد يعطلك');
    expect(t.rows[0]).toEqual(['R1', 'خطر', 'غياب المتطوعين', '5', '5', 'قائمة احتياط']);
    // الاحتمال والأثر مكتوبان (5 × 5) والمالك مخفي: لا فحص «خطر عالٍ بلا مالك» يحجب التأسيسي
    const c = capstoneChecks({ scope: 'project', models: { raid: { fields: [f] } }, answers: { raid: { items } } });
    expect(c.find((x) => x.blocking && !x.ok)).toBeUndefined();
  });
});
