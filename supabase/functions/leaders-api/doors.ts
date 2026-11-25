// ════════════════════════════════════════════════════════════════
// الباب الخطأ: من طلب الدخول من بوابة ليست له يصله بريد يدلّه على بوابته
// ════════════════════════════════════════════════════════════════
// ثلاث بوابات بثلاث هويات: المشارك (/)، والخبير (/x)، ومنسق الجهة (/org).
// الشاشة ترد الرد نفسه دائمًا (لا تكشف لغير صاحب البريد شيئًا)، والدلالة تصل إلى البريد نفسه فقط،
// ومرة واحدة في الساعة لكل بريد وبوابة، ولا بريد لعنوان لا دور له.
import { mailButton, mailShell, mailText } from '../_shared/mail.ts';
import { audit, CONFIG, db, sendMail } from './core.ts';
import { listed } from './counting.ts';
import { participantByEmail } from './account-emails.ts';

export type Door = 'participant' | 'expert' | 'org';
const APP = () => CONFIG.appUrl.replace(/\/$/, '');
export const DOOR = {
  participant: { path: '/', title: 'رحلتك في البرنامج', label: 'ادخل إلى رحلتك' },
  expert: { path: '/x', title: 'لوحة الخبير', label: 'افتح لوحة الخبير' },
  org: { path: '/org', title: 'لوحة الجهة', label: 'افتح لوحة الجهة' },
} as const;

// أدوار البريد كلها، من مصادرها نفسها
export async function rolesOf(email: string): Promise<Door[]> {
  const [{ data: p }, { data: e }, { data: c }] = await Promise.all([
    // البريد البديل لحساب مشارك يفتح بابه كالأساسي (account-emails.ts)
    participantByEmail(email, 'id, status', listed).then((data) => ({ data })),
    // journey-guard: باب /x واحد للخدمتين (رحلة وكتاب)، والبوابة تتفرع بعد الدخول (experts.ts portalDashboard)
    db.from('experts').select('status').eq('email', email).maybeSingle(),
    db.from('org_coordinators').select('status').eq('email', email).limit(5),
  ]);
  const out: Door[] = [];
  if (p && p.status !== 'suspended') out.push('participant');
  if (e && !['rejected', 'suspended'].includes(e.status)) out.push('expert');
  if ((c || []).some((x: any) => x.status !== 'suspended')) out.push('org');
  return out;
}

export async function wrongDoor(email: string, tried: Door) {
  const doors = (await rolesOf(email)).filter((d) => d !== tried);
  if (!doors.length) return;
  const { count } = await db.from('audit_log').select('id', { count: 'exact', head: true })
    .eq('action', `door.${tried}`).eq('actor', email).gte('created_at', new Date(Date.now() - 36e5).toISOString());
  if ((count ?? 0) >= 1) return;
  await audit('system', email, `door.${tried}`, 'participants', null, null, { doors });
  const body = mailText(`طلبت الدخول إلى ${DOOR[tried].title}، وبريدك غير مسجل فيها. بريدك مسجل في:`)
    + doors.map((d) => mailButton(`${APP()}${DOOR[d].path}`, DOOR[d].label)).join('');
  await sendMail(email, 'بوابتك الصحيحة في برنامج القادة', mailShell('بوابتك في برنامج القادة', body), [], { category: 'essential' }).catch(() => {});
}
