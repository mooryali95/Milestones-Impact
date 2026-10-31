// ════════════════════════════════════════════════════════════════
// متابعة تنفيذ المبادرة وأثرها بعد اعتماد وثيقتها: المنطق الصافي
// ════════════════════════════════════════════════════════════════
// الخطة لا تُكتب مرة ثانية: معالمها ومنافعها تُقرأ من لقطة الوثيقة
// المعتمدة (سجل المعالم وسجل المنافع)، فهي خط الأساس الذي لا يتغير.
// المتابعة تخزّن الفعلي وحده: حالة كل معلم، وقيمة كل مؤشر، وسردًا قصيرًا.
//   • تحديث واحد لكل شهر طوال ستة أشهر من الاعتماد.
//   • نقطتا مراجعة عند اليوم 90 واليوم 180: تُقاس فيهما كل المنافع،
//     ويؤكد راعي المبادرة في الجهة الأرقام برابط خاص.
//   • نسبة التحقق لكل منفعة: (الفعلي − خط الأساس) ÷ (المستهدف − خط الأساس).
// هذا هو المستوى الرابع في قياس الأثر (نتائج الجهة)، بجانب قياس
// كفاءات القائد قبل البرنامج وبعده (المستوى الثالث).
import { norm, parseDate, parseNumber } from './capstone.js';

export const TRACK_DAYS = 185;
export const FIRST_UPDATE_DAY = 25;
export const CHECKPOINTS = [
  { key: 'd90', day: 90, title: 'مراجعة الأثر بعد 90 يومًا' },
  { key: 'd180', day: 180, title: 'مراجعة الختام بعد 180 يومًا' },
];
export const UPDATE_POINTS = 10;
export const VERIFIED_POINTS = 50;
export const M_STATUS = { on_track: 'في موعده', at_risk: 'معرّض للتأخر', late: 'متأخر', done: 'تحقق', dropped: 'أُلغي بقرار' };
export const HEALTH = { pending: 'لم تبدأ المتابعة', green: 'على المسار', amber: 'يحتاج انتباهًا', red: 'متعثر', stale: 'بلا تحديث', closed: 'اكتملت المتابعة' };
export const VERIFY = { pending: 'بانتظار تأكيد الراعي', confirmed: 'أكّده الراعي', disputed: 'اعترض الراعي', none: 'بلا راعٍ للتأكيد' };

const DAY = 864e5;
export const periodOf = (t) => new Date(t).toISOString().slice(0, 7);

// جدول من لقطة الوثيقة بدلالة أعمدته، كما في محرك الاتساق
function tableOf(snapshot, sectionKey, fieldKey) {
  const s = (snapshot?.sections || []).find((x) => x.key === sectionKey);
  const f = (s?.fields || []).find((x) => x.key === fieldKey && x.type === 'table');
  if (!f) return null;
  const cols = (f.columns || []).map(norm);
  const rows = (Array.isArray(f.value) ? f.value : []).filter((r) => Array.isArray(r) && String(r[0] ?? '').trim());
  const col = (...words) => cols.findIndex((c) => words.some((w) => c.includes(norm(w))));
  return { rows, col, cell: (r, i) => (i >= 0 ? String(r[i] ?? '').trim() : '') };
}

// ── الخطة: من الوثيقة المعتمدة وحدها ──
// المعالم من سجل المعالم، وإن غاب فمن الجدول الزمني. المفاتيح بترتيب الصفوف
// في اللقطة، واللقطة لا تتغير، فتبقى ثابتة طوال المتابعة.
export function trackingPlan(snapshot) {
  const reg = tableOf(snapshot, 'milestone-register', 'milestones');
  const sched = reg && reg.rows.length ? null : tableOf(snapshot, 'schedule', 'activities');
  const t = reg && reg.rows.length ? reg : sched;
  const milestones = t ? t.rows.map((r, i) => {
    const due = reg === t ? t.cell(r, t.col('التاريخ')) : t.cell(r, t.col('النهايه'));
    return {
      key: `m${i}`, title: reg === t ? t.cell(r, 0) : t.cell(r, t.col('النشاط')) || t.cell(r, 0),
      type: reg === t ? t.cell(r, t.col('النوع')) || null : null,
      due: due || null, due_ts: parseDate(due),
      criterion: reg === t ? t.cell(r, t.col('معيار')) || null : null,
      owner: reg === t ? t.cell(r, t.col('صاحب')) || null : null,
    };
  }) : [];
  const b = tableOf(snapshot, 'benefits-register', 'benefits');
  const benefits = b ? b.rows.map((r, i) => {
    const baseline = b.cell(r, b.col('خط الاساس')), target = b.cell(r, b.col('المستهدف'));
    return {
      key: `b${i}`, title: b.cell(r, 0), indicator: b.cell(r, b.col('المؤشر')) || null,
      baseline: baseline || null, target: target || null, owner: b.cell(r, b.col('المالك')) || null,
      numeric: parseNumber(baseline) != null && parseNumber(target) != null && parseNumber(baseline) !== parseNumber(target),
    };
  }) : [];
  return { start: snapshot?.meta?.start || null, end: snapshot?.meta?.end || null, milestones, benefits };
}

// نسبة تحقق المنفعة: 0 عند خط الأساس، و1 عند المستهدف، وتصلح للمؤشر الذي
// يُراد خفضه (المستهدف أقل من خط الأساس). تُقص بين −1 و2 كي لا يطغى رقم شاذ.
export function realization(baseline, target, value) {
  const b = parseNumber(baseline), t = parseNumber(target), v = parseNumber(value);
  if (b == null || t == null || v == null || t === b) return null;
  return Math.round(Math.max(-1, Math.min(2, (v - b) / (t - b))) * 100) / 100;
}

// ── الحالة الراهنة: آخر ما سُجّل لكل معلم ومنفعة ──
export function latestState(plan, updates) {
  const ms = {}, bs = {};
  const ordered = [...(updates || [])].sort((a, b) => String(a.period).localeCompare(String(b.period)));
  for (const u of ordered) {
    for (const [k, x] of Object.entries(u.milestones || {})) if (x?.status) ms[k] = { ...x, period: u.period };
    for (const [k, x] of Object.entries(u.benefits || {})) if (String(x?.value ?? '').trim()) bs[k] = { ...x, period: u.period };
  }
  return {
    milestones: plan.milestones.map((m) => ({ ...m, status: ms[m.key]?.status || null, actual: ms[m.key]?.date || null, note: ms[m.key]?.note || null, period: ms[m.key]?.period || null })),
    benefits: plan.benefits.map((x) => {
      const v = bs[x.key];
      return { ...x, value: v?.value ?? null, note: v?.note || null, evidence: v?.evidence || null, period: v?.period || null, realization: v ? realization(x.baseline, x.target, v.value) : null };
    }),
  };
}

const verifyOf = (u) => (u.verify_status || (u.checkpoint ? 'none' : null));

// ── ملخص المتابعة: مصدر واحد لكل شاشة وتقرير ──
export function trackingSummary(plan, updates, approvedAt, now = Date.now()) {
  if (!approvedAt) return null;
  const list = updates || [];
  const day = Math.floor((now - Date.parse(approvedAt)) / DAY);
  const state = latestState(plan, list);
  const due = state.milestones.filter((m) => m.status !== 'dropped' && m.due_ts != null && m.due_ts <= now);
  const late = due.filter((m) => m.status !== 'done');
  const flagged = state.milestones.filter((m) => m.status === 'late' && !late.includes(m));
  const atRisk = state.milestones.filter((m) => m.status === 'at_risk' && !late.includes(m));
  const done = state.milestones.filter((m) => m.status === 'done');
  const measured = state.benefits.filter((b) => b.value != null);
  const rs = measured.map((b) => b.realization).filter((r) => r != null);
  const avg = rs.length ? Math.round((rs.reduce((a, r) => a + Math.max(0, Math.min(1.5, r)), 0) / rs.length) * 100) : null;
  const current = periodOf(now);
  const thisPeriod = list.find((u) => u.period === current) || null;
  const active = day < TRACK_DAYS;
  // مراجعة فات موعدها وحلّت التي بعدها تُحسب فائتة، فلا تُطلب مراجعتان معًا
  const checkpoints = CHECKPOINTS.map((c, i) => {
    const u = list.find((x) => x.checkpoint === c.key);
    const next = CHECKPOINTS[i + 1];
    const status = u ? (verifyOf(u) === 'confirmed' ? 'verified' : verifyOf(u) === 'disputed' ? 'disputed' : 'submitted')
      : next && day >= next.day ? 'missed' : day >= c.day ? 'due' : 'upcoming';
    return { ...c, status, verify: u ? verifyOf(u) : null, verify_title: u ? VERIFY[verifyOf(u)] : null, period: u?.period || null };
  });
  // مراجعة الختام تبقى متاحة شهرًا بعد انتهاء المتابعة
  const checkpointDue = day < TRACK_DAYS + 30 ? checkpoints.find((c) => c.status === 'due') || null : null;
  const lastAt = list.reduce((a, u) => (!a || String(u.updated_at || u.created_at) > a ? String(u.updated_at || u.created_at) : a), null);
  const reviewed = checkpoints.some((c) => ['submitted', 'verified', 'disputed'].includes(c.status));

  let health;
  if (!checkpointDue && !active) health = 'closed';
  else if (!list.length) health = day >= FIRST_UPDATE_DAY + 10 ? 'stale' : 'pending';
  else if (lastAt && now - Date.parse(lastAt) > 45 * DAY) health = 'stale';
  else if ((due.length && late.length / due.length >= 1 / 3) || (reviewed && avg != null && avg < 50)) health = 'red';
  else if (late.length || flagged.length || atRisk.length || (reviewed && avg != null && avg < 80)) health = 'amber';
  else health = 'green';

  return {
    day, active, current, health, health_title: HEALTH[health],
    milestones: {
      total: plan.milestones.length, done: done.length, due: due.length, late: late.length + flagged.length, at_risk: atRisk.length,
      on_time: due.length ? Math.round(((due.length - late.length) / due.length) * 100) : null,
    },
    benefits: { total: plan.benefits.length, measured: measured.length, realization: avg },
    updates: list.length, last_at: lastAt,
    due: {
      update: active && day >= FIRST_UPDATE_DAY && !thisPeriod,
      checkpoint: checkpointDue ? checkpointDue.key : null,
    },
    can_update: (active || !!checkpointDue) && !(thisPeriod && thisPeriod.verify_status === 'confirmed'),
    checkpoints,
  };
}

// ── تحديث المشارك: قيم معروفة فقط، ومراجعة الأثر تقيس كل المنافع ──
const clip = (v, n) => String(v ?? '').trim().slice(0, n);
export function cleanUpdate(plan, body, checkpoint = null) {
  const milestones = {}, benefits = {};
  for (const m of plan.milestones) {
    const x = body?.milestones?.[m.key];
    if (!x || !x.status) continue;
    if (!(x.status in M_STATUS)) throw new Error(`حالة غير معروفة للمعلم «${m.title}»`);
    const date = clip(x.date, 20);
    if (x.status === 'done' && date && parseDate(date) == null) throw new Error(`اكتب تاريخ تحقق «${m.title}» هكذا 2026-03-15`);
    if (x.status === 'dropped' && !clip(x.note, 500)) throw new Error(`اكتب سبب إلغاء «${m.title}» ومن قرّره`);
    milestones[m.key] = { status: x.status, ...(date ? { date } : {}), ...(clip(x.note, 500) ? { note: clip(x.note, 500) } : {}) };
  }
  for (const b of plan.benefits) {
    const x = body?.benefits?.[b.key];
    const value = clip(x?.value, 60);
    if (!value) {
      if (checkpoint) throw new Error(`مراجعة الأثر تقيس كل المنافع: اكتب القيمة الحالية لـ«${b.title}»`);
      continue;
    }
    if (b.numeric && parseNumber(value) == null) throw new Error(`القيمة الحالية لـ«${b.title}» رقم، مثل خط أساسها ${b.baseline}`);
    const evidence = clip(x?.evidence, 300);
    if (evidence && !/^https:\/\/\S+$/.test(evidence)) throw new Error(`رابط دليل «${b.title}» يبدأ بـ https`);
    benefits[b.key] = { value, ...(clip(x?.note, 500) ? { note: clip(x.note, 500) } : {}), ...(evidence ? { evidence } : {}) };
  }
  const narrative = clip(body?.narrative, 2000);
  if (checkpoint && narrative.length < 40) throw new Error('اكتب في مراجعة الأثر ما الذي تغيّر فعلًا في الجهة، وما دليله (40 حرفًا على الأقل)');
  if (!Object.keys(milestones).length && !Object.keys(benefits).length && !narrative) throw new Error('حدّث معلمًا أو منفعة، أو اكتب ما جرى هذا الشهر');
  return { milestones, benefits, narrative: narrative || null, blockers: clip(body?.blockers, 1000) || null, support: clip(body?.support, 1000) || null };
}

// ── محفظة: إجمالي مبادرات دفعة أو جهة ──
export function portfolioOutcomes(rows) {
  const tracked = rows.filter((r) => r.summary);
  const by = {};
  for (const r of tracked) by[r.summary.health] = (by[r.summary.health] || 0) + 1;
  const mean = (xs) => { const v = xs.filter((x) => x != null); return v.length ? Math.round(v.reduce((a, b) => a + b, 0) / v.length) : null; };
  return {
    approved: tracked.length,
    reporting: tracked.filter((r) => r.summary.updates > 0).length,
    health: by,
    on_time: mean(tracked.map((r) => r.summary.milestones.on_time)),
    realization: mean(tracked.map((r) => r.summary.benefits.realization)),
    verified: tracked.reduce((a, r) => a + r.summary.checkpoints.filter((c) => c.status === 'verified').length, 0),
    cost: tracked.reduce((a, r) => a + (Number(r.cost) || 0), 0) || null,
  };
}
