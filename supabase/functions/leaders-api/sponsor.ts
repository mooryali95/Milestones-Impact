// ════════════════════════════════════════════════════════════════
// طلبات الرعاية: من كتب اسم جهة دون رمز، تتحقق منه الإدارة ثم يُربط ويُعفى
// ════════════════════════════════════════════════════════════════
// المشارك لا يرى قائمة الجهات ولا نتيجة البحث: يُسجَّل طلبه فقط. الإدارة ترى أقرب الجهات
// المسجلة (sponsor-match.js) ونطاق بريده، فتربط أو ترفض، ويصله بريد بالقرار.
import { bdi, mailButton, mailShell, mailText } from '../_shared/mail.ts';
import { SITES } from '../_shared/sites.js';
import { audit, CONFIG, db, Fail, must, sendMail } from './core.ts';
import { requireWrite } from './admin.ts';
import { ownerNoticeLater } from './notify.ts';
import { coveredElsewhere, needsSeat, pinSponsorFor, seatsUsed } from './entitlements.ts';
import { inProgram, isEmail, normalizeEmail } from './logic.js';
import { suggestOrgs } from './sponsor-match.js';
import { firstName } from './hall.js';

type Body = Record<string, any>;
type Admin = import('./admin.ts').Admin;
const shell = (t: string, b: string) => mailShell(t, b);

export async function mine(p: any) {
  const { data } = await db.from('sponsor_requests').select('id, typed_name, status, created_at, reason').eq('participant_id', p.id).order('created_at', { ascending: false }).limit(1).maybeSingle();
  return data || null;
}

// كل طلب ينبّه المالك، والإلغاء يفتح طلبًا جديدًا، فدورة طلب وإلغاء بلا حد كانت تستنزف نصيب الإشعارات (server-sec-2).
// ثلاثة طلبات في اليوم تكفي من يصحح اسم جهته. طلبات المقاعد والعقد (kind) يفتحها الخادم فلا تُحتسب
export const SPONSOR_REQUESTS_PER_DAY = 3;
export async function request(p: any, b: Body) {
  if (p.organization_id) throw new Fail('حسابك مرتبط بجهة راعية', 409);
  const typed = String(b.typed_name || '').trim().slice(0, 200);
  if (typed.length < 2) throw new Fail('اكتب اسم الجهة التي رشّحتك');
  const contact = b.contact_email ? normalizeEmail(b.contact_email) : null;
  if (contact && !isEmail(contact)) throw new Fail('بريد منسق الجهة غير صحيح');
  const { count } = await db.from('sponsor_requests').select('id', { count: 'exact', head: true })
    .eq('participant_id', p.id).eq('kind', 'claim').gte('created_at', new Date(Date.now() - 864e5).toISOString());
  if ((count ?? 0) >= SPONSOR_REQUESTS_PER_DAY) throw new Fail('أرسلت طلبات رعاية كثيرة اليوم، حاول غدًا', 429, 'rate');
  const { data, error } = await db.from('sponsor_requests').insert({ participant_id: p.id, typed_name: typed, contact_email: contact }).select('id').single();
  if (error) throw new Fail(error.code === '23505' ? 'لديك طلب رعاية قيد المراجعة' : 'تعذّر إرسال الطلب', error.code === '23505' ? 409 : 500);
  await audit('participant', p.id, 'sponsor.request', 'sponsor_requests', data.id, null, { typed });
  // سطر Slack «طلب رعاية جديد» ورابطه وحده: اسم المشارك واسم الجهة كما كتبه يبقيان في البريد الاحتياطي (sponsor_request)
  ownerNoticeLater('sponsor_request', {
    line: '🤝 طلب رعاية جديد', ref: `sponsor_request:${data.id}`,
    mail: { subject: `طلب رعاية: ${p.full_name} · ${typed}`, html: shell('طلب رعاية جديد',
      mailText(`${bdi(p.full_name)} (${bdi(p.email)}) يذكر أن «${bdi(typed)}» رشّحته للبرنامج.`) + mailButton(`${SITES.admin}/#/leaders/payments`, 'راجع الطلب')) },
  });
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
  const r = must(await db.from('sponsor_requests').select('*, participants(id, full_name, email, organization_id, status)').eq('id', String(b.id || '')).maybeSingle()) as any;
  if (!r || r.status !== 'pending') throw new Fail('لم يعد الطلب قيد المراجعة', 409);
  const now = new Date().toISOString();
  const p = r.participants;
  if (b.approve) {
    const org = must(await db.from('organizations').select('id, name, status, seats, contract_starts, contract_ends').eq('id', String(b.organization_id || r.organization_id || '')).maybeSingle()) as any;
    if (!org || org.status !== 'active') throw new Fail('اختر جهة نشطة');
    if (p.organization_id && p.organization_id !== org.id) throw new Fail('المشارك مرتبط بجهة أخرى؛ غيّرها من ملفه', 409);
    // خارج البرنامج (inProgram) لا تُثبَّت رعايته: يُرد قبل أي كتابة، فلا مقعد يُضاف ولا ربط (P1-06)
    if (!inProgram(p.status)) throw new Fail('المشارك خارج البرنامج (منسحب أو موقوف)، فلا تُثبَّت رعايته. أعده إلى البرنامج من ملفه ثم اعتمد الطلب', 409, 'out_of_program');
    const contractMsg = 'مدة العقد لا تشمل اليوم. عدّل تاريخي العقد في ملف الجهة ثم اعتمد';
    // D20: رعاية بانتظار الاعتماد لامتلاء المقاعد: القبول مقعد يُضاف إلى العقد بتعليل مكتوب وتدقيق
    // مقاعد العقد كما قُرئت قبل أي كتابة: بها يُرد المقعد المضاف إن لم يُستهلك
    let why = '', added = false;
    const cap = org.seats as number | null;
    if (r.kind === 'seats') {
      why = String(b.reason || '').trim();
      if (why.length < 5) throw new Fail('اكتب سبب إضافة المقعد إلى العقد', 400, 'seat_reason');
      // ما يرده التثبيت لغير المقاعد يُرد قبل أي كتابة: كان المقعد يُضاف ثم يفشل التثبيت (عقد انتهت مدته، أو تعذّر عابر)
      // فيزيد العقد مقعدًا مع كل محاولة. ومدة العقد بتاريخ القاعدة نفسه (current_date بتوقيت UTC)
      const today = new Date().toISOString().slice(0, 10);
      if ((org.contract_starts && today < org.contract_starts) || (org.contract_ends && today > org.contract_ends)) throw new Fail(contractMsg, 409, 'seat_blocked');
      // المقعد يُضاف حين لا يتسع العقد له وحده: لا لمن له إعفاء حي منها أو حقه حي من غيرها، ولا حين تحرر مقعد يأخذه
      if (cap != null && (await needsSeat(p.id, org.id))) {
        const used = await seatsUsed(org.id);
        if (used > cap) throw new Fail(`المقاعد المستهلكة (${used}) فوق مقاعد العقد (${cap})، فلا يكفيه مقعد واحد. عدّل مقاعد الجهة من ملفها ثم اعتمد`, 409, 'seats_over');
        if (used === cap) {
          const { data: bumped } = await db.from('organizations').update({ seats: org.seats + 1 }).eq('id', org.id).eq('seats', org.seats).select('seats');
          if (!bumped?.length) throw new Fail('تغيّرت مقاعد الجهة للتو، أعد المحاولة', 409, 'seats_changed');
          added = true;
        }
      }
    }
    must(await db.from('participants').update({ organization_id: org.id, org_via: p.organization_id ? undefined : 'admin' }).eq('id', p.id));
    // القبول فعل صريح: يتخطى سحبًا سابقًا أو رفضًا لهذه الجهة إلى فحص المقاعد والعقد (P1-06). ومن حقه في البندين حي من
    // غيرها (دفع أو منحة) يُربط بها ولا يأخذ مقعدًا
    if (!(await pinSponsorFor(p.id)) && !(await coveredElsewhere(p.id, org.id))) {
      // المقعد المضاف لهذا القبول يُرد إن لم يأخذه (تعذّر عابر، أو سبق إليه تسجيل آخر): لا مقعد في العقد بلا قرار يستهلكه
      if (added) {
        const { data: back } = await db.from('organizations').update({ seats: cap }).eq('id', org.id).eq('seats', (cap as number) + 1).select('id');
        if (!back?.length) console.error('seat rollback: seats changed meanwhile', org.id);
      }
      throw new Fail(r.kind === 'contract' ? contractMsg : 'تعذّر تثبيت الرعاية، راجع مقاعد الجهة وحالتها', 409, 'seat_blocked');
    }   // الإعفاء يُثبَّت لحظة القبول
    if (added) await audit('admin', a.email, 'sponsor.seat-added', 'organizations', org.id, { seats: cap }, { seats: (cap as number) + 1, participant: p.id, reason: why.slice(0, 300) });
    await db.from('sponsor_requests').update({ status: 'approved', organization_id: org.id, decided_by: a.email, decided_at: now }).eq('id', r.id);
    // قرار صريح في سجله (ORG_DECISIONS): بعده لا يقف التثبيت الآلي عند سحب أو رفض قبله في هذه الجهة
    await audit('admin', a.email, 'sponsor.approve', 'participants', p.id, null, { org: org.id, typed: r.typed_name, ...(why ? { reason: why.slice(0, 300) } : {}) });
    sendMail(p.email, `تأكدت رعايتك من ${org.name}`, shell(`أهلًا ${firstName(p.full_name)}`,
      mailText(`تأكدنا من ترشيحك للبرنامج برعاية ${bdi(org.name)}. رسوم القياس والبرنامج مغطاة من جهتك، وما دفعته من قبل لا يُطلب منك بعده شيء.`)
      + mailButton(CONFIG.appUrl, 'تابع رحلتك')), [], { category: 'essential' }).catch(() => {});
    return { success: true };
  }
  const reason = b.reason ? String(b.reason).trim().slice(0, 300) : null;
  await db.from('sponsor_requests').update({ status: 'rejected', decided_by: a.email, decided_at: now, reason }).eq('id', r.id);
  await audit('admin', a.email, 'sponsor.reject', 'participants', p.id, null, { typed: r.typed_name, reason });
  sendMail(p.email, 'بخصوص طلب الرعاية', shell(`أهلًا ${firstName(p.full_name)}`,
    mailText(`لم نتمكن من تأكيد رعاية «${bdi(r.typed_name)}» لك${reason ? `: ${bdi(reason)}` : ''}. يمكنك متابعة البرنامج مشاركًا فرديًا، أو طلب رمز الجهة من منسقها.`)
    + mailButton(CONFIG.appUrl, 'ادخل إلى رحلتك')), [], { category: 'essential' }).catch(() => {});
  return { success: true };
}
