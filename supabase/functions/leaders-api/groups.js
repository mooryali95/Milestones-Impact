// ════════════════════════════════════════════════════════════════
// نمط المجموعة: تجانس المستوى، ونمط العمل لكل مرحلة، والمجموعات
// ════════════════════════════════════════════════════════════════
// إعدادات الدفعة كلها يضبطها الأدمن:
//   level_mode: mixed (كل مشارك بمستواه من القياس) | uniform (محتوى بمستوى واحد للدفعة)
//   content_level: مستوى المحتوى حين تكون uniform
//   stage_modes: { [stage_key]: shared | individual | groups } نمط العمل في المرحلة
//   project_mode: individual | group مشروع فردي أو لكل مجموعة
// المستوى الموحد يسري على المحتوى فقط (الرحلة والكتيب والنماذج والمنهج)،
// ولا يمس القياس ولا المسار ولا التقرير: تبقى من قياس المشارك نفسه.
const LEVELS = ['beginner', 'intermediate', 'advanced'];
const DIMS = ['milestone', 'impact', 'leadership'];
const RANK = { beginner: 0, intermediate: 1, advanced: 2 };

export const LEVEL_MODE_AR = { mixed: 'مختلط: كل مشارك بمستواه من القياس', uniform: 'متجانس: محتوى بمستوى واحد للدفعة كلها' };
export const WORK_MODE_AR = { shared: 'جماعي مع الدفعة', individual: 'فردي', groups: 'في مجموعات' };
export const PROJECT_MODE_AR = { individual: 'فردي: لكل مشارك مشروعه', group: 'جماعي: مشروع لكل مجموعة' };

// مستويات المحتوى للمشارك في دفعته
export function contentLevels(levels, cohort) {
  if (cohort?.level_mode !== 'uniform' || !LEVELS.includes(cohort?.content_level)) return levels || {};
  return Object.fromEntries(DIMS.map((d) => [d, cohort.content_level]));
}

export function cleanStageModes(raw, stageKeys) {
  const keys = new Set(stageKeys || []);
  const out = {};
  for (const [k, v] of Object.entries(raw && typeof raw === 'object' ? raw : {})) {
    if (keys.has(k) && Object.hasOwn(WORK_MODE_AR, v)) out[k] = v;
  }
  return out;
}

// الإعدادات كما تُحفظ في الدفعة
export function cleanGroupSettings(b) {
  const out = {};
  if ('level_mode' in b) {
    if (!Object.hasOwn(LEVEL_MODE_AR, b.level_mode)) throw new Error('نمط المستوى غير معروف');
    out.level_mode = b.level_mode;
  }
  if ('content_level' in b) out.content_level = LEVELS.includes(b.content_level) ? b.content_level : null;
  if ('project_mode' in b) {
    if (!Object.hasOwn(PROJECT_MODE_AR, b.project_mode)) throw new Error('نمط المشروع غير معروف');
    out.project_mode = b.project_mode;
  }
  return out;
}

// المستوى العام للمشارك (وسيط أطره) لتوزيع المجموعات
const overall = (levels) => {
  const r = Object.values(levels || {}).filter((l) => l in RANK).map((l) => RANK[l]).sort((a, b) => a - b);
  return r.length ? r[Math.floor((r.length - 1) / 2)] : -1;
};

// توزيع آلي على عدد من المجموعات:
//   by=level: مجموعات متقاربة المستوى (الأدنى معًا)، مفيد للتمايز في الدفعة المختلطة
//   by=mixed: كل مجموعة فيها من كل المستويات بالتناوب، مفيد للتعلم من الأقران
// ثابت لنفس المدخلات (ترتيب بالاسم ثم المعرف) فلا يتبدل عند إعادة التشغيل.
export function autoGroups(people, count, by = 'mixed') {
  const n = Math.max(1, Math.min(50, Math.round(Number(count) || 1)));
  const list = [...(people || [])].sort((a, b) => overall(a.levels) - overall(b.levels)
    || String(a.name || '').localeCompare(String(b.name || ''), 'ar') || String(a.id).localeCompare(String(b.id)));
  const groups = Array.from({ length: n }, () => []);
  if (by === 'level') {
    const size = Math.ceil(list.length / n);
    list.forEach((p, i) => groups[Math.min(n - 1, Math.floor(i / size))].push(p.id));
  } else {
    // ثعباني: 0..n-1 ثم n-1..0 فتتوازن المستويات والأحجام
    list.forEach((p, i) => {
      const round = Math.floor(i / n), pos = i % n;
      groups[round % 2 ? n - 1 - pos : pos].push(p.id);
    });
  }
  return groups;
}
