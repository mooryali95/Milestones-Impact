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
import { COUNTING_AR, COUNTING_HELP_AR, countingImpactAr, countingOf, eachWorkshop, OPTIONAL_NOT_READY_AR, optionalReq, optionalSession } from '../../supabase/functions/leaders-api/optional.js';

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
// المدرب: من خبراء دفعة الجلسة (trainersOf(قيم) من الخادم).
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
  // إعادة ملغاة: دعوتها من سؤال الإعادة (leaveAsk) لا من مربع هنا. ونقلها إلى دفعة أخرى: الدفعة الجديدة لم تُدعَ
  if (o && o.active === false && o.invited_at) return null;
  if (!o?.invited_at || (!ctx.cohortId && !!o.cohort_id && cohort !== o.cohort_id)) return 'invite';
  const c = sessionChanged(o, v);
  // دُعيت وتغيّر موعدها أو مكانها: إشعار بالتغيير. ودُعيت ولم يتغير شيء: لا بريد (إعادة الدعوة من زرها)
  return c.when || c.where ? 'change' : null;
}
export const TRAINER_HELP_AR = 'من مستشار الدفعة وفريق خبرائها. يراه المشارك «مع فلان» في رحلته ودعوته، وتظهر الجلسة للمدرب في بوابته باسمه. تصله دعوتها وتحديثها بالبريد مع المدعوين، وتغييره في جلسة أُرسلت دعوتها يبلّغ السابق ويدعو الجديد.';
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
      help: 'بريد بالموعد والمكان وملف تقويم لأعضاء الدفعة ولمدربها المسمى. والتذكير قبل يوم وقبل ساعة يُرسل آليًا.',
    });
    out.push({
      name: 'notify_change', label: 'أبلغ المدعوين بالتغيير', type: 'check', show: (v) => mailChoice(mail, v) === 'change',
      help: 'أُرسلت دعوة هذه الجلسة من قبل. بريد قصير بالموعد والمكان الجديدين وملف تقويم محدَّث لمن دُعي ولمدربها المسمى.',
    });
  }
  return out;
}
/** يفصل اختياري البريد وتأكيد الوسم عن صف الجلسة: الصف لـrow، والباقي بجانبه في جسم admin.workshop-save */
export function saveBody(v, base = {}) {
  const { invite, notify_change, counting_confirm, notify_cancel, reinvite, ...row } = v;
  return { row: { ...row, ...base }, ...(invite === true ? { invite: true } : {}), ...(notify_change === true ? { notify_change: true } : {}), ...(counting_confirm === true ? { counting_confirm: true } : {}),
    ...(notify_cancel === false ? { notify_cancel: false } : {}), ...(reinvite === true ? { reinvite: true } : {}) };
}

// ── إلغاء الجلسة وحذفها ونقلها وإعادتها (قرار المالك 2026-11-22، بريد الإلغاء في activities.ts) ──
// قبل التأكيد يرى المدير من الخادم كم مشاركًا يُبلَّغ (العدد من القراءة التي يرسل بها)، وله ألا يبلّغ لجلسة أُنشئت بالخطأ.
// والافتراض الإبلاغ. جلسة لم تُعلن أو انتهت أو بلا موعد أو عامة لا بريد لها، ويُقال ذلك في سطره. ومن يسحب الإلغاء اكتماله
// يُعدّ في سطر تحذير. وإعادة الملغاة تسأل: هل يُدعون من جديد؟
// وسحب موعد جلسة أُعلنت (undate) يسأل السؤال نفسه: المدعوون يُبلَّغون بملف يزيل الموعد، والجلسة باقية «يُحدد لاحقًا».
// noun: ما تسمي به الشاشة الجلسة («اليوم» في بطاقة المرحلة، «الموعد» في «الحضور والجلسات»)
const peopleAr = (n) => countAr(n, 'مشارك واحد', 'مشاركَين', 'مشاركين', 'مشاركًا');
/** أي خروج أو عودة في هذا الحفظ؟ يطابق leaveOf في الخادم. الدفعة تُقارن حين يحملها النموذج وحده (شاشة «الحضور والجلسات»)
 * @param {any} original الجلسة قبل التحرير @param {any} out ما سيُحفظ @returns {'cancel' | 'move' | 'restore' | 'undate' | null} */
export function leaveKind(original, out) {
  if (!original) return null;
  if (original.active === false) return out.active !== false ? 'restore' : null;
  if (out.active === false) return 'cancel';
  if ('cohort_id' in out && !!original.cohort_id && (out.cohort_id || null) !== original.cohort_id) return 'move';
  return !isUndated(original) && !out.starts_at ? 'undate' : null;
}
const NO_MAIL_AR = Object.freeze({
  unannounced: 'لا يُرسل بريد: لم تُرسل دعوة هذه الجلسة لأحد.', ended: 'لا يُرسل بريد: الجلسة انتهت.', undated: 'لا يُرسل بريد: الجلسة بلا موعد.',
  general: 'لا يُرسل بريد: الجلسة لكل الدفعات، فلا يُعرف مدعووها.', inactive: 'لا يُرسل بريد: الجلسة ملغاة من قبل.',
});
const LEAVE_AR = Object.freeze({
  cancel: { ask: (t) => `يُلغى «${t}»: يختفي من رحلة المشاركين ولا يُرسل له تذكير، وما سُجّل من حضور محفوظ. يُعاد بنقرة.`, ok: (noun) => `ألغِ ${noun}`, mail: 'بريد الإلغاء', lost: 'بإلغائه', gone: 'الملغى' },
  delete: { ask: (t) => `يُحذف «${t}» نهائيًا ولا يُستعاد.`, ok: () => 'احذف', mail: 'بريد الإلغاء', lost: 'بحذفه', gone: 'الملغى' },
  move: { ask: (t) => `يُنقل «${t}» عن دفعته، فيختفي من رحلة أعضائها.`, ok: () => 'احفظ وانقله', mail: 'بريد الإلغاء', lost: 'بنقله', gone: 'الملغى' },
  undate: { ask: (t) => `يُسحب موعد «${t}»: يبقى في رحلة المشاركين بلا موعد، «${SESSION_TBD_AR}».`, ok: () => 'احفظ بلا موعد', mail: 'بريد سحب الموعد', lost: '', gone: 'المسحوب' },
});
const LEAVE_CHECK_AR = Object.freeze({
  undate: { label: 'أبلغ المدعوين بسحب الموعد', help: 'أزل العلامة إن لم يحتج أحد أن يعلم. يبقى الموعد حينها في تقاويمهم.' },
  other: { label: 'أبلغ المدعوين بالإلغاء', help: 'أزل العلامة لجلسة أُنشئت بالخطأ ولا يحتاج أحد أن يعلم بها.' },
});
const withTrainer = (n, trainer) => (n ? `${peopleAr(n)}${trainer ? `، وإلى المدرب ${trainer}` : ''}` : trainer ? `المدرب ${trainer}` : '');
/** سؤال التأكيد من معاينة الخادم (leave في رد admin.workshop-save وadmin.workshop-delete بـpreview)
 * @param {any} leave { kind, notify: { members, trainer } | null, skipped, uncomplete, told_at? } @param {string} title عنوان الجلسة
 * @param {{ noun?: string }} o noun: «اليوم» أو «الموعد» كما تسميه الشاشة
 * @returns {{ text: string, lines: any[], ok: string, danger?: boolean, check?: any } | null} null: لا سؤال (إعادة بلا دعوة، أو سحب موعد لا يبلَّغ به أحد) */
export function leaveAsk(leave, title, { noun = 'اليوم' } = {}) {
  if (!leave) return null;
  const name = title || 'الجلسة';
  const who = leave.notify ? withTrainer(leave.notify.members, leave.notify.trainer) : '';
  if (leave.kind === 'restore') {
    if (!who) return null;
    return {
      text: `يُعاد «${name}» ويظهر للمشاركين في رحلتهم.`, ok: 'أعده',
      lines: [`أُعلن هذا ${noun} ثم أُلغي. تُرسل دعوته من جديد إلى ${who}، ومعها ملف يعيد الموعد إلى التقويم.`],
      check: { name: 'reinvite', label: 'ادعُهم من جديد', help: `بلا العلامة يُعاد ${noun} بلا بريد، وتُرسل دعوته لاحقًا من زرها.`, checked: true },
    };
  }
  const undate = leave.kind === 'undate';
  // سحب موعد جلسة لم يُدعَ إليها أحد حفظ عادي: لا سؤال
  if (undate && !who) return null;
  const t = LEAVE_AR[leave.kind] || LEAVE_AR.cancel;
  const lines = [];
  if (who) lines.push(`يصل ${t.mail} إلى ${who}، ومعه ملف يزيل الموعد من التقويم.`);
  else lines.push(leave.notify ? 'لا يُرسل بريد: لا أعضاء في الدفعة يصلهم بريد الآن.' : NO_MAIL_AR[leave.skipped] || 'لا يُرسل بريد.');
  // الموعد تغيّر بعد آخر دعوة بلا إبلاغ: المدعوون يعرفون الموعد السابق، والبريد وملفه يقولانه
  if (who && leave.told_at) lines.push(`المدعوون يعرفون موعدًا سابقًا لم يُبلَّغوا بتغييره: ${weekTime(leave.told_at)}. البريد يقول إنه هو ${t.gone}.`);
  if (leave.uncomplete > 0) lines.push({ tone: 'warn', text: `${peopleAr(leave.uncomplete)} ${leave.uncomplete === 1 ? 'أتم' : 'أتموا'} نشاط الحضور أو مرحلته بهذه الجلسة، و${t.lost} يعود غير مكتمل ${leave.uncomplete === 1 ? 'له' : 'لهم'}.` });
  return {
    text: t.ask(name), ok: t.ok(noun), ...(undate ? {} : { danger: true }), lines,
    ...(who ? { check: { name: 'notify_cancel', ...(undate ? LEAVE_CHECK_AR.undate : LEAVE_CHECK_AR.other), checked: true } } : {}),
  };
}
/** معاينة الخروج من الخادم ثم سؤاله. يعيد null بلا سؤال، أو { error } إن تعذّرت المعاينة فلا يُحفظ شيء.
 * وإن تغيّر الوسم في الحفظ نفسه أُلحق أثره بالسطور وتأكيده بالمحفوظ
 * @param {(action: string, body: any) => Promise<any>} call @param {any} body جسم الحفظ (saveBody)
 * @param {{ title?: string, counting?: string | null, noun?: string }} o */
export async function leaveConfirm(call, body, { title = '', counting = null, noun = 'اليوم' } = {}) {
  const r = await call('admin.workshop-save', { ...body, preview: true });
  if (!r?.success) return { error: r?.message || 'تعذّرت معاينة أثر الحفظ، فلم يُحفظ شيء' };
  const ask = leaveAsk(r.leave, title, { noun });
  if (!r.changed) return ask;
  const flip = { lines: [`ويتغير وسمها إلى «${COUNTING_AR[counting]}»:`, ...countingImpactAr(r.impact, counting)], patch: { counting_confirm: true } };
  return ask ? { ...ask, lines: [...ask.lines, ...flip.lines], patch: flip.patch } : { text: `يتغير وسم «${title || 'الورشة'}» إلى «${COUNTING_AR[counting]}». هذا أثره على أعضاء الدفعة:`, lines: flip.lines.slice(1), ok: 'غيّر الوسم', patch: flip.patch };
}
/** سؤال الحذف من معاينة الخادم */
export async function deleteConfirm(call, id, title = '', { noun = 'اليوم' } = {}) {
  const r = await call('admin.workshop-delete', { id, preview: true });
  if (!r?.success) return { error: r?.message || 'تعذّرت معاينة الحذف، فلم يُحذف شيء' };
  return leaveAsk(r.leave, title, { noun });
}

// ── وسم الورشة: إلزامية أو اختيارية (قرار المالك 2026-11-21، القاعدة في optional.js) ──
// اختيار صريح بلا قيمة مسبقة في كل نموذج يضيف ورشة: وسم خاطئ بالسهو يغيّر عدّ دفعة كاملة، فلا يُحفظ ما لم يختره المدير.
// وفي التحرير يظهر الوسم القائم، وتغييره يمر بمعاينة أثره بالأرقام ثم تأكيد. قبل ترحيل العمود «اختيارية» معطلة بجملتها.
export const COUNTING_LABEL_AR = 'هل تُحسب هذه الورشة؟';
export const COUNTING_REQUIRED_AR = 'اختر أولًا: هل هذه الورشة إلزامية أم اختيارية؟';
/** @param {{ ready?: boolean }} o ready: عمود الوسم مرحَّل (optional_ready من الخادم) */
export function countingField({ ready = true } = {}) {
  return {
    name: 'counting', label: COUNTING_LABEL_AR, type: 'choice', required: COUNTING_REQUIRED_AR,
    options: [
      { value: 'mandatory', label: COUNTING_AR.mandatory, help: COUNTING_HELP_AR.mandatory },
      { value: 'optional', label: COUNTING_AR.optional, help: COUNTING_HELP_AR.optional, disabled: !ready, note: ready ? '' : OPTIONAL_NOT_READY_AR },
    ],
  };
}
/** الوسم القائم لجلسة تُحرَّر، لقيمة الحقل */
export const countingValue = (session) => countingOf(session);
/** شارة الوسم على صف الورشة: للإدارة الوسمان، ولنشاط اختياري في البرنامج كله «اختيارية» */
export const countingChip = (session, req = null) => {
  const optional = optionalSession(session) || optionalReq(req);
  return { optional, text: optional ? COUNTING_AR.optional : COUNTING_AR.mandatory, title: optional ? COUNTING_HELP_AR.optional : COUNTING_HELP_AR.mandatory };
};
// سطر ما تعنيه «إلزامية» في هذا النشاط بعينه، قبل الحفظ
export const EACH_EFFECT_AR = 'كل ورشة إلزامية في هذه المرحلة مطلوبة بعينها لإكمالها. من أتم المرحلة قبل إضافتها يبقى مكتملًا.';
export const OPTIONAL_EFFECT_AR = 'ورشة اختيارية: تظهر للمشاركين بوسمها ويُسجَّل حضورها، ولا تدخل في تقدم ولا اكتمال ولا نسبة حضور.';
export const GUIDED_EFFECT_AR = 'بالحفظ يُضاف إلى برنامج الدفعة نشاط «ورش إضافية» في هذه المرحلة، وتُحفظ به نسخة من البرنامج تُثبَّت عليها الدفعة. لا يتغير على أعضائها غير هذه الورشة.';
/** هل يحتاج الحفظ معاينة من الخادم؟ تغيير وسم جلسة قائمة، أو ورشة إلزامية جديدة في نشاط «ورش إضافية» أو في مرحلة بلا نشاط حضور
 * @param {{ original?: any, counting?: string | null, req?: any, guided?: boolean }} o */
export function needsCountingPreview({ original = null, counting = null, req = null, guided = false }) {
  if (!counting) return false;
  if (original) return counting !== countingOf(original);
  return counting === 'mandatory' && (guided || eachWorkshop(req));
}
/** سؤال التأكيد قبل الحفظ ومعه أثر الوسم. base: سؤال البريد أو الخط إن وُجد. يعيد null بلا سؤال، أو { error } إن تعذّرت المعاينة
 * @param {(action: string, body: any) => Promise<any>} call @param {any} body جسم الحفظ نفسه (saveBody)
 * @param {{ base?: any, preview?: boolean, counting?: string | null, title?: string, changed?: boolean }} o */
export async function countingConfirm(call, body, { base = null, preview = false, counting = null, title = '', changed = false } = {}) {
  if (!preview) return base;
  const r = await call('admin.workshop-save', { ...body, preview: true });
  if (!r?.success) return { error: r?.message || 'تعذّرت معاينة أثر الوسم، فلم يُحفظ شيء' };
  const lines = countingImpactAr(r.impact, counting);
  const name = title || 'الورشة';
  const text = base?.text || (changed ? `يتغير وسم «${name}» إلى «${COUNTING_AR[counting]}». هذا أثره على أعضاء الدفعة:` : `تُحفظ «${name}» ${COUNTING_AR[counting]}. هذا أثرها على أعضاء الدفعة:`);
  return { text: base?.text ? `${base.text}\nوأثر وسمها «${COUNTING_AR[counting]}» على أعضاء الدفعة:` : text, lines, ok: base?.ok || (changed ? 'غيّر الوسم' : 'احفظ'), patch: { counting_confirm: true } };
}
// تأكيد قبل حفظ يرسل بريدًا (المرحلة 4): الدعوة أو إشعار التغيير لأعضاء الدفعة كلهم، فلا يخرج بنقرة واحدة
export const mailConfirm = (out) => (out.invite === true ? { text: `تُحفظ «${out.title_ar || 'الجلسة'}» وتُرسل دعوتها بالبريد إلى أعضاء الدفعة${out.expert_id ? ' ومدربها' : ''} الآن، ومعها ملف تقويم. متابعة؟`, ok: 'احفظ وأرسل الدعوة' }
  : out.notify_change === true ? { text: `يُحفظ التغيير في «${out.title_ar || 'الجلسة'}» ويُرسل به بريد إلى من دُعي إليها${out.expert_id ? ' وإلى مدربها' : ''}، ومعه ملف تقويم محدَّث. متابعة؟`, ok: 'احفظ وأبلغهم' } : null);
const SKIP_AR = Object.freeze({
  general: 'لم تُرسل الدعوة: الجلسة لكل الدفعات', undated: 'لم يُرسل بريد: الجلسة بلا موعد', ended: 'لم يُرسل بريد: الجلسة انتهت',
  inactive: 'لم يُرسل بريد: الجلسة ملغاة', invited: 'الدعوة أُرسلت من قبل، فلم تُرسل ثانية',
});
// المدرب المسمى يصله ما يصل المدعوين (الدعوة والتحديث والإلغاء وسحب الموعد)، بريد واحد
export const trainerAr = (m) => (m?.trainer === 'sent' ? '، وأُبلغ المدرب' : m?.trainer === 'queued' ? '، وبريد المدرب ينتظر حصة البريد' : m?.trainer === 'failed' ? '، وتعذّر بريد المدرب' : '');
/** ما جرى لبريد الإلغاء (أو سحب الموعد) بعد الحفظ أو الحذف. فارغ إن لم يكن له بريد أصلًا (لم تُعلن، انتهت...) */
export function cancelResultAr(c, mail = 'بريد الإلغاء') {
  if (!c) return '';
  if (c.error) return `وتعذّر ${mail}، فأبلغ المدعوين بطريقتك`;
  if (c.skipped) return c.skipped === 'opted_out' ? 'ولم يُبلَّغ أحد كما اخترت' : '';
  if (!c.total) return trainerAr(c).replace(/^، و/, 'و');
  return mailCount(c, `وأُرسل ${mail}`, `وأُرسل ${mail}`) + trainerAr(c);
}
// استبدال المدرب في جلسة معلنة: للسابق بريد يزيل الموعد من تقويمه (released)، وللجديد الدعوة (trainer في رد الحفظ نفسه)
const SWAP_AR = Object.freeze({
  released: { sent: 'وأُبلغ المدرب السابق', queued: 'وبريد المدرب السابق ينتظر حصة البريد', failed: 'وتعذّر بريد المدرب السابق' },
  trainer: { sent: 'وأُرسلت الدعوة إلى المدرب الجديد', queued: 'ودعوة المدرب الجديد تنتظر حصة البريد', failed: 'وتعذّرت دعوة المدرب الجديد' },
});
// queued: لم تتسع لها حصة بريد اليوم فتنتظر في «لم يُرسل» (مركز البريد) وتخرج آليًّا. تُذكر صراحةً: ليست متعذرة ولا واصلة بعد
export const queuedAr = (r) => (r?.queued ? `، و${r.queued} تنتظر حصة البريد وتخرج آليًّا` : '');
const mailCount = (r, one, many) => (r.failed ? `${many} إلى ${r.sent}، وتعذّرت ${r.failed}` : r.total === 0 ? 'لا أعضاء في الدفعة يصلهم بريد الآن' : `${one} إلى ${r.sent} ${r.sent >= 3 && r.sent <= 10 ? 'مشاركين' : 'مشاركًا'}`) + queuedAr(r);
/** ما جرى للبريد بعد الحفظ، جملة تُلحق برسالة الحفظ. فارغ إن لم يُطلب بريد */
export function mailResultAr(r) {
  if (!r) return '';
  if (r.mail_error) return 'وتعذّر البريد، فأرسل الدعوة من زرها';
  const m = r.invite || r.change;
  const gone = r.undate ? cancelResultAr(r.undate, 'بريد سحب الموعد') : cancelResultAr(r.cancel);
  const swap = [SWAP_AR.released[r.released] || '', SWAP_AR.trainer[r.trainer] || ''];
  if (!m) return [gone, ...swap].filter(Boolean).join('، ');
  const said = m.skipped ? SKIP_AR[m.skipped] || 'لم يُرسل بريد'
    : r.invite ? mailCount(m, 'وأُرسلت الدعوة', 'وأُرسلت الدعوة') + trainerAr(m) : mailCount(m, 'وأُبلغ بالتغيير', 'وأُرسل إشعار التغيير') + trainerAr(m);
  return [gone, swap[0], said].filter(Boolean).join('، ');
}
/** رسالة الحفظ كاملة: النص، ثم ما لم يُحفظ قبل ترحيله، ثم ما جرى للبريد */
export function savedAr(msg, r) {
  return [msg, r?.capacity_skipped ? 'السعة لم تُحفظ لأن قاعدة البيانات لم تُحدَّث بعد' : '', mailResultAr(r)].filter(Boolean).join('، ');
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
    .map((r) => ({ id: r.id, title: renderJourneyText(r.title_ar || '', { reqs }), need: Number(r.config?.sessions_required) || SESSION_DEFAULTS.sessions_required, verify: r.config?.verify || 'qr',
      // each: نشاط «ورش إضافية» (المطلوب كل ورشة إلزامية بعينها)، وoptional: نشاط اختياري في البرنامج كله (optional.js)
      each: eachWorkshop(r), optional: optionalReq(r) }));
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
  const reqById = new Map((def?.requirements || []).map((r) => [r.id, r]));
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
      // الوسم: الورشة الاختيارية، أو أي ورشة في نشاط اختياري في البرنامج
      counting: countingChip(s, reqById.get(s.requirement_id)),
      raw: s,
    };
  });
  // العدّاد على ما يُعد وحده: الورش الاختيارية وأيام النشاط الاختياري خارجه، ونشاط «ورش إضافية» مطلوبه ورشه الإلزامية القائمة
  const live = rows.filter((r) => r.active && !r.counting.optional);
  const extra = reqs.filter((r) => r.each);
  const fixed = reqs.filter((r) => !r.each && !r.optional);
  const need = fixed.reduce((n, r) => n + r.need, 0) + live.filter((r) => extra.some((x) => x.id === r.req_id)).length;
  const set = live.filter((r) => !r.undated).length;
  const optionalN = rows.filter((r) => r.active && r.counting.optional).length;
  const optionalAr = optionalN ? `، و${countAr(optionalN, 'ورشة اختيارية', 'ورشتان اختياريتان', 'ورش اختيارية', 'ورشة اختيارية')} خارج العد` : '';
  const head = `أيام ${stage.title}`;
  // مرحلة ورشها إضافية وحدها (المسار الموجّه): لا عدد ثابت من البرنامج، فالعدّاد يقول ما فيها
  const only = !fixed.length;
  return {
    reqs, rows, need, set, each_only: only,
    head_ar: only ? `ورش ${stage.title}` : head,
    count_ar: (only ? (need ? `${countAr(need, 'ورشة إلزامية', 'ورشتان إلزاميتان', 'ورش إلزامية', 'ورشة إلزامية')}` : 'لا ورشة إلزامية') : set > need ? `${daysAr(set)} محددة، والمطلوب حضور ${need}` : `${set} من ${need} محددة`) + optionalAr,
    tone: !only && set < need ? 'warn' : 'ok',
    empty_ar: 'لا أيام بعد. أضف أول يوم أو ورشة ليظهر للمشاركين في رحلتهم بموعده ومكانه.',
  };
}
