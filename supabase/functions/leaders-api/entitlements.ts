// ════════════════════════════════════════════════════════════════
// تثبيت إعفاء الراعي: لحظة ربط المشارك بجهته، بقيمتها وعملتها يومذاك
// ════════════════════════════════════════════════════════════════
// كان التثبيت يقع في أول طلب للمشارك بعد الربط (access)، فيبقى كشف الجهة بقيم فارغة حتى يدخل
// كل مشارك، وتُثبَّت قيمة لاحقة إن تغيّر السعر بينهما. الآن كل مسار ربط (تسجيل برمز أو نطاق،
// رمز يكتبه المشارك، ربط آلي بالنطاق، نقل من الإدارة، قبول طلب رعاية) يثبّت فورًا، وaccess()
// يبقى احتياطًا لمن رُبط قبل هذا التغيير. وحدة مستقلة حتى لا تدور الاستيرادات (admin ↔ payments).
import { db, Fail } from './core.ts';

export type Item = 'assessment' | 'program';
export const ITEMS: Item[] = ['assessment', 'program'];

export async function settings() {
  const { data } = await db.from('payment_settings').select('*').eq('id', true).maybeSingle();
  return data || { enabled: false, currency: 'USD', assessment_cents: 100, program_cents: 9900 };
}

// القيمة التعاقدية تُثبَّت على بند البرنامج (والقياس صفر)، فمجموع ما للمشارك = سعر جهته لحظة ربطه، بعملة الإعداد يومذاك
export async function pinSponsor(p: { id: string }, org: { id: string; name: string; contract_cents?: number | null }) {
  const s: any = await settings();
  const value = org.contract_cents ?? (s.assessment_cents + s.program_cents);
  const rows = ITEMS.map((item) => ({
    participant_id: p.id, item, source: 'sponsor', organization_id: org.id, granted_by: 'sponsor', note: org.name,
    value_cents: item === 'program' ? value : 0, currency: s.currency || 'USD',
  }));
  for (const r of rows) {
    const { error } = await db.from('entitlements').insert(r);
    if (error && error.code === '23505') continue;   // للمشارك حق حي في هذا البند من قبل (دفع أو منحة أو تثبيت سابق)
    if (error && error.code === '42703') {            // عمود currency قبل ترحيله: نثبّت بلا عملة بدل أن نفشل
      const { currency: _c, ...legacy } = r;
      const { error: e2 } = await db.from('entitlements').insert(legacy);
      if (e2 && e2.code !== '23505') { console.error('pin sponsor', e2.message); throw new Fail('تعذّر تثبيت إعفاء الراعي', 500, 'db_error'); }
      continue;
    }
    if (error) { console.error('pin sponsor', error.message); throw new Fail('تعذّر تثبيت إعفاء الراعي', 500, 'db_error'); }
  }
}

// يثبّت لمشارك بمعرّفه إن كانت جهته نشطة؛ يُستدعى من مسارات الربط كلها. لا يرمي: الربط نفسه نجح، والتثبيت له احتياط في access()
export async function pinSponsorFor(participantId: string) {
  try {
    const { data: p } = await db.from('participants').select('id, organization_id, is_demo').eq('id', participantId).maybeSingle();
    if (!p || p.is_demo || !p.organization_id) return false;
    const { data: org } = await db.from('organizations').select('id, name, status, contract_cents').eq('id', p.organization_id).maybeSingle();
    if (!org || org.status !== 'active') return false;
    await pinSponsor(p, org);
    return true;
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
