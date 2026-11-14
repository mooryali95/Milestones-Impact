// ════════════════════════════════════════════════════════════════
// مرافق بناء المبادرة: دليل الحقل والمثال المحلول، العون بقدر الحاجة يتلاشى بالمستوى
// ════════════════════════════════════════════════════════════════
// التصور: docs/content/2026-11-14-تصور-مرافق-بناء-المبادرة-v1.md (المرحلتان 4أ و4ب، اعتمدهما المالك).
// أثر المثال المحلول وانعكاس الخبرة: ما يعين المبتدئ يثقل على الخبير، فالعون نفسه يُعرض بثلاث صور:
//   التأسيسي: المطلوب والخطأ الشائع ومثال من قطاعه، مفتوحة بجانب الحقل
//   المتوسط: «كيف أكتبه؟» مطويًا، وفيه المثال وسؤال يرفع الجودة
//   المتقدم: «سؤال الخبير» مطويًا: تحدٍّ لا شرح، والمثال الكامل عند الطلب فقط
// المحتوى في المستودع (supabase/content/initiative-guide)، غير مُقاس، يراجعه خبير المحتوى.
import FIELDS from '../../supabase/content/initiative-guide/v1/fields.json';
import GOV from '../../supabase/content/initiative-guide/v1/sectors/gov.json';
import HEALTH from '../../supabase/content/initiative-guide/v1/sectors/health.json';
import { costSummary } from '../../supabase/functions/leaders-api/capstone.js';

export const GUIDE_MODES = Object.freeze({ beginner: 'open', intermediate: 'collapsed', advanced: 'expert' });

// الأمثلة المحلولة بترتيب العرض. القطاع الأقرب أولًا، والخدمات الحكومية أقرب مثال لمن لم يُضف قطاعه بعد
export const EXAMPLES = Object.freeze([GOV, HEALTH]);
const BY_SECTOR = Object.fromEntries(EXAMPLES.map((x) => [x.sector, x]));
const SECTOR_WORDS = [['health', /صح|مستشف|طب|علاج|رعاي|مستوصف|تمريض|دواء|صيدل/]];

/** مفتاح قطاع المثال من قطاع المشارك المكتوب نصًا حرًا في ملفه، ومعه هل طابق قطاعه فعلًا */
export function sectorOf(text) {
  const t = String(text || '');
  for (const [key, re] of SECTOR_WORDS) if (re.test(t)) return { key, matched: true };
  return { key: 'gov', matched: /حكوم|وزار|هيئ|بلدي|أمان|جهة عامة|قطاع عام/.test(t) };
}

/** الأمثلة مرتبة: مثال قطاع المشارك أولًا */
export const examplesFor = (sectorText) => { const k = sectorOf(sectorText).key; return [BY_SECTOR[k], ...EXAMPLES.filter((x) => x.sector !== k)]; };

/** حقل المثال المحلول لقطاع المشارك: { value, type, columns, sector_title } أو null */
export function exampleFor(modelKey, fieldKey, sectorText) {
  const ex = BY_SECTOR[sectorOf(sectorText).key];
  const f = ex?.sections.find((s) => s.key === modelKey)?.fields.find((x) => x.key === fieldKey);
  if (!f || f.value == null || (Array.isArray(f.value) ? !f.value.length : !String(f.value).trim())) return null;
  return { value: f.value, type: f.type, columns: f.columns || null, sector_title: ex.sector_title };
}

/**
 * عون الحقل بمستوى المشارك في إطار الفصل، أو null إن لم يكن للحقل دليل
 * @param {string} modelKey @param {string} fieldKey @param {string | null | undefined} level @param {string | null} [sectorText]
 */
export function guideFor(modelKey, fieldKey, level, sectorText = null) {
  const g = FIELDS[modelKey]?.[fieldKey];
  if (!g || typeof g !== 'object') return null;
  const mode = GUIDE_MODES[level] || 'collapsed';
  // المتقدم لا يُعرض له المثال بجانب الحقل: يُثقل عليه (انعكاس الخبرة)، والوثيقة الكاملة متاحة له في صفحة المبادرة
  const example = mode === 'expert' ? null : exampleFor(modelKey, fieldKey, sectorText);
  return { mode, meaning: g.meaning, mistake: g.mistake, challenge: g.challenge, example };
}

export const hasGuide = (modelKey) => !!FIELDS[modelKey] && typeof FIELDS[modelKey] === 'object';

/** المثال المحلول وثيقةً كاملة بصيغة الخادم، يطبعها قالب الوثيقة نفسه (capstoneReport) */
export function exampleDoc(ex) {
  const sec = (k) => ex.sections.find((s) => s.key === k);
  const val = (k, f) => sec(k)?.fields.find((x) => x.key === f)?.value ?? null;
  const cp = sec('cost-plan');
  const cost = cp ? costSummary({ fields: cp.fields }, Object.fromEntries(cp.fields.map((f) => [f.key, f.value]))) : null;
  return {
    meta: {
      ref: `MI-EX-${ex.sector.toUpperCase()}`, version: 1, example: true, status: 'example', status_title: 'مثال محلول',
      initiative: ex.initiative, scope: 'project', scope_title: 'مشروع', readiness: 100,
      participant: { name: 'مثال محلول' }, org: { name: ex.sector_title },
      sponsor: val('initiative-charter', 'sponsor'), start: val('initiative-charter', 'start'), end: val('initiative-charter', 'end'),
    },
    summary: ex.about,
    sections: ex.sections.map((s) => ({ key: s.key, title: s.title, dimension: s.dimension, fields: s.fields })),
    cost, checks: [], review: null, sponsor: null, rubric: [],
  };
}
