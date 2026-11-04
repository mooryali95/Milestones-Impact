// ════════════════════════════════════════════════════════════════
// طلبات الرعاية: من كتب اسم جهة دون رمز، تتحقق منه الإدارة ثم يُربط ويُعفى
// ════════════════════════════════════════════════════════════════
// المشارك لا يرى قائمة الجهات ولا نتيجة البحث: يُسجَّل طلبه فقط. الإدارة ترى أقرب الجهات
// المسجلة (sponsor-match.js) ونطاق بريده، فتربط أو ترفض، ويصله بريد بالقرار.
import { mailButton, mailShell, mailText } from '../_shared/mail.ts';
import { SITES } from '../_shared/sites.js';
import { audit, CONFIG, db, Fail, must, sendMail } from './core.ts';
import { requireWrite } from './admin.ts';
import { pinSponsorFor } from './entitlements.ts';
import { isEmail, normalizeEmail } from './logic.js';
import { suggestOrgs } from './sponsor-match.js';
import { firstName } from './hall.js';

type Body = Record<string, any>;
type Admin = import('./admin.ts').Admin;
const shell = (t: string, b: string) => mailShell(t, b);

export async function mine(p: any) {
  const { data } = await db.from('sponsor_requests').select('id, typed_name, status, created_at, reason').eq('participant_id', p.id).order('created_at', { ascending: false }).limit(1).maybeSingle();
  return data || null;
}

export async function request(p: any, b: Body) {
  if (p.organization_id) throw new Fail('حسابك مرتبط بجهة راعية', 409);
  const typed = String(b.typed_name || '').trim().slice(0, 200);
  if (typed.length < 2) throw new Fail('اكتب اسم الجهة التي رشّحتك');
  const contact = b.contact_email ? normalizeEmail(b.contact_email) : null;
  if (contact && !isEmail(contact)) throw new Fail('بريد منسق الجهة غير صحيح');
  const { data, error } = await db.from('sponsor_requests').insert({ participant_id: p.id, typed_name: typed, contact_email: contact }).select('id').single();
  if (error) throw new Fail(error.code === '23505' ? 'لديك طلب رعاية قيد المراجعة' : 'تعذّر إرسال الطلب', error.code === '23505' ? 409 : 500);
  await audit('participant', p.id, 'sponsor.request', 'sponsor_requests', data.id, null, { typed });
  if (CONFIG.alertEmail) {
    sendMail(CONFIG.alertEmail, `طلب رعاية: ${p.full_name} · ${typed}`, shell('طلب رعاية جديد',
      mailText(`${p.full_name} (${p.email}) يذكر أن «${typed}» رشّحته للبرنامج.`) + mailButton(`${SITES.admin}/#/leaders/payments`, 'راجع الطلب'))).catch(() => {});
  }
  return { success: true, request: await mine(p) };
}

export async function cancel(p: any) {
  await db.from('sponsor_requests').update({ status: 'cancelled', decided_at: new Date().toISOString(), decided_by: 'participant' }).eq('participant_id', p.id).eq('status', 'pending');
  return { success: true };
}

// ── الإدارة ──
export async function adminList() {
  const [{ data: reqs }, { data: orgs }] = await Promise.all([
    db.from('sponsor_requests').select('*, participants(full_name, email, organization_name)').order('created_at', { ascending: false }).limit(500),
    db.from('organizations').select('id, name, short_name, domains, status').eq('status', 'active'),
  ]);
  return {
    success: true, orgs: (orgs || []).map((o: any) => ({ id: o.id, name: o.name })),
    requests: (reqs || []).map((r: any) => ({
      ...r, suggestions: r.status === 'pending' ? suggestOrgs(r.typed_name, orgs || [], String(r.participants?.email || '').split('@')[1] || '') : [],
    })),
  };
}

export async function adminDecide(a: Admin, b: Body) {
  requireWrite(a);
  const r = must(await db.from('sponsor_requests').select('*, participants(id, full_name, email, organization_id)').eq('id', String(b.id || '')).maybeSingle()) as any;
  if (!r || r.status !== 'pending') throw new Fail('لم يعد الطلب قيد المراجعة', 409);
  const now = new Date().toISOString();
  const p = r.participants;
  if (b.approve) {
    const org = must(await db.from('organizations').select('id, name, status').eq('id', String(b.organization_id || '')).maybeSingle()) as any;
    if (!org || org.status !== 'active') throw new Fail('اختر جهة نشطة');
    if (p.organization_id && p.organization_id !== org.id) throw new Fail('المشارك مرتبط بجهة أخرى؛ غيّرها من ملفه', 409);
    must(await db.from('participants').update({ organization_id: org.id, org_via: 'admin' }).eq('id', p.id));
    await pinSponsorFor(p.id);   // الإعفاء يُثبَّت لحظة القبول
    await db.from('sponsor_requests').update({ status: 'approved', organization_id: org.id, decided_by: a.email, decided_at: now }).eq('id', r.id);
    await audit('admin', a.email, 'sponsor.approve', 'participants', p.id, null, { org: org.id, typed: r.typed_name });
    sendMail(p.email, `تأكدت رعايتك من ${org.name}`, shell(`أهلًا ${firstName(p.full_name)}`,
      mailText(`تأكدنا من ترشيحك للبرنامج برعاية ${org.name}. رسوم القياس والبرنامج مغطاة من جهتك، وما دفعته من قبل لا يُطلب منك بعده شيء.`)
      + mailButton(CONFIG.appUrl, 'تابع رحلتك'))).catch(() => {});
    return { success: true };
  }
  const reason = b.reason ? String(b.reason).trim().slice(0, 300) : null;
  await db.from('sponsor_requests').update({ status: 'rejected', decided_by: a.email, decided_at: now, reason }).eq('id', r.id);
  await audit('admin', a.email, 'sponsor.reject', 'participants', p.id, null, { typed: r.typed_name, reason });
  sendMail(p.email, 'بخصوص طلب الرعاية', shell(`أهلًا ${firstName(p.full_name)}`,
    mailText(`لم نتمكن من تأكيد رعاية «${r.typed_name}» لك${reason ? `: ${reason}` : ''}. يمكنك متابعة البرنامج مشاركًا فرديًا، أو طلب رمز الجهة من منسقها.`)
    + mailButton(CONFIG.appUrl, 'ادخل إلى رحلتك'))).catch(() => {});
  return { success: true };
}
