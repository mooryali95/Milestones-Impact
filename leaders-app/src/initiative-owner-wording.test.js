// المبادرة ملك قائدها، والجهة سياق مساعد (قرار المالك 2026-11-15). قواعد الكتابة في anatomy.json writing_rules
// يمنع هذا الحارس عودة صياغة تفترض أن للمشارك جهة، أو أن لها استراتيجية، أو أن المبادرة مبادرتها.
import { readdirSync, readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import A from '../../supabase/content/initiative-guide/v1/anatomy.json';
import FIELDS from '../../supabase/content/initiative-guide/v1/fields.json';
import { CARD_CRITERIA, RUBRIC } from '../../supabase/functions/leaders-api/capstone.js';
import { CONFIDENTIAL_AR } from '../../supabase/functions/leaders-api/labels.js';
import { define } from '../../supabase/content/initiative-guide/v1/anatomy.js';
import { CONTEXTS, contextNote, discoveryQuestions, examplesFor, guideFor, sectorOf } from './guide.js';
import { charterData } from '../../supabase/functions/leaders-api/business-case.js';

// ما يفترض الجهة مالكًا أو موجودًا: «جهتك»، «في جهته»، «هيكل جهتك»، «استراتيجية جهتك»، «خطة الجهة»، «يقنع الجهة»
const ASSUMES_ORG = /جهتك|جهته\b|في جهته|هيكل الجهة|استراتيجية الجهة|خطة الجهة|يقنع الجهة|تكلّف الجهة|من الجهة نفسها|ملاك منافع من الجهة/;
const texts = (o) => (typeof o === 'string' ? [o] : Array.isArray(o) ? o.flatMap(texts) : o && typeof o === 'object' ? Object.values(o).flatMap(texts) : []);

describe('المبادرة ملك قائدها والجهة سياق مساعد', () => {
  it('قواعد الكتابة مكتوبة في المصدر الواحد، والمعجم فيه المصطلحات الأربعة', () => {
    expect(A.writing_rules.length).toBeGreaterThanOrEqual(5);
    for (const t of ['قائد المبادرة', 'الجهة المستضيفة', 'صاحب القرار', 'الهدف الأعلى']) expect(define(t)?.def, t).toBeTruthy();
    expect(A.meaning.owner_rule).toMatch(/ملك قائدها/);
  });
  it('دليل الحقول ومعنى المبادرة والمسرد بلا صياغة تفترض جهة', () => {
    for (const t of [...texts(FIELDS), ...texts(A.meaning), ...texts(A.glossary), ...texts(A.chapters)]) expect(t, t).not.toMatch(ASSUMES_ORG);
  });
  it('معايير البطاقة والتقييم لا تشترط جهة، والدرجة العليا للاتساق بهدف أعلى بمصدره', () => {
    for (const t of [...texts(CARD_CRITERIA), ...texts(RUBRIC)]) expect(t, t).not.toMatch(ASSUMES_ORG);
    const s = RUBRIC.find((r) => r.key === 'strategy');
    expect(s.anchors[3]).toMatch(/هدف أعلى بنصه ومصدره/);
    expect(s.levels.beginner[3]).toMatch(/هدف أعلى بنصه ومصدره/);
  });
  it('أسئلة الاكتشاف تسأل عن الهدف الأعلى ببدائله لا عن استراتيجية الجهة', () => {
    for (const lv of ['beginner', 'intermediate', 'advanced']) {
      const goal = discoveryQuestions(lv).find((q) => q.key === 'goal');
      expect(`${goal.label} ${goal.hint || ''}`).toMatch(/هدف أعلى/);
      expect(`${goal.label} ${goal.hint || ''}`).not.toMatch(ASSUMES_ORG);
    }
  });
  it('الوثيقة المطبوعة ملك قائدها، والجهة لا تطّلع إلا بإذنه', () => {
    const t = readFileSync('src/lib/brand/capstone.js', 'utf8');
    // السرية ثابت واحد في labels.js (المرحلة 23) تستورده الوثيقة
    expect(t).toMatch(/confidential: example \? .+ : CONFIDENTIAL_AR,/);
    expect(CONFIDENTIAL_AR).toBe('ملك قائد المبادرة: يطّلع عليها مستشاره، ولا تُتداول إلا بإذنه.');
    expect(t).not.toMatch(/مخصص للقائد وجهته/);
  });
  it('شاشات المبادرة (صفحتها، والاكتشاف، والفصل، والمتابعة، والمشاركة، واللوحة، وصفحة الراعي) لا تفترض جهة ولا عملًا', () => {
    for (const f of ['Capstone.jsx', 'Tracking.jsx', 'Sponsor.jsx', 'Discovery.jsx', 'Models.jsx', 'SharedInitiative.jsx', 'Share.jsx', 'InitiativeMap.jsx', 'Visuals.jsx']) {
      const t = readFileSync(`leaders-app/src/screens/${f}`, 'utf8');
      expect(t, f).not.toMatch(/عملك الحقيقي|واقع عملك|تراها في عملك|أولويات جهتك|ما تحتاجه من جهتك/);
    }
  });
});

describe('سياق التنفيذ: أين تُنفَّذ المبادرة، والجهة المستضيفة إن وُجدت', () => {
  const sql = readFileSync('supabase/migrations/20261115210000_leaders_initiative_owner_context.sql', 'utf8');
  const field = (k) => JSON.parse(sql.match(new RegExp(`add_after\\('initiative-charter', '\\w+', \\$j\\$(\\{"key": "${k}"[^\\n]*?\\})\\$j\\$`))[1]);
  it('خيارات الحقل في الترحيل هي خيارات المصدر الواحد بنصها وترتيبها، والحقلان اختياريان بعد اسم المبادرة', () => {
    expect(field('context').options).toEqual(CONTEXTS.map((o) => o.label));
    expect(field('context').required).toBe(false);
    expect(field('host').required).toBe(false);
    expect(sql).toMatch(/add_after\('initiative-charter', 'title', \$j\$\{"key": "context"/);
    expect(sql).toMatch(/add_after\('initiative-charter', 'context', \$j\$\{"key": "host"/);
  });
  it('كل تلميح سياق لحقل له دليل، وبمفتاح سياق معروف', () => {
    const keys = new Set(CONTEXTS.map((o) => o.key));
    for (const [k, notes] of Object.entries(A.contexts.notes)) {
      const [m, f] = k.split('.');
      expect(FIELDS[m]?.[f], k).toBeTruthy();
      for (const c of Object.keys(notes)) expect(keys.has(c), `${k}.${c}`).toBe(true);
    }
  });
  it('السياق الريادي يقدّم المثال الريادي أيًا كان قطاع صاحبه، وبلا سياق يبقى مثال القطاع', () => {
    expect(sectorOf('صحي', 'مبادرة ريادية أو مستقلة').key).toBe('startup');
    expect(examplesFor('صحي', null, 'مبادرة ريادية أو مستقلة')[0].sector).toBe('startup');
    expect(examplesFor('صحي', null, 'في جهة أعمل فيها')[0].sector).toBe('health');
    expect(examplesFor('صحي', ['gov', 'health'], 'مبادرة ريادية أو مستقلة')[0].sector).toBe('health');
    expect(sectorOf('صحي', 'نص غير معروف').key).toBe('health');
  });
  it('دليل الحقل يحمل تلميح السياق حين يختلف الجواب فيه', () => {
    expect(contextNote('initiative-charter', 'sponsor', 'مبادرة ريادية أو مستقلة').note).toMatch(/المستثمر/);
    expect(contextNote('initiative-charter', 'sponsor', null)).toBeNull();
    expect(contextNote('cost-plan', 'envelope', 'في جهة أعمل فيها')).toBeNull();
    const g = guideFor('initiative-charter', 'objective', 'beginner', 'صحي', { field: true, sectors: ['gov', 'health', 'startup'], context: 'مبادرة ريادية أو مستقلة' });
    expect(g.context.label).toBe('مبادرة ريادية أو مستقلة');
    expect(g.example.sector_title).toBe('ريادة الأعمال');
  });
  it('الميثاق يعرض سياق التنفيذ والجهة المستضيفة إن كُتبا، ويسمي الهدف الأعلى', () => {
    const doc = { sections: [{ key: 'initiative-charter', title: 'البطاقة', fields: [
      { key: 'title', label: 'اسم المبادرة', type: 'text', value: 'م' },
      { key: 'context', label: 'أين تُنفَّذ مبادرتك؟', type: 'select', value: 'في جهة أخرى' },
      { key: 'host', label: 'الجهة المستضيفة', type: 'text', value: 'جمعية خيرية' },
      { key: 'objective', label: 'الهدف', type: 'textarea', value: 'هدف' }] }] };
    const rows = Object.fromEntries(charterData(doc).rows);
    expect(rows['سياق التنفيذ']).toBe('في جهة أخرى');
    expect(rows['الجهة المستضيفة']).toBe('جمعية خيرية');
    expect(rows['الهدف الأعلى']).toBe('هدف');
  });
  it('الخادم يرسل سياق المبادرة مع الأمثلة، والواجهة تقرؤه من البطاقة الحية أثناء كتابتها', () => {
    expect(readFileSync('supabase/functions/leaders-api/participant.ts', 'utf8')).toMatch(/context: typeof card\?\.answers\?\.context === 'string'/);
    expect(readFileSync('leaders-app/src/screens/Models.jsx', 'utf8')).toContain("m.key === 'initiative-charter' ? answers.context : null");
  });
});

describe('خطوات البطاقة كما تصير في القاعدة بعد كل الترحيلات', () => {
  it('زرعها الأول ثم كل استبدال لاحق عليها بالترتيب: لا يبقى فيها ما يفترض جهة', () => {
    const dir = 'supabase/migrations';
    const files = readdirSync(dir).filter((f) => f.endsWith('.sql')).sort();
    // الزرع الأول: نص خطوات البطاقة في إدراج نموذجها
    const seed = readFileSync(`${dir}/20261029120000_leaders_capstone.sql`, 'utf8');
    let steps = seed.match(/\$q\$(اختر مبادرة حقيقية تقودها[\s\S]*?)\$q\$/)[1];
    // كل update على steps_ar للبطاقة: أزواج replace(…, 'قديم', 'جديد') بترتيب ظهورها من الداخل إلى الخارج
    for (const f of files) {
      for (const block of readFileSync(`${dir}/${f}`, 'utf8').matchAll(/update leaders\.learning_models\s+set steps_ar = ([\s\S]*?)\n\s*where key = 'initiative-charter'/g)) {
        for (const [, from, to] of block[1].matchAll(/'([^']+)',\s*'([^']+)'\)/g)) steps = steps.replace(from, to);
      }
    }
    expect(steps).not.toMatch(ASSUMES_ORG);
    expect(steps).toMatch(/هدف أعلى بنصه ومصدره/);
  });
});

describe('مساعدة متطلبات البطاقة والاعتماد كما تصير في القاعدة بعد كل الترحيلات', () => {
  // يحاكي التسلسل: الزرع، ثم replace على help_ar، ثم set help_ar = جديد where help_ar = قديم (الحارس الحرفي)
  const dir = 'supabase/migrations';
  const all = readdirSync(dir).filter((f) => f.endsWith('.sql')).sort().map((f) => readFileSync(`${dir}/${f}`, 'utf8'));
  const finalHelp = (code) => {
    let help = null;
    for (const sql of all) {
      const seed = sql.match(new RegExp(`'${code}', \\d+, \\$q\\$[^$]*\\$q\\$,\\s*\\$q\\$([^$]+)\\$q\\$`));
      if (seed && help == null) help = seed[1];
      for (const [, from, to] of sql.matchAll(new RegExp(`set help_ar = replace\\(help_ar, '([^']+)', '([^']+)'\\) where code = '${code}'`, 'g'))) help = help?.replace(from, to);
      for (const [, to, from] of sql.matchAll(new RegExp(`set help_ar = \\$q\\$([^$]+)\\$q\\$\\s*where code = '${code}'\\s*and help_ar = \\$q\\$([^$]+)\\$q\\$`, 'g'))) if (help === from) help = to;
    }
    return help;
  };
  for (const code of ['CP-CARD', 'CP-FINAL']) {
    it(`${code}: نصه النهائي لا يفترض جهة`, () => {
      const h = finalHelp(code);
      expect(h, code).toBeTruthy();
      expect(h).not.toMatch(ASSUMES_ORG);
    });
  }
});

describe('مكان المبادرة في غلافها وصفحة مشاركتها: من بطاقتها لا من ملف صاحبها', () => {
  it('الغلاف: الجهة المستضيفة، وإلا سياق التنفيذ، وإلا لا صف', async () => {
    const { placeRow } = await import('../../src/lib/brand/capstone.js');
    expect(placeRow({ host: 'جمعية خيرية', context: 'في جهة أخرى', org: { name: 'جهة الملف' } })).toEqual([['الجهة المستضيفة', 'جمعية خيرية']]);
    expect(placeRow({ context: 'مبادرة ريادية أو مستقلة', org: { name: 'جهة الملف' } })).toEqual([['سياق التنفيذ', 'مبادرة ريادية أو مستقلة']]);
    expect(placeRow({ org: { name: 'جهة الملف' } })).toEqual([]);
    const t = readFileSync('src/lib/brand/capstone.js', 'utf8');
    expect(t).not.toMatch(/\['الجهة', m\.org/);
  });
  it('الخادم يرسل مكانها من البطاقة، وقارئ رابط المشاركة يرى الجهة لغلاف الوثيقة المؤسسية (قرار المالك 2026-11-24)', async () => {
    expect(readFileSync('supabase/functions/leaders-api/capstone.ts', 'utf8')).toMatch(/host: String\(d\.charter\.host/);
    const { publicDoc } = await import('../../supabase/functions/leaders-api/share.js');
    const out = publicDoc({ meta: { org: { name: 'جهة الملف' }, host: 'جمعية', initiative: 'م' }, sections: [], levels: [] }, { show_levels: false });
    expect(out.meta.org).toEqual({ name: 'جهة الملف' });
    expect(out.meta.host).toBe('جمعية');
    const page = readFileSync('leaders-app/src/screens/SharedInitiative.jsx', 'utf8');
    expect(page).not.toMatch(/m\.org/);
  });
});

describe('قطاع المشارك في صفحة المبادرة من مكانه في جواب الخادم', () => {
  it('Capstone.jsx يقرأ me.participant.sector (حيث يرسله mePayload)، لا me.sector الذي لا يوجد', () => {
    const t = readFileSync('leaders-app/src/screens/Capstone.jsx', 'utf8');
    expect(t).not.toMatch(/me\?\.sector\b/);
    expect(t).toContain('me?.participant?.sector');
    expect(readFileSync('supabase/functions/leaders-api/participant.ts', 'utf8')).toMatch(/participant: \{[\s\S]{0,600}sector: p\.sector/);
  });
});
