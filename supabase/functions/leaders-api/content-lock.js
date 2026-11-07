// ════════════════════════════════════════════════════════════════
// ملكية المحتوى (D01 في سجل قرارات لجنة الخبراء): المستودع هو الأصل، واللوحة كاتب مسودة
// ════════════════════════════════════════════════════════════════
// المحتوى المُقاس والنظامي لا يُعدَّل حيًا من اللوحة: نص الفقرة وخياراتها ودرجاتها، واختبار الباب،
// ومستوى الباب، ومفاتيح كاتون ونقاطه، ورموز المتطلبات النظامية، ومفاتيح النماذج، وتفعيل الأدوات
// وإصداراتها. يتغير في supabase/content ثم بترحيل مولّد بعد نجاح المتحققات.
// والنص غير المُقاس (متن الباب، والتأمل، والعناوين، والمساعدة) يُحرَّر من اللوحة بعامل ثانٍ
// ويُسجَّل بقيمته السابقة، ثم يُصدَّر إلى المستودع بـ scripts/content/export-live.mjs.
// مصدر واحد يقرؤه الخادم (admin.ts وkaton.ts) ولوحة الإدارة واختباراتهما.
import { AUTO_CHECKS } from './logic.js';

export const REPO_EDIT_AR = 'محتوى مُقاس يُعدَّل من المستودع (supabase/content) بترحيل مولّد، لا من اللوحة';

// رموز متطلبات يقرؤها الكود باسمها: تغيير رمزها أو نوعها يكسر ما يحسمها
export const SYSTEM_REQUIREMENT_CODES = Object.freeze([...Object.keys(AUTO_CHECKS), 'E-CASE', 'E-POST', 'T-REACT'].sort());

// لكل كيان: الحقول المقفلة بعد الإنشاء، وهل يُنشأ أو يُحذف من اللوحة
// editable بدل locked: كل ما عداه مقفل
export const CONTENT_LOCK = Object.freeze({
  questions:          { editable: ['help_ar', 'sort'], create: false, remove: false },
  handbook_modules:   { locked: ['quiz_md', 'min_level', 'dimension', 'chapter_key'], create: false, remove: false },
  learning_models:    { locked: ['key'] },
  stage_requirements: { locked: [] },
  instruments:        { locked: ['active'] },
});

// النص الفارغ وnull سواء، والمسافات في الطرفين لا تُعد تغييرًا
const norm = (x) => { const v = typeof x === 'string' ? x.trim() : x; return v === '' || v === undefined ? null : v; };
const same = (a, b) => JSON.stringify(norm(a)) === JSON.stringify(norm(b));

// ما يرفضه الحفظ: [{ field, msg }]. current الصف المخزن (null للجديد).
// الحقل المرسل بقيمته المخزنة نفسها لا يُعد تغييرًا، فيبقى المحرر يرسل الصف كاملًا.
export function lockedChanges(entity, row, current) {
  const rule = CONTENT_LOCK[entity];
  if (!rule) return [];
  const out = [];
  if (!current) {
    if (rule.create === false) out.push({ field: '*', msg: `لا يُنشأ هذا من اللوحة: ${REPO_EDIT_AR}` });
    if (entity === 'stage_requirements' && SYSTEM_REQUIREMENT_CODES.includes(String(row.code || '').trim())) {
      out.push({ field: 'code', msg: `الرمز ${row.code} محجوز لمتطلب نظامي يحسمه الكود` });
    }
    return out;
  }
  const changed = Object.keys(row).filter((f) => !same(row[f], current[f]));
  const locked = rule.editable ? changed.filter((f) => !rule.editable.includes(f)) : changed.filter((f) => rule.locked.includes(f));
  for (const f of locked) out.push({ field: f, msg: `الحقل ${f}: ${REPO_EDIT_AR}` });
  if (entity === 'stage_requirements') {
    if (changed.includes('code')) out.push({ field: 'code', msg: 'رمز المتطلب ثابت بعد إنشائه، لأن الرحلة والتقارير تقرأ التقدم به' });
    if (SYSTEM_REQUIREMENT_CODES.includes(current.code) && changed.includes('kind')) {
      out.push({ field: 'kind', msg: `المتطلب ${current.code} نظامي يحسمه الكود، فلا يتغير نوعه` });
    }
  }
  return out;
}

export const removeLocked = (entity) => CONTENT_LOCK[entity]?.remove === false;
