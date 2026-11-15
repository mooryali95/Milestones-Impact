// المبادرة ملك قائدها، والجهة سياق مساعد (قرار المالك 2026-11-15). قواعد الكتابة في anatomy.json writing_rules
// يمنع هذا الحارس عودة صياغة تفترض أن للمشارك جهة، أو أن لها استراتيجية، أو أن المبادرة مبادرتها.
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import A from '../../supabase/content/initiative-guide/v1/anatomy.json';
import FIELDS from '../../supabase/content/initiative-guide/v1/fields.json';
import { CARD_CRITERIA, RUBRIC } from '../../supabase/functions/leaders-api/capstone.js';
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
    expect(t).toContain('ملك قائد المبادرة: يطّلع عليها مستشاره ومن يأذن له القائد');
    expect(t).not.toMatch(/مخصص للقائد وجهته/);
  });
  it('شاشات المبادرة (صفحتها، والمتابعة، وصفحة الراعي) لا تفترض جهة', () => {
    for (const f of ['Capstone.jsx', 'Tracking.jsx', 'Sponsor.jsx']) {
      const t = readFileSync(`leaders-app/src/screens/${f}`, 'utf8');
      expect(t, f).not.toMatch(/عملك الحقيقي|أولويات جهتك|ما تحتاجه من جهتك/);
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
