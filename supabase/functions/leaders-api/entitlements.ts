// ════════════════════════════════════════════════════════════════
// تثبيت إعفاء الراعي: لحظة ربط المشارك بجهته، بقيمتها وعملتها يومذاك
// ════════════════════════════════════════════════════════════════
// كان التثبيت يقع في أول طلب للمشارك بعد الربط (access)، فيبقى كشف الجهة بقيم فارغة حتى يدخل
// كل مشارك، وتُثبَّت قيمة لاحقة إن تغيّر السعر بينهما. الآن كل مسار ربط (تسجيل برمز أو نطاق،
// رمز يكتبه المشارك، ربط آلي بالنطاق، نقل من الإدارة، قبول طلب رعاية) يثبّت فورًا، وaccess()
// يبقى احتياطًا لمن رُبط قبل هذا التغيير. وحدة مستقلة حتى لا تدور الاستيرادات (admin ↔ payments).
import { alertOps, audit, CONFIG, db, Fail, must, sendMail } from './core.ts';
import { esc, mailButton, mailShell, mailText } from '../_shared/mail.ts';
import { SITES } from '../_shared/sites.js';
import { inProgram } from './logic.js';

export type Item = 'assessment' | 'program';
export const ITEMS: Item[] = ['assessment', 'program'];

// خطأ القراءة يرمي: لا يصير البندان مجانيين بعطل عابر. والافتراضي (الدفع مطفأ) لصف غائب حقًا، ويُسجَّل
export async function settings() {
  const data = must(await db.from('payment_settings').select('*').eq('id', true).maybeSingle(), 'تعذّر قراءة إعداد الدفع');
  if (data) return data;
  console.error('payment_settings: لا صف إعداد، فالدفع مطفأ');
  return { enabled: false, currency: 'USD', assessment_cents: 100, program_cents: 9900 };
}

// القيمة التعاقدية تُثبَّت على بند البرنامج (والقياس صفر)، فمجموع ما للمشارك = سعر جهته لحظة ربطه، بعملة الإعداد يومذاك.
// D20: التثبيت يستهلك مقعدًا من عقد الجهة بفحص ذري في القاعدة (leaders.pin_sponsor_seat): قفل صف الجهة، ومدة العقد،
// والمقاعد، ثم البندان في المعاملة نفسها. تعذّر الفحص لا يمنح شيئًا: ينبّه المالك ويرمي 503، ويُعاد التثبيت لاحقًا.
export type PinResult = 'granted' | 'exists' | 'full' | 'before' | 'after' | 'inactive' | 'out' | 'cancelled' | 'rejected' | 'covered';
export const SEAT_BLOCKED: PinResult[] = ['full', 'before', 'after'];
export const SEAT_ALERTS = [0.8, 1];
// P1-06: ما يوقف التثبيت ولا يمنح شيئًا. كان رد المقعد عند الانسحاب وسحب الإعفاء يُنقضان في أول قراءة للملف.
// out: خارج البرنامج (inProgram)، لكل تثبيت، وهو وحده في leaders.pin_sponsor_seat (ترحيل 20261114130000).
// cancelled وrejected: قرار للإدارة في رعاية هذه الجهة له (sponsorDecision)، للتثبيت الآلي وحده (auto: access()، والربط
// بالنطاق، ورمز يكتبه المشارك، وعودة الحالة). والفعل الصريح من الإدارة (نقله إلى الجهة، قبول طلب رعايته) يتخطاهما إلى فحص
// المقاعد والعقد. ورد المقعد عند الانسحاب (seat-return) ليس قرارًا: يحرسه out ما دام منسحبًا، ويعود التثبيت بعودته
export const SEAT_STOPPED: PinResult[] = ['out', 'cancelled', 'rejected'];
// ما يُعد مقعدًا من العقد: إعفاء أُدرج الآن أو حي قبله. وcovered: حقه في البندين حي من غير الجهة (دفع أو منحة أو إعفاء سابق
// للدفع)، فلا مقعد يُستهلك ولا طلب مقعد ينتظر، ولا يُحسب تثبيتًا
export const SEATED: PinResult[] = ['granted', 'exists'];
export const tookSeat = (r: PinResult | null) => !!r && SEATED.includes(r);
export type PinOpts = { auto?: boolean };

// قرار الإدارة الصريح في جهة المشارك يبقى أثره في سجل التدقيق لكل مشارك، بجهته قبله وبعده (لا يُكتب فوقه): النقل والفك
// (participant.org من assignOrg) وقبول طلب الرعاية (sponsor.approve). به يُعرف الفعل الصريح ولو لم يُثبَّت به شيء لحظتها
// (خارج البرنامج)، وفك الإدارة ولو لم يبق إعفاء حي يُسحب (رُد مقعده بانسحابه)
export const ORG_DECISIONS = ['participant.org', 'sponsor.approve'];
export async function recordOrgDecisions(actor: string, ids: string[], before: Map<string, string | null>, to: string | null) {
  for (let i = 0; i < ids.length; i += 200) {
    const rows = ids.slice(i, i + 200).map((id) => ({ actor_type: 'admin', actor, action: 'participant.org', entity: 'participants', entity_id: id, before: { org: before.get(id) ?? null }, after: { org: to } }));
    const { error } = await db.from('audit_log').insert(rows);
    if (error) {
      console.error('org decisions:', error.message);
      throw new Fail('تعذّر تسجيل العملية في السجل، فلم تكتمل. حاول بعد قليل.', 500, 'audit_failed', { action: 'participant.org' });
    }
  }
}

// قرار الإدارة في رعاية هذه الجهة له، يسري ما لم يأت بعده تثبيت منها أو ربط صريح إليها:
// cancelled: سُحب إعفاؤه منها (لا رد المقعد)، أو نقلته الإدارة منها أو فكّته عنها؛ rejected: رُفض طلب مقعده أو عقده فيها.
// «آخر تثبيت» أحدث إعفاء منها أو أحدث ربط صريح إليها، فما قبله من قرار نقضه ذلك الفعل. والحساب نفسه يقرؤه holdSponsorship
// (بعده لا رفض ساريًا) وprogramPaymentDue وربط المشارك نفسه (الرمز والنطاق)، فالحكم واحد في كل مسار
export async function sponsorDecision(participantId: string, orgId: string): Promise<'cancelled' | 'rejected' | null> {
  const [rows, refused, decided] = await Promise.all([
    db.from('entitlements').select('created_at, revoked_at, revoked_by').eq('participant_id', participantId).eq('organization_id', orgId).eq('source', 'sponsor').limit(200),
    db.from('sponsor_requests').select('created_at, decided_at').eq('participant_id', participantId).eq('organization_id', orgId).eq('status', 'rejected').in('kind', ['seats', 'contract']).limit(50),
    db.from('audit_log').select('action, before, after, created_at').eq('entity', 'participants').eq('entity_id', participantId).in('action', ORG_DECISIONS)
      .order('created_at', { ascending: false }).limit(50),
  ]);
  const t = (x: unknown) => Date.parse(String(x || '')) || 0;
  let since = Math.max(0, ...(must(rows) ?? []).map((e: any) => t(e.created_at)));
  // أحدث قرار صريح يخص الجهة بعد آخر تثبيت منها: الربط إليها يصير «آخر تثبيت»، والنقل منها أو الفك عنها سحب
  const d = ((must(decided) ?? []) as any[]).filter((x) => t(x.created_at) > since && (x.after?.org === orgId || x.before?.org === orgId))
    .sort((a, b) => t(b.created_at) - t(a.created_at))[0];
  if (d) {
    if (d.after?.org !== orgId) return 'cancelled';
    since = t(d.created_at);
  }
  if ((must(rows) ?? []).some((e: any) => e.revoked_at && e.revoked_by !== 'seat-return' && t(e.revoked_at) > since)) return 'cancelled';
  if ((must(refused) ?? []).some((r: any) => t(r.decided_at || r.created_at) > since)) return 'rejected';
  return null;
}
async function seatStopped(p: { id: string; status?: string | null }, orgId: string, auto: boolean): Promise<PinResult | null> {
  if (!inProgram(p.status)) return 'out';
  return auto ? await sponsorDecision(p.id, orgId) : null;
}

// المقاعد المستهلكة من عقد الجهة: من له إعفاء حي منها (كما تعدّها leaders.pin_sponsor_seat)
export async function seatsUsed(orgId: string) {
  const ents = must(await db.from('entitlements').select('participant_id').eq('organization_id', orgId).eq('source', 'sponsor').is('revoked_at', null)) ?? [];
  return new Set((ents as any[]).map((e) => e.participant_id)).size;
}
// هل يحتاج تثبيته مقعدًا؟ لا لمن له إعفاء حي منها (exists) ولا لمن حقه في البندين حي من غيرها (covered)
async function heldItems(participantId: string, orgId: string): Promise<PinResult | null> {
  const { data: live } = await db.from('entitlements').select('item, source, organization_id').eq('participant_id', participantId).is('revoked_at', null);
  if (!ITEMS.every((i) => (live || []).some((x: any) => x.item === i))) return null;
  return (live || []).some((x: any) => x.source === 'sponsor' && x.organization_id === orgId) ? 'exists' : 'covered';
}
export async function coveredElsewhere(participantId: string, orgId: string) {
  return (await heldItems(participantId, orgId)) === 'covered';
}
export async function needsSeat(participantId: string, orgId: string) {
  if (await heldItems(participantId, orgId)) return false;
  const { count } = await db.from('entitlements').select('id', { count: 'exact', head: true }).eq('participant_id', participantId).eq('organization_id', orgId)
    .eq('source', 'sponsor').is('revoked_at', null);
  return !count;
}

export async function pinSponsor(p: { id: string; status?: string | null }, org: { id: string; name: string; contract_cents?: number | null }, { auto = true }: PinOpts = {}): Promise<PinResult> {
  const stop = await seatStopped(p, org.id, auto);
  if (stop) return stop;
  // البندان حيّان له: لا مقعد ولا طلب مقعد. كانت عودة الحالة ونقل الإدارة لدافع أو معفى إلى عقد ممتلئ تفتح طلب مقعد،
  // وقبوله يزيد العقد مقعدًا لا يُدرج به شيء
  const held = await heldItems(p.id, org.id);
  if (held) return held;
  const s: any = await settings();
  const value = org.contract_cents ?? (s.assessment_cents + s.program_cents);
  const currency = s.currency || 'USD';
  const { data, error } = await db.rpc('pin_sponsor_seat', { p_participant: p.id, p_org: org.id, p_program_value: value, p_currency: currency, p_note: org.name });
  if (!error) {
    const r = String(data) as PinResult;
    if (r === 'granted') {
      // مقعد أُضيف أو تحرر: يُغلق طلب الانتظار من نفسه
      await db.from('sponsor_requests').update({ status: 'approved', decided_by: 'seats', decided_at: new Date().toISOString() })
        .eq('participant_id', p.id).eq('status', 'pending').in('kind', ['seats', 'contract']).then(() => {}, () => {});
      await seatAlerts(org).catch((e) => console.error('seat alerts', e));
    }
    if (SEAT_BLOCKED.includes(r)) await holdSponsorship(p.id, org, r);
    return r;
  }
  // أي خطأ (ومنه دالة غائبة من ذاكرة PostgREST بعد ترحيل): لا تثبيت بلا فحص المقاعد
  console.error('pin sponsor', error.code, error.message);
  await alertOps('seat_check_unavailable', { participant: p.id, org: org.id, code: error.code ?? null, message: String(error.message || '').slice(0, 200) });
  throw new Fail('تعذّر تثبيت إعفاء الراعي', 503, 'seat_check_unavailable');
}

// «رعاية بانتظار الاعتماد» (D20): طلب للإدارة بنوعه، وإخطار المنسق والإدارة فورًا. المشارك لا يرى بوابة دفع،
// ولا يُفقد ملفه ولا قياسه، والقرار خلال يومي عمل: مقعد يُضاف إلى العقد بتعليل، أو دفع فردي.
async function holdSponsorship(participantId: string, org: { id: string; name: string }, why: PinResult) {
  const kind = why === 'full' ? 'seats' : 'contract';
  // طلب قائم بانتظار القرار: لا طلب ثانٍ. والرفض لا يُفحص هنا: التثبيت الآلي يقف عند رفض سارٍ قبل الدالة (sponsorDecision)
  // فلا تتكرر الحلقة بعده، والصريح نقضه. كان كل رفض قديم يمنع الطلب ولو نقضه فعل صريح بعده، فيبقى المرعي المعاد على
  // بوابة الدفع وأمامه رفض قديم بلا قرار ينتظر
  const { data: open } = await db.from('sponsor_requests').select('id').eq('participant_id', participantId).eq('status', 'pending').limit(1);
  if (open?.length) return;
  const { error } = await db.from('sponsor_requests').insert({ participant_id: participantId, typed_name: org.name, organization_id: org.id, kind, status: 'pending' });
  if (error) { console.error('hold sponsorship', error.message); return; }
  await audit('system', 'seats', 'sponsor.hold', 'participants', participantId, null, { org: org.id, why });
  const reason = why === 'full' ? 'اكتملت مقاعد العقد' : why === 'before' ? 'العقد لم يبدأ بعد' : 'انتهت مدة العقد';
  await notifyOrg(org, `تسجيل بانتظار قرار الرعاية: ${reason}`, `سجّل مشارك برعاية ${esc(org.name)}، و${reason}. القرار خلال يومي عمل: مقعد يُضاف إلى العقد بتعليل، أو يتابع المشارك بدفع فردي.`);
}

// تنبيه الاستهلاك عند 80% و100% من المقاعد، مرة لكل حد (D20)
async function seatAlerts(org: { id: string; name: string }) {
  const { data: o } = await db.from('organizations').select('seats').eq('id', org.id).maybeSingle();
  if (!o?.seats) return;
  const used = await seatsUsed(org.id);
  const level = [...SEAT_ALERTS].reverse().find((x) => used >= Math.ceil(o.seats * x));
  if (!level) return;
  const { count } = await db.from('audit_log').select('id', { count: 'exact', head: true }).eq('action', 'seats.alert').eq('entity_id', org.id).eq('after->>level', String(level)).eq('after->>seats', String(o.seats));
  if (count) return;
  await audit('system', 'seats', 'seats.alert', 'organizations', org.id, null, { level, seats: o.seats, used });
  await notifyOrg(org, level === 1 ? `اكتملت مقاعد ${org.name}` : `استُهلك ${Math.round(level * 100)}% من مقاعد ${org.name}`,
    `استُهلك ${used} من ${o.seats} مقعدًا في عقد ${esc(org.name)}.${level === 1 ? ' التسجيلات التالية تنتظر قرار الرعاية.' : ''}`);
}

// المنسق يُخطَر ببوابة جهته (لا يدخل لوحة الإدارة)، والإدارة بصفحة الطلبات حيث يُتخذ القرار
async function notifyOrg(org: { id: string; name: string }, subject: string, text: string) {
  const { data: coords } = await db.from('org_coordinators').select('email, status').eq('organization_id', org.id).neq('status', 'suspended');
  const coordEmails = [...new Set((coords || []).map((c: any) => c.email).filter(Boolean))] as string[];
  const send = (to: string, url: string, label: string) => sendMail(to, subject, mailShell(subject, mailText(text) + mailButton(url, label), { family: 'admin', footnote: '' }), [], { ref: `organization:${org.id}` })
    .catch((e) => console.error('seat notify', e));
  for (const t of coordEmails) await send(t, `${CONFIG.appUrl}/org`, 'افتح بوابة جهتك');
  if (CONFIG.alertEmail && !coordEmails.includes(CONFIG.alertEmail)) await send(CONFIG.alertEmail, `${SITES.admin}/#/leaders/payments`, 'افتح الطلبات');
}

// يثبّت لمشارك بمعرّفه إن كانت جهته نشطة؛ يُستدعى من مسارات الربط كلها. لا يرمي: الربط نفسه نجح، والتثبيت له احتياط في access()
// صريح افتراضًا (نقل الإدارة، قبول طلب رعاية، والتسجيل والاستيراد بلا سابقة)، وما ليس فعلًا من الإدارة يمرر auto (انظر SEAT_STOPPED)
// النتيجة نفسها، أو null بلا جهة نشطة أو بتعذّر
export async function pinSponsorResult(participantId: string, { auto = false }: PinOpts = {}): Promise<PinResult | null> {
  try {
    const { data: p } = await db.from('participants').select('id, organization_id, is_demo, status').eq('id', participantId).maybeSingle();
    if (!p || p.is_demo || !p.organization_id) return null;
    const { data: org } = await db.from('organizations').select('id, name, status, contract_cents').eq('id', p.organization_id).maybeSingle();
    if (!org || org.status !== 'active') return null;
    return await pinSponsor(p, org, { auto });
  } catch (e) { console.error('pinSponsorFor:', e); return null; }
}
// أخذ مقعدًا من عقد جهته (SEATED)، وبه تعدّ الإدارة pinned وseated. ومن حقه حي من غيرها (covered) لا يُعد
export async function pinSponsorFor(participantId: string, opts: PinOpts = {}) {
  return tookSeat(await pinSponsorResult(participantId, opts));
}

// يبقى على المشارك رسم البرنامج؟ (D04) الدفع مفعّل، ولا حق حي في البرنامج، ولا جهة نشطة ترعاه. والجهة لا ترعاه إن أوقف
// قرار للإدارة رعايتها له (sponsorDecision: سحب أو نقل منها أو رفض طلب مقعده)، كما يحكم access() فيرده 402: كان من
// سُحب إعفاؤه أو رُفض طلبه يُرد بالدفع ولا يصله بريد الرسم ولا تذكيره. ومن ينتظر قرار مقعده (D20) لا يُطلب منه الدفع
export async function programPaymentDue(participantId: string) {
  const s: any = await settings();
  if (!s.enabled) return false;
  const { data: p } = await db.from('participants').select('id, organization_id, is_demo').eq('id', participantId).maybeSingle();
  if (!p || p.is_demo) return false;
  const { count } = await db.from('entitlements').select('participant_id', { count: 'exact', head: true }).eq('participant_id', participantId).eq('item', 'program').is('revoked_at', null);
  if (count) return false;
  if (p.organization_id) {
    const { data: o } = await db.from('organizations').select('status').eq('id', p.organization_id).maybeSingle();
    const org = o?.status === 'active' && (await sponsorDecision(p.id, p.organization_id)) ? null : o;
    if (org?.status === 'active') return false;
  }
  return true;
}
