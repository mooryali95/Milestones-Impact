import { CONF, B } from "./theme";

export const now = () => new Date().toISOString().slice(0, 16).replace("T", " ");

export function calcScore(ev, criteria) {
  let raw = 0, adj = 0;
  criteria.forEach((cr, i) => {
    raw += cr.w * ev.scores[i];
    adj += cr.w * ev.scores[i] * CONF[ev.conf[i]].f;
  });
  const tw = criteria.reduce((s, c) => s + c.w, 0) || 1;
  return { raw: (raw / (tw * 9)) * 100, adj: (adj / (tw * 9)) * 100 };
}

export function bucket(adj, risk) {
  if (adj >= 75 && risk <= 5) return "launch";
  if (adj >= 68) return "next";
  if (adj >= 60) return "defer";
  return "exclude";
}

export function scenWeights(criteria, mult) {
  const ws = criteria.map((c) => c.w * (mult[c.id] || 1));
  const t = ws.reduce((a, b) => a + b, 0);
  return criteria.map((c, i) => ({ ...c, w: (ws[i] / t) * 100 }));
}

export function runMonteCarlo(items, criteria, n = 1000) {
  const NOISE = { H: 0.5, M: 1.25, L: 2.5 };
  const tw = criteria.reduce((s, c) => s + c.w, 0) || 1;
  const stat = {};
  items.forEach((it) => (stat[it.key] = { top3: 0, sum: 0, min: 100, max: 0 }));
  for (let t = 0; t < n; t++) {
    const round = items.map((it) => {
      let v = 0;
      criteria.forEach((cr, i) => {
        const s = Math.min(9, Math.max(1, it.ev.scores[i] + (Math.random() * 2 - 1) * NOISE[it.ev.conf[i]]));
        v += cr.w * s;
      });
      v = (v / (tw * 9)) * 100;
      const st = stat[it.key];
      st.sum += v; st.min = Math.min(st.min, v); st.max = Math.max(st.max, v);
      return { key: it.key, v };
    });
    round.sort((a, b) => b.v - a.v);
    round.slice(0, 3).forEach((r) => stat[r.key].top3++);
  }
  return items.map((it) => ({
    key: it.key, name: it.name,
    avg: stat[it.key].sum / n, min: stat[it.key].min, max: stat[it.key].max,
    top3: (stat[it.key].top3 / n) * 100,
  })).sort((a, b) => b.top3 - a.top3);
}

export const scoreStyle = (s) =>
  s >= 7 ? { background: "#E4F2EA", color: B.ok } : s >= 4 ? { background: "#F7EDD8", color: B.warn } : { background: "#F7E2DE", color: B.bad };

/** حساب الأوزان من مصفوفة المقارنات الزوجية عبر المتوسط الهندسي (طريقة معتمدة ومبسّطة لـ AHP) */
export function computeAHPWeights(criteria, pairs) {
  const n = criteria.length;
  const M = Array.from({ length: n }, () => Array(n).fill(1));
  for (let i = 0; i < n; i++) for (let j = i + 1; j < n; j++) {
    const v = pairs[`${i}-${j}`] ?? 1;
    M[i][j] = v; M[j][i] = 1 / v;
  }
  const geo = M.map((row) => Math.pow(row.reduce((a, b) => a * b, 1), 1 / n));
  const total = geo.reduce((a, b) => a + b, 0) || 1;
  return geo.map((g) => Math.round((g / total) * 1000) / 10);
}
