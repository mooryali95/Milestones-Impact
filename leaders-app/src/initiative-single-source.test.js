// حارس المصدر الواحد لكل ما بُني في بناء المبادرة (#331 إلى المرحلة الخامسة): لكل معلومة أصل واحد، والباقي يستورد منه.
// تقرير المراجعة: docs/content/2026-11-14-تصور-بناء-المبادرة-وحالة-العمل-v1.md (قسم «مراجعة المصدر الواحد»).
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { CARD_CRITERIA, CARD_REVIEW_CRITERIA } from '../../supabase/functions/leaders-api/capstone.js';
import { EXAMPLE_SECTORS } from '../../supabase/functions/leaders-api/visibility.js';
import { EXAMPLES } from '../../supabase/content/initiative-guide/v1/examples.js';
import { DISCOVERY_CRITERIA } from './guide.js';

const root = process.cwd();
const read = (p) => readFileSync(resolve(root, p), 'utf8');
// كل ملفات المصدر في التطبيقين والخادم والقالب، دون الناتج المبني والاختبارات
const files = (dir) => readdirSync(resolve(root, dir)).flatMap((f) => {
  const p = join(dir, f);
  if (statSync(resolve(root, p)).isDirectory()) return f === 'node_modules' ? [] : files(p);
  return /\.(js|jsx|ts)$/.test(f) && !/\.test\.|_test\.ts$/.test(f) ? [p] : [];
});
const SOURCES = ['leaders-app/src', 'admin-app/src', 'supabase/functions/leaders-api', 'src/lib/brand'].flatMap(files);
const holding = (needle) => SOURCES.filter((p) => read(p).includes(needle));

describe('مصدر واحد لكل معلومة في بناء المبادرة', () => {
  it('معايير البطاقة: أصل واحد بصيغتين (للمستشار وللمشارك في الاكتشاف)', () => {
    expect(CARD_REVIEW_CRITERIA).toEqual(CARD_CRITERIA.map((c) => c.advisor));
    expect(DISCOVERY_CRITERIA).toEqual(CARD_CRITERIA.map((c) => [c.key, c.self]));
    expect(holding('يمكن البدء بها وإثبات قيمتها في مدة البرنامج')).toEqual(['supabase/functions/leaders-api/capstone.js']);
  });
  it('المبادرات المحلولة: تُستورد من examples.js وحده، وقطاعاتها هي مفاتيح الرؤية', () => {
    expect(holding('sectors/gov.json')).toEqual([]);
    expect(holding('initiative-guide/v1/examples.js').sort()).toEqual(['admin-app/src/screens/Capstones.jsx', 'leaders-app/src/guide.js']);
    expect(EXAMPLES.map((x) => x.sector)).toEqual([...EXAMPLE_SECTORS]);
  });
  it('حد الخطر العالي ثابت واحد، لا رقم مكتوب في كل موضع', () => {
    for (const p of SOURCES) expect(/\*[^;\n]*>=\s*12\b|score\s*>=\s*12\b|a \* b >= 12/.test(read(p)), p).toBe(false);
  });
  it('حالة نقاط المراجعة بالعربية: أصل واحد في tracking.js', () => {
    expect(holding("upcoming: 'لم يحن موعدها'")).toEqual(['supabase/functions/leaders-api/tracking.js']);
  });
  it('عائلات القطاع: أصل واحد في logic.js، يقرؤه الترشيح والمثال المحلول', () => {
    expect(holding('SECTOR_FAMILIES = ')).toEqual(['supabase/functions/leaders-api/logic.js']);
    expect(read('leaders-app/src/guide.js')).toContain('sectorFamily(text)');
  });
  it('الميثاق وحالة العمل وتقرير الإغلاق وسجل القرارات عروض مولّدة: لا جدول لها في أي ترحيل (جداول النسخ الاحتياطي ليست مصدر بيانات)', () => {
    const mig = readdirSync(resolve(root, 'supabase/migrations')).filter((f) => f >= '20261114140000').map((f) => read(`supabase/migrations/${f}`)).join('\n');
    for (const name of ['business_case', 'charter_page', 'closure', 'gate_decisions', 'decisions']) expect(mig, name).not.toMatch(new RegExp(`create table if not exists leaders\\.(?!backup_)\\w*${name}`, 'i'));
  });
  it('معنى المبادرة وخريطة فصولها ومسردها: anatomy.json يُقرأ عبر anatomy.js وحده، والمرجع مولَّد منه', () => {
    // لا يستورد الملف الخام أحد غير anatomy.js (وهو خارج مجلدات المصدر هنا)
    expect(SOURCES.filter((p) => /from '[^']*anatomy\.json'/.test(read(p)))).toEqual([]);
    expect(read('supabase/content/initiative-guide/v1/anatomy.js')).toContain("import A from './anatomy.json';");
    // master-book-drafts.js نص مسودة مولَّد يذكر الملف اسمًا في جدول فحص التضارب، لا يقرؤه
    expect(holding('initiative-guide/v1/anatomy.js').filter((p) => !p.endsWith('master-book-drafts.js')).sort()).toEqual(['leaders-app/src/Term.jsx', 'leaders-app/src/screens/InitiativeMap.jsx', 'src/lib/brand/capstone.js']);
    // المصطلح يُعرَّف في المسرد وحده: لا تعريف مكتوب لخط الأساس في شاشة
    expect(holding('قيمة المؤشر اليوم قبل أن تبدأ')).toEqual([]);
  });
  it('خطة الانطلاق عرض مولّد: لا حقل ولا جدول لها', () => {
    const mig = readdirSync(resolve(root, 'supabase/migrations')).filter((f) => f >= '20261115000000').map((f) => read(`supabase/migrations/${f}`)).join('\n');
    expect(mig).not.toMatch(/launch_plan|launch-plan/);
  });
  it('ما يكتبه الاكتشاف يُحفظ في بطاقة المبادرة نفسها، لا في مكان ثانٍ', () => {
    const d = read('leaders-app/src/screens/Discovery.jsx');
    expect(d).toContain("call('models.save', { id: charterId, answers: answersOut, submit: false })");
    expect(d).not.toMatch(/localStorage/);
  });
});
