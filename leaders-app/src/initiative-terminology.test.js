// حارس مصطلحات المبادرة (تدقيق لغة المبادرة v2، قرار المالك 2026-11-24).
// المرفوضات تُقرأ من المسرد نفسه (anatomy.json: glossary[].reject وstyle_reject)، فلا تُكتب قائمة ثانية هنا.
// يفحص نصوص المشارك والإدارة والعارضات والبريد وأمثلة المبادرة. التعليقات لا تُفحص (ليست نصًا معروضًا).
// الاستثناءات: استعمال مشروع لكلمة مرفوضة في معنى آخر، كل منها بملفه وسببه. لا يُضاف استثناء لنص معروض بالمعنى المرفوض.
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import A from '../../supabase/content/initiative-guide/v1/anatomy.json';

const root = join(__dirname, '../..');

export const SCANNED = [
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
  'supabase/content/initiative-guide/v1/fields.json',
  'supabase/content/initiative-guide/v1/sectors/gov.json',
  'supabase/content/initiative-guide/v1/sectors/health.json',
  'supabase/content/initiative-guide/v1/sectors/startup.json',
];

// [الملف، الكلمة المرفوضة، السبب]. تُفرَّغ كلما أُغلقت مرحلة.
const EXCEPTIONS = [
  ['admin-app/src/leaders-tabs.js', 'مشاريع التخرج', 'قائم قبل المرحلتين 2–4'],
  ['admin-app/src/methodology.js', 'مشاريع التخرج', 'قائم قبل المرحلتين 2–4'],
  ['admin-app/src/methodology.js', 'مشروع التخرج', 'قائم قبل المرحلتين 2–4'],
  ['admin-app/src/screens/Capstones.jsx', 'راعيها في الجهة', 'قائم قبل المرحلتين 2–4'],
  ['admin-app/src/screens/Capstones.jsx', 'مشاريع التخرج', 'قائم قبل المرحلتين 2–4'],
  ['admin-app/src/screens/Capstones.jsx', 'يقيّمها المستشار', 'قائم قبل المرحلتين 2–4'],
  ['leaders-app/src/screens/Capstone.jsx', 'إطارك الأولوي', 'قائم قبل المرحلتين 2–4'],
  ['leaders-app/src/screens/Capstone.jsx', 'تُسلَّم الوثيقة', 'قائم قبل المرحلتين 2–4'],
  ['leaders-app/src/screens/Capstone.jsx', 'حالة العمل', 'قائم قبل المرحلتين 2–4'],
  ['leaders-app/src/screens/Capstone.jsx', 'سلّم الوثيقة', 'قائم قبل المرحلتين 2–4'],
  ['leaders-app/src/screens/Capstone.jsx', 'لازم', 'قائم قبل المرحلتين 2–4'],
  ['leaders-app/src/screens/Capstone.jsx', 'مختص', 'قائم قبل المرحلتين 2–4'],
  ['leaders-app/src/screens/Capstone.jsx', 'مختصًا', 'قائم قبل المرحلتين 2–4'],
  ['leaders-app/src/screens/Capstone.jsx', 'مشروعك', 'قائم قبل المرحلتين 2–4'],
  ['leaders-app/src/screens/Models.jsx', 'مختص', 'قائم قبل المرحلتين 2–4'],
  ['leaders-app/src/screens/Models.jsx', 'مشروعك', 'قائم قبل المرحلتين 2–4'],
  ['leaders-app/src/screens/Models.jsx', 'ملاحظات المراجع', 'قائم قبل المرحلتين 2–4'],
  ['leaders-app/src/screens/Models.jsx', 'وثيقة مسلّمة', 'قائم قبل المرحلتين 2–4'],
  ['leaders-app/src/screens/SharedInitiative.jsx', 'صاحب الوثيقة', 'قائم قبل المرحلتين 2–4'],
  ['leaders-app/src/screens/Sponsor.jsx', 'صاحب المبادرة', 'قائم قبل المرحلتين 2–4'],
  ['leaders-app/src/screens/Sponsor.jsx', 'مشروع تخرجه', 'قائم قبل المرحلتين 2–4'],
  ['src/lib/brand/capstone.js', 'الإطار الأولوي', 'قائم قبل المرحلتين 2–4'],
  ['src/lib/brand/capstone.js', 'الميزانية المتاحة', 'قائم قبل المرحلتين 2–4'],
  ['src/lib/brand/capstone.js', 'الميزانية', 'قائم قبل المرحلتين 2–4'],
  ['src/lib/brand/capstone.js', 'بقرار الإدارة', 'قائم قبل المرحلتين 2–4'],
  ['src/lib/brand/capstone.js', 'حالة العمل', 'قائم قبل المرحلتين 2–4'],
  ['src/lib/brand/capstone.js', 'مشروع التخرج', 'قائم قبل المرحلتين 2–4'],
  ['src/lib/brand/institutional.js', 'بقرار الإدارة', 'قائم قبل المرحلتين 2–4'],
  ['src/lib/brand/institutional.js', 'كيف نعرف أننا نجحنا', 'قائم قبل المرحلتين 2–4'],
  ['src/lib/brand/institutional.js', 'ما تعلمناه', 'قائم قبل المرحلتين 2–4'],
  ['supabase/content/initiative-guide/v1/fields.json', 'المختص', 'قائم قبل المرحلتين 2–4'],
  ['supabase/content/initiative-guide/v1/fields.json', 'الميزانية', 'قائم قبل المرحلتين 2–4'],
  ['supabase/content/initiative-guide/v1/fields.json', 'بشكل', 'قائم قبل المرحلتين 2–4'],
  ['supabase/content/initiative-guide/v1/fields.json', 'صاحب المبادرة', 'قائم قبل المرحلتين 2–4'],
  ['supabase/content/initiative-guide/v1/fields.json', 'كلفة', 'قائم قبل المرحلتين 2–4'],
  ['supabase/content/initiative-guide/v1/fields.json', 'كلفتها', 'قائم قبل المرحلتين 2–4'],
  ['supabase/content/initiative-guide/v1/sectors/gov.json', 'المالك بعد التسليم', 'قائم قبل المرحلتين 2–4'],
  ['supabase/content/initiative-guide/v1/sectors/gov.json', 'الميزانية المتاحة', 'قائم قبل المرحلتين 2–4'],
  ['supabase/content/initiative-guide/v1/sectors/gov.json', 'الميزانية', 'قائم قبل المرحلتين 2–4'],
  ['supabase/content/initiative-guide/v1/sectors/gov.json', 'بشكل', 'قائم قبل المرحلتين 2–4'],
  ['supabase/content/initiative-guide/v1/sectors/gov.json', 'كلفة', 'قائم قبل المرحلتين 2–4'],
  ['supabase/content/initiative-guide/v1/sectors/gov.json', 'كلفتها', 'قائم قبل المرحلتين 2–4'],
  ['supabase/content/initiative-guide/v1/sectors/health.json', 'المالك بعد التسليم', 'قائم قبل المرحلتين 2–4'],
  ['supabase/content/initiative-guide/v1/sectors/health.json', 'المختص', 'قائم قبل المرحلتين 2–4'],
  ['supabase/content/initiative-guide/v1/sectors/health.json', 'الميزانية المتاحة', 'قائم قبل المرحلتين 2–4'],
  ['supabase/content/initiative-guide/v1/sectors/health.json', 'الميزانية', 'قائم قبل المرحلتين 2–4'],
  ['supabase/content/initiative-guide/v1/sectors/health.json', 'بشكل', 'قائم قبل المرحلتين 2–4'],
  ['supabase/content/initiative-guide/v1/sectors/health.json', 'كلفة', 'قائم قبل المرحلتين 2–4'],
  ['supabase/content/initiative-guide/v1/sectors/health.json', 'كلفتها', 'قائم قبل المرحلتين 2–4'],
  ['supabase/content/initiative-guide/v1/sectors/startup.json', 'المالك بعد التسليم', 'قائم قبل المرحلتين 2–4'],
  ['supabase/content/initiative-guide/v1/sectors/startup.json', 'الميزانية المتاحة', 'قائم قبل المرحلتين 2–4'],
  ['supabase/content/initiative-guide/v1/sectors/startup.json', 'الميزانية', 'قائم قبل المرحلتين 2–4'],
  ['supabase/content/initiative-guide/v1/sectors/startup.json', 'بشكل', 'قائم قبل المرحلتين 2–4'],
  ['supabase/content/initiative-guide/v1/sectors/startup.json', 'كلفة', 'قائم قبل المرحلتين 2–4'],
  ['supabase/content/initiative-guide/v1/sectors/startup.json', 'كلفتها', 'قائم قبل المرحلتين 2–4'],
  ['supabase/functions/leaders-api/doc-quality.js', 'الكلفة', 'قائم قبل المرحلتين 2–4'],
  ['supabase/functions/leaders-api/doc-quality.js', 'الميزانية', 'قائم قبل المرحلتين 2–4'],
  ['supabase/functions/leaders-api/labels.js', 'مشروع التخرج', 'قائم قبل المرحلتين 2–4'],
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
const AR = '\\u0621-\\u064A';
const re = (w) => new RegExp(`(?<![${AR}])${norm(w).replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}(?![${AR}])`, 'g');

export function hits() {
  const out = [];
  for (const f of SCANNED) {
    const t = norm(stripComments(readFileSync(join(root, f), 'utf8'), f));
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
