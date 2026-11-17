// ════════════════════════════════════════════════════════════════
// «التوجيه والإرشاد» H1: تبويبا الإدارة (قرار المالك 2026-11-16)
// ════════════════════════════════════════════════════════════════
// «التوجيه والإرشاد»: الحالة والتحكم، والإنفاق، والاستعمال موزعًا على الجهات والدفعات، والدقة.
// «إتاحة التوجيه»: فتح المساعد أو إغلاقه لكل جهة (مفتاحها القائم companion_allowed، مصدر واحد تقرؤه البوابة)،
// والدفعات التجريبية. كله للمدير الأعلى والمالك، والكتابة بغلاف superWriter، وكل تغيير يُسجَّل.
// لا نص محادثة في شيء من هذا: الأعداد والكلفة وحدها (سجل المحادثات في المرحلة H3 بصلاحية من المالك).
import { audit, db, Fail } from './core.ts';
import type { Admin } from './admin.ts';
import { requireAgentRead } from './agent-admin.ts';
import { appSettings, adminSave } from './settings.ts';
import { GUIDE_MODEL, GUIDE_POLICY_VERSION, riyadhWindow } from './guide.js';
import { GD, guideBreakdown, guideReport } from './guide.ts';
import { evalGateNow, pilotList, resetEvalGate } from './guide-eval.ts';
import { EVAL_GATE_AR } from './guide-eval.js';

type Body = Record<string, any>;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// ما يمنع المساعد عن الجميع الآن، بالترتيب نفسه الذي تحكم به البوابة (guideGate)
export function blockers(o: { policy: string | null; enabled: boolean; evalOk: boolean; evalReason: string | null; hasKey: boolean; pilots: number }) {
  const b: string[] = [];
  if (!o.policy) b.push('نسخة السياسة الجوهرية لم تُنشر بعد (المرحلة G4b).');
  if (!o.enabled) b.push('المساعد متوقف من هذه اللوحة.');
  if (!o.evalOk) b.push((EVAL_GATE_AR as Record<string, string>)[o.evalReason || 'none'] || 'تقييم الدقة لم ينجح بعد.');
  if (!o.pilots) b.push('لا دفعة تجريبية مفعّلة في «إتاحة التوجيه».');
  if (!o.hasKey) b.push('لا مفتاح للنموذج (يُضبط من «المساعد الآلي» ← المفتاح).');
  return b;
}

export async function dashboard(a: Admin) {
  requireAgentRead(a);
  const s = (await appSettings()).guidance as any;
  const [report, breakdown, gate, pilots, key] = await Promise.all([
    guideReport(), guideBreakdown(30), evalGateNow(), pilotList(a), GD.key().catch(() => ''),
  ]);
  const today = riyadhWindow(GD.now()).dayKey;
  const spentToday = (report.spend || []).find((x: any) => x.day === today)?.usd || 0;
  const pilotCount = (pilots.cohorts || []).filter((c: any) => c.pilot).length;
  return {
    success: true, model: GUIDE_MODEL, policy_version: GUIDE_POLICY_VERSION,
    settings: { enabled: !!s.enabled, cap_usd: Number(s.daily_spend_usd), daily: s.daily_questions, monthly: s.monthly_questions, retention_days: s.retention_days, extra_rules: String(s.extra_rules || '') },
    gate: { eval_ok: gate.ok, eval_reason: gate.reason, pilots: pilotCount, has_key: !!key },
    can_write: a.role === 'super_admin' && a.method !== 'email',
    blockers: blockers({ policy: GUIDE_POLICY_VERSION, enabled: !!s.enabled, evalOk: gate.ok, evalReason: gate.reason, hasKey: !!key, pilots: pilotCount }),
    today: { day: today, usd: spentToday },
    report, breakdown,
  };
}

// التشغيل والإيقاف: المفتاح نفسه في الإعدادات العامة (guidance.enabled)، فيُحفظ بمساره ويُسجَّل فيه
export async function toggle(a: Admin, b: Body) {
  requireAgentRead(a);
  const on = b.on === true;
  await adminSave(a, { group: 'guidance', values: { enabled: on } });
  resetEvalGate();
  return { success: true, enabled: on };
}

// الجهات: مفتاح companion_allowed القائم (OrgForm وبوابة المساعد)، فلا إعداد ثانٍ
export async function orgs(a: Admin) {
  requireAgentRead(a);
  const { data, error } = await db.from('organizations').select('id, name, status, companion_allowed').order('name');
  if (error) {
    if (error.code === '42703' || /companion_allowed/.test(String(error.message || ''))) return { success: true, ready: false, orgs: [] };
    throw error;
  }
  return { success: true, ready: true, orgs: (data || []).map((o: any) => ({ id: o.id, name: o.name, status: o.status, allowed: o.companion_allowed !== false })) };
}

export async function orgSet(a: Admin, b: Body) {
  requireAgentRead(a);
  const id = String(b.org_id || '');
  if (!UUID.test(id)) throw new Fail('معرّف غير صحيح', 400, 'bad_id');
  const on = b.on === true;
  const { data, error } = await db.from('organizations').update({ companion_allowed: on }).eq('id', id).select('id, name').maybeSingle();
  if (error) throw error;
  if (!data) throw new Fail('الجهة غير موجودة', 404);
  await audit('admin', a.email, on ? 'guide.org-on' : 'guide.org-off', 'organizations', id, { companion_allowed: !on }, { companion_allowed: on });
  return { success: true, org: { id, name: (data as any).name, allowed: on } };
}
