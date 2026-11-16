// ════════════════════════════════════════════════════════════════
// الاعتماد الجماعي: من يُعتمد بمستواه المحسوب ومن يُستبقى للمراجعة، ولماذا (منطق خالص بلا قاعدة)
// ════════════════════════════════════════════════════════════════
// الإدارة بالاستثناء: الآلة تعتمد الواضح، والإنسان يقرر في الاستثناء. الإشارات نفسها التي يراها المدير في ملف
// المشارك (evaluatePlacement: الحدّية والأعلام، وجدية الإجابة، وطلب الإعادة)، فلا يحكم الاعتماد الجماعي بغير ما في الملف.
// الحالة الحدّية تُستبقى (قرار المالك 2026-11-15): المستوى التالي في متناول هامش صغير، فيقرره إنسان.
import { DIMENSIONS, LEVELS, OVERRIDE_REASON_MIN } from './logic.js';
import { DIM_AR, LEVEL_AR } from './labels.js';
import { queueEta } from './mail-center.js';

// حد الطلب الواحد، كالإجراءات الجماعية الأخرى (BULK_MAX في admin.ts)
export const BULK_APPROVE_MAX = 50;

/** أسباب استبقاء مشارك عن الاعتماد الجماعي بمستواه المحسوب. فارغة = يُعتمد
 * @param {{ status?: string, placements?: { dimension: string, level: string }[], evaluations?: Record<string, any>, effort?: { level?: string } | null, retake?: any }} d
 *   placements: المستوى المحفوظ لكل بُعد (يُعتمد كما هو) · evaluations: evaluatePlacement لكل بُعد من آخر قياس مسلَّم */
export function approvalHolds({ status, placements = [], evaluations = {}, effort = null, retake = null }) {
  const out = [];
  if (status !== 'pending_approval') return [{ key: 'status', text: 'ليس بانتظار الاعتماد' }];
  if (retake) out.push({ key: 'retake', text: 'طُلبت إعادة قياسه ولم يسلّم قياسًا جديدًا' });
  if (effort?.level === 'low') out.push({ key: 'effort', text: 'أجاب باستعجال' });
  else if (effort?.level === 'watch') out.push({ key: 'effort', text: 'جدية إجابته تحت المراجعة' });
  const byDim = Object.fromEntries((placements || []).map((x) => [x.dimension, x.level]));
  for (const d of DIMENSIONS) {
    const name = DIM_AR[d] || d;
    const ev = evaluations[d];
    if (!LEVELS.includes(byDim[d]) || !ev) { out.push({ key: 'missing', dim: d, text: `لا مستوى محسوب في ${name}` }); continue; }
    if (ev.level && ev.level !== byDim[d]) out.push({ key: 'drift', dim: d, text: `المستوى المحفوظ في ${name} (${LEVEL_AR[byDim[d]]}) يخالف المحسوب الآن (${LEVEL_AR[ev.level]})` });
    if (ev.borderline) out.push({ key: 'borderline', dim: d, text: `حالة حدّية في ${name}: المستوى التالي في متناول هامش صغير` });
    for (const f of ev.flags || []) out.push({ key: f.key, dim: d, text: `${f.reason_ar} في ${name}` });
  }
  return out;
}

// تقسيم المحددين: من يُعتمد ومن يُستبقى بأسبابه. rows: { id, full_name, ...مدخل approvalHolds }
export function splitForApproval(rows = []) {
  const ready = [], held = [];
  for (const r of rows) {
    const holds = approvalHolds(r);
    const levels = Object.fromEntries((r.placements || []).map((x) => [x.dimension, x.level]));
    (holds.length ? held : ready).push({ id: r.id, full_name: r.full_name, levels, ...(holds.length ? { holds } : {}) });
  }
  return { ready, held };
}

// أثر البريد قبل التنفيذ: كم يخرج الآن وكم ينتظر في صندوق «لم يُرسل»، ومتى يُتوقع أن يخرج آخره.
// بريد الاعتماد إشعار (notify)، فيحكمه نصيب غير الرموز من السقف (mailBudget.nonCodeLeft) لا السقف الكلي، ويُقدَّر
// موعد المنتظر بالحساب نفسه الذي يعرضه مركز البريد (queueEta)
/** @param {number} count @param {{ budget?: any, nonCodeSent?: string[], now?: number }} o */
export function mailForecast(count, { budget = {}, nonCodeSent = [], now = Date.now() } = {}) {
  const n = Math.max(0, Number(count) || 0);
  const nowCount = Math.min(n, Math.max(0, budget.nonCodeLeft ?? 0));
  const queued = n - nowCount;
  if (!queued) return { now: nowCount, queued: 0, clear_at: null };
  // ما يخرج الآن يأخذ ما بقي من الحصة ويحرر مكانه بعد 24 ساعة كغيره، والمنتظر يأخذ ما يتحرر بعده
  const sentNow = Array.from({ length: nowCount }, () => new Date(now).toISOString());
  const rows = Array.from({ length: queued }, (_, i) => ({ id: String(i), kind: 'notify', created_at: new Date(now + i).toISOString() }));
  const eta = queueEta(rows, { nonCodeSent: [...nonCodeSent, ...sentNow], budget: { nonCodeLeft: 0 }, now });
  return { now: nowCount, queued, clear_at: eta[String(queued - 1)]?.at ?? null };
}

// ── المرحلة 2: اعتماد المحددين بمستوى واحد (للمدير العام، بتعليل إلزامي) ──
// levels: لكل بُعد مستوى يُفرض، والفارغ يبقى على المحسوب. التعليل يلزم إن خالف مستوًى مفروضٌ محسوبَ أحدٍ منهم،
// ويُحفظ لكل من خالفه (admin_note) فيظهر في ملفه كمخالفة فردية بتعليلها. لا تُستبقى الإشارات هنا: القرار صريح من صاحبه
/** @param {any[]} rows @param {Record<string, string>} levels @param {string} reason */
export function planUniform(rows = [], levels = {}, reason = '') {
  const set = Object.fromEntries(Object.entries(levels || {}).filter(([d, l]) => DIMENSIONS.includes(d) && LEVELS.includes(l)));
  const ready = [], held = [];
  for (const r of rows) {
    if (r.status !== 'pending_approval') { held.push({ id: r.id, full_name: r.full_name, holds: [{ key: 'status', text: 'ليس بانتظار الاعتماد' }] }); continue; }
    const now = Object.fromEntries((r.placements || []).map((x) => [x.dimension, x.level]));
    const next = { ...now, ...set };
    const missing = DIMENSIONS.filter((d) => !LEVELS.includes(next[d]));
    if (missing.length) { held.push({ id: r.id, full_name: r.full_name, holds: missing.map((d) => ({ key: 'missing', dim: d, text: `لا مستوى محسوب في ${DIM_AR[d]}: اختر له مستوى` })) }); continue; }
    const changes = DIMENSIONS.filter((d) => now[d] && now[d] !== next[d]).map((d) => ({ dim: d, from: now[d], to: next[d] }));
    ready.push({ id: r.id, full_name: r.full_name, levels: next, changes });
  }
  const overrides = ready.some((r) => r.changes.length);
  return { ready, held, levels: set, needs_reason: overrides, reason_ok: !overrides || String(reason || '').trim().length >= OVERRIDE_REASON_MIN };
}
// علة كل بُعد خالفه المستوى المفروض: التعليل الواحد نفسه، فيقبله approveOne بقاعدته (overrideNeedsReason)
export const notesFor = (row, reason) => Object.fromEntries((row.changes || []).map((c) => [c.dim, String(reason).trim()]));

// ── المرحلة 3: التحقق بالعينة ──
// مراجعة نسبة عشوائية مما اعتُمد آليًا تكشف إن كانت القاعدة نفسها تخطئ (ضبط جودة لا مراجعة كاملة). 10% وواحد على الأقل.
// rnd قابل للحقن في الاختبار؛ الخادم يمرر Math.random
export const SAMPLE_RATE = 0.1;
export function pickSample(ids = [], { rate = SAMPLE_RATE, rnd = Math.random } = {}) {
  if (!ids.length) return [];
  const n = Math.min(ids.length, Math.max(1, Math.ceil(ids.length * rate)));
  const pool = [...ids];
  for (let i = pool.length - 1; i > 0; i -= 1) { const j = Math.floor(rnd() * (i + 1)); [pool[i], pool[j]] = [pool[j], pool[i]]; }
  return pool.slice(0, n);
}
