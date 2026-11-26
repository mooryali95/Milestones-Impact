// مصفوفة وثيقة المبادرة بحسب المستوى (اعتمدها المالك 2026-11-24): المرحلتان 2 و3
// docs/content/2026-11-24-مصفوفة-الوثيقة-بحسب-المستوى-v1.md، وحالة التنفيذ في v2.
// شرط المالك: لا فقد ولا عجز ولا خلل في الوثيقة. الحراس هنا على الحقول كما تصير فعلًا في القاعدة:
// كل ترحيلات المستودع تُعاد على البنية المرجعية (PGlite)، بطريقة الجرد نفسها، ومعها إنشاء الفصول الثمانية التي لا يُنشئها
// ترحيل في المستودع (server/leaders-011-book-and-models.sql)، فتعدّلها الترحيلات بعده كما عدّلتها في الإنتاج.
// اختبار «أمانة اللقطة» يطابق حقولها بقراءة الإنتاج (الجرد v2 §3)، ثم يُطبَّق ترحيل المصفوفة مرتين.
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { PGlite } from '@electric-sql/pglite';
import { beforeAll, describe, expect, it } from 'vitest';
import { approvalOf, answeredModels, cleanAnswers, cleanModelFieldsOf, fieldsFor, keptModel, missingFields, modelsFor } from '../../supabase/functions/leaders-api/logic.js';
import { capstoneChecks, capstoneModels, chapterLevel, CHAPTER_STANDING_AR, costLabel, costSummary, displayJoins, displayPages, DISPLAY_PAIRS, docLevelsFor, modelFields, readiness, sectionState } from '../../supabase/functions/leaders-api/capstone.js';
import { capstoneReport, levelAnnex } from '../../src/lib/brand/capstone.js';
import { renderInitiative } from '../../src/lib/brand/institutional.js';
import { publicDoc } from '../../supabase/functions/leaders-api/share.js';
import { freezeIssued } from '../../supabase/functions/leaders-api/doc-quality.js';
import { businessCase, caseStatus } from '../../supabase/functions/leaders-api/business-case.js';
import { chapterTone, countedChapters, nextChapter } from './screens/InitiativeMap.jsx';

const ROOT = join(__dirname, '../..');
const read = (p) => readFileSync(join(ROOT, p), 'utf8');
const MATRIX = '20261128140000_leaders_level_matrix';
const SQL = read(`supabase/migrations/${MATRIX}.sql`);
const LV = ['beginner', 'intermediate', 'advanced'];
const DIMS = ['milestone', 'impact', 'leadership'];
const PRELUDE = `create role anon; create role authenticated; create role service_role; create schema auth; create schema extensions;
  create table auth.users (id uuid primary key, email text);
  create function auth.uid() returns uuid language sql as 'select null::uuid';
  create function auth.role() returns text language sql as 'select null::text';
  create function auth.jwt() returns jsonb language sql as 'select null::jsonb';`;
const EIGHT = ['benefits-register', 'milestone-register', 'theory-of-change', 'stakeholder-map', 'stage-gate', 'impact-report', 'portfolio-review', 'development-plan'];

const snap = async (db) => (await db.query('select id, key, dimension, min_level, sort, capstone_sort, scopes, active, title_ar, fields from leaders.learning_models order by key')).rows;
let before, after, again, db;

beforeAll(async () => {
  db = new PGlite();
  await db.exec(PRELUDE);
  await db.exec(read('supabase/schema/baseline.sql'));
  for (const x of read('server/leaders-011-book-and-models.sql').match(/insert into leaders\.learning_models[\s\S]*?on conflict \(key\) do nothing;/g)) await db.exec(x);
  // ترحيلات تحتاج ما لا تحاكيه البنية المرجعية (cron، sspdf، مستخدم حقيقي) تُتخطى كما في الجرد؛ لا يمس أي منها النماذج
  for (const f of readdirSync(join(ROOT, 'supabase/migrations')).filter((x) => x.endsWith('.sql')).sort()) {
    if (f >= `${MATRIX}.sql`) break;
    try { await db.exec(read(`supabase/migrations/${f}`)); } catch { await db.exec('rollback').catch(() => {}); }
    await db.exec('discard temp').catch(() => {});
  }
  before = await snap(db);
  await db.exec(SQL);
  await db.exec('discard temp');
  after = await snap(db);
  await db.exec(SQL);
  await db.exec('discard temp');
  again = await snap(db);
}, 120000);

const by = (rows) => Object.fromEntries(rows.map((m) => [m.key, m]));
const keys = (m, lv, scope = 'project', primary = false) => fieldsFor(m.fields, lv, scope, primary).map((f) => f.key);
// من اعتُمد مساره قبل الترحيل (OLD) ومن بعده (NEW): required_after بوقت تطبيقه
const OLD = '2026-01-01T00:00:00.000Z', NEW = '2099-01-01T00:00:00.000Z';
const req = (m, lv, since = NEW, scope = 'project') => fieldsFor(m.fields, lv, scope, false, null, false, since).filter((f) => f.required !== false).map((f) => f.key);
const optGroup = (f) => f.required === false && !f.required_after && !f.required_from;
const same = (lv) => Object.fromEntries(DIMS.map((d) => [d, lv]));
// المسارات الـ27: كل تركيبة مستويات
const COMBOS = LV.flatMap((m) => LV.flatMap((i) => LV.map((l) => ({ milestone: m, impact: i, leadership: l }))));

describe('الترحيل', () => {
  it('رأسه بوابة tolerant بملاحظة، ونسخة احتياطية وسطر استرجاع، واسمه في السجل', () => {
    expect(SQL).toMatch(/^-- deploy-gate: tolerant \S/m);
    expect(SQL).toMatch(/^-- restore: update leaders\.learning_models .* from leaders\.backup_20261128_level_matrix/m);
    expect(SQL).toContain('create table if not exists leaders.backup_20261128_level_matrix');
    expect(SQL).toContain(`insert into leaders.schema_migrations (name) values ('${MATRIX}') on conflict do nothing;`);
    expect(SQL).not.toMatch(/^\s*(begin|commit)\s*;/mi);
  });
  it('أمانة اللقطة: الفصول الثمانية قبله كما قُرئت من الإنتاج (الجرد v2 §3)', () => {
    const B = by(before);
    for (const k of EIGHT) expect(B[k], k).toBeTruthy();
    const view = (k) => B[k].fields.map((f) => f.key + (f.min_level ? `:${f.min_level}` : '') + (f.track ? ':track' : ''));
    expect(view('stakeholder-map')).toEqual(['project', 'stakeholders', 'silent:intermediate', 'track_depth:track']);
    expect(view('milestone-register')).toEqual(['project', 'goal', 'milestones', 'track_depth:track']);
    expect(view('impact-report')).toEqual(['program', 'changes', 'contribution', 'not_achieved', 'lessons']);
    expect(view('development-plan')).toEqual(['competencies', 'support', 'successor:advanced', 'track_depth:track']);
    expect(B['impact-report'].min_level).toBe('advanced');
    expect(B['stage-gate'].min_level).toBe('intermediate');
  });
  it('إعادة تشغيله لا تغيّر شيئًا', () => {
    expect(again).toEqual(after);
  });
  it('لا يفشل في بيئة تخلو من الفصول الثمانية، ولا يمس غيرها', async () => {
    const lite = new PGlite();
    await lite.exec(`create role anon; create role authenticated; create schema leaders;
      create table leaders.schema_migrations (name text primary key);
      create table leaders.learning_models (key text primary key, min_level text not null, fields jsonb not null);
      create table leaders.track_profiles (key text primary key, journey_ar text not null);
      create table leaders.tracks (key text primary key, profile_key text, journey_ar text);`);
    for (const m of before.filter((x) => !EIGHT.includes(x.key))) await lite.query('insert into leaders.learning_models values ($1, $2, $3)', [m.key, m.min_level, JSON.stringify(m.fields)]);
    await lite.exec(SQL);
    const rows = by((await lite.query('select key, min_level, fields from leaders.learning_models')).rows);
    const A = by(after);
    // وقت required_after وقت التطبيق، فيختلف بين القاعدتين
    const norm = (fs) => fs.map((f) => (f.required_after ? { ...f, required_after: 'T' } : f));
    for (const k of Object.keys(rows)) expect({ min_level: rows[k].min_level, fields: norm(rows[k].fields) }, k).toEqual({ min_level: A[k].min_level, fields: norm(A[k].fields) });
    expect(Object.keys(rows).some((k) => EIGHT.includes(k))).toBe(false);
  });
  it('لا يحذف حقلًا ولا يغيّر مفتاحًا أو عنوانًا أو نوعًا، ولا يُسقط إلزامًا عن أحد كان مطلوبًا منه', () => {
    const B = by(before);
    for (const m of after) {
      const old = B[m.key];
      for (const f of old.fields) {
        const n = m.fields.find((x) => x.key === f.key);
        expect(n, `${m.key}.${f.key}`).toBeTruthy();
        expect({ label: n.label, type: n.type, columns: n.columns }, `${m.key}.${f.key}`).toEqual({ label: f.label, type: f.type, columns: f.columns });
        // إلزام صار شرطيًا: مخزّن false للدوال الأقدم (تراجع آمن)، ومطلوب لكل مستوى كان يُطلب منه قبل
        if (n.required !== f.required) {
          expect(n.required, `${m.key}.${f.key}`).toBe(false);
          for (const lv of LV.slice(LV.indexOf(old.min_level))) if (fieldsFor(old.fields, lv, 'project').some((x) => x.key === f.key && x.required !== false)) {
            for (const since of [OLD, NEW]) expect(req(m, lv, since), `${m.key}.${f.key} ${lv}`).toContain(f.key);
          }
        }
      }
      // الجديد مخزّن غير مطلوب، ومطلوب لمن يبدأ بعد الترحيل
      for (const f of m.fields.filter((x) => !old.fields.some((y) => y.key === x.key))) {
        expect(f, `${m.key}.${f.key}`).toMatchObject({ required: false, required_after: expect.stringMatching(/^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\dZ$/) });
      }
    }
  });
  it('الدوال الأقدم على القاعدة الجديدة (تراجع): لا حقل مطلوب لم يكن مطلوبًا', () => {
    const B = by(before);
    const oldReq = (fs, lv) => (fs || []).filter((f) => (!f.min_level || LV.indexOf(lv) >= LV.indexOf(f.min_level)) && !f.track && f.required !== false).map((f) => f.key);
    for (const m of after) for (const lv of LV) {
      const was = oldReq(B[m.key].fields, lv);
      for (const k of oldReq(m.fields, lv)) expect(was, `${m.key}.${k} ${lv}`).toContain(k);
    }
  });
});

describe('المصفوفة فصلًا فصلًا', () => {
  it('تقرير الأثر: من التأسيسي بثلاثة حقول (البرنامج مربوط، وما تغيّر بأرقامه، والدروس)، والمتوسط كاملًا، والاحترافي + حقل المسار', () => {
    const m = by(after)['impact-report'];
    expect(m.min_level).toBe('beginner');
    expect(keys(m, 'beginner')).toEqual(['program', 'changes', 'lessons']);
    expect(keys(m, 'intermediate')).toEqual(['program', 'changes', 'contribution', 'not_achieved', 'lessons']);
    expect(keys(m, 'advanced')).toEqual(['program', 'changes', 'contribution', 'not_achieved', 'lessons']);
    expect(keys(m, 'intermediate', 'project', true)).not.toContain('track_depth');
    expect(keys(m, 'advanced', 'project', true)).toContain('track_depth');
    // «بأي رقم»: جدول ما تغيّر يحمل خط الأساس والقيمة الحالية، فلا حقل رقم ثانٍ يكرر المصدر
    expect(m.fields.find((f) => f.key === 'changes').columns).toEqual(expect.arrayContaining(['خط الأساس', 'القيمة الحالية']));
    // مطلوب للاحترافي كما كان، ولمن يبدأ بعد الترحيل في كل مستوى، واختياري لمن بدأ قبله دون الاحترافي
    for (const since of [OLD, NEW]) expect(req(m, 'advanced', since)).toEqual(['program', 'changes', 'contribution', 'not_achieved', 'lessons']);
    expect(req(m, 'beginner', NEW)).toEqual(['program', 'changes', 'lessons']);
    expect(req(m, 'intermediate', NEW)).toEqual(['program', 'changes', 'contribution', 'not_achieved', 'lessons']);
    expect(req(m, 'beginner', OLD)).toEqual([]);
    expect(req(m, 'intermediate', OLD)).toEqual([]);
    // بلا وقت اعتماد يُعامل معاملة من بدأ قبل
    expect(req(m, 'beginner', null)).toEqual([]);
    // تقرير أثر فارغ لا يُعد مكتملًا لمن يبدأ بعد الترحيل
    expect(sectionState(m, fieldsFor(m.fields, 'beginner', 'project', false, null, false, NEW), { answers: {} }).complete).toBe(false);
    expect(fieldsFor(m.fields, 'beginner').find((f) => f.key === 'changes').min_rows).toBe(1);
  });
  it('خطة القياس والأدلة: حقل واحد للتأسيسي «كيف ستعرف أنك نجحت؟»، وحقولها القائمة من المتوسط', () => {
    const m = by(after)['evidence-plan'];
    expect(m.min_level).toBe('beginner');
    expect(keys(m, 'beginner', 'project', true)).toEqual(['success_signal']);
    expect(m.fields[0]).toMatchObject({ key: 'success_signal', label: 'كيف ستعرف أنك نجحت؟', required: false });
    expect(req(m, 'beginner', NEW)).toEqual(['success_signal']);
    expect(req(m, 'beginner', OLD)).toEqual([]);
    expect(keys(m, 'intermediate')).toEqual(['success_signal', ...keys(by(before)['evidence-plan'], 'intermediate')]);
    expect(req(m, 'intermediate', OLD)).toEqual(req(by(before)['evidence-plan'], 'intermediate'));
  });
  it('الموارد والتكلفة: التأسيسي ثلاثة (البنود، والميزانية، ومصدر التمويل)، والاحتياطي من المتوسط', () => {
    const m = by(after)['cost-plan'];
    expect(keys(m, 'beginner')).toEqual(['items', 'envelope', 'funding']);
    expect(keys(m, 'intermediate')).toEqual(['items', 'envelope', 'contingency', 'funding']);
    expect(keys(m, 'advanced')).toEqual(['items', 'envelope', 'contingency', 'funding', 'cba']);
  });
  it('الشراء وخريطة الطريق والحوكمة وخطة التطوير القيادي من المتوسط', () => {
    const A = by(after);
    for (const k of ['procurement', 'roadmap', 'governance', 'development-plan']) expect(A[k].min_level, k).toBe('intermediate');
    const mine = capstoneModels(after, same('beginner'), 'project').map((m) => m.key);
    expect(mine).toHaveLength(13);
    for (const k of ['procurement', 'roadmap', 'governance', 'development-plan', 'wbs', 'stage-gate', 'portfolio-review']) expect(mine).not.toContain(k);
    expect(capstoneModels(after, same('intermediate'), 'project')).toHaveLength(19 - 1); // خريطة الطريق لنطاق البرنامج
    expect(capstoneModels(after, same('intermediate'), 'program').map((m) => m.key)).toContain('roadmap');
  });
  it('حقلان للاحترافي وحده: المسار الحرج والاعتماديات، والتحالفات وتحريك المعارضين', () => {
    const A = by(after);
    for (const [k, f] of [['milestone-register', 'critical_path'], ['stakeholder-map', 'coalitions']]) {
      expect(keys(A[k], 'advanced'), k).toContain(f);
      expect(keys(A[k], 'intermediate'), k).not.toContain(f);
      const ks = A[k].fields.map((x) => x.key);
      expect(ks.indexOf(f), k).toBe(ks.indexOf('track_depth') - 1);
    }
  });
  it('بطاقة المبادرة: المطلوب أولًا ثم «تعمّق إن شئت»، بالحقول نفسها', () => {
    const b = by(before)['initiative-charter'].fields, a = by(after)['initiative-charter'].fields;
    expect(a.map((f) => f.key).sort()).toEqual(b.map((f) => f.key).sort());
    const opt = a.map(optGroup);
    // الراعي اختياري لكل أحد (قرار المالك 2026-11-14، وأكده 2026-11-24)، تحت «تعمّق إن شئت»
    expect(a.find((f) => f.key === 'sponsor')).toEqual(b.find((f) => f.key === 'sponsor'));
    expect(optGroup(a.find((f) => f.key === 'sponsor'))).toBe(true);
    for (const since of [OLD, NEW]) expect(req(by(after)['initiative-charter'], 'beginner', since)).not.toContain('sponsor');
    expect(opt.indexOf(true)).toBeGreaterThan(0);
    expect(opt.slice(opt.indexOf(true)).every(Boolean)).toBe(true);
    expect(a.filter((f) => f.group)).toEqual([expect.objectContaining({ key: a[opt.indexOf(true)].key, group: 'تعمّق إن شئت' })]);
    // الترتيب داخل كل مجموعة كما كان
    const order = (list, o) => list.filter((f) => optGroup(f) === o).map((f) => f.key);
    expect([...order(a, false), ...order(a, true)]).toEqual(a.map((f) => f.key));
    const pos = (k) => b.findIndex((f) => f.key === k);
    for (const o of [true, false]) { const ks = order(a, o); expect([...ks].sort((x, y) => pos(x) - pos(y))).toEqual(ks); }
  });
});

describe('العمود الفقري: كل سؤال من العشرة له حقل مطلوب ظاهر في كل مستوى (لمن يبدأ بعد الترحيل)', () => {
  // المصادر من المصفوفة §1: فصل وحقل؛ يكفي واحد مطلوب ظاهر. الأسئلة 5 و9 و10 من المصدر الذي أضافته المصفوفة للتأسيسي
  // (سطر النجاح، خريطة أصحاب المصلحة، تقرير الأثر)، فلو عاد أحدها اختياريًا لمن يبدأ لسقط الاختبار
  const SPINE = {
    'ما المشكلة ولمن؟': [['initiative-charter', 'problem']],
    'ما الهدف وما المخرجات؟': [['initiative-charter', 'objective'], ['initiative-charter', 'deliverables']],
    'لماذا هذا الحل لا غيره؟': [['options-analysis', 'options'], ['options-analysis', 'recommendation']],
    'كيف يحدث التغيير؟': [['theory-of-change', 'chain']],
    'ما المنفعة وكيف تُقاس؟': [['evidence-plan', 'success_signal'], ['evidence-plan', 'plan']],
    'متى وبأي خطوات؟': [['milestone-register', 'milestones'], ['schedule', 'activities']],
    'بأي موارد وكلفة؟': [['cost-plan', 'items']],
    'ما المخاطر وكيف تُعالج؟': [['raid', 'items']],
    'من يقرر ومن يشارك؟': [['stakeholder-map', 'stakeholders']],
    'ماذا تحقق وماذا يبقى؟': [['impact-report', 'changes']],
  };
  it.each(COMBOS.map((c) => [Object.values(c).join('/'), c]))('%s', (_, levels) => {
    const mine = Object.fromEntries(capstoneModels(after, levels, 'project').map((m) => [m.key, m]));
    for (const [q, src] of Object.entries(SPINE)) {
      const ok = src.some(([k, f]) => mine[k] && fieldsFor(mine[k].fields, levels[mine[k].dimension], 'project', false, null, false, NEW).some((x) => x.key === f && x.required !== false));
      expect(ok, q).toBe(true);
    }
  });
});

describe('الهرم', () => {
  it('لا فصل يُنقص حقلًا أو إلزامًا مع ارتفاع المستوى', () => {
    for (const m of after) for (const scope of ['project', 'program', 'portfolio']) for (const primary of [false, true]) for (const since of [OLD, NEW]) {
      for (let i = 1; i < LV.length; i++) {
        const lo = fieldsFor(m.fields, LV[i - 1], scope, primary, null, false, since), hi = fieldsFor(m.fields, LV[i], scope, primary, null, false, since);
        const hk = hi.map((f) => f.key);
        expect(lo.every((f) => hk.includes(f.key)), `${m.key} ${LV[i - 1]}→${LV[i]}`).toBe(true);
        for (const f of lo.filter((x) => x.required !== false)) expect(hi.find((x) => x.key === f.key).required, `${m.key}.${f.key}`).not.toBe(false);
      }
    }
  });
  it('كل فصل يظهر لمستوى دون الاحترافي له حقل للاحترافي وحده', () => {
    // مستثنى بقرار مسمّى: خريطة الطريق (نطاق برنامج، بلا حقل احترافي قبل المصفوفة ولم تضف له)، وتقرير الأثر (المصفوفة:
    // «✓ + حقل المسار» للاحترافي، وحقل المسار احترافي فيه لكنه لمحور الأولوية وحده)
    const EXEMPT = new Set(['roadmap', 'impact-report']);
    const doc = after.filter((m) => m.capstone_sort != null && m.min_level !== 'advanced' && !EXEMPT.has(m.key));
    expect(doc.length).toBeGreaterThanOrEqual(17);
    for (const m of doc) expect(m.fields.some((f) => f.min_level === 'advanced' && !f.track), m.key).toBe(true);
    expect(by(after)['impact-report'].fields.find((f) => f.track)).toMatchObject({ min_level: 'advanced' });
  });
});

// إجابات تملأ ما يراه المشارك: كل الحقول، أو المطلوب وحده، أو نصف الفصول
const TEXT = 'إجابة كاملة لها معنى واضح في سياق المبادرة';
const valueFor = (f) => (f.type === 'table' ? Array.from({ length: Math.max(f.min_rows || 1, 3) }, (_, i) => (f.columns || ['x']).map((c, j) => (j === 0 ? `R${i + 1}` : /الاحتمال|الأثر|الوزن|الكمية|سعر|التكلفة/.test(c) ? '2' : TEXT)))
  : f.type === 'select' ? (f.options || ['نعم'])[0] : f.key === 'envelope' ? '100000' : f.key === 'contingency' ? '10' : TEXT);
function stateOf(models, levels, subs, priority = null, since = OLD) {
  const kept = answeredModels(subs);
  const subBy = Object.fromEntries(subs.map((s) => [s.model_id, s]));
  const sections = capstoneModels(models, levels, 'project', kept).map((m) => {
    const sub = subBy[m.id];
    const fields = modelFields(m, levels, 'project', priority, sub?.answers || null, since);
    return { key: m.key, model: m, fields, answers: sub?.answers || {}, state: sectionState(m, fields, sub) };
  });
  const checks = capstoneChecks({ scope: 'project', models: Object.fromEntries(sections.map((s) => [s.key, { ...s.model, fields: s.fields }])), answers: Object.fromEntries(sections.map((s) => [s.key, s.answers])) });
  return { sections, readiness: readiness(sections.map((s) => s.state), checks) };
}
function answersBefore(levels, pick, priority) {
  return capstoneModels(before, levels, 'project').map((m, i) => {
    if (pick === 'half' && i % 2) return null;
    const fs = fieldsFor(m.fields, levels[m.dimension], 'project', m.dimension === priority).filter((f) => pick !== 'required' || f.required !== false);
    return { model_id: m.id, answers: Object.fromEntries(fs.map((f) => [f.key, valueFor(f)])) };
  }).filter(Boolean);
}

describe('عدم تراجع الجاهزية لمن بدأ قبل الترحيل: ما اكتمل يبقى مكتملًا، والجاهزية كما هي', () => {
  for (const pick of ['all', 'required', 'half']) {
    it(`${pick}: لكل تركيبة من الـ27 وكل محور أولوية`, () => {
      for (const levels of COMBOS) for (const priority of [null, ...DIMS]) {
        const subs = answersBefore(levels, pick, priority);
        const b = stateOf(before, levels, subs, priority), a = stateOf(after, levels, subs, priority);
        const tag = `${pick} ${Object.values(levels).join('/')} ${priority}`;
        for (const s of b.sections.filter((x) => x.state.complete)) {
          expect(a.sections.find((x) => x.key === s.key)?.state.complete, `${tag} ${s.key}`).toBe(true);
        }
        // الفصل الباقي بقاعدة «لا فقد» والفصل الجديد بلا حقل مطلوب لا يُحسبان، فلا تتضخم الجاهزية: هي نفسها حين كُتب في
        // كل فصل كان ظاهرًا، ولا تقل حين بقي فصل فارغ أُخفي (كان ناقصًا فخرج من الحساب)
        if (pick === 'half') expect(a.readiness, tag).toBeGreaterThanOrEqual(b.readiness);
        else expect(a.readiness, tag).toBe(b.readiness);
        // لا إجابة تضيع: كل ما كُتب في فصل ظاهر قبله ما زال ظاهرًا في وثيقته
        for (const sub of subs) {
          const sec = a.sections.find((x) => x.model.id === sub.model_id);
          expect(sec, `${tag} ${sub.model_id}`).toBeTruthy();
          for (const k of Object.keys(sub.answers)) expect(sec.fields.some((f) => f.key === k), `${tag} ${sec.key}.${k}`).toBe(true);
        }
      }
    });
  }
});

describe('قاعدة «لا فقد»', () => {
  const fields = [
    { key: 'a', type: 'textarea', label: 'أ', required: true },
    { key: 'b', type: 'textarea', label: 'ب', required: true, min_level: 'intermediate' },
    { key: 't', type: 'table', label: 'ت', columns: ['س'], required: true, min_level: 'advanced' },
    { key: 'r', type: 'textarea', label: 'ر', required: false, required_from: 'advanced' },
  ];
  it('حقل رُفع مستواه وكتب فيه المشارك يبقى ظاهرًا غير مطلوب؛ والفارغ لا يظهر', () => {
    expect(fieldsFor(fields, 'beginner').map((f) => f.key)).toEqual(['a', 'r']);
    const kept = fieldsFor(fields, 'beginner', null, false, { b: 'ما كتبه قبل الترحيل', t: [['', 'خلية']] });
    expect(kept.map((f) => f.key)).toEqual(['a', 'b', 't', 'r']);
    expect(kept.find((f) => f.key === 'b')).toMatchObject({ required: false, kept: true });
    expect(fieldsFor(fields, 'beginner', null, false, { b: '  ', t: [['', '']] }).map((f) => f.key)).toEqual(['a', 'r']);
    // الحفظ التالي لا يحذفه
    expect(cleanAnswers(kept, { b: 'ما كتبه قبل الترحيل' }).b).toBe('ما كتبه قبل الترحيل');
  });
  it('required_from: ظاهر لمن دونه اختياريًا، ومطلوب منه فأعلى', () => {
    expect(fieldsFor(fields, 'intermediate').find((f) => f.key === 'r').required).toBe(false);
    expect(fieldsFor(fields, 'advanced').find((f) => f.key === 'r').required).toBe(true);
    expect(missingFields(fieldsFor(fields, 'beginner'), {})).toEqual(['أ']);
  });
  it('فصل رُفع مستواه وكتب فيه المشارك يبقى في قائمته ووثيقته، وكله غير مطلوب', () => {
    const gov = by(after).governance;
    const levels = same('beginner');
    expect(capstoneModels(after, levels, 'project').map((m) => m.key)).not.toContain('governance');
    const subs = [{ model_id: gov.id, answers: { structure: 'اللجنة التوجيهية تقرر' } }, { model_id: by(after).raid.id, answers: { items: [] } }];
    const kept = answeredModels(subs);
    expect([...kept]).toEqual([gov.id]);
    expect(capstoneModels(after, levels, 'project', kept).map((m) => m.key)).toContain('governance');
    expect(modelsFor(after, levels, 'project', kept).map((m) => m.key)).toContain('governance');
    expect(keptModel(gov, levels)).toBe(true);
    expect(keptModel(gov, same('intermediate'))).toBe(false);
    const fs = modelFields(gov, levels, 'project', null, subs[0].answers);
    expect(fs.length).toBeGreaterThan(0);
    expect(fs.every((f) => f.required === false)).toBe(true);
    expect(missingFields(fs, subs[0].answers)).toEqual([]);
    // ناقص بحقوله الأصلية: لا يُحسب في الجاهزية مكتملًا ولا ناقصًا. ومكتمل بها: يُحسب مكتملًا كما كان
    expect(sectionState(gov, fs, subs[0]).counted).toBe(false);
    const full = Object.fromEntries(fieldsFor(gov.fields, 'intermediate', 'project').filter((f) => f.required !== false).map((f) => [f.key, f.type === 'table' ? Array.from({ length: f.min_rows || 1 }, () => (f.columns || ['x']).map(() => 'قيمة مكتوبة كاملة هنا')) : 'إجابة كاملة لها معنى واضح']));
    const fsFull = modelFields(gov, levels, 'project', null, full);
    expect(sectionState(gov, fsFull, { answers: full })).toMatchObject({ complete: true, counted: true });
    expect(readiness([{ complete: true, counted: false }, { complete: false }], [])).toBe(50);
    // بلا مستوى معتمد في البُعد لا يظهر شيء (المنهج مقفل قبل الاعتماد)
    expect(modelsFor(after, {}, 'project', kept)).toEqual([]);
  });
});

describe('مسوّغات المبادرة بلا فصلي الشراء والحوكمة (التأسيسي)', () => {
  const doc = {
    sections: [
      { key: 'initiative-charter', fields: [{ key: 'sponsor', type: 'text', value: 'مدير الإدارة: يعتمد البدء' }] },
      { key: 'cost-plan', fields: [
        { key: 'items', type: 'table', columns: ['رمز الحزمة', 'البند', 'الكمية', 'سعر الوحدة', 'الإجمالي'], value: [['1', 'قاعة تدريب', '1', '500', ''], ['2', 'مواد مطبوعة', '20', '10', '']] },
        { key: 'funding', type: 'textarea', value: 'تبرع من جمعية الحي' },
      ] },
    ],
  };
  it('سؤال البعد التجاري يُجاب من «الموارد والتكلفة»، و«من يقرر» من البطاقة: لا بعد غائب', () => {
    const c = Object.fromEntries(businessCase(doc).map((x) => [x.key, x]));
    expect(c.commercial.missing).toBeNull();
    expect(c.commercial.points).toEqual([['ما تحتاجه المبادرة', 'قاعة تدريب؛ مواد مطبوعة'], ['من يوفره', 'تبرع من جمعية الحي']]);
    expect(c.management.points).toContainEqual(['من يقرر', 'مدير الإدارة: يعتمد البدء']);
    const st = Object.fromEntries(caseStatus([{ key: 'cost-plan', complete: true }]).map((x) => [x.key, x]));
    expect(st.commercial).toMatchObject({ state: 'done', total: 1 });
  });
  it('ومع فصل الشراء يبقى مصدره هو', () => {
    const withProc = { sections: [...doc.sections, { key: 'procurement', fields: [{ key: 'need', type: 'select', value: 'لا، تُنفَّذ بموارد الجهة' }] }] };
    const c = Object.fromEntries(businessCase(withProc).map((x) => [x.key, x]));
    expect(c.commercial.points).toEqual([['الحاجة إلى الشراء', 'لا، تُنفَّذ بموارد الجهة']]);
    expect(caseStatus([{ key: 'procurement', complete: false }, { key: 'cost-plan', complete: true }]).find((x) => x.key === 'commercial')).toMatchObject({ state: 'todo', total: 1 });
  });
});

describe('الاحتياطي من المتوسط: وثيقة بلا احتياطي لا تقول «مع الاحتياطي 0%»', () => {
  const items = { key: 'items', type: 'table', columns: ['رمز الحزمة', 'البند', 'الكمية', 'سعر الوحدة', 'الإجمالي'] };
  const answers = { items: [['1', 'قاعة', '1', '1000', '']], envelope: '5000', contingency: '10' };
  it('لا يُحسب احتياطي ليس حقله من حقول المشارك، والعناوين بلا «مع الاحتياطي»', () => {
    const c = costSummary({ fields: [items, { key: 'envelope' }] }, answers);
    expect(c).toMatchObject({ total: 1000, contingency: 0, withContingency: 1000 });
    expect(costLabel(c)).toBe('التكلفة');
    expect(costSummary({ fields: [items, { key: 'contingency' }] }, answers).contingency).toBe(10);
    const doc = { cost: c, sections: [{ key: 'cost-plan', fields: [] }] };
    const fin = businessCase(doc).find((x) => x.key === 'financial').points.map(([k]) => k);
    expect(fin).not.toContain('الاحتياطي');
    expect(fin).not.toContain('التكلفة مع الاحتياطي');
    const chk = capstoneChecks({ models: { 'cost-plan': { fields: [items, { key: 'envelope' }] } }, answers: { 'cost-plan': answers } }).find((x) => x.key === 'cost-envelope');
    expect(chk.title).toBe('التكلفة ضمن الموازنة المتاحة');
  });
});

describe('محرر النماذج في اللوحة يحفظ خصائص المصفوفة ذهابًا وإيابًا', () => {
  it('حفظ كل فصل كما هو بعد الترحيل لا يُسقط شيئًا مما تقرؤه fieldsFor', () => {
    const KEYS = ['key', 'label', 'type', 'required', 'min_level', 'required_from', 'required_after', 'group', 'min_rows', 'min_rows_beginner', 'track', 'scopes', 'bind', 'columns', 'options', 'import'];
    const pick = (f) => Object.fromEntries(KEYS.filter((k) => f[k] !== undefined).map((k) => [k, f[k]]));
    for (const m of after) {
      const once = cleanModelFieldsOf(m.fields);
      expect(once.map(pick), m.key).toEqual(m.fields.map(pick));
      expect(cleanModelFieldsOf(once), m.key).toEqual(once);
    }
    const a = by(after);
    for (const [k, f, p] of [['impact-report', 'changes', 'required_after'], ['impact-report', 'changes', 'required_from'], ['impact-report', 'changes', 'min_rows_beginner'],
      ['evidence-plan', 'success_signal', 'required_after'], ['milestone-register', 'critical_path', 'required_after']]) {
      const v = a[k].fields.find((x) => x.key === f)[p];
      expect(v, `${k}.${f}.${p}`).toBeTruthy();
      expect(cleanModelFieldsOf(a[k].fields).find((x) => x.key === f)[p], `${k}.${f}.${p}`).toBe(v);
    }
    expect(cleanModelFieldsOf(a['initiative-charter'].fields).filter((x) => x.group).map((x) => x.group)).toEqual(['تعمّق إن شئت']);
    // ما تحسبه fieldsFor للمشارك لا يُخزَّن، والتاريخ غير الصالح لا يُكتب
    expect(cleanModelFieldsOf([{ key: 'x', label: 'س', type: 'text', kept: true, kept_req: true, required_after: 'ليس تاريخًا' }])[0]).toEqual({ key: 'x', label: 'س', type: 'text', hint: '', required: true });
  });
});

describe('من بدأ قبل الترحيل يبقى كذلك بعد إعادة الاعتماد أو تغيير المستوى', () => {
  const CUT = '2026-11-28T12:00:00Z';
  const f = [{ key: 'x', type: 'textarea', label: 'س', required: false, required_after: CUT }];
  const pl = (at) => DIMS.map((dimension) => ({ dimension, level: 'beginner', approved_at: at }));
  const reqFor = (a) => fieldsFor(f, 'beginner', null, false, null, false, a.since)[0].required;
  it('إعادة الاعتماد تُبقي approved_at لبُعد لم يتغير مستواه', () => {
    const src = read('supabase/functions/leaders-api/admin.ts');
    expect(src).toContain('approved_at: old?.approved_at && !changed ? old.approved_at : now');
  });
  it('تغيير المستوى أو الاعتماد الجماعي بعد الترحيل لا يجعله «جديدًا»: أول قيد اعتماد أو أول تسليم يحسم', () => {
    // كل التسكينات أُعيد اعتمادها بعد الترحيل (تغيّر المستوى في الأبعاد الثلاثة)
    const re = pl('2026-12-05T09:00:00Z');
    expect(reqFor(approvalOf(re))).toBe(true);
    expect(reqFor(approvalOf(re, ['2026-11-10T08:00:00Z']))).toBe(false); // أول placement.approve في سجل التدقيق
    expect(reqFor(approvalOf(re, [null, '2026-11-20T08:00:00Z']))).toBe(false); // أول تسليم نموذج
    // بُعد واحد تغيّر بعده والباقيان على اعتمادهما الأول
    expect(reqFor(approvalOf(pl('2026-11-01T00:00:00Z').map((x, i) => (i ? x : { ...x, approved_at: '2026-12-05T09:00:00Z' }))))).toBe(false);
    // من بدأ بعده فعلًا مطلوب منه
    expect(reqFor(approvalOf(pl('2026-12-01T00:00:00Z'), ['2026-12-01T00:00:00Z']))).toBe(true);
    // أدلة غير صالحة لا تُحسب، ولا since قبل اعتماد المسار كاملًا
    expect(approvalOf(re, ['ليس وقتًا']).since).toBe('2026-12-05T09:00:00.000Z');
    expect(approvalOf(re.slice(0, 2), ['2026-11-10T08:00:00Z']).since).toBeNull();
  });
  it('الخادم يقرأ الأدلة في ملف المشارك والوثيقة', () => {
    expect(read('supabase/functions/leaders-api/participant.ts')).toMatch(/approvalOf\(must\(pl\) \?\? \[\], earlier\)/);
    expect(read('supabase/functions/leaders-api/capstone.ts')).toContain('approvalOf(pl, earlier)');
  });
});

describe('الفصل الاختياري في الواجهة: لا «مكتمل» ولا حساب في الاكتمال', () => {
  const secs = [{ id: 1, complete: true }, { id: 2, complete: true, optional: true }, { id: 3, complete: false }, { id: 4, complete: true, optional: true, status: 'returned' }];
  it('chapterTone وnextChapter وcountedChapters', () => {
    expect(secs.map(chapterTone)).toEqual(['ok', 'opt', 'idle', 'bad']);
    expect(countedChapters(secs).map((s) => s.id)).toEqual([1, 3]);
    expect(nextChapter(secs.slice(0, 3)).id).toBe(3);
    expect(nextChapter([{ id: 9, complete: true, optional: true }])).toBeNull();
  });
  it('الخادم يرسل optional من counted، والواجهتان تقرآنه', () => {
    expect(read('supabase/functions/leaders-api/capstone.ts')).toContain('optional: s.state.counted === false,');
    expect(read('leaders-app/src/screens/Capstone.jsx')).toContain("d.sections.filter((s) => !s.optional)");
    expect(read('admin-app/src/screens/Capstones.jsx')).toContain("x.optional ? 'اختياري'");
  });
  it('الجاهزية: كل الفصول غير محسوبة يعني نصف الفصول صفرًا لا كاملًا', () => {
    expect(readiness([{ complete: true, counted: false }], [])).toBe(50);
    expect(readiness([{ complete: true, counted: false }], [{ ok: false }])).toBe(0);
  });
});

// ── المرحلة 4: المستشار والمراجع يريان مستوى الوثيقة وموقع كل فصل منه ──
// الوثيقة كما يبنيها الخادم (capstone.ts build): الفصول بحقولها وحالتها وموقعها من مستواها
const built = (levels, answered = {}, since = NEW) => capstoneModels(after, levels, 'project', new Set(Object.keys(answered))).map((m) => {
  const answers = answered[m.id] || {};
  const fields = modelFields(m, levels, 'project', null, answers, since);
  const state = sectionState(m, fields, { answers });
  return { model: m, fields, state, chapter: chapterLevel(m, fields, state, levels, levels) };
});

describe('المرحلة 4: موقع الفصل من مستوى الوثيقة', () => {
  it('لكل فصل مستواه في إطاره، وموقعه من قاعدة الجاهزية نفسها، ومعيار مستواه من المعيار نفسه', () => {
    for (const lv of LV) for (const s of built(same(lv))) {
      expect(s.chapter.level, s.model.key).toBe(lv);
      expect(s.chapter.standing, s.model.key).toBe(s.state.counted === false ? 'optional' : 'required');
      expect(s.chapter.criteria.length, s.model.key).toBeGreaterThan(0);
      for (const c of s.chapter.criteria) expect(c.anchor).toBeTruthy();
    }
    // المعيار بمستوى الإطار: مرساة التأسيسي غير مرساة الاحترافي
    const b = built(same('beginner')).find((s) => s.model.key === 'benefits-register').chapter.criteria;
    const a = built(same('advanced')).find((s) => s.model.key === 'benefits-register').chapter.criteria;
    expect(b.map((c) => c.anchor)).not.toEqual(a.map((c) => c.anchor));
  });
  it('الفصل الباقي بقاعدة «لا فقد» يُعلَّم «باقٍ» لا «اختياري»', () => {
    const gov = after.find((m) => m.key === 'governance');
    const f = gov.fields.find((x) => x.type !== 'table');
    const s = built(same('beginner'), { [gov.id]: { [f.key]: 'نص كتبه المشارك قبل أن يُرفع مستوى الفصل عن مستواه' } }).find((x) => x.model.key === 'governance');
    expect(s.chapter.standing).toBe('kept');
    expect(CHAPTER_STANDING_AR[s.chapter.standing]).toContain('باقٍ');
  });
});

// ── المرحلة 5: قراءة أخف للتأسيسي دون حذف سؤال ──
// الوثيقة كما تصل القالب (docFor): الفصل بمستواه، وكل حقل بقيمة صالحة
const sample = (f) => (f.type === 'table' ? [(f.columns || ['أ']).map((c, i) => `${c} ${i + 1} قيمة واضحة`)] : `${f.label}: نص واضح كتبه القائد عن مبادرته بتفصيل كاف`);
// كما يبنيها docOf في capstone.ts: التجميع يُحسب من المستويات (displayJoins) ويصل تلميحًا محايدًا joins، بلا مستوى
const docOf = (levels, answered = {}) => {
  const b = built(levels, answered);
  const joins = displayJoins(b.map((s) => ({ key: s.model.key, dimension: s.model.dimension })), levels);
  return {
    meta: { status: 'draft', status_title: 'مسودة', level: levels.impact, initiative: 'مبادرة للاختبار', ref: 'MI-CP-TEST0001', version: 1 },
    summary: '', checks: [], rubric: [],
    sections: b.map((s) => ({ key: s.model.key, title: s.model.title_ar, dimension: s.model.dimension, optional: s.state.counted === false,
      ...(joins[s.model.key] ? { joins: joins[s.model.key] } : {}),
      fields: s.fields.map((f) => ({ key: f.key, label: f.label, type: f.type, columns: f.columns || null, value: sample(f) })) })),
  };
};

describe('المرحلة 5: صفحات العرض للتأسيسي', () => {
  it('العمود الفقري قبل التجميع وبعده: التجميع لا يمس الحقول ولا إلزامها (عرض وحده)', () => {
    for (const levels of COMBOS) {
      const secs = docOf(levels).sections;
      const pages = displayPages(secs);
      expect(pages.flat().map((s) => s.key).sort(), Object.values(levels).join('/')).toEqual(secs.map((s) => s.key).sort());
      expect(pages.flat().flatMap((s) => s.fields.map((f) => `${s.key}.${f.key}`)).sort()).toEqual(secs.flatMap((s) => s.fields.map((f) => `${s.key}.${f.key}`)).sort());
    }
  });
  it('التأسيسي: الأزواج الخمسة كل زوج في صفحة، فالوثيقة في 8 صفحات بدل 13', () => {
    const secs = docOf(same('beginner')).sections;
    const pages = displayPages(secs);
    expect(pages.length).toBe(secs.length - DISPLAY_PAIRS.length);
    expect(pages.length).toBe(8);
    for (const p of DISPLAY_PAIRS) expect(pages.find((x) => x[0].key === p.host).map((s) => s.key)).toEqual([p.host, p.joins]);
  });
  it('المتوسط والاحترافي كما هما: صفحة لكل فصل، وإطار بمستوى أعلى لا يُجمع', () => {
    for (const lv of ['intermediate', 'advanced']) {
      const secs = docOf(same(lv)).sections;
      expect(displayPages(secs).every((p) => p.length === 1)).toBe(true);
    }
    // المنافع وخطة القياس ونظرية التغيير من إطار الأثر: أثر متوسط مع معالم وقيادة تأسيسيين يجمع ما في إطاريهما وحدهما
    // (المعالم مع الجدول، والموارد مع المخاطر، والاستدامة مع قصة التحول، تخفيف وثيقة المبادرة للتأسيسي، المرحلة 4)
    const mixed = docOf({ milestone: 'beginner', impact: 'intermediate', leadership: 'beginner' }).sections;
    expect(displayPages(mixed).filter((p) => p.length === 2).map((p) => p[0].key)).toEqual(['milestone-register', 'cost-plan', 'change-sustain']);
  });
  it('ملف العمل يطبع الصفحة المجمّعة بعنوانيها، وكل حقل بعنوانه، ومرساة لكل فصل', () => {
    const d = docOf(same('beginner'));
    const { body } = capstoneReport(d);
    for (const p of DISPLAY_PAIRS) {
      const [h, j] = [p.host, p.joins].map((k) => d.sections.find((s) => s.key === k));
      expect(body).toContain(`${h.title} و${j.title}`);
      expect(body).toContain(`id="ch-${j.key}"`);
      for (const f of j.fields) expect(body).toContain(f.label);
    }
    // المتوسط بلا تجميع
    expect(capstoneReport(docOf(same('intermediate'))).body).not.toContain('class="cp-join"');
  });
});

describe('ملحق مستوى الوثيقة: للمراجع وحده', () => {
  const review_levels = { level: 'beginner', chapters: [{ key: 'raid', title: 'سجل المخاطر', level: 'beginner', standing: 'kept', standing_title: CHAPTER_STANDING_AR.kept, kept_fields: 0, criteria: [{ key: 'risk', title: 'المخاطر والتغيير', anchor: 'مرساة' }] }] };
  it('يُطبع حين تحمله الوثيقة، ولا يُطبع لغيرها', () => {
    const d = docOf(same('beginner'));
    expect(levelAnnex(d)).toBe('');
    const html = levelAnnex({ ...d, review_levels });
    expect(html).toContain('مستوى الوثيقة وموقع كل فصل منه');
    expect(html).toContain(CHAPTER_STANDING_AR.kept);
    expect(capstoneReport({ ...d, review_levels }).body).toContain('id="ch-levels"');
    // القارئ الخارجي (الراعي والجهة) لا يراه ولو حمله
    expect(renderInitiative({ ...d, review_levels }, 'external').body).not.toContain('ch-levels');
  });
});

describe('المستوى لا يصل من لم يُؤذن له، والمعتمدة القديمة بتخطيطها', () => {
  let d;
  beforeAll(() => { d = docOf(same('beginner')); });
  const levelIn = (doc) => (doc.sections || []).some((x) => 'level' in x || 'joins' in x) || doc.meta?.level != null || doc.meta?.profile != null;
  it('الوثيقة نفسها لا تحمل مستوى فصل، والتلميح وحده على التابع', () => {
    expect(d.sections.some((x) => 'level' in x)).toBe(false);
    expect(d.sections.filter((x) => x.joins).map((x) => `${x.key}>${x.joins}`).sort()).toEqual(DISPLAY_PAIRS.map((p) => `${p.joins}>${p.host}`).sort());
  });
  it('docLevelsFor وpublicDoc بلا إذن: لا مستوى ولا تلميح؛ وبالإذن كما هي', () => {
    const leaky = { ...d, sections: d.sections.map((x) => ({ ...x, level: 'beginner' })) };
    expect(levelIn(docLevelsFor(leaky, false))).toBe(false);
    expect(levelIn(publicDoc(leaky, { show_levels: false }))).toBe(false);
    expect(publicDoc(d, { show_levels: true }).sections.some((x) => x.joins)).toBe(true);
  });
  it('لقطة الاعتماد وما يُجمَّد منها بلا مستوى فصل', () => {
    const issued = freezeIssued(d);
    expect((issued.sections || []).some((x) => 'level' in x)).toBe(false);
  });
  it('لقطة معتمدة قبل التغيير (بلا تلميح) لا تُجمع ولو كان مستواها العام تأسيسيًا', () => {
    const old = { ...d, meta: { ...d.meta, status: 'approved', level: 'beginner' }, sections: d.sections.map(({ joins: _j, ...x }) => x) };
    expect(displayPages(old.sections).every((p) => p.length === 1)).toBe(true);
    expect(capstoneReport(old).body).not.toContain('class="cp-join"');
  });
});

describe('مسوّغات المبادرة تحيل برقم الصفحة بعد التجميع', () => {
  it('فصل الشراء الباقي بقاعدة «لا فقد» يُحال إليه برقم صفحته', () => {
    const pr = after.find((m) => m.key === 'procurement');
    const table = pr.fields.find((f) => f.type === 'table');
    const row = (table.columns || ['أ']).map((c, i) => `${c} ${i + 1} قيمة واضحة`);
    const yes = (f) => (f.options || []).find((o) => String(o).startsWith('نعم')) || (f.options || [])[0];
    const filledPr = Object.fromEntries(pr.fields.map((f) => [f.key, f.type === 'table' ? [row] : f.type === 'select' ? yes(f) : 'نص واضح كتبه القائد عن الشراء والتعاقد بتفصيل كاف']));
    const d = docOf(same('beginner'), { [pr.id]: filledPr });
    const prSec = d.sections.find((x) => x.key === 'procurement');
    for (const f of prSec.fields) if (f.type === 'select') f.value = yes(pr.fields.find((y) => y.key === f.key));
    expect(d.sections.some((x) => x.key === 'procurement')).toBe(true);
    const pages = displayPages(d.sections);
    const no = pages.findIndex((p) => p.some((x) => x.key === 'procurement')) + 1;
    const body = capstoneReport(d).body;
    const m = body.match(/<a href="#ch-procurement">الفصل (\d+) «/);
    expect(m, "إحالة مسوّغات المبادرة إلى فصل الشراء").toBeTruthy();
    expect(Number(m[1])).toBe(no);
    // رقم الصفحة في المتن نفسه
    expect(body).toContain(`${no}. ${pr.title_ar}`);
    expect(no).toBeLessThan(d.sections.findIndex((x) => x.key === 'procurement') + 1);
  });
});
