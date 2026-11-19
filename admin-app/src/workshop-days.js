// ════════════════════════════════════════════════════════════════
// أيام الورشة في بطاقة المرحلة (W3، تصور الرحلة بالسحب والورش والحضور 2026-11-18، ب5.4)
// ════════════════════════════════════════════════════════════════
// نموذج عرض نقي لقسم «أيام التدريب: 2 من 4 محددة» في بطاقة المرحلة بتبويب «الرحلة»، ولشاشة «الحضور والجلسات».
// المصادر: الجلسات من admin.cohort-workshops (الطريقة الفعلية والمتوقع والحاضر من الخادم)، و«خارج النافذة» من نموذج الخط
// الزمني نفسه (journeyTimeline يحسبه لكل جلسة بتوقيت الرياض)، فلا يُحسب تاريخ هنا. والكتابة كلها بـadmin.workshop-save.
import { countAr, SESSION_MODE_AR } from '../../supabase/functions/leaders-api/labels.js';
import { isUndated, renderJourneyText, SESSION_DEFAULTS, SESSION_LINK_LATER_AR, SESSION_TBD_AR } from '../../supabase/functions/leaders-api/logic.js';
import { timeOnly, weekTime } from './dates.js';
import { outsideSessions } from '../../supabase/functions/leaders-api/journey-timeline.js';

// طريقة توثيق الحضور بكلمات المدير: مصدر واحد للوحة (شاشة الحضور والجلسات وبطاقة المرحلة)
export const VERIFY_AR = Object.freeze({ qr: 'التوثيق برمز QR', join: 'التوثيق بالانضمام من التطبيق', manual: 'التوثيق يدويًا', auto: 'التوثيق آلي بانتهاء الجلسة' });
// حد السعة كقيد القاعدة (workshop_sessions_capacity_check) ورسالة الخادم (cleanCapacity في activities.ts)
export const CAPACITY_MAX = 10000;
// حقل السعة في نموذج الجلسة نفسه، ويظهر بعد ترحيل عمودها وحده (capacity_ready من الخادم)
export const CAPACITY_FIELD = Object.freeze({
  name: 'capacity', label: 'السعة (اختياري)', type: 'number',
  help: `عدد المقاعد في القاعة أو الحد للجلسة عن بعد، من 1 إلى ${CAPACITY_MAX}. للعرض والتنبيه فقط: لا يُمنع أحد من الحضور إن زاد المتوقع عليها.`,
});
// حقول الجلسة مع السعة إن رُحّلت: قبل «مفعّلة» آخر النموذج
export const withCapacity = (fields, ready) => {
  if (!ready) return fields;
  const at = fields.findIndex((f) => f.name === 'active');
  return at < 0 ? [...fields, CAPACITY_FIELD] : [...fields.slice(0, at), CAPACITY_FIELD, ...fields.slice(at)];
};

// ── مدرب الجلسة والبريد عند الحفظ (تصور تشغيل الدفعة 2026-11-19، المرحلة 4) ──
// حقول تُضاف إلى نموذج الجلسة نفسه في «الحضور والجلسات» وبطاقة المرحلة والنقرة على الخط، فالنموذج واحد أينما فُتح.
// المدرب: من خبراء دفعة الجلسة (trainersOf(قيم) من الخادم)، ويظهر بعد ترحيل عموده وحده (trainer_ready).
// الدعوة عند الحفظ: لجلسة دفعة مؤرخة قائمة لم تنتهِ ولم تُدعَ. وإشعار التغيير: لجلسة دُعيت ثم تغيّر موعدها أو مكانها في النموذج.
// كلاهما اختيار صريح يراه المدير قبل الحفظ، والخادم لا يرسل بريدًا بغيرهما ويعيد الفحص نفسه (saveMail في activities.ts)
const localOf = (iso) => {
  if (!iso) return '';
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? '' : new Date(d.getTime() - d.getTimezoneOffset() * 6e4).toISOString().slice(0, 16);
};
const placeKey = (v) => (v.mode === 'online' ? `online|${String(v.join_url || '').trim()}` : `in_person|${String(v.location_ar || '').trim()}`);
/** هل تغيّر الموعد أو المكان في النموذج عما كانت عليه الجلسة؟ قيم النموذج للموعد محلية (datetime-local) فتُقارن بمثلها
 * @param {any} original الجلسة قبل التحرير @param {any} v قيم النموذج الحالية */
export function sessionChanged(original, v) {
  if (!original) return { when: false, where: false };
  return {
    when: localOf(original.starts_at) !== String(v.starts_at || '') || localOf(original.ends_at) !== String(v.ends_at || ''),
    where: placeKey({ mode: original.mode || 'in_person', join_url: original.join_url, location_ar: original.location_ar }) !== placeKey(v),
  };
}
const datedAhead = (v, now = Date.now()) => !!v.starts_at && !!v.ends_at && new Date(v.ends_at).getTime() > now;
/** ما يعرضه النموذج من اختياري البريد لقيمه الحالية: 'invite' أو 'change' أو null
 * @param {{ original?: any, cohortId?: string | null }} ctx cohortId: دفعة الجلسة إن كانت ثابتة (بطاقة المرحلة)، وإلا حقل النموذج */
export function mailChoice(ctx, v, now = Date.now()) {
  const cohort = ctx.cohortId || v.cohort_id || '';
  if (!cohort || v.active === false || !datedAhead(v, now)) return null;
  const o = ctx.original;
  if (!o?.invited_at) return 'invite';
  const c = sessionChanged(o, v);
  // دُعيت وتغيّر موعدها أو مكانها: إشعار بالتغيير. ودُعيت ولم يتغير شيء: لا بريد (إعادة الدعوة من زرها)
  return c.when || c.where ? 'change' : null;
}
export const TRAINER_HELP_AR = 'من مستشار الدفعة وفريق خبرائها. يراه المشارك «مع فلان» في رحلته ودعوته، وتظهر الجلسة للمدرب في بوابته باسمه.';
export const TRAINER_NONE_AR = 'لا خبراء في فريق هذه الدفعة بعد. أضفهم من «الفريق والمجموعات» ليُسمى منهم مدرب.';
/** حقول المدرب والبريد لنموذج الجلسة
 * @param {{ trainersOf?: ((v: any) => { id: string, full_name: string }[]) | null, mail?: { original?: any, cohortId?: string | null } | null }} o */
export function sessionExtras({ trainersOf = null, mail = null } = {}) {
  const out = [];
  if (trainersOf) {
    out.push({
      name: 'expert_id', label: 'المدرب (اختياري)', type: 'select', empty: 'بلا مدرب مسمى',
      options: (v) => Object.fromEntries((trainersOf(v) || []).map((e) => [e.id, e.full_name])),
      // للجلسة العامة لا مدرب: يُسمى لجلسة دفعة بعينها
      show: (v) => trainersOf(v) != null,
      help: (v) => ((trainersOf(v) || []).length ? TRAINER_HELP_AR : TRAINER_NONE_AR),
    });
  }
  if (mail) {
    out.push({
      name: 'invite', label: 'أرسل الدعوة عند الحفظ', type: 'check', show: (v) => mailChoice(mail, v) === 'invite',
      help: 'بريد بالموعد والمكان وملف تقويم لأعضاء الدفعة. والتذكير قبل يوم وقبل ساعة يُرسل آليًا.',
    });
    out.push({
      name: 'notify_change', label: 'أبلغ المدعوين بالتغيير', type: 'check', show: (v) => mailChoice(mail, v) === 'change',
      help: 'أُرسلت دعوة هذه الجلسة من قبل. بريد قصير بالموعد والمكان الجديدين وملف تقويم محدَّث لمن دُعي.',
    });
  }
  return out;
}
/** يفصل اختياري البريد عن صف الجلسة: الصف لـrow، والاختياران بجانبه في جسم admin.workshop-save */
export function saveBody(v, base = {}) {
  const { invite, notify_change, ...row } = v;
  return { row: { ...row, ...base }, ...(invite === true ? { invite: true } : {}), ...(notify_change === true ? { notify_change: true } : {}) };
}
// تأكيد قبل حفظ يرسل بريدًا (المرحلة 4): الدعوة أو إشعار التغيير لأعضاء الدفعة كلهم، فلا يخرج بنقرة واحدة
export const mailConfirm = (out) => (out.invite === true ? { text: `تُحفظ «${out.title_ar || 'الجلسة'}» وتُرسل دعوتها بالبريد إلى أعضاء الدفعة الآن، ومعها ملف تقويم. متابعة؟`, ok: 'احفظ وأرسل الدعوة' }
  : out.notify_change === true ? { text: `يُحفظ التغيير في «${out.title_ar || 'الجلسة'}» ويُرسل به بريد إلى من دُعي إليها، ومعه ملف تقويم محدَّث. متابعة؟`, ok: 'احفظ وأبلغهم' } : null);
const SKIP_AR = Object.freeze({
  general: 'لم تُرسل الدعوة: الجلسة لكل الدفعات', undated: 'لم يُرسل بريد: الجلسة بلا موعد', ended: 'لم يُرسل بريد: الجلسة انتهت',
  inactive: 'لم يُرسل بريد: الجلسة ملغاة', invited: 'الدعوة أُرسلت من قبل، فلم تُرسل ثانية',
});
const mailCount = (r, one, many) => (r.failed ? `${many} إلى ${r.sent}، وتعذّرت ${r.failed}` : r.total === 0 ? 'لا أعضاء في الدفعة يصلهم بريد الآن' : `${one} إلى ${r.sent} ${r.sent >= 3 && r.sent <= 10 ? 'مشاركين' : 'مشاركًا'}`);
/** ما جرى للبريد بعد الحفظ، جملة تُلحق برسالة الحفظ. فارغ إن لم يُطلب بريد */
export function mailResultAr(r) {
  if (!r) return '';
  if (r.mail_error) return 'وتعذّر البريد، فأرسل الدعوة من زرها';
  const m = r.invite || r.change;
  if (!m) return '';
  if (m.skipped) return SKIP_AR[m.skipped] || 'لم يُرسل بريد';
  return r.invite ? mailCount(m, 'وأُرسلت الدعوة', 'وأُرسلت الدعوة') : mailCount(m, 'وأُبلغ بالتغيير', 'وأُرسل إشعار التغيير');
}
/** رسالة الحفظ كاملة: النص، ثم ما لم يُحفظ قبل ترحيله، ثم ما جرى للبريد */
export function savedAr(msg, r) {
  const skipped = [r?.capacity_skipped ? 'السعة' : '', r?.trainer_skipped ? 'المدرب' : ''].filter(Boolean);
  return [msg, skipped.length ? `${skipped.join(' و')} لم ${skipped.length > 1 ? 'يُحفظا' : skipped[0] === 'السعة' ? 'تُحفظ' : 'يُحفظ'} لأن قاعدة البيانات لم تُحدَّث بعد` : '', mailResultAr(r)].filter(Boolean).join('، ');
}

const daysAr = (n) => countAr(n, 'يوم واحد', 'يومان', 'أيام', 'يومًا');
/** سطر الأثر قبل حفظ ورشة جديدة (القرار 6): تُحسب لمن ينقصه يوم ولا تزيد المطلوب
 * @param {{ need: number }} req بند الحضور (stageWorkshopReqs) */
export const extraEffectAr = (req) => `المطلوب حضور ${daysAr(req?.need || 1)}. هذه الورشة تُحسب لمن ينقصه يوم، ولا تزيد المطلوب.`;
export const OUTSIDE_SAVE_AR = 'خارج نافذة المرحلة: الحضور يُحسب، وراجع الموعد.';
// «18 من السعة 20»، وتنبيه لا منع إن زاد المتوقع على السعة (أ8: السعة عرض وتنبيه فقط)
export const capacityAr = (expected, capacity) => (capacity ? `${expected ?? 0} من السعة ${capacity}` : '');
export const capacityOver = (expected, capacity) => !!capacity && Number(expected) > Number(capacity);
export const capacityOverAr = (expected, capacity) => (capacityOver(expected, capacity)
  ? `المتوقع (${expected}) أكثر مما تسعه (${capacity}). الحضور لا يُمنع، فراجع المكان أو أضف يومًا آخر.` : '');

/** متطلبات الحضور في المرحلة: الجلسات الجماعية الظاهرة العاملة، بعدد أيامها المطلوب
 * @param {any} def تعريف الدفعة (admin.cohort-definition) @param {string} key مفتاح المرحلة */
export function stageWorkshopReqs(def, key) {
  const reqs = def?.requirements || [];
  return reqs.filter((r) => r.stage_key === key && r.kind === 'workshop' && r.active !== false && !r.hidden && r.id)
    .sort((a, b) => (a.sort ?? 0) - (b.sort ?? 0))
    .map((r) => ({ id: r.id, title: renderJourneyText(r.title_ar || '', { reqs }), need: Number(r.config?.sessions_required) || SESSION_DEFAULTS.sessions_required, verify: r.config?.verify || 'qr' }));
}

/** قسم الأيام في بطاقة مرحلة: العنوان والعدّاد، وصف لكل يوم بموعده ومكانه وطريقته وحضوره وسعته وتنبيهاته
 * @param {{ def: any, stage: { key: string, title: string }, sessions?: any[] | null, model?: any, cohortId?: string, now?: number }} o
 * sessions: من admin.cohort-workshops، أو null قبل قراءتها (فتُقرأ من جلسات التعريف بلا أعداد) */
export function workshopDays({ def, stage, sessions = null, model = null, cohortId = '', now = Date.now() }) {
  const reqs = stageWorkshopReqs(def, stage.key);
  if (!reqs.length) return null;
  const ids = new Set(reqs.map((r) => r.id));
  const list = (sessions ?? def?.sessions ?? []).filter((s) => ids.has(s.requirement_id) && (!s.cohort_id || !cohortId || s.cohort_id === cohortId));
  // «خارج نافذة المرحلة» من الخط نفسه: كل جلسة مؤرخة لها نقطة بعلامة outside
  const outside = new Set(outsideSessions(model).map((x) => x.session));
  const reqTitle = new Map(reqs.map((r) => [r.id, r.title]));
  const rows = list.map((s) => {
    const undated = isUndated(s);
    const started = !undated && Date.parse(s.starts_at) <= now;
    const held = !undated && Date.parse(s.ends_at) < now;
    const online = s.mode === 'online';
    const known = s.expected != null;
    const verify = s.verify || reqs.find((r) => r.id === s.requirement_id)?.verify || 'qr';
    return {
      id: s.id, req_id: s.requirement_id, req_title: reqTitle.get(s.requirement_id) || '', title: s.title_ar, active: s.active !== false, general: !s.cohort_id,
      undated, held, started, upcoming: !undated && !held,
      when_ar: undated ? SESSION_TBD_AR : `${weekTime(s.starts_at)} إلى ${timeOnly(s.ends_at)}`,
      mode: online ? 'online' : 'in_person', place_ar: online ? `${SESSION_MODE_AR.online}${s.join_url ? '' : `، ${SESSION_LINK_LATER_AR}`}` : s.location_ar || `${SESSION_MODE_AR.in_person}، المكان لم يُحدد بعد`,
      verify, verify_ar: VERIFY_AR[verify] || verify, qr: verify === 'qr',
      expected: known ? s.expected : null, attended: known ? s.attended : null,
      // المتوقع دائمًا، والحاضر بعد البدء (من يوم انعقد أو بدأ)
      counts_ar: !known ? '' : started ? `حضر ${s.attended} من ${s.expected}` : `المتوقع ${s.expected}`,
      capacity: s.capacity ?? null, capacity_ar: capacityAr(known ? s.expected : 0, s.capacity),
      over: known && capacityOver(s.expected, s.capacity), over_ar: known ? capacityOverAr(s.expected, s.capacity) : '',
      outside: outside.has(s.id), invited: !!s.invited_at, can_invite: !!s.cohort_id && !undated && !held && s.active !== false,
      trainer: s.trainer || '', trainer_ar: s.trainer ? `مع ${s.trainer}` : '',
      raw: s,
    };
  });
  const need = reqs.reduce((n, r) => n + r.need, 0);
  const set = rows.filter((r) => r.active && !r.undated).length;
  const head = `أيام ${stage.title}`;
  return {
    reqs, rows, need, set,
    head_ar: head,
    count_ar: set > need ? `${daysAr(set)} محددة، والمطلوب حضور ${need}` : `${set} من ${need} محددة`,
    tone: set < need ? 'warn' : 'ok',
    empty_ar: 'لا أيام بعد. أضف أول يوم أو ورشة ليظهر للمشاركين في رحلتهم بموعده ومكانه.',
  };
}
