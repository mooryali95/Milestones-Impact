// مرافق بناء المبادرة، المرحلة 4أ: دليل الحقل بمستوى المشارك
// التصور: docs/content/2026-11-14-تصور-مرافق-بناء-المبادرة-v1.md
import { readFileSync, readdirSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import FIELDS from '../../supabase/content/initiative-guide/v1/fields.json';
import { guideFor, GUIDE_MODES } from './guide.js';

const root = process.cwd();
const sql = [resolve(root, 'server/leaders-011-book-and-models.sql'),
  ...readdirSync(resolve(root, 'supabase/migrations')).sort().map((f) => resolve(root, 'supabase/migrations', f))].map((p) => readFileSync(p, 'utf8')).join('\n');

// مفاتيح حقول كل نموذج كما تُزرع: إدراج النموذج، ثم الحقول المضافة بعده
const known = {};
for (const m of sql.matchAll(/\('\w+', '([a-z-]+)', \d+, \$q\$[\s\S]*?\$q\$(\[[\s\S]*?\])\$q\$::jsonb\)/g)) {
  try { known[m[1]] ||= new Set(JSON.parse(m[2]).map((f) => f.key)); } catch { /* ليس جدول حقول */ }
}
for (const m of sql.matchAll(/add_field\('([a-z-]+)', (?:\$j\$|')(\{[^\n]*?\})(?:\$j\$|')::jsonb/g)) {
  try { known[m[1]]?.add(JSON.parse(m[2]).key); } catch { /* حقل مسار يُبنى بالدالة */ }
}
// حقل يُضاف بعد حقل بعينه (pg_temp.add_after)
for (const m of sql.matchAll(/add_after\('([a-z-]+)', '[a-z_]+', \$j\$(\{[^\n]*?\})\$j\$::jsonb/g)) {
  try { known[m[1]]?.add(JSON.parse(m[2]).key); } catch { /* ليس حقلًا */ }
}

const entries = Object.entries(FIELDS).filter(([k]) => !k.startsWith('_'));

describe('محتوى دليل الحقل', () => {
  it('كل نموذج وحقل في الدليل موجود فعلًا في النماذج المزروعة', () => {
    for (const [model, fields] of entries) {
      expect(known[model], model).toBeTruthy();
      for (const key of Object.keys(fields)) expect(known[model].has(key), `${model}.${key}`).toBe(true);
    }
  });
  it('لكل حقل المعنى والخطأ الشائع وسؤال الخبير، بجمل قصيرة بلا حروف لاتينية', () => {
    for (const [model, fields] of entries) {
      for (const [key, g] of Object.entries(fields)) {
        for (const part of ['meaning', 'mistake', 'challenge']) {
          const t = g[part];
          expect(typeof t === 'string' && t.length >= 15 && t.length <= 200, `${model}.${key}.${part}`).toBe(true);
          expect(/[A-Za-z]/.test(t), `${model}.${key}.${part}`).toBe(false);
        }
        expect(g.challenge.trim().endsWith('؟'), `${model}.${key}: سؤال الخبير سؤال`).toBe(true);
      }
    }
  });
  it('فصول الوثيقة الأساسية للتأسيسي كلها مغطاة', () => {
    for (const k of ['initiative-charter', 'options-analysis', 'theory-of-change', 'benefits-register', 'stakeholder-map', 'milestone-register', 'cost-plan', 'procurement', 'governance', 'raid', 'change-sustain', 'development-plan', 'transformation-story']) {
      expect(Object.keys(FIELDS[k] || {}).length, k).toBeGreaterThan(0);
    }
  });
  it('لا يعود معيار «لا على مثال افتراضي»: المبادرة قد تكون افتراضية واقعية (قرار المالك)', () => {
    const models = readFileSync(resolve(root, 'leaders-app/src/screens/Models.jsx'), 'utf8');
    expect(models).not.toContain('لا على مثال افتراضي');
    expect(models).toContain('حقيقية كانت أو افتراضية واقعية');
  });
});

describe('العون يتلاشى بالمستوى', () => {
  it('التأسيسي مفتوح، والمتوسط مطوي، والمتقدم سؤال الخبير، وبلا مستوى مطوي', () => {
    expect(GUIDE_MODES).toEqual({ beginner: 'open', intermediate: 'collapsed', advanced: 'expert' });
    expect(guideFor('cost-plan', 'items', 'beginner').mode).toBe('open');
    expect(guideFor('cost-plan', 'items', 'intermediate').mode).toBe('collapsed');
    expect(guideFor('cost-plan', 'items', 'advanced').mode).toBe('expert');
    expect(guideFor('cost-plan', 'items', null).mode).toBe('collapsed');
  });
  it('الحقل بلا دليل أو النموذج خارج الوثيقة: لا شيء', () => {
    expect(guideFor('initiative-charter', 'title', 'beginner')).toBeNull();
    expect(guideFor('conflict-mode', 'x', 'beginner')).toBeNull();
    expect(guideFor('_about', 'x', 'beginner')).toBeNull();
  });
  it('الخادم يرسل مستوى المشارك في بُعد النموذج من مصدر حقوله نفسه', () => {
    const p = readFileSync(resolve(root, 'supabase/functions/leaders-api/participant.ts'), 'utf8');
    expect(p).toContain('return { ...m, level: levels[m.dimension] || null, fields: fieldsFor(m.fields, levels[m.dimension]');
  });
});

// ════════════ 4ب: المثال المحلول لكل قطاع ════════════
import { capstoneChecks, CARD_REVIEW_CRITERIA, costSummary } from '../../supabase/functions/leaders-api/capstone.js';
import { businessCase, charterData } from '../../supabase/functions/leaders-api/business-case.js';
import { copiedFromExamples, nearCopy, similarity } from '../../supabase/functions/leaders-api/example-check.js';
import { capstoneReport } from '../../src/lib/brand/capstone.js';
import { EXAMPLES, exampleDoc, exampleFor, examplesFor, sectorOf } from './guide.js';

// حقول الجداول وأعمدتها كما تُزرع اليوم (بعد تعديلات الأعمدة اللاحقة)
const seededColumns = (model, field) => {
  let cols = null;
  for (const m of sql.matchAll(/\('\w+', '([a-z-]+)', \d+, \$q\$[\s\S]*?\$q\$(\[[\s\S]*?\])\$q\$::jsonb\)/g)) {
    if (m[1] !== model || cols) continue;
    try { cols = JSON.parse(m[2]).find((f) => f.key === field)?.columns || null; } catch { /* ليس جدول حقول */ }
  }
  for (const m of sql.matchAll(/patch_field\('([a-z-]+)', '([a-z_]+)', \$j\$(\{[\s\S]*?\})\$j\$/g)) {
    if (m[1] === model && m[2] === field) { try { cols = JSON.parse(m[3]).columns || cols; } catch { /* تعديل بلا أعمدة */ } }
  }
  if (model === 'benefits-register' && field === 'benefits' && cols) cols = [...cols, 'تاريخ التحقق', 'تكرار القياس'];
  return cols;
};

describe('المثال المحلول: مبادرة متسقة لكل قطاع', () => {
  for (const ex of EXAMPLES) {
    const models = {}, answers = {};
    for (const s of ex.sections) { models[s.key] = { key: s.key, fields: s.fields }; answers[s.key] = Object.fromEntries(s.fields.map((f) => [f.key, f.value])); }
    it(`${ex.sector_title}: كل حقل حقل مزروع، وأعمدة جداوله أعمدة النموذج نفسها`, () => {
      for (const s of ex.sections) {
        expect(known[s.key], s.key).toBeTruthy();
        for (const f of s.fields) {
          expect(known[s.key].has(f.key), `${s.key}.${f.key}`).toBe(true);
          if (f.type === 'table') {
            expect(f.columns, `${s.key}.${f.key}`).toEqual(seededColumns(s.key, f.key));
            for (const r of f.value) expect(r.length, `${s.key}.${f.key}`).toBe(f.columns.length);
          }
        }
      }
    });
    it(`${ex.sector_title}: يجتاز كل فحوص الاتساق، والتكلفة ضمن الموازنة`, () => {
      const checks = capstoneChecks({ scope: 'project', models, answers });
      expect(checks.length).toBeGreaterThanOrEqual(12);
      expect(checks.filter((c) => !c.ok).map((c) => `${c.key}: ${c.detail}`)).toEqual([]);
      const cost = costSummary(models['cost-plan'], answers['cost-plan']);
      expect(cost.withContingency).toBeLessThanOrEqual(cost.envelope);
    });
    it(`${ex.sector_title}: حالة العمل بأبعادها الخمسة مكتملة، والميثاق يُبنى منه`, () => {
      const doc = exampleDoc(ex);
      expect(businessCase(doc).filter((c) => c.missing)).toEqual([]);
      expect(charterData(doc).rows.length).toBeGreaterThanOrEqual(10);
      for (const k of ['initiative-charter', 'options-analysis', 'cost-plan', 'procurement', 'raid', 'transformation-story']) expect(ex.sections.some((s) => s.key === k), k).toBe(true);
    });
    it(`${ex.sector_title}: الوثيقة الكاملة مثال تعليمي، لا مسودة ولا فحوص ولا اعتماد`, () => {
      const { meta, body } = capstoneReport(exampleDoc(ex));
      expect(meta.subtitle).toContain('مثال محلول');
      expect(meta.confidential).toContain('مثال تعليمي');
      expect(body).not.toContain('مسودة عمل');
      expect(body).not.toContain('فحوص الاتساق بين الفصول');
      expect(body).toContain('حالة العمل');
    });
  }
});

describe('قطاع المشارك يختار المثال', () => {
  it('النص الحر في ملفه يُطابق بكلماته، والخدمات الحكومية أقرب مثال لمن لم يُضف قطاعه', () => {
    expect(sectorOf('القطاع الصحي')).toEqual({ key: 'health', matched: true });
    expect(sectorOf('مستشفى الملك فهد')).toEqual({ key: 'health', matched: true });
    expect(sectorOf('حكومي')).toEqual({ key: 'gov', matched: true });
    expect(sectorOf('خاص')).toEqual({ key: 'gov', matched: false });
    expect(sectorOf(null).key).toBe('gov');
    expect(examplesFor('صحي').map((x) => x.sector)).toEqual(['health', 'gov', 'startup']);
  });
  it('مثال الحقل من قطاعه، والمتقدم لا يُعرض له المثال بجانب الحقل', () => {
    expect(exampleFor('options-analysis', 'recommendation', 'صحي').sector_title).toBe('الصحة');
    expect(exampleFor('options-analysis', 'recommendation', 'حكومي').sector_title).toBe('الخدمات الحكومية');
    expect(exampleFor('initiative-charter', 'sponsor_email', 'حكومي')).toBeNull();
    expect(guideFor('cost-plan', 'items', 'beginner', 'صحي').example.columns[0]).toBe('رمز الحزمة');
    expect(guideFor('cost-plan', 'items', 'advanced', 'صحي').example).toBeNull();
  });
});

describe('القرب من المثال: تنبيه لا يمنع', () => {
  const ex = EXAMPLES[0];
  const rec = ex.sections.find((s) => s.key === 'options-analysis').fields.find((f) => f.key === 'recommendation').value;
  it('النص المنقول أو المعدّل قليلًا قريب، والمكتوب من الواقع ليس قريبًا', () => {
    expect(nearCopy(rec, rec)).toBe(true);
    expect(nearCopy(`${rec} وهذا رأيي.`, rec)).toBe(true);
    expect(nearCopy('نوصي بتوحيد نموذج الطلب في الفروع الثلاثة لأنه أسرع أثرًا وأقل كلفة من التعاقد مع مورد خارجي.', rec)).toBe(false);
    expect(nearCopy('قصير', 'قصير')).toBe(false);
    expect(similarity('', rec)).toBe(0);
  });
  it('صف جدول منقول يكفي للتنبيه، والمستشار يرى الحقول القريبة باسم الفصل والحقل', () => {
    const risks = ex.sections.find((s) => s.key === 'raid').fields.find((f) => f.key === 'items').value;
    expect(nearCopy([risks[0], ['R9', 'خطر', 'خطر آخر من واقع مبادرتي لا يشبه شيئًا', '2', '2', 'أنا', 'متابعة', '1']], risks)).toBe(true);
    const doc = { sections: [{ key: 'options-analysis', title: 'المبرر والبدائل', fields: [{ key: 'recommendation', label: 'التوصية ومبررها', value: rec }] }] };
    expect(copiedFromExamples(doc, EXAMPLES)).toEqual([{ chapter: 'المبرر والبدائل', field: 'التوصية ومبررها', sector: 'الخدمات الحكومية' }]);
    expect(copiedFromExamples({ sections: [] }, EXAMPLES)).toEqual([]);
  });
});

describe('فحص تغطية مصفوفة المسؤوليات يقرأ الرمز في أول الخلية', () => {
  it('«1.1 رحلة المستفيد» تغطي الحزمة 1.1 كما يكتبها المشارك حين يُطلب «الرمز أو الاسم»', () => {
    const models = {
      wbs: { fields: [{ key: 'packages', type: 'table', columns: ['الرمز', 'حزمة العمل', 'المخرج', 'المالك', 'المدة (أيام)'] }] },
      governance: { fields: [{ key: 'raci', type: 'table', columns: ['حزمة العمل أو القرار', 'المسؤول R', 'المحاسب A', 'المستشار C', 'المُطّلع I'] }] },
    };
    const answers = {
      wbs: { packages: [['1.1', 'أ', 'م', 'س', '5'], ['1.2', 'ب', 'م', 'س', '5'], ['2.1', 'ج', 'م', 'س', '5'], ['2.2', 'د', 'م', 'س', '5']] },
      governance: { raci: [['1.1 رحلة المستفيد', 'س', 'ق', '', ''], ['1.2 المتطلبات', 'س', 'ق', '', ''], ['2.1 النموذج', 'س', 'ق', '', ''], ['2.2 الربط', 'س', 'ق', '', '']] },
    };
    expect(capstoneChecks({ scope: 'project', models, answers }).find((c) => c.key === 'raci-cover').ok).toBe(true);
  });
});

// ════════════ تحكم المالك في المبادرات المحلولة (مفاتيح الرؤية) ════════════
import { EXAMPLE_SECTORS, examplesView, resolveVisibility, VISIBILITY } from '../../supabase/functions/leaders-api/visibility.js';
import { nearExample } from './guide.js';

describe('المالك يعرض المبادرات المحلولة أو يحجبها، عامةً أو للدفعة، وكل قطاع وحده', () => {
  it('أربعة مفاتيح للمشارك مفتوحة افتراضيًا، فلا يتغير شيء عند النشر حتى يغيّرها المالك', () => {
    for (const k of ['par_examples_field', 'par_examples_doc', 'par_example_gov', 'par_example_health', 'par_example_startup']) {
      expect(VISIBILITY[k].audience, k).toBe('participant');
      expect(VISIBILITY[k].default, k).toBe(true);
    }
    expect(EXAMPLE_SECTORS).toEqual(EXAMPLES.map((x) => x.sector));
    for (const s of EXAMPLE_SECTORS) expect(VISIBILITY[`par_example_${s}`], s).toBeTruthy();
  });
  it('الحسم: حجب قطاع يُسقطه، وحجب كل القطاعات يُسقط العرضين، واستثناء الدفعة يعلو العام', () => {
    const view = (vis) => examplesView({ field: vis.par_examples_field, doc: vis.par_examples_doc, sectors: { gov: vis.par_example_gov, health: vis.par_example_health, startup: vis.par_example_startup } });
    expect(view(resolveVisibility(null, null))).toEqual({ field: true, doc: true, sectors: ['gov', 'health', 'startup'] });
    expect(view(resolveVisibility({ par_example_health: false }, null)).sectors).toEqual(['gov', 'startup']);
    expect(view(resolveVisibility({ par_example_health: false }, { par_example_health: true })).sectors).toEqual(['gov', 'health', 'startup']);
    expect(view(resolveVisibility(null, { par_examples_doc: false }))).toEqual({ field: true, doc: false, sectors: ['gov', 'health', 'startup'] });
    expect(view(resolveVisibility({ par_example_gov: false, par_example_health: false, par_example_startup: false }, null))).toEqual({ field: false, doc: false, sectors: [] });
  });
  it('الواجهة تتبع ما حسمه الخادم: حُجب مثال قطاعه فيرى الأقرب المفتوح، وحُجب العرض بجانب الحقل فلا مثال', () => {
    expect(examplesFor('صحي', ['gov']).map((x) => x.sector)).toEqual(['gov']);
    expect(examplesFor('صحي', []).length).toBe(0);
    expect(examplesFor('صحي', null).map((x) => x.sector)).toEqual(['health', 'gov', 'startup']);
    expect(exampleFor('options-analysis', 'recommendation', 'صحي', ['gov']).sector_title).toBe('الخدمات الحكومية');
    expect(exampleFor('options-analysis', 'recommendation', 'صحي', [])).toBeNull();
    expect(guideFor('cost-plan', 'items', 'beginner', 'صحي', { field: false, sectors: ['gov', 'health'] }).example).toBeNull();
    expect(guideFor('cost-plan', 'items', 'beginner', 'صحي', { field: true, sectors: ['gov'] }).example.sector_title).toBe('الخدمات الحكومية');
    // خادم أقدم لا يرسل الحسم: يبقى السلوك كما كان
    expect(guideFor('cost-plan', 'items', 'beginner', 'صحي', null).example.sector_title).toBe('الصحة');
  });
  it('تنبيه النقل يقارن بكل الأمثلة ولو حُجب بعضها، كما يقارن المستشار', () => {
    const rec = EXAMPLES[1].sections.find((s) => s.key === 'options-analysis').fields.find((f) => f.key === 'recommendation').value;
    expect(nearExample('options-analysis', 'recommendation', rec)).toBe(true);
    expect(nearExample('options-analysis', 'recommendation', 'نوصي بتوحيد نموذج الطلب في الفروع الثلاثة لأنه أسرع أثرًا وأقل كلفة من التعاقد مع مورد خارجي.')).toBe(false);
  });
  it('الخادم يحسمها من رؤية المشارك النافذة ويرسلها مع الفصل وصفحة المبادرة', () => {
    const p = readFileSync(resolve(root, 'supabase/functions/leaders-api/participant.ts'), 'utf8');
    expect(p).toContain('examplesView({ field: vis.par_examples_field, doc: vis.par_examples_doc, sectors: { gov: vis.par_example_gov, health: vis.par_example_health, startup: vis.par_example_startup } })');
    expect(p).toContain('m.capstone_sort != null ? examplesFor(p) : null,');
    const c = readFileSync(resolve(root, 'supabase/functions/leaders-api/capstone.ts'), 'utf8');
    expect(c).toContain('const [d, examples] = await Promise.all([build(p), examplesFor(p)]);');
  });
});

// ════════════ 4ج: صفوف البداية، واختبار الواقعية، واكتشاف المبادرة ════════════
import STARTERS from '../../supabase/content/initiative-guide/v1/starters.json';
import { canStart, charterFromDiscovery, DISCOVERY_CRITERIA, discoveryQuestions, discoveryScore, starterFor, untouchedStarters } from './guide.js';

describe('صفوف البداية: هيكل لا محتوى', () => {
  const entries4 = Object.entries(STARTERS).filter(([k]) => !k.startsWith('_'));
  it('كل هيكل لجدول مزروع، وصفوفه بعدد أعمدته، وخاناته الأولى تُحسب صفًا', () => {
    for (const [model, fields] of entries4) {
      for (const [field, rows] of Object.entries(fields)) {
        const cols = seededColumns(model, field);
        expect(cols, `${model}.${field}`).toBeTruthy();
        for (const r of rows) { expect(r.length, `${model}.${field}`).toBe(cols.length); expect(String(r[0]).trim(), `${model}.${field}`).not.toBe(''); }
        expect(starterFor(model, field, cols)).toEqual(rows);
      }
    }
  });
  it('الزر للجدول الفارغ وحده، والهيكل نسخة جديدة لا تمس المصدر', () => {
    const cols = seededColumns('raid', 'items');
    expect(canStart('raid', 'items', cols, undefined)).toBe(true);
    expect(canStart('raid', 'items', cols, [['', '', '', '', '', '', '', '']])).toBe(true);
    expect(canStart('raid', 'items', cols, [['R1', '', '', '', '', '', '', '']])).toBe(false);
    expect(canStart('schedule', 'activities', seededColumns('schedule', 'activities'), [])).toBe(false);
    expect(starterFor('raid', 'items', ['عمود واحد'])).toBeNull();
    const rows = starterFor('raid', 'items', cols); rows[0][2] = 'تغيير'; expect(STARTERS.raid.items[0][2]).toBe('');
  });
  it('الصفوف التي بقيت كما أُدرجت تُعد للتنبيه، والمعدّلة لا', () => {
    const rows = starterFor('governance', 'cadence', seededColumns('governance', 'cadence'));
    expect(untouchedStarters('governance', 'cadence', rows)).toBe(3);
    rows[0][2] = 'أولويات الأسبوع'; expect(untouchedStarters('governance', 'cadence', rows)).toBe(2);
    expect(untouchedStarters('governance', 'cadence', null)).toBe(0);
  });
});

describe('اختبار الواقعية في البطاقة', () => {
  const mig = readFileSync(resolve(root, 'supabase/migrations/20261115100000_leaders_initiative_reality.sql'), 'utf8');
  it('ثلاثة حقول اختيارية تُضاف إن غابت: بطاقة معتمدة مقفلة فلا يُحرم صاحبها من التسليم', () => {
    expect(mig.split('\n')[0]).toMatch(/^-- deploy-gate: tolerant/);
    for (const k of ['reality', 'first_step', 'operator']) {
      const m = mig.match(new RegExp(`add_field\\('initiative-charter', \\$j\\$(\\{"key": "${k}"[^\\n]*\\})\\$j\\$`));
      expect(m, k).toBeTruthy();
      expect(JSON.parse(m[1]).required, k).toBe(false);
      expect(FIELDS['initiative-charter'][k], k).toBeTruthy();
    }
    expect(mig).toContain("insert into leaders.schema_migrations (name) values ('20261115100000_leaders_initiative_reality')");
  });
  it('الخطوة الأولى ومن يشغّل بعد المبادرة يظهران في الميثاق المولّد', () => {
    const c = Object.fromEntries(charterData(exampleDoc(EXAMPLES[0])).rows);
    expect(c['الخطوة الأولى خلال 30 يومًا']).toContain('اجتماع الأحد القادم');
    expect(c['من يشغّل بعد المبادرة']).toContain('إدارة الخدمات');
  });
});

describe('اكتشاف المبادرة: أسئلة بالمستوى، وناتجه مسودة البطاقة', () => {
  it('المعايير معايير بوابة البطاقة الأربعة، والدرجة عدد المحقق منها', () => {
    expect(DISCOVERY_CRITERIA.length).toBe(CARD_REVIEW_CRITERIA.length);
    expect(discoveryScore({ real: true, owner: true })).toBe(2);
    expect(discoveryScore(null)).toBe(0);
  });
  it('التأسيسي بأمثلة، والمتوسط بلا أمثلة، والمتقدم أسئلة استراتيجية، والخطوة الأولى للجميع', () => {
    const b = discoveryQuestions('beginner'), m = discoveryQuestions('intermediate'), a = discoveryQuestions('advanced');
    expect(b.every((q) => q.hint)).toBe(true);
    expect(m.every((q) => !q.hint)).toBe(true);
    expect(b.map((q) => q.key)).toEqual(m.map((q) => q.key));
    expect(a.map((q) => q.key)).toEqual(['decision', 'metric', 'goal', 'first']);
    for (const qs of [b, m, a]) expect(qs.some((q) => q.key === 'first')).toBe(true);
  });
  it('تُملأ الحقول الفارغة وحدها، ولا يُكتب فوق ما في البطاقة', () => {
    const out = charterFromDiscovery('beginner', { idea: 'تجديد الترخيص يأخذ أسبوعين', title: 'تجديد في يوم', answers: { who: '1,200 مستفيد شهريًا', size: '9 أيام (نظام الطلبات)', goal: 'رفع الرضا إلى 85%', first: 'اجتماع مع مالك البيانات' } }, { objective: 'هدف كتبه المشارك' });
    expect(out.title).toBe('تجديد في يوم');
    expect(out.problem).toBe('تجديد الترخيص يأخذ أسبوعين. المستفيدون أو المتأثرون: 1,200 مستفيد شهريًا. حجمها: 9 أيام (نظام الطلبات).');
    expect(out.objective).toBe('هدف كتبه المشارك');
    expect(out.first_step).toBe('اجتماع مع مالك البيانات');
    const adv = charterFromDiscovery('advanced', { idea: 'الانتظار طويل', answers: { decision: 'تمويل المرحلة الأولى', metric: 'الانتظار من 34 إلى 14 يومًا' } });
    expect(adv.problem).toBe('الانتظار طويل. المؤشر: الانتظار من 34 إلى 14 يومًا. القرار المطلوب: تمويل المرحلة الأولى.');
    expect(adv.title).toBe('الانتظار طويل');
  });
});
