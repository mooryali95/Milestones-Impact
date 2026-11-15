// ════════════════════════════════════════════════════════════════
// محرك الجدول الزمني: علاقات الأنشطة (FS وSS وFF وSF مع التأخير)، والمسار الحرج، وفحوصه (منطق خالص)
// ════════════════════════════════════════════════════════════════
// التصور: docs/content/2026-11-15-تصور-اللوحات-المرئية-للمبادرة-v1.md (اعتمده المالك، الخيار أ).
// لا عمود جديد: العلاقة تُكتب في عمود «يعتمد على» نفسه بصيغة مختصرة، وما كُتب قبلها يبقى صالحًا:
//   A1              ينتهي A1 ثم يبدأ هذا (FS، الافتراضي)
//   A2 SS           يبدأ مع بدء A2
//   A3 FF+2         ينتهي بعد انتهاء A3 بيومين
//   A4 SF-1، A5     علاقتان، الفاصلة أو الفاصلة المنقوطة أو المسافة بينهما
// الأيام تقويمية، والنشاط يشمل يومي بدايته ونهايته. يقرؤه محرك الاتساق (capstone.js) والرسوم (src/lib/brand/visuals.js).
import { parseDate } from './capstone.js';

export const DEP_TYPES = Object.freeze(['FS', 'SS', 'FF', 'SF']);
export const DEP_AR = Object.freeze({
  FS: { title: 'بعد انتهاء', hint: 'يبدأ بعد أن ينتهي النشاط السابق' },
  SS: { title: 'مع البدء', hint: 'يبدأ حين يبدأ النشاط السابق' },
  FF: { title: 'مع الانتهاء', hint: 'ينتهي حين ينتهي النشاط السابق' },
  SF: { title: 'ينتهي بعد بدء', hint: 'ينتهي بعد أن يبدأ النشاط السابق' },
});
const DAY = 864e5;
const latin = (s) => String(s ?? '').replace(/[٠-٩]/g, (d) => '٠١٢٣٤٥٦٧٨٩'.indexOf(d)).replace(/[۰-۹]/g, (d) => '۰۱۲۳۴۵۶۷۸۹'.indexOf(d));
const code = (v) => latin(v).trim().replace(/\s+/g, '').toUpperCase();

/** «A1، A2 SS+3» ← [{ code: 'A1', type: 'FS', lag: 0 }, { code: 'A2', type: 'SS', lag: 3 }] */
export function parseDeps(text) {
  const out = [];
  for (const raw of latin(text).split(/[،,;؛\s]+/).map((t) => t.trim()).filter(Boolean)) {
    const rel = raw.match(/^(FS|SS|FF|SF)\s*([+-]\s*\d+)?\s*(?:d|days?|ي|يوم|أيام|ايام)?$/i);
    const lag = raw.match(/^([+-]\d+)\s*(?:d|days?|ي|يوم|أيام|ايام)?$/i);
    const glued = raw.match(/^(.+?)(FS|SS|FF|SF)([+-]\d+)?$/i);
    const last = out[out.length - 1];
    if (/^(d|days?|ي|يوم|يومًا|يوما|أيام|ايام|يومين)$/i.test(raw)) continue;   // كلمة الوحدة وحدها بعد التأخير
    if (rel && last) { last.type = rel[1].toUpperCase(); last.lag = rel[2] ? parseInt(rel[2].replace(/\s/g, ''), 10) : 0; continue; }
    if (lag && last) { last.lag = parseInt(lag[1], 10); continue; }
    if (glued && /\d/.test(glued[1])) { out.push({ code: code(glued[1]), type: glued[2].toUpperCase(), lag: glued[3] ? parseInt(glued[3], 10) : 0 }); continue; }
    out.push({ code: code(raw), type: 'FS', lag: 0 });
  }
  return out.filter((d) => d.code);
}

/** [{ code, type, lag }] ← «A1، A2 SS+3» */
export const formatDeps = (deps) => (deps || []).map((d) => `${d.code}${d.type && d.type !== 'FS' ? ` ${d.type}` : ''}${d.lag ? `${d.type && d.type !== 'FS' ? '' : ' FS'}${d.lag > 0 ? '+' : ''}${d.lag}` : ''}`).join('، ');

/** نص العلاقة بالعربية لتلميح أو وصف: «يبدأ مع بدء A2 بعد 3 أيام» */
export function depAr(d) {
  const lag = d.lag ? (d.lag > 0 ? ` بعد ${d.lag} ${d.lag === 1 ? 'يوم' : d.lag === 2 ? 'يومين' : 'أيام'}` : ` قبل ${-d.lag} ${d.lag === -1 ? 'يوم' : 'أيام'}`) : '';
  return { FS: `يبدأ بعد انتهاء ${d.code}${lag}`, SS: `يبدأ مع بدء ${d.code}${lag}`, FF: `ينتهي مع انتهاء ${d.code}${lag}`, SF: `ينتهي بعد بدء ${d.code}${lag}` }[d.type] || d.code;
}

const colIn = (columns, ...words) => (columns || []).findIndex((c) => words.some((w) => String(c).includes(w)));

/**
 * الأنشطة من جدول الفصل: [{ code, name, start, end, days, deps, row }]. start وend بالميلي ثانية (UTC)، وما لا تاريخ له null
 * @param {string[]} columns @param {any[][]} rows
 */
export function activitiesOf(columns, rows) {
  const c = Math.max(0, colIn(columns, 'الرمز')), n = colIn(columns, 'النشاط', 'الحزمة'), s = colIn(columns, 'البداية'), e = colIn(columns, 'النهاية'), d = colIn(columns, 'يعتمد');
  return (rows || []).filter((r) => Array.isArray(r) && r.some((x) => String(x ?? '').trim())).map((r, i) => {
    const start = s >= 0 ? parseDate(r[s] ?? '') : null, end = e >= 0 ? parseDate(r[e] ?? '') : null;
    return { code: code(r[c]) || `#${i + 1}`, name: String(r[n >= 0 ? n : 1] ?? '').trim(), start, end, days: start != null && end != null && end >= start ? Math.round((end - start) / DAY) + 1 : null, deps: d >= 0 ? parseDeps(r[d]) : [], row: i };
  });
}

// القيد الذي تفرضه علاقة على بداية النشاط اللاحق، بالأيام من مرجع واحد. f نهاية حصرية (اليوم التالي لآخر يوم)
function earliestStart(dep, pred, dur) {
  switch (dep.type) {
    case 'SS': return pred.es + dep.lag;
    case 'FF': return pred.ef + dep.lag - dur;
    case 'SF': return pred.es + dep.lag - dur;
    default: return pred.ef + dep.lag;
  }
}

/**
 * تحليل المسار الحرج (CPM) على الأيام. يعيد { nodes, cycle, order, finish, critical }:
 * لكل نشاط مؤرخ: es, ef (حصرية), ls, lf, float بالأيام من أول بداية، وcritical. cycle: رموز حلقة إن وُجدت، فلا مسار حرج
 */
export function cpm(acts) {
  const dated = (acts || []).filter((a) => a.days != null);
  if (!dated.length) return { nodes: {}, cycle: null, order: [], finish: 0, critical: [], origin: null };
  const origin = Math.min(...dated.map((a) => a.start));
  const by = Object.fromEntries(dated.map((a) => [a.code, a]));
  const preds = Object.fromEntries(dated.map((a) => [a.code, a.deps.filter((d) => by[d.code] && d.code !== a.code)]));
  // ترتيب طوبولوجي (Kahn)، وما بقي حلقة
  const indeg = Object.fromEntries(dated.map((a) => [a.code, preds[a.code].length]));
  const succ = Object.fromEntries(dated.map((a) => [a.code, []]));
  for (const a of dated) for (const d of preds[a.code]) succ[d.code].push({ code: a.code, dep: d });
  const queue = dated.filter((a) => !indeg[a.code]).map((a) => a.code);
  const order = [];
  while (queue.length) { const k = queue.shift(); order.push(k); for (const s of succ[k]) if (--indeg[s.code] === 0) queue.push(s.code); }
  if (order.length < dated.length) return { nodes: {}, cycle: dated.filter((a) => !order.includes(a.code)).map((a) => a.code), order: [], finish: 0, critical: [], origin };
  const N = {};
  for (const k of order) {
    const a = by[k], dur = a.days;
    const planned = Math.round((a.start - origin) / DAY);
    // البداية المبكرة: أبعد قيد من سوابقه، ولا تسبق أول يوم في الجدول
    const es = Math.max(0, ...preds[k].map((d) => earliestStart(d, N[d.code], dur)));
    N[k] = { code: k, name: a.name, dur, es, ef: es + dur, planned, plannedEnd: planned + dur };
  }
  const finish = Math.max(...order.map((k) => N[k].ef));
  for (const k of [...order].reverse()) {
    const n = N[k];
    // النهاية المتأخرة: أقرب قيد من لواحقه (العلاقة نفسها معكوسة)، أو نهاية المشروع
    const lf = Math.min(finish, ...succ[k].map(({ code: s, dep }) => {
      const m = N[s];
      switch (dep.type) {
        // القيود الأمامية معكوسة: FS ‏m.es ≥ n.ef+lag، وSS ‏m.es ≥ n.es+lag، وFF ‏m.ef ≥ n.ef+lag، وSF ‏m.ef ≥ n.es+lag
        case 'SS': return m.ls - dep.lag + n.dur;
        case 'FF': return m.lf - dep.lag;
        case 'SF': return m.lf - dep.lag + n.dur;
        default: return m.ls - dep.lag;
      }
    }));
    n.lf = lf; n.ls = lf - n.dur; n.float = n.ls - n.es; n.critical = n.float <= 0;
  }
  return { nodes: N, cycle: null, order, finish, critical: order.filter((k) => N[k].critical), origin };
}

/**
 * مخالفات العلاقات في التواريخ المكتوبة: نشاط تخالف تواريخه علاقته بسابقه. [{ code, dep, need }] need أقل يوم يسمح به القيد
 */
export function violations(acts) {
  const by = Object.fromEntries((acts || []).filter((a) => a.days != null).map((a) => [a.code, a]));
  const out = [];
  for (const a of Object.values(by)) {
    for (const d of a.deps) {
      const p = by[d.code];
      if (!p || p === a) continue;
      const sA = a.start / DAY, fA = a.end / DAY + 1, sP = p.start / DAY, fP = p.end / DAY + 1;
      const ok = { FS: sA >= fP + d.lag, SS: sA >= sP + d.lag, FF: fA >= fP + d.lag, SF: fA >= sP + d.lag }[d.type];
      if (!ok) out.push({ code: a.code, dep: d });
    }
  }
  return out;
}

/** ملخص الجدول للفحوص والرسوم: الأنشطة، والتحليل، والمخالفات، والرموز التي لا تجد نشاطها */
export function scheduleOf(columns, rows, { extraCodes = [] } = {}) {
  const acts = activitiesOf(columns, rows);
  const codes = new Set([...acts.map((a) => a.code), ...extraCodes.map(code)]);
  const orphan = [...new Set(acts.flatMap((a) => a.deps.map((d) => d.code)).filter((c) => !codes.has(c)))];
  return { acts, analysis: cpm(acts), broken: violations(acts), orphan };
}
