// حارس مصطلحات المبادرة (تدقيق لغة المبادرة v2، قرار المالك 2026-11-24).
// المرفوضات تُقرأ من المسرد نفسه (anatomy.json: glossary[].reject وstyle_reject)، فلا تُكتب قائمة ثانية هنا.
// يفحص نصوص المشارك والإدارة والعارضات والبريد وأمثلة المبادرة. التعليقات لا تُفحص (ليست نصًا معروضًا).
// الاستثناءات: استعمال مشروع لكلمة مرفوضة في معنى آخر، كل منها بملفه وسببه. لا يُضاف استثناء لنص معروض بالمعنى المرفوض.
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import A from '../../supabase/content/initiative-guide/v1/anatomy.json';

const root = join(__dirname, '../..');

// المسرد نفسه يحمل المرفوضات، فيُفحص anatomy.json دون المسرد
const ANATOMY_FILE = 'supabase/content/initiative-guide/v1/anatomy.json';

export const SCANNED = [
  ANATOMY_FILE,
  'leaders-app/src/screens/Capstone.jsx',
  'leaders-app/src/screens/InitiativeMap.jsx',
  'leaders-app/src/screens/Models.jsx',
  'leaders-app/src/screens/Sponsor.jsx',
  'leaders-app/src/screens/OrgPortal.jsx',
  'leaders-app/src/screens/SharedInitiative.jsx',
  'leaders-app/src/labels.js',
  'admin-app/src/screens/Capstones.jsx',
  'admin-app/src/screens/PersonFile.jsx',
  'admin-app/src/App.jsx',
  'admin-app/src/leaders-tabs.js',
  'admin-app/src/methodology.js',
  'src/lib/brand/capstone.js',
  'src/lib/brand/institutional.js',
  'src/lib/brand/doc.js',
  'supabase/functions/leaders-api/business-case.js',
  'supabase/functions/leaders-api/doc-quality.js',
  'supabase/functions/leaders-api/labels.js',
  'supabase/functions/leaders-api/sponsor.ts',
  'supabase/functions/leaders-api/capstone.ts',
  'supabase/functions/leaders-api/capstone.js',
  'supabase/functions/leaders-api/share.ts',
  'leaders-app/src/screens/AskExpert.jsx',
  'supabase/functions/leaders-api/insight.js',
  'admin-app/src/screens/Experts.jsx',
  'admin-app/src/screens/MailGallery.jsx',
  'supabase/content/initiative-guide/v1/fields.json',
  'supabase/content/initiative-guide/v1/sectors/gov.json',
  'supabase/content/initiative-guide/v1/sectors/health.json',
  'supabase/content/initiative-guide/v1/sectors/startup.json',
];

// [الملف، الكلمة المرفوضة، السبب]. تُفرَّغ كلما أُغلقت مرحلة.
const EXCEPTIONS = [
  // نمط مطابقة لأعمدة المال في جداول كتبها المشاركون بأي صيغة (COL_MONEY)، لا نص معروض
  ['supabase/functions/leaders-api/doc-quality.js', 'الميزانية', 'مطابقة أعمدة قديمة'],
  ['supabase/functions/leaders-api/doc-quality.js', 'الكلفة', 'مطابقة أعمدة قديمة'],
  // «الطبيب المختص» صفة طبية في مثال الصحة، لا دور في البرنامج
  ['supabase/content/initiative-guide/v1/sectors/health.json', 'المختص', 'الطبيب المختص'],
];

const TASHKEEL = /[ً-ْـ]/g;
const norm = (s) => String(s).replace(TASHKEEL, '');
// يحذف التعليقات: سطر يبدأ بـ // أو * أو /* أو {/*، وما بعد « // » في آخر السطر
const stripComments = (t, file) => (file.endsWith('.json') ? t : t.split('\n')
  .filter((l) => !/^\s*(\/\/|\*|\/\*|\{\/\*)/.test(l))
  .map((l) => l.replace(/\s\/\/\s.*$/, ''))
  .join('\n'));

const REJECTS = [
  ...A.glossary.flatMap((g) => (g.reject || []).map((r) => ({ bad: r, use: g.term }))),
  ...(A.style_reject || []).map((s) => ({ bad: s.reject, use: s.use })),
];
// المثال المحلول: تُفحص القيم وحدها. التسميات والأعمدة نسخة من تعريف الفصل في القاعدة، تُزامَن معه في ترحيل المرحلة 5
// (ويحرس guide.test.js أن الأعمدة أعمدة النموذج نفسها)، فلا تسبقه هنا
const exampleValues = (o) => (Array.isArray(o) ? o.map(exampleValues)
  : o && typeof o === 'object' ? Object.fromEntries(Object.entries(o).filter(([k]) => !['label', 'columns', 'title'].includes(k)).map(([k, v]) => [k, exampleValues(v)])) : o);
const AR = '\\u0621-\\u064A';
const re = (w) => new RegExp(`(?<![${AR}])${norm(w).replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}(?![${AR}])`, 'g');

export function hits() {
  const out = [];
  for (const f of SCANNED) {
    const t = norm(f === ANATOMY_FILE ? JSON.stringify({ ...A, glossary: null, style_reject: null, writing_rules: null })
      : f.includes('/sectors/') ? JSON.stringify(exampleValues(JSON.parse(readFileSync(join(root, f), 'utf8'))))
        : stripComments(readFileSync(join(root, f), 'utf8'), f));
    for (const { bad, use } of REJECTS) {
      const n = (t.match(re(bad)) || []).length;
      if (n) out.push({ file: f, bad, use, n });
    }
  }
  return out;
}

describe('مصطلحات المبادرة من المسرد الواحد', () => {
  it('المسرد يحمل المرفوضات، وكل مرفوض ليس مصطلحًا معتمدًا', () => {
    expect(REJECTS.length).toBeGreaterThan(20);
    const terms = new Set(A.glossary.flatMap((g) => [g.term, ...(g.aka || [])]).map(norm));
    for (const { bad } of REJECTS) expect(terms.has(norm(bad)), bad).toBe(false);
  });
  it('القرارات الأربعة: مسوّغات المبادرة، وتقديم الوثيقة، والمستشار والخبير', () => {
    const t = (x) => A.glossary.find((g) => g.term === x);
    expect(t('مسوّغات المبادرة').reject).toContain('حالة العمل');
    expect(t('تقديم الوثيقة').reject).toContain('تسليم الوثيقة');
    expect(t('التسليم والتسلم')).toBeTruthy();
    expect(t('المستشار').reject).toContain('ملاحظات المراجع');
    expect(t('الخبير').reject).toContain('مختص');
  });
  it('لا مرفوض في النصوص المعروضة إلا باستثناء معلن', () => {
    const allowed = new Set(EXCEPTIONS.map(([f, b]) => `${f}|${b}`));
    const bad = hits().filter((h) => !allowed.has(`${h.file}|${h.bad}`));
    expect(bad.map((h) => `${h.file}: «${h.bad}» ×${h.n} ← «${h.use}»`)).toEqual([]);
  });
  it('كل استثناء ما زال مستعملًا (يُحذف حين يزول)', () => {
    const live = new Set(hits().map((h) => `${h.file}|${h.bad}`));
    for (const [f, b] of EXCEPTIONS) expect(live.has(`${f}|${b}`), `${f} ${b}`).toBe(true);
  });
});
