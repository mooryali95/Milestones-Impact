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
import { answeredModels, cleanAnswers, fieldsFor, keptModel, missingFields, modelsFor } from '../../supabase/functions/leaders-api/logic.js';
import { capstoneChecks, capstoneModels, modelFields, readiness, sectionState } from '../../supabase/functions/leaders-api/capstone.js';
import { businessCase, caseStatus } from '../../supabase/functions/leaders-api/business-case.js';

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
const req = (m, lv, scope = 'project') => fieldsFor(m.fields, lv, scope, false).filter((f) => f.required !== false).map((f) => f.key);
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
    for (const k of Object.keys(rows)) expect({ min_level: rows[k].min_level, fields: rows[k].fields }, k).toEqual({ min_level: A[k].min_level, fields: A[k].fields });
    expect(Object.keys(rows).some((k) => EIGHT.includes(k))).toBe(false);
  });
  it('لا يحذف حقلًا ولا يغيّر مفتاحًا أو عنوانًا أو نوعًا: يضيف ويضبط المستوى والإلزام والترتيب فقط', () => {
    const B = by(before);
    for (const m of after) {
      const old = B[m.key];
      for (const f of old.fields) {
        const n = m.fields.find((x) => x.key === f.key);
        expect(n, `${m.key}.${f.key}`).toBeTruthy();
        expect({ label: n.label, type: n.type, columns: n.columns, required: n.required }, `${m.key}.${f.key}`).toEqual({ label: f.label, type: f.type, columns: f.columns, required: f.required });
      }
      const added = m.fields.filter((f) => !old.fields.some((x) => x.key === f.key));
      for (const f of added) expect(f.required, `${m.key}.${f.key} جديد فلا يُطلب`).toBe(false);
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
    // مطلوب كما كان للاحترافي وحده، واختياري لمن فُتح له الفصل الآن
    expect(req(m, 'advanced')).toEqual(['program', 'changes', 'contribution', 'not_achieved', 'lessons']);
    expect(req(m, 'beginner')).toEqual([]);
    expect(req(m, 'intermediate')).toEqual([]);
    expect(fieldsFor(m.fields, 'beginner').find((f) => f.key === 'changes').min_rows).toBe(1);
  });
  it('خطة القياس والأدلة: حقل واحد للتأسيسي «كيف ستعرف أنك نجحت؟»، وحقولها القائمة من المتوسط', () => {
    const m = by(after)['evidence-plan'];
    expect(m.min_level).toBe('beginner');
    expect(keys(m, 'beginner', 'project', true)).toEqual(['success_signal']);
    expect(m.fields[0]).toMatchObject({ key: 'success_signal', label: 'كيف ستعرف أنك نجحت؟', required: false });
    expect(keys(m, 'intermediate')).toEqual(['success_signal', ...keys(by(before)['evidence-plan'], 'intermediate')]);
    expect(req(m, 'intermediate')).toEqual(req(by(before)['evidence-plan'], 'intermediate'));
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
    const opt = a.map((f) => f.required === false);
    expect(opt.indexOf(true)).toBeGreaterThan(0);
    expect(opt.slice(opt.indexOf(true)).every(Boolean)).toBe(true);
    expect(a.filter((f) => f.group)).toEqual([expect.objectContaining({ key: a[opt.indexOf(true)].key, group: 'تعمّق إن شئت' })]);
    // الترتيب داخل كل مجموعة كما كان
    const order = (list, o) => list.filter((f) => (f.required === false) === o).map((f) => f.key);
    for (const o of [true, false]) expect(order(a, o)).toEqual(order(b, o));
  });
});

describe('العمود الفقري: كل سؤال من العشرة له حقل مطلوب ظاهر في كل مستوى', () => {
  // المصادر من المصفوفة §1: فصل وحقل؛ يكفي واحد مطلوب ظاهر
  const SPINE = {
    'ما المشكلة ولمن؟': [['initiative-charter', 'problem']],
    'ما الهدف وما المخرجات؟': [['initiative-charter', 'objective'], ['initiative-charter', 'deliverables']],
    'لماذا هذا الحل لا غيره؟': [['options-analysis', 'options'], ['options-analysis', 'recommendation']],
    'كيف يحدث التغيير؟': [['theory-of-change', 'chain']],
    'ما المنفعة وكيف تُقاس؟': [['benefits-register', 'benefits'], ['evidence-plan', 'plan']],
    'متى وبأي خطوات؟': [['milestone-register', 'milestones'], ['schedule', 'activities']],
    'بأي موارد وكلفة؟': [['cost-plan', 'items']],
    'ما المخاطر وكيف تُعالج؟': [['raid', 'items']],
    'من يقرر ومن يشارك؟': [['stakeholder-map', 'stakeholders'], ['governance', 'structure']],
    'ماذا تحقق وماذا يبقى؟': [['change-sustain', 'handover'], ['change-sustain', 'sustain'], ['impact-report', 'changes']],
  };
  it.each(COMBOS.map((c) => [Object.values(c).join('/'), c]))('%s', (_, levels) => {
    const mine = Object.fromEntries(capstoneModels(after, levels, 'project').map((m) => [m.key, m]));
    for (const [q, src] of Object.entries(SPINE)) {
      const ok = src.some(([k, f]) => mine[k] && fieldsFor(mine[k].fields, levels[mine[k].dimension], 'project').some((x) => x.key === f && x.required !== false));
      expect(ok, q).toBe(true);
    }
  });
});

describe('الهرم', () => {
  it('لا فصل يُنقص حقلًا أو إلزامًا مع ارتفاع المستوى', () => {
    for (const m of after) for (const scope of ['project', 'program', 'portfolio']) for (const primary of [false, true]) {
      for (let i = 1; i < LV.length; i++) {
        const lo = fieldsFor(m.fields, LV[i - 1], scope, primary), hi = fieldsFor(m.fields, LV[i], scope, primary);
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
function stateOf(models, levels, subs, priority = null) {
  const kept = answeredModels(subs);
  const subBy = Object.fromEntries(subs.map((s) => [s.model_id, s]));
  const sections = capstoneModels(models, levels, 'project', kept).map((m) => {
    const sub = subBy[m.id];
    const fields = modelFields(m, levels, 'project', priority, sub?.answers || null);
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

describe('عدم تراجع الجاهزية: ما اكتمل قبل الترحيل يبقى مكتملًا بعده', () => {
  for (const pick of ['all', 'required', 'half']) {
    it(`${pick}: لكل تركيبة من الـ27 وكل محور أولوية`, () => {
      for (const levels of COMBOS) for (const priority of [null, ...DIMS]) {
        const subs = answersBefore(levels, pick, priority);
        const b = stateOf(before, levels, subs, priority), a = stateOf(after, levels, subs, priority);
        const tag = `${pick} ${Object.values(levels).join('/')} ${priority}`;
        for (const s of b.sections.filter((x) => x.state.complete)) {
          expect(a.sections.find((x) => x.key === s.key)?.state.complete, `${tag} ${s.key}`).toBe(true);
        }
        expect(a.readiness, tag).toBeGreaterThanOrEqual(b.readiness);
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
    { key: 'r', type: 'textarea', label: 'ر', required: true, required_from: 'advanced' },
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
    // بلا مستوى معتمد في البُعد لا يظهر شيء (المنهج مقفل قبل الاعتماد)
    expect(modelsFor(after, {}, 'project', kept)).toEqual([]);
  });
});

describe('حالة العمل بلا فصلي الشراء والحوكمة (التأسيسي)', () => {
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
