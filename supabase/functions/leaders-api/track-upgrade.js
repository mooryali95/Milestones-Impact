// ════════════════════════════════════════════════════════════════
// الترقية بين المسارات (بطاقة المسار، المرحلة 3، قرار المالك 2026-11-25)
// ════════════════════════════════════════════════════════════════
// حين يعتمد المستشار مستويات جديدة بعد إعادة القياس فيتغير المسار، لا يضيع شيء كتبه المشارك: الإجابات مفتاحها الفصل
// والحقل (model_submissions)، وتقدم الكتاب مفتاحه الباب (handbook_progress)، وقاعدة «لا فقد» (keptModel، fieldsFor)
// تبقي الفصل أو الحقل الذي كتب فيه ظاهرًا ولو نزل مستواه. ما يضيفه المستوى الجديد يُحسب هنا مرة واحدة ويُخزَّن
// (participant_new_items) فيُعلَّم «جديد في مستواك» حتى يراه، ويُكتب سطر التطور في سجل المسار (participant_track_history).
import { DIM_AR } from './labels.js';
import { capstoneModels, modelFields } from './capstone.js';
import { DIMENSIONS, handbookModulesFor, LEVELS, trackKey } from './logic.js';

const RANK = Object.fromEntries(LEVELS.map((l, i) => [l, i]));

/** الأطر التي ارتفع مستواها بين مسارين */
export const raisedFrameworks = (from, to) => DIMENSIONS.filter((d) => from?.[d] in RANK && to?.[d] in RANK && RANK[to[d]] > RANK[from[d]]);

/**
 * ما أضافه المسار الجديد: أبواب الكتاب، وفصول الوثيقة، وحقول الفصول القائمة. لا يحذف شيئًا (الحذف لا يقع: «لا فقد»).
 * @param {{ from: Record<string,string>|null, to: Record<string,string>, modules: any[], models: any[], scope?: string|null, priorityFrom?: string|null, priorityTo?: string|null }} a
 */
export function upgradeDiff({ from, to, modules = [], models = [], scope = null, priorityFrom = null, priorityTo = null }) {
  if (!from || !to || trackKey(from) === trackKey(to)) return { handbook: [], chapters: [], fields: [] };
  const hbOld = new Set(handbookModulesFor(modules, from).map((m) => String(m.id)));
  const handbook = handbookModulesFor(modules, to).map((m) => String(m.id)).filter((id) => !hbOld.has(id));
  const capOld = Object.fromEntries(capstoneModels(models, from, scope).map((m) => [m.key, m]));
  const chapters = [];
  const fields = [];
  for (const m of capstoneModels(models, to, scope)) {
    if (!capOld[m.key]) { chapters.push(m.key); continue; }
    const had = new Set(modelFields(capOld[m.key], from, scope, priorityFrom).map((f) => f.key));
    for (const f of modelFields(m, to, scope, priorityTo)) if (!had.has(f.key)) fields.push(`${m.key}.${f.key}`);
  }
  return { handbook, chapters, fields };
}

/** سطر التطور في الرحلة: «تقدمت في إطار …، وهذا ما أضيف إلى منهجك» */
export function evolutionLine(from, to) {
  const up = raisedFrameworks(from, to).map((d) => DIM_AR[d]);
  if (!up.length) return null;
  const names = up.length === 1 ? up[0] : `${up.slice(0, -1).join('، ')} و${up[up.length - 1]}`;
  return `تقدمت في إطار ${names}، وهذا ما أضيف إلى منهجك`;
}

/** صفوف «جديد في مستواك» من الفرق (participant_new_items) */
export const newItemRows = (participantId, trackKeyTo, diff) => [
  ...diff.handbook.map((key) => ({ participant_id: participantId, kind: 'handbook', key, track_key: trackKeyTo })),
  ...diff.chapters.map((key) => ({ participant_id: participantId, kind: 'chapter', key, track_key: trackKeyTo })),
  ...diff.fields.map((key) => ({ participant_id: participantId, kind: 'field', key, track_key: trackKeyTo })),
];

/** ملخص الإضافة للسجل والإشعار: أعداد لا مفاتيح */
export const diffSummary = (diff) => ({ handbook: diff.handbook.length, chapters: diff.chapters.length, fields: diff.fields.length });

export function upgradeMessage(name, line, sum) {
  const parts = [sum.handbook && `${sum.handbook} من أبواب الكتاب`, sum.chapters && `${sum.chapters} من فصول الوثيقة`, sum.fields && `${sum.fields} من الحقول في فصولك`].filter(Boolean);
  return {
    subject: line || 'تحدّث منهجك في برنامج القادة',
    html: `<p>${name ? `مرحبًا ${name}،` : 'مرحبًا،'}</p><p>${line || 'اعتمد مستشارك مستوياتك الجديدة'}${parts.length ? `: ${parts.join('، ')}.` : '.'}</p><p>كل ما كتبته باقٍ كما هو، والجديد معلّم «جديد في مستواك» في كتابك ووثيقة مبادرتك.</p>`,
  };
}
