// ════════════════════════════════════════════════════════════════
// تثبيت إعفاء الراعي: لحظة ربط المشارك بجهته، بقيمتها وعملتها يومذاك
// ════════════════════════════════════════════════════════════════
// كان التثبيت يقع في أول طلب للمشارك بعد الربط (access)، فيبقى كشف الجهة بقيم فارغة حتى يدخل
// كل مشارك، وتُثبَّت قيمة لاحقة إن تغيّر السعر بينهما. الآن كل مسار ربط (تسجيل برمز أو نطاق،
// رمز يكتبه المشارك، ربط آلي بالنطاق، نقل من الإدارة، قبول طلب رعاية) يثبّت فورًا، وaccess()
// يبقى احتياطًا لمن رُبط قبل هذا التغيير. وحدة مستقلة حتى لا تدور الاستيرادات (admin ↔ payments).
import { audit, CONFIG, db, Fail, sendMail } from './core.ts';
import { esc, mailButton, mailShell, mailText } from '../_shared/mail.ts';
import { SITES } from '../_shared/sites.js';

export type Item = 'assessment' | 'program';
export const ITEMS: Item[] = ['assessment', 'program'];

export async function settings() {
  const { data } = await db.from('payment_settings').select('*').eq('id', true).maybeSingle();
  return data || { enabled: false, currency: 'USD', assessment_cents: 100, program_cents: 9900 };
}

// القيمة التعاقدية تُثبَّت على بند البرنامج (والقياس صفر)، فمجموع ما للمشارك = سعر جهته لحظة ربطه، بعملة الإعداد يومذاك.
// D20: التثبيت يستهلك مقعدًا من عقد الجهة بفحص ذري في القاعدة (leaders.pin_sponsor_seat): قفل صف الجهة، ومدة العقد،
// والمقاعد، ثم البندان في المعاملة نفسها. قبل ترحيل 20261107130000 يُثبَّت كما كان بلا فحص، والضبط يدوي.
export type PinResult = 'granted' | 'exists' | 'full' | 'before' | 'after' | 'inactive' | 'legacy';
export const SEAT_BLOCKED: PinResult[] = ['full', 'before', 'after'];
export const SEAT_ALERTS = [0.8, 1];

export async function pinSponsor(p: { id: string }, org: { id: string; name: string; contract_cents?: number | null }): Promise<PinResult> {
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
  if (!['PGRST202', '42883'].includes(String(error.code))) { console.error('pin sponsor', error.message); throw new Fail('تعذّر تثبيت إعفاء الراعي', 500, 'db_error'); }
  // قبل الترحيل: السلوك السابق بلا فحص المقاعد
  const rows = ITEMS.map((item) => ({
    participant_id: p.id, item, source: 'sponsor', organization_id: org.id, granted_by: 'sponsor', note: org.name,
    value_cents: item === 'program' ? value : 0, currency,
  }));
  for (const r of rows) {
    const { error: e1 } = await db.from('entitlements').insert(r);
    if (e1 && e1.code === '23505') continue;   // للمشارك حق حي في هذا البند من قبل (دفع أو منحة أو تثبيت سابق)
    if (e1 && e1.code === '42703') {            // عمود currency قبل ترحيله: نثبّت بلا عملة بدل أن نفشل
      const { currency: _c, ...legacy } = r;
      const { error: e2 } = await db.from('entitlements').insert(legacy);
      if (e2 && e2.code !== '23505') { console.error('pin sponsor', e2.message); throw new Fail('تعذّر تثبيت إعفاء الراعي', 500, 'db_error'); }
      continue;
    }
    if (e1) { console.error('pin sponsor', e1.message); throw new Fail('تعذّر تثبيت إعفاء الراعي', 500, 'db_error'); }
  }
  return 'legacy';
}

// «رعاية بانتظار الاعتماد» (D20): طلب للإدارة بنوعه، وإخطار المنسق والإدارة فورًا. المشارك لا يرى بوابة دفع،
// ولا يُفقد ملفه ولا قياسه، والقرار خلال يومي عمل: مقعد يُضاف إلى العقد بتعليل، أو دفع فردي.
async function holdSponsorship(participantId: string, org: { id: string; name: string }, why: PinResult) {
  const kind = why === 'full' ? 'seats' : 'contract';
  // طلب قائم بانتظار القرار، أو قرار بالدفع الفردي لهذه الجهة: لا طلب جديد (لا تتكرر الحلقة بعد الرفض)
  const { data: open } = await db.from('sponsor_requests').select('id').eq('participant_id', participantId).eq('status', 'pending').limit(1);
  if (open?.length) return;
  const { data: decided } = await db.from('sponsor_requests').select('id').eq('participant_id', participantId).eq('organization_id', org.id)
    .eq('status', 'rejected').in('kind', ['seats', 'contract']).limit(1);
  if (decided?.length) return;
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
  const { data: ents } = await db.from('entitlements').select('participant_id').eq('organization_id', org.id).eq('source', 'sponsor').is('revoked_at', null);
  const used = new Set((ents || []).map((e: any) => e.participant_id)).size;
  const level = [...SEAT_ALERTS].reverse().find((x) => used >= Math.ceil(o.seats * x));
  if (!level) return;
  const { count } = await db.from('audit_log').select('id', { count: 'exact', head: true }).eq('action', 'seats.alert').eq('entity_id', org.id).eq('after->>level', String(level)).eq('after->>seats', String(o.seats));
  if (count) return;
  await audit('system', 'seats', 'seats.alert', 'organizations', org.id, null, { level, seats: o.seats, used });
  await notifyOrg(org, level === 1 ? `اكتملت مقاعد ${org.name}` : `استُهلك ${Math.round(level * 100)}% من مقاعد ${org.name}`,
    `استُهلك ${used} من ${o.seats} مقعدًا في عقد ${esc(org.name)}.${level === 1 ? ' التسجيلات التالية تنتظر قرار الرعاية.' : ''}`);
}

async function notifyOrg(org: { id: string; name: string }, subject: string, text: string) {
  const { data: coords } = await db.from('org_coordinators').select('email, status').eq('organization_id', org.id).neq('status', 'suspended');
  const to = [...new Set([...(coords || []).map((c: any) => c.email).filter(Boolean), CONFIG.alertEmail].filter(Boolean))];
  const html = mailShell(subject, mailText(text) + mailButton(`${SITES.admin}/#/leaders/payments`, 'افتح الطلبات'), { family: 'admin', footnote: '' });
  for (const t of to) await sendMail(t as string, subject, html, [], { ref: `organization:${org.id}` }).catch((e) => console.error('seat notify', e));
}

// يثبّت لمشارك بمعرّفه إن كانت جهته نشطة؛ يُستدعى من مسارات الربط كلها. لا يرمي: الربط نفسه نجح، والتثبيت له احتياط في access()
export async function pinSponsorFor(participantId: string) {
  try {
    const { data: p } = await db.from('participants').select('id, organization_id, is_demo').eq('id', participantId).maybeSingle();
    if (!p || p.is_demo || !p.organization_id) return false;
    const { data: org } = await db.from('organizations').select('id, name, status, contract_cents').eq('id', p.organization_id).maybeSingle();
    if (!org || org.status !== 'active') return false;
    return !SEAT_BLOCKED.includes(await pinSponsor(p, org));
  } catch (e) { console.error('pinSponsorFor:', e); return false; }
}

// يبقى على المشارك رسم البرنامج؟ (D04) الدفع مفعّل، ولا جهة نشطة ترعاه، ولا حق حي في البرنامج
export async function programPaymentDue(participantId: string) {
  const s: any = await settings();
  if (!s.enabled) return false;
  const { data: p } = await db.from('participants').select('id, organization_id, is_demo').eq('id', participantId).maybeSingle();
  if (!p || p.is_demo) return false;
  if (p.organization_id) {
    const { data: org } = await db.from('organizations').select('status').eq('id', p.organization_id).maybeSingle();
    if (org?.status === 'active') return false;
  }
  const { count } = await db.from('entitlements').select('participant_id', { count: 'exact', head: true }).eq('participant_id', participantId).eq('item', 'program').is('revoked_at', null);
  return !count;
}
