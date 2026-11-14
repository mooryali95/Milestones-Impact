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
import { capstoneChecks, costSummary } from '../../supabase/functions/leaders-api/capstone.js';
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
    expect(examplesFor('صحي').map((x) => x.sector)).toEqual(['health', 'gov']);
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
