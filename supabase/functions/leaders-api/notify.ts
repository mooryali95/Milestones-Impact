// ════════════════════════════════════════════════════════════════
// إشعارات المالك التشغيلية (مركز الإشعارات، المرحلة 3، التصور 5 البنود 25 إلى 32 و6.6)
// ════════════════════════════════════════════════════════════════
// طلب انضمام خبير، وخبير استكمل ملفه، ولا خبير متاح، وطلب رعاية، ونسخة المالك من حدود المقاعد، والدفعة والاسترداد:
// كلها تمر بجدول التوجيه (route) وحده. سطر Slack ثابت النص يصنعه المستدعي بلا أسماء ولا بريد ولا نص طلب ولا رمز،
// نوع الحدث ورابط شاشته فقط، ويمر بـ maskText احتياطًا. والبريد بمتنه الكامل (الاسم والتفاصيل) حين يقرره الجدول:
// الحرج دائمًا، والمهم إن لم يصل Slack، والمعلوماتي لا بريد له (يدخل الملخص اليومي وله احتياطه البريدي الواحد).
// كل حدث يُكتب في سجل التدقيق (system.notify، المعرّف مفتاح الحدث، والتفاصيل مرجع بمعرّف فقط) فيعدّه الملخص اليومي.
import { audit, CONFIG, db, sendMail, slackDownNotice } from './core.ts';
import { maskText, slackConfigured, slackDeliver } from '../_shared/slack.ts';
import { route, screenOf, slackStateOf } from '../_shared/notify-routing.js';
import { notifySettings, type NotifySettings } from '../_shared/notify-settings.ts';
import { SITES } from '../_shared/sites.js';
import type { MailKind } from '../_shared/mail.ts';

export const NOTICE_ACTION = 'system.notify';
export type OwnerMail = { subject: string; html: string; kind?: MailKind };
export type NoticeOpts = {
  // سطر Slack بلا رابط: الرابط يُضاف من screen الحدث
  line: string;
  // متن البريد إن قرره الجدول، وnull: لا بريد لهذا الحدث في هذه المرة (نافذة طلبات الخبراء مثلًا)، ويبقى سطره وعدّه
  mail?: OwnerMail | null;
  // مرجع البريد وسطر السجل (payment:<id>)، بمعرّف لا باسم
  ref?: string | null;
  // إعداد محسوب سلفًا (الدفعة بقراءتها الاحتياطية للمفتاح القديم)
  settings?: NotifySettings;
};
export type NoticeResult = { slack: boolean; email: boolean; digest: boolean };

// السطر كما يُنشر: النص مطموسًا (بريد مقنّع، وأي ستة أرقام قائمة بنفسها) ثم رابط الشاشة
export function noticeLine(event: string, line: string) {
  return `${maskText(String(line || '')).slice(0, 400)}\n${SITES.admin}/${screenOf(event)}`;
}

export async function ownerNotice(event: string, { line, mail = null, ref = null, settings }: NoticeOpts): Promise<NoticeResult> {
  const s = settings ?? await notifySettings(db);
  const plan = route(event, s);
  const slack = plan.slack ? await slackDeliver('alerts', noticeLine(event, line), { client: db }) : false;
  const state = plan.slack ? slackStateOf({ delivered: slack, configured: slackConfigured() }) : 'ok';
  const decided = route(event, s, state);
  let email = false;
  if (decided.email && mail && CONFIG.alertEmail) {
    email = await sendMail(CONFIG.alertEmail, mail.subject, mail.html, [], { category: 'staff', kind: mail.kind ?? 'notify', ref }).then(() => true, (e) => { console.error('owner notice mail:', event, e); return false; });
  }
  // سلاك مضبوط ولم يستقبل: بريد «Slack لا يستقبل» نفسه، مرة كل ست ساعات بين النسخ
  if (plan.slack && !slack && slackConfigured() && CONFIG.alertEmail && CONFIG.resendKey) await slackDownNotice(event).catch(() => false);
  // السجل لا يحمل إلا المرجع وما وصل، فلا اسم في سجل لا يُحذف منه
  await audit('system', 'notify', NOTICE_ACTION, 'notify', event, null, { ref, slack, email, digest: decided.digest })
    .catch((e) => console.error('owner notice audit:', event, e));
  return { slack, email, digest: decided.digest };
}

// من مسار يرد على مستخدم (طلب انضمام، طلب رعاية): لا ينتظر سلاك ولا البريد، ويبقى حيًا بعد الرد
const later = new Set<Promise<unknown>>();
export function ownerNoticeLater(event: string, opts: NoticeOpts) {
  const p = ownerNotice(event, opts).catch((e) => { console.error('owner notice:', event, e); return null; });
  later.add(p);
  p.finally(() => later.delete(p));
  try {
    // deno-lint-ignore no-explicit-any
    (globalThis as any).EdgeRuntime?.waitUntil?.(p);
  } catch { /* بيئة بلا waitUntil */ }
  return p;
}
// للاختبار: ينتظر كل إشعار أُطلق بلا انتظار
export async function noticesIdle() { while (later.size) await Promise.all([...later]); }
