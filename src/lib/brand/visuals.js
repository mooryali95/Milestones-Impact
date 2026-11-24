// ════════════════════════════════════════════════════════════════
// اللوحات المرئية للمبادرة: رسوم SVG تُولَّد من فصول الوثيقة، واحدة للتطبيق وللوثيقة وملف PDF
// ════════════════════════════════════════════════════════════════
// التصور: docs/content/2026-11-15-تصور-اللوحات-المرئية-للمبادرة-v1.md (اعتمده المالك 2026-11-15).
// كل رسم دالة خالصة تعيد { svg, missing }: svg نص SVG جاهز، وmissing ما ينقص ليكتمل الرسم (يُقال صراحة ولا يُخفى).
// الألوان من هوية Milestone Impact، والاتجاه من اليمين إلى اليسار: الزمن يجري نحو اليسار.
// العناصر تحمل <title> (تلميح عند المرور في التطبيق) وdata-chapter (النقر يفتح الفصل في التطبيق).
import { isVirtual, parseDate, parseWhen, RISK_HIGH, RISK_MID, whenAr } from '../../../supabase/functions/leaders-api/capstone.js';
import { activitiesOf, cpm, depAr, scheduleOf } from '../../../supabase/functions/leaders-api/schedule.js';
import { BRAND } from '../../../shared/js/brand.js';

// ألوان الهوية من مصدرها (shared/js/brand.js). المسار الحرج بالذهبي العميق، والنشاط العادي بالجرافيت، والمعلم معين جرافيتي بحد ذهبي
export const VC = Object.freeze({ ink: BRAND.graphite, slate: BRAND['ink-text'], muted: BRAND['muted-mid'], line: BRAND['line-cool'], faint: BRAND['line-soft'], gold: BRAND.gold, goldSoft: BRAND['gold-pale'],
  cream: BRAND['cream-light'], crit: BRAND['gold-deep'], critSoft: BRAND['cream-warm'], paper: BRAND.white, stripe: BRAND['cream-faint'] });
const DAY = 864e5;
const esc = (s) => String(s ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const cut = (s, n) => { const t = String(s ?? ''); return t.length > n ? `${t.slice(0, n - 1)}…` : t; };
const FONT = 'font-family="Noto Kufi Arabic, Noto Sans, sans-serif"';
const days = (n) => (n === 1 ? 'يوم واحد' : n === 2 ? 'يومان' : n <= 10 ? `${n} أيام` : `${n} يومًا`);
const fieldOf = (doc, key, field) => (doc?.sections || []).find((s) => s.key === key)?.fields?.find((f) => f.key === field) || null;

/** الأنشطة والمعالم وتحليلها من الوثيقة: مدخل الرسمين */
export function scheduleModel(doc) {
  const f = fieldOf(doc, 'schedule', 'activities');
  const wbs = fieldOf(doc, 'wbs', 'packages');
  const wbsCodes = wbs ? (wbs.value || []).map((r) => String(r?.[0] ?? '').trim()).filter(Boolean) : [];
  // مرساة الأسابيع: تاريخ البدء في البطاقة إن وُجد
  const anchor = parseDate(fieldOf(doc, 'initiative-charter', 'start')?.value || '');
  const sc = f ? scheduleOf(f.columns, f.value || [], { extraCodes: wbsCodes, anchor }) : { acts: [], analysis: cpm([]), broken: [], orphan: [] };
  const ms = fieldOf(doc, 'milestone-register', 'milestones');
  const mcols = ms?.columns || [];
  const mi = (w) => mcols.findIndex((c) => String(c).includes(w));
  const milestones = (ms?.value || []).filter((r) => Array.isArray(r) && r.some((x) => String(x ?? '').trim()))
    .map((r) => ({ title: String(r[0] ?? '').trim(), at: parseWhen(r[mi('التاريخ')], { anchor, edge: 'end', virtual: true }), decision: String(r[mi('القرار')] ?? '').trim(), owner: String(r[mi('صاحب القرار')] ?? '').trim(), type: String(r[mi('النوع')] ?? '').trim() }))
    .filter((m) => m.at != null);
  // بعد الاعتماد: حالة كل معلم وتاريخ تحققه من المتابعة الشهرية (المخطط مقابل الفعلي)
  const tr = Object.fromEntries((doc?.tracking?.state?.milestones || []).map((x) => [normAr(x.title), x]));
  const statuses = doc?.tracking?.statuses || {};
  for (const x of milestones) { const t = tr[normAr(x.title)]; if (t) { x.status = t.status; x.status_title = statuses[t.status] || null; x.actual = t.actual || null; } }
  const base = { ...sc, milestones };
  // المخاطر على أنشطتها: الخطر المرتبط بحزمة يظهر على أنشطة الحزمة وما تحتها
  const pk = packagesOf(doc, base);
  const risks = {};
  for (const r of risksOf(doc)) {
    const p = pk.find((x) => x.code === r.link);
    for (const a of p?.acts || []) (risks[a] ||= []).push(r);
  }
  return { ...base, risks };
}

// ── مخطط جانت المتكامل ──
/**
 * @param {ReturnType<typeof scheduleModel>} m
 * @param {{ today?: number | null, width?: number, compact?: boolean }} [opts]
 */
export function ganttSvg(m, { today = Date.now(), width = 1000, compact = false } = {}) {
  const acts = m.acts.filter((a) => a.days != null);
  const missing = [];
  if (!m.acts.length) missing.push('أضف أنشطة إلى الجدول الزمني');
  else if (!acts.length) missing.push('اكتب تاريخي البداية والنهاية لكل نشاط');
  if (m.acts.length && !m.acts.some((a) => a.deps.length)) missing.push('اربط الأنشطة بعلاقاتها في عمود «يعتمد على» ليظهر التتابع والمسار الحرج');
  if (!acts.length) return { svg: '', missing };
  const an = m.analysis;
  const ms = m.milestones || [];
  const min = Math.min(...acts.map((a) => a.start), ...ms.map((x) => x.at));
  const max = Math.max(...acts.map((a) => a.end + DAY), ...ms.map((x) => x.at + DAY));
  const span = Math.max(DAY, max - min);
  const W = width, label = compact ? 230 : 300, pad = 14, chart = W - label - pad * 2, rowH = compact ? 26 : 32, top = 40;
  const rows = [...acts.map((a) => ({ kind: 'act', a })), ...ms.map((x) => ({ kind: 'ms', x }))];
  const H = top + rows.length * rowH + 18;
  const X = (t) => W - label - pad - ((t - min) / span) * chart;
  const Y = (i) => top + i * rowH;
  const at = Object.fromEntries(acts.map((a, i) => [a.code, i]));
  let g = '';
  // محور الشهور
  const d0 = new Date(min);
  const ticks = [];
  for (let t = Date.UTC(d0.getUTCFullYear(), d0.getUTCMonth(), 1); t <= max; ) { if (t >= min) ticks.push(t); const d = new Date(t); t = Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 1); }
  const step = Math.max(1, Math.ceil(ticks.length / 12));
  for (const t of ticks.filter((_, i) => i % step === 0)) {
    g += `<line x1="${X(t).toFixed(1)}" y1="${top - 8}" x2="${X(t).toFixed(1)}" y2="${H - 14}" stroke="${VC.faint}" stroke-width="1"/>`
      + `<text x="${X(t).toFixed(1)}" y="${top - 14}" font-size="12" fill="${VC.muted}" text-anchor="middle">${esc(isVirtual(t) ? whenAr(t) : new Date(t).toLocaleDateString('ar-SA-u-ca-gregory-nu-latn', { month: 'short', year: '2-digit', timeZone: 'UTC' }))}</text>`;
  }
  // صفوف متناوبة الخلفية
  rows.forEach((_, i) => { if (i % 2) g += `<rect x="0" y="${Y(i)}" width="${W}" height="${rowH}" fill="${VC.stripe}"/>`; });
  // اليوم
  if (today != null && today >= min && today <= max) {
    g += `<line x1="${X(today).toFixed(1)}" y1="${top - 6}" x2="${X(today).toFixed(1)}" y2="${H - 14}" stroke="${VC.gold}" stroke-width="1.5" stroke-dasharray="4 3"/><text x="${X(today).toFixed(1)}" y="${H - 2}" font-size="11" fill="${VC.gold}" text-anchor="middle">اليوم</text>`;
  }
  // العلاقات: من مرساة السابق إلى مرساة اللاحق، بزوايا قائمة وسهم
  const anchor = (a, side) => (side === 's' ? X(a.start) : X(a.end + DAY));
  let arrows = '';
  for (const a of acts) {
    for (const d of a.deps) {
      if (at[d.code] == null) continue;
      const p = acts[at[d.code]];
      const from = d.type === 'SS' || d.type === 'SF' ? 's' : 'e';
      const to = d.type === 'FF' || d.type === 'SF' ? 'e' : 's';
      const ax = anchor(p, from), ay = Y(at[p.code]) + rowH / 2, bx = anchor(a, to), by = Y(at[a.code]) + rowH / 2;
      const out = from === 's' ? 8 : -8, inn = to === 's' ? 8 : -8;
      const crit = an.nodes[a.code]?.critical && an.nodes[p.code]?.critical;
      const col = crit ? VC.crit : VC.muted;
      const path = `M${ax.toFixed(1)} ${ay.toFixed(1)} H${(ax + out).toFixed(1)} V${(by - (by > ay ? 6 : -6)).toFixed(1)} H${(bx + inn).toFixed(1)} V${by.toFixed(1)} H${(bx + (inn > 0 ? 2 : -2)).toFixed(1)}`;
      arrows += `<g><title>${esc(`${a.code}: ${depAr(d)}`)}</title><path d="${path}" fill="none" stroke="${col}" stroke-width="${crit ? 1.6 : 1.1}" marker-end="url(#ar-${crit ? 'c' : 'n'})" opacity=".85"/>`
        + (d.type !== 'FS' || d.lag ? `<text x="${(bx + inn * 2.2).toFixed(1)}" y="${(by - 7).toFixed(1)}" font-size="10" fill="${col}" text-anchor="middle" direction="ltr">${esc(`${d.type}${d.lag ? (d.lag > 0 ? `+${d.lag}` : d.lag) : ''}`)}</text>` : '') + '</g>';
    }
  }
  // الأشرطة والمعالم
  rows.forEach((r, i) => {
    const y = Y(i);
    if (r.kind === 'act') {
      const a = r.a, n = an.nodes[a.code];
      const x1 = X(a.end + DAY), x2 = X(a.start);
      const crit = !!n?.critical;
      // الفائض على المخطط من التاريخ المكتوب: آخر نهاية تسمح بها العلاقات ناقص النهاية المخططة
      const slack = n ? Math.max(0, n.lf - n.plannedEnd) : 0;
      const tip = [`${a.code} · ${a.name}`, `${whenAr(a.start)} إلى ${whenAr(a.end)} (${days(a.days)})`,
        ...a.deps.map(depAr), n ? (crit ? 'على المسار الحرج: أي تأخير فيه يؤخر المبادرة' : slack ? `يحتمل التأخير ${days(slack)} قبل أن يؤخر المبادرة` : 'لا فائض له بتواريخه المكتوبة') : ''].filter(Boolean).join('\n');
      g += `<text x="${W - pad}" y="${y + rowH / 2 + 4.5}" font-size="${compact ? 12 : 13}" fill="${VC.ink}" text-anchor="start" direction="rtl"><tspan font-weight="500" fill="${crit ? VC.crit : VC.gold}">${esc(a.code)}</tspan>  ${esc(cut(a.name, compact ? 26 : 34))}</text>`;
      g += `<g data-chapter="schedule" data-code="${esc(a.code)}" style="cursor:pointer"><title>${esc(tip)}</title>`
        + `<rect x="${x1.toFixed(1)}" y="${y + rowH * 0.22}" width="${Math.max(3, x2 - x1).toFixed(1)}" height="${rowH * 0.56}" rx="3" fill="${crit ? VC.crit : VC.ink}" opacity="${crit ? 1 : 0.72}"/>`
        + (n && !crit && slack > 0 ? `<line x1="${x1.toFixed(1)}" y1="${y + rowH / 2}" x2="${(x1 - (slack * DAY / span) * chart).toFixed(1)}" y2="${y + rowH / 2}" stroke="${VC.muted}" stroke-width="1.2" stroke-dasharray="2 3"/>` : '')
        + '</g>'
        + riskMark(m.risks?.[a.code], x1, y, rowH);
    } else {
      const x = X(r.x.at);
      const tip = [r.x.title, whenAr(r.x.at), r.x.decision && `القرار: ${r.x.decision}`, r.x.owner && `صاحب القرار: ${r.x.owner}`].filter(Boolean).join('\n');
      g += `<text x="${W - pad}" y="${y + rowH / 2 + 4.5}" font-size="${compact ? 12 : 13}" fill="${VC.slate}" text-anchor="start" direction="rtl"><tspan fill="${VC.ink}">◆</tspan>  ${esc(cut(r.x.title, compact ? 26 : 34))}</text>`
        + `<g data-chapter="milestone-register" style="cursor:pointer"><title>${esc(tip)}</title><rect x="${(x - 7).toFixed(1)}" y="${(y + rowH / 2 - 7).toFixed(1)}" width="14" height="14" transform="rotate(45 ${x.toFixed(1)} ${(y + rowH / 2).toFixed(1)})" fill="${VC.ink}" stroke="${VC.gold}" stroke-width="2"/></g>`;
    }
  });
  const defs = `<defs>${['n', 'c'].map((k) => `<marker id="ar-${k}" viewBox="0 0 8 8" refX="7" refY="4" markerWidth="7" markerHeight="7" orient="auto-start-reverse"><path d="M0 0 L8 4 L0 8 z" fill="${k === 'c' ? VC.crit : VC.muted}"/></marker>`).join('')}</defs>`;
  const svg = `<svg viewBox="0 0 ${W} ${H}" width="100%" role="img" aria-label="مخطط جانت: ${acts.length} نشاطًا و${ms.length} معلمًا" ${FONT} class="mi-viz">${defs}${g}${arrows}</svg>`;
  return { svg, missing, stats: ganttStats(m) };
}

// علامة المخاطر على الشريط: مثلث بلون أعلى درجة، وتلميحه يسرد المخاطر
function riskMark(list, x, y, rowH) {
  if (!list?.length) return '';
  const top = Math.max(...list.map((r) => r.score));
  const c = top >= RISK_HIGH ? VC.crit : top >= RISK_MID ? VC.gold : VC.muted;
  const cx = x - 10, cy = y + rowH / 2;
  return `<g data-chapter="raid" style="cursor:pointer"><title>${esc(list.map((r) => `${r.code} · ${r.title} (${r.score})${r.owner ? `، المالك: ${r.owner}` : ''}`).join('\n'))}</title>`
    + `<path d="M${cx} ${cy - 8} L${cx + 8} ${cy + 6} L${cx - 8} ${cy + 6} Z" fill="${c}" stroke="${VC.paper}" stroke-width="1"/><text x="${cx}" y="${cy + 4}" font-size="9" fill="${VC.paper}" text-anchor="middle">!</text></g>`;
}

/** أرقام المخطط للبطاقة والوثيقة: مدة المسار الحرج، والأنشطة الحرجة، والمخالفات */
export function ganttStats(m) {
  const an = m.analysis;
  return { activities: m.acts.length, critical: an.critical.length, path: an.critical, finish: an.finish, cycle: an.cycle, broken: m.broken.length, orphan: m.orphan.length };
}

export function ganttLegend() {
  const item = (sw, t) => `<span class="mi-lg">${sw}${esc(t)}</span>`;
  return `<div class="mi-legend">${item(`<i style="background:${VC.crit}"></i>`, 'على المسار الحرج')}${item(`<i style="background:${VC.ink}"></i>`, 'نشاط')}${item(`<i class="dash"></i>`, 'الفائض')}${item(`<i class="dm" style="background:${VC.ink};outline:1.5px solid ${VC.gold}"></i>`, 'معلم')}${item(`<i class="ln"></i>`, 'علاقة (FS ما لم يُكتب غيرها)')}${item(`<b style="color:${VC.crit}">▲</b>`, 'مخاطر على النشاط')}</div>`;
}

// ── مخطط الشبكة: الأنشطة عقدًا بالمسار الحرج ──
/**
 * @param {ReturnType<typeof scheduleModel>} m
 * @param {{ vertical?: boolean, width?: number }} [opts] vertical: المستويات صفوفًا من الأعلى (للوثيقة الطولية)
 */
export function networkSvg(m, { vertical = false, width = 1000 } = {}) {
  const an = m.analysis;
  const missing = [];
  if (an.cycle) missing.push(`احذف الحلقة بين ${an.cycle.join('، ')} ليُحسب المسار الحرج`);
  if (!an.order.length) { if (!an.cycle) missing.push('أضف أنشطة بتواريخها وعلاقاتها في الجدول الزمني'); return { svg: '', missing }; }
  if (!m.acts.some((a) => a.deps.length)) missing.push('اربط الأنشطة بعلاقاتها ليظهر التتابع');
  const N = an.nodes;
  const acts = Object.fromEntries(m.acts.map((a) => [a.code, a]));
  const level = {};
  for (const k of an.order) level[k] = Math.max(0, ...acts[k].deps.filter((d) => N[d.code]).map((d) => level[d.code] + 1));
  const L = Math.max(...Object.values(level)) + 1;
  const cols = Array.from({ length: L }, (_, i) => an.order.filter((k) => level[k] === i).sort((a, b) => N[a].es - N[b].es));
  const maxIn = Math.max(...cols.map((c) => c.length));
  const nw = 168, nh = 76, gx = vertical ? 26 : 58, gy = vertical ? 54 : 24;
  const Wc = vertical ? maxIn * (nw + gx) + gx : L * (nw + gx) + gx;
  const Hc = vertical ? L * (nh + gy) + gy : maxIn * (nh + gy) + gy;
  const W = Math.max(width, Wc);
  const pos = {};
  cols.forEach((c, li) => c.forEach((k, j) => {
    const off = vertical ? (W - (c.length * (nw + gx) - gx)) / 2 : (Hc - (c.length * (nh + gy) - gy)) / 2;
    pos[k] = vertical ? { x: W - off - (j + 1) * nw - j * gx, y: gy + li * (nh + gy) } : { x: W - gx - (li + 1) * nw - li * gx, y: off + j * (nh + gy) };
  }));
  let edges = '', nodes = '';
  for (const k of an.order) {
    for (const d of acts[k].deps) {
      if (!pos[d.code]) continue;
      const a = pos[d.code], b = pos[k];
      const crit = N[k].critical && N[d.code].critical;
      const col = crit ? VC.crit : VC.muted;
      const [x1, y1, x2, y2] = vertical ? [a.x + nw / 2, a.y + nh, b.x + nw / 2, b.y] : [a.x, a.y + nh / 2, b.x + nw, b.y + nh / 2];
      const path = vertical ? `M${x1} ${y1} C${x1} ${y1 + gy / 2} ${x2} ${y2 - gy / 2} ${x2} ${y2 - 3}` : `M${x1} ${y1} C${x1 - gx / 2} ${y1} ${x2 + gx / 2} ${y2} ${x2 + 3} ${y2}`;
      edges += `<g><title>${esc(`${k}: ${depAr(d)}`)}</title><path d="${path}" fill="none" stroke="${col}" stroke-width="${crit ? 1.8 : 1.1}" marker-end="url(#nar-${crit ? 'c' : 'n'})"/>`
        + (d.type !== 'FS' || d.lag ? `<text x="${(x1 + x2) / 2}" y="${(y1 + y2) / 2 - 4}" font-size="10" fill="${col}" text-anchor="middle" direction="ltr">${esc(`${d.type}${d.lag ? (d.lag > 0 ? `+${d.lag}` : d.lag) : ''}`)}</text>` : '') + '</g>';
    }
    const n = N[k], p = pos[k], crit = n.critical;
    const cell = (x, y, t, l) => `<text x="${x}" y="${y}" font-size="11" fill="${VC.slate}" text-anchor="middle"><tspan font-size="8.5" fill="${VC.muted}">${l} </tspan>${t}</text>`;
    const tip = [`${k} · ${n.name}`, `المدة ${days(n.dur)}`, `أبكر بداية: اليوم ${n.es + 1}، أبكر نهاية: اليوم ${n.ef}`, `آخر بداية: اليوم ${n.ls + 1}، آخر نهاية: اليوم ${n.lf}`, crit ? 'على المسار الحرج' : `الفائض ${days(n.float)}`].join('\n');
    nodes += `<g data-chapter="schedule" data-code="${esc(k)}" style="cursor:pointer"><title>${esc(tip)}</title>`
      + `<rect x="${p.x}" y="${p.y}" width="${nw}" height="${nh}" rx="6" fill="${crit ? VC.critSoft : VC.paper}" stroke="${crit ? VC.crit : VC.line}" stroke-width="${crit ? 1.6 : 1}"/>`
      + `<text x="${p.x + nw - 10}" y="${p.y + 19}" font-size="12.5" fill="${VC.ink}" text-anchor="start" direction="rtl"><tspan font-weight="500" fill="${crit ? VC.crit : VC.gold}">${esc(k)}</tspan> ${esc(cut(n.name, 16))}</text>`
      + `<line x1="${p.x + 8}" y1="${p.y + 28}" x2="${p.x + nw - 8}" y2="${p.y + 28}" stroke="${VC.faint}"/>`
      + cell(p.x + nw - 30, p.y + 46, n.es + 1, 'ب') + cell(p.x + nw / 2, p.y + 46, n.dur, 'م') + cell(p.x + 30, p.y + 46, n.ef, 'ن')
      + cell(p.x + nw - 30, p.y + 66, n.ls + 1, 'ب') + cell(p.x + nw / 2, p.y + 66, crit ? '0' : n.float, 'ف') + cell(p.x + 30, p.y + 66, n.lf, 'ن')
      + '</g>';
  }
  const H = Hc;
  const defs = `<defs>${['n', 'c'].map((k) => `<marker id="nar-${k}" viewBox="0 0 8 8" refX="7" refY="4" markerWidth="7" markerHeight="7" orient="auto"><path d="M0 0 L8 4 L0 8 z" fill="${k === 'c' ? VC.crit : VC.muted}"/></marker>`).join('')}</defs>`;
  return { svg: `<svg viewBox="0 0 ${W} ${H}" width="100%" role="img" aria-label="مخطط الشبكة: ${an.order.length} نشاطًا، و${an.critical.length} على المسار الحرج" ${FONT} class="mi-viz">${defs}${edges}${nodes}</svg>`, missing, stats: ganttStats(m) };
}

export function networkLegend() {
  return `<div class="mi-legend"><span class="mi-lg">في كل عقدة صفان: الأعلى أبكر بداية (ب) والمدة (م) وأبكر نهاية (ن)، والأسفل آخر بداية وآخر نهاية والفائض (ف)، بأيام المبادرة من يومها الأول.</span><span class="mi-lg"><i style="background:${VC.crit}"></i>المسار الحرج: فائضه صفر</span></div>`;
}

/** معاينة الجدول وهو يُكتب في فصله: من أعمدة الجدول وصفوفه مباشرة */
export function ganttFromTable(columns, rows) {
  const acts = activitiesOf(columns, rows);
  return ganttSvg({ acts, analysis: cpm(acts), broken: [], orphan: [], milestones: [] }, { compact: true });
}

// ════════════════════════════════════════════════════════════════
// المرحلة ل2: شجرة تجزئة العمل، وخارطة المعالم، ومنحنى الإنفاق، والتكلفة بالحزمة، والمخاطر
// ════════════════════════════════════════════════════════════════
const normAr = (t) => String(t || '').replace(/\(.*?\)/g, '').replace(/[ًٌٍَُِّْـ]/g, '').replace(/[أإآ]/g, 'ا').replace(/ة/g, 'ه').replace(/\s+/g, ' ').trim();
const num = (v) => { const n = parseFloat(String(v ?? '').replace(/[٠-٩]/g, (d) => '٠١٢٣٤٥٦٧٨٩'.indexOf(d)).replace(/[^\d.-]/g, '')); return Number.isFinite(n) ? n : null; };
const money = (n) => `${Math.round(n).toLocaleString('en-US')}`;
const rowsOf = (f) => (f?.value || []).filter((r) => Array.isArray(r) && r.some((x) => String(x ?? '').trim()));
const ci = (f, ...w) => (f?.columns || []).findIndex((c) => w.some((x) => String(c).includes(x)));

/** حزم التجزئة: { code, name, owner, days, depth, parent, cost (مجمّعة من الأبناء), acts (رموز الأنشطة المرتبطة) } */
export function packagesOf(doc, m = scheduleModel(doc)) {
  const f = fieldOf(doc, 'wbs', 'packages');
  const c = Math.max(0, ci(f, 'الرمز')), n = ci(f, 'حزمة') >= 0 ? ci(f, 'حزمة') : 1, o = ci(f, 'المالك'), d = ci(f, 'المدة');
  const by = doc?.cost?.by || {};
  const list = rowsOf(f).map((r) => ({ code: String(r[c] ?? '').trim().toUpperCase(), name: String(r[n] ?? '').trim(), owner: o >= 0 ? String(r[o] ?? '').trim() : '', days: d >= 0 ? num(r[d]) : null }))
    .filter((p) => p.code || p.name).sort((a, b) => a.code.localeCompare(b.code, 'en', { numeric: true }));
  for (const p of list) {
    p.depth = p.code ? p.code.split('.').filter(Boolean).length : 1;
    p.parent = p.depth > 1 ? p.code.split('.').slice(0, -1).join('.') : null;
    const under = (k) => k === p.code || k.startsWith(`${p.code}.`);
    p.cost = Object.entries(by).filter(([k]) => under(k)).reduce((a, [, v]) => a + v, 0);
    // النشاط المرتبط: رمزه أو اسمه، أو رمز في أول اسمه («1.1 تحليل…»)
    p.ownActs = m.acts.filter((a) => a.code === p.code || normAr(a.name) === normAr(p.name) || normAr(a.name).split(' ')[0] === p.code || (p.name && normAr(a.name).includes(normAr(p.name)))).map((a) => a.code);
  }
  for (const p of list) p.acts = [...new Set(list.filter((q) => q.code === p.code || q.code.startsWith(`${p.code}.`)).flatMap((q) => q.ownActs))];
  return list;
}

/** شجرة تجزئة العمل: الجذر المبادرة، والحزم الأولى أعمدة، وما تحتها مكدّس، ولكل حزمة مالكها وتكلفتها المجمّعة */
export function wbsChartSvg(doc, { width = 1000 } = {}) {
  const pk = packagesOf(doc);
  if (!pk.length) return { svg: '', missing: ['أضف حزم العمل برموزها (1، 1.1، 1.2) في هيكل تجزئة العمل'] };
  const missing = [];
  if (!pk.some((p) => p.depth > 1)) missing.push('رمّز الحزم الفرعية تحت الأولى (1.1، 1.2) لتظهر الشجرة بمستوياتها');
  if (doc?.cost && !pk.some((p) => p.cost)) missing.push('اربط بنود التكلفة برموز الحزم في «الموارد والتكلفة» لتظهر تكلفة كل حزمة');
  const tops = pk.filter((p) => p.depth === 1);
  const W = width, gap = 12, colW = (W - gap * (tops.length + 1)) / Math.max(1, tops.length), bh = 62, rootH = 54;
  let y0 = 18, g = '';
  const total = doc?.cost?.total || 0;
  const box = (x, y, w, h, p, lvl) => {
    const fill = lvl === 0 ? VC.ink : lvl === 1 ? VC.cream : VC.paper;
    const tc = lvl === 0 ? VC.paper : VC.ink;
    const tip = [p.code ? `${p.code} · ${p.name}` : p.name, p.owner && `المالك: ${p.owner}`, p.days && `المدة: ${days(p.days)}`, p.cost ? `التكلفة: ${money(p.cost)} ريال` : '', p.acts?.length ? `في الجدول: ${p.acts.join('، ')}` : ''].filter(Boolean).join('\n');
    return `<g data-chapter="wbs"${p.code ? ` data-code="${esc(p.code)}"` : ''} style="cursor:pointer"><title>${esc(tip)}</title><rect x="${x}" y="${y}" width="${w}" height="${h}" rx="6" fill="${fill}" stroke="${lvl === 1 ? VC.gold : VC.line}"/>`
      + `<text x="${x + w - 8}" y="${y + 20}" font-size="${lvl === 0 ? 14 : 12}" fill="${tc}" text-anchor="start" direction="rtl">${p.code ? `<tspan fill="${lvl === 0 ? VC.goldSoft : VC.gold}" font-weight="500">${esc(p.code)}</tspan> ` : ''}${esc(cut(p.name, Math.floor(w / 7.5)))}</text>`
      + `<text x="${x + w - 8}" y="${y + 40}" font-size="10.5" fill="${lvl === 0 ? VC.goldSoft : VC.muted}" text-anchor="start" direction="rtl">${esc(cut([p.owner, p.days ? days(p.days) : ''].filter(Boolean).join(' · '), Math.floor(w / 6.5)))}</text>`
      + (p.cost ? `<text x="${x + 8}" y="${y + h - 9}" font-size="10.5" fill="${lvl === 0 ? VC.paper : VC.slate}" text-anchor="start" direction="ltr">${money(p.cost)}</text>` : '') + '</g>';
  };
  g += box((W - 320) / 2, y0, 320, rootH, { name: doc?.meta?.initiative || 'المبادرة', owner: '', cost: total }, 0);
  const yTop = y0 + rootH + 34;
  let H = yTop;
  g += `<line x1="${W / 2}" y1="${y0 + rootH}" x2="${W / 2}" y2="${yTop - 16}" stroke="${VC.line}" stroke-width="1.2"/>`;
  if (tops.length > 1) {
    const cx = (i) => W - gap - i * (colW + gap) - colW / 2;
    g += `<line x1="${cx(tops.length - 1)}" y1="${yTop - 16}" x2="${cx(0)}" y2="${yTop - 16}" stroke="${VC.line}" stroke-width="1.2"/>`;
  }
  tops.forEach((t, i) => {
    const x = W - gap - (i + 1) * colW - i * gap;
    g += `<line x1="${x + colW / 2}" y1="${yTop - 16}" x2="${x + colW / 2}" y2="${yTop}" stroke="${VC.line}" stroke-width="1.2"/>`;
    g += box(x, yTop, colW, bh, t, 1);
    let y = yTop + bh + 10;
    for (const c of pk.filter((p) => p.code.startsWith(`${t.code}.`))) {
      const ind = (c.depth - 2) * 12;
      g += `<path d="M${x + colW - 6} ${y - 10} V${y + bh / 2} H${x + colW - ind}" fill="none" stroke="${VC.line}"/>`;
      g += box(x + 6, y, colW - 12 - ind, bh - 6, c, 2);
      y += bh + 4;
    }
    H = Math.max(H, y);
  });
  return { svg: `<svg viewBox="0 0 ${W} ${H + 10}" width="100%" role="img" aria-label="شجرة تجزئة العمل: ${pk.length} حزمة" ${FONT} class="mi-viz">${g}</svg>`, missing };
}

/** خارطة المعالم: خط زمني تتناوب المعالم فوقه وتحته، بنوعها وقرارها */
export function roadmapSvg(m, { width = 1000 } = {}) {
  const ms = [...(m.milestones || [])].sort((a, b) => a.at - b.at);
  if (!ms.length) return { svg: '', missing: ['اكتب تاريخًا مستهدفًا لكل معلم في سجل المعالم'] };
  const W = width, pad = 70, H = 300, mid = 150;
  const min = ms[0].at, max = ms[ms.length - 1].at, span = Math.max(DAY, max - min);
  const X = (t) => W - pad - ((t - min) / span) * (W - pad * 2);
  const TYPE = (t) => (/قيم/.test(t) ? VC.gold : /حوكم/.test(t) ? VC.ink : /تعاقد/.test(t) ? BRAND.clay : VC.muted);
  let g = `<line x1="${pad - 30}" y1="${mid}" x2="${W - pad + 30}" y2="${mid}" stroke="${VC.ink}" stroke-width="2"/>`;
  ms.forEach((x, i) => {
    const px = X(x.at), up = i % 2 === 0, ty = up ? mid - 110 : mid + 40;
    const tip = [x.title, whenAr(x.at), x.type && `النوع: ${x.type}`, x.decision && `القرار: ${x.decision}`, x.owner && `صاحب القرار: ${x.owner}`,
      x.status_title && `الحالة: ${x.status_title}${x.actual ? `، تحقق في ${x.actual}` : ''}`].filter(Boolean).join('\n');
    const ring = x.status === 'done' ? BRAND.graphite : x.status === 'late' || x.status === 'at_risk' ? VC.crit : null;
    g += `<g data-chapter="milestone-register" style="cursor:pointer"><title>${esc(tip)}</title>`
      + (ring ? `<circle cx="${px}" cy="${mid}" r="15" fill="none" stroke="${ring}" stroke-width="2"/>${x.status === 'done' ? `<text x="${px + 18}" y="${mid - 12}" font-size="12" fill="${ring}">✓</text>` : ''}` : '')
      + `<line x1="${px}" y1="${mid}" x2="${px}" y2="${up ? mid - 44 : mid + 40}" stroke="${VC.line}" stroke-width="1.2"/>`
      + `<rect x="${px - 8}" y="${mid - 8}" width="16" height="16" transform="rotate(45 ${px} ${mid})" fill="${TYPE(x.type)}" stroke="${VC.paper}" stroke-width="2"/>`
      + `<text x="${px}" y="${up ? mid - 92 : ty + 12}" font-size="12" fill="${VC.ink}" text-anchor="middle" font-weight="500">${esc(cut(x.title, 22))}</text>`
      + `<text x="${px}" y="${up ? mid - 74 : ty + 30}" font-size="10.5" fill="${VC.muted}" text-anchor="middle">${esc(whenAr(x.at))}</text>`
      + (x.decision ? `<text x="${px}" y="${up ? mid - 58 : ty + 46}" font-size="10" fill="${VC.slate}" text-anchor="middle">${esc(cut(`القرار: ${x.decision}`, 26))}</text>` : '')
      + '</g>';
  });
  return { svg: `<svg viewBox="0 0 ${W} ${H}" width="100%" role="img" aria-label="خارطة المعالم: ${ms.length} معلمًا" ${FONT} class="mi-viz">${g}</svg>`, missing: [] };
}
export function roadmapLegend() {
  const it = (c, t) => `<span class="mi-lg"><i class="dm" style="background:${c}"></i>${t}</span>`;
  return `<div class="mi-legend">${it(VC.gold, 'معلم قيمة')}${it(VC.ink, 'حوكمي')}${it(BRAND.clay, 'تعاقدي')}${it(VC.muted, 'تقني أو غيره')}</div>`;
}

/** منحنى الإنفاق التراكمي المخطط: تكلفة كل حزمة موزعة على أيام أنشطتها، مقابل الموازنة والتكلفة مع الاحتياطي */
export function sCurveSvg(doc, { width = 1000 } = {}) {
  const cost = doc?.cost;
  const m = scheduleModel(doc);
  const acts = m.acts.filter((a) => a.days != null);
  const missing = [];
  if (!cost?.total) return { svg: '', missing: ['اكتب بنود التكلفة بكمياتها وأسعارها في «الموارد والتكلفة»'] };
  if (!acts.length) return { svg: '', missing: ['اكتب تواريخ الأنشطة في الجدول الزمني ليتوزع الإنفاق على الزمن'] };
  const pk = packagesOf(doc, m);
  const daily = new Map();
  const put = (from, to, amount) => { const n = Math.round((to - from) / DAY) + 1; for (let i = 0; i < n; i++) { const t = from + i * DAY; daily.set(t, (daily.get(t) || 0) + amount / n); } };
  const min = Math.min(...acts.map((a) => a.start)), max = Math.max(...acts.map((a) => a.end));
  let unplaced = 0;
  for (const [code, amount] of Object.entries(cost.by || {})) {
    // البند يتبع أدق حزمة لها أنشطة: الحزمة نفسها، ثم أبوها
    let p = pk.find((x) => x.code === code);
    while (p && !p.acts.length && p.parent) p = pk.find((x) => x.code === p.parent);
    const linked = p ? acts.filter((a) => p.acts.includes(a.code)) : [];
    if (!linked.length) { unplaced += amount; put(min, max, amount); continue; }
    const span = linked.reduce((s, a) => s + a.days, 0);
    for (const a of linked) put(a.start, a.end, amount * (a.days / span));
  }
  if (unplaced) missing.push(`${money(unplaced)} ريال لم ترتبط حزمها بأنشطة في الجدول، فوُزّعت على المدة كلها`);
  const W = width, H = 300, padL = 70, padR = 20, padT = 20, padB = 34;
  const top = Math.max(cost.withContingency || 0, cost.envelope || 0, cost.total) * 1.08;
  const X = (t) => W - padR - ((t - min) / Math.max(DAY, max - min)) * (W - padL - padR);
  const Y = (v) => H - padB - (v / top) * (H - padT - padB);
  const days2 = [...daily.keys()].sort((a, b) => a - b);
  let cum = 0;
  const pts = days2.map((t) => { cum += daily.get(t); return [X(t), Y(cum)]; });
  let g = '';
  for (let i = 0; i <= 4; i++) { const v = (top / 4) * i; g += `<line x1="${padL - 8}" y1="${Y(v)}" x2="${W - padR}" y2="${Y(v)}" stroke="${VC.faint}"/><text x="${padL - 12}" y="${Y(v) + 4}" font-size="10" fill="${VC.muted}" text-anchor="end" direction="ltr">${money(v)}</text>`; }
  const d0 = new Date(min);
  for (let t = Date.UTC(d0.getUTCFullYear(), d0.getUTCMonth() + 1, 1); t <= max; ) { g += `<text x="${X(t)}" y="${H - 12}" font-size="10.5" fill="${VC.muted}" text-anchor="middle">${esc(new Date(t).toLocaleDateString('ar-SA-u-ca-gregory-nu-latn', { month: 'short', timeZone: 'UTC' }))}</text>`; const d = new Date(t); t = Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 1); }
  const hline = (v, c, t, dash) => (v ? `<line x1="${padL}" y1="${Y(v)}" x2="${W - padR}" y2="${Y(v)}" stroke="${c}" stroke-width="1.3"${dash ? ' stroke-dasharray="5 4"' : ''}/><text x="${W - padR - 4}" y="${Y(v) - 5}" font-size="10.5" fill="${c}" text-anchor="start" direction="rtl">${esc(t)}</text>` : '');
  g += hline(cost.envelope, VC.ink, `الموازنة المتاحة ${money(cost.envelope || 0)}`, true) + hline(cost.withContingency, VC.gold, `مع الاحتياطي ${money(cost.withContingency)}`, true);
  g += `<path d="M${X(min)} ${Y(0)} ${pts.map(([x, y]) => `L${x.toFixed(1)} ${y.toFixed(1)}`).join(' ')}" fill="none" stroke="${VC.ink}" stroke-width="2.4"/>`;
  g += `<path d="M${X(min)} ${Y(0)} ${pts.map(([x, y]) => `L${x.toFixed(1)} ${y.toFixed(1)}`).join(' ')} L${X(max)} ${Y(0)} Z" fill="${VC.cream}" opacity=".6"/>`;
  g += `<g data-chapter="cost-plan"><title>${esc(`التكلفة التقديرية ${money(cost.total)} ريال، تتراكم بحسب أنشطة الجدول`)}</title><circle cx="${pts.at(-1)[0]}" cy="${pts.at(-1)[1]}" r="4" fill="${VC.ink}"/></g>`;
  return { svg: `<svg viewBox="0 0 ${W} ${H}" width="100%" role="img" aria-label="منحنى الإنفاق التراكمي المخطط" ${FONT} class="mi-viz">${g}</svg>`, missing };
}

/** التكلفة بالحزمة الأولى: أعمدة أفقية بالقيمة والنسبة */
export function costBarsSvg(doc, { width = 1000 } = {}) {
  const pk = packagesOf(doc).filter((p) => p.depth === 1 && p.cost);
  const total = doc?.cost?.total || 0;
  if (!pk.length || !total) return { svg: '', missing: ['اربط بنود التكلفة برموز الحزم ليظهر توزيعها'] };
  const W = width, rowH = 34, label = 260, H = pk.length * rowH + 16, maxV = Math.max(...pk.map((p) => p.cost));
  let g = '';
  pk.forEach((p, i) => {
    const y = 8 + i * rowH, w = ((W - label - 140) * p.cost) / maxV;
    g += `<g data-chapter="cost-plan"><title>${esc(`${p.code} · ${p.name}: ${money(p.cost)} ريال`)}</title>`
      + `<text x="${W - 4}" y="${y + 20}" font-size="12.5" fill="${VC.ink}" text-anchor="start" direction="rtl"><tspan fill="${VC.gold}" font-weight="500">${esc(p.code)}</tspan> ${esc(cut(p.name, 26))}</text>`
      + `<rect x="${W - label - w}" y="${y + 8}" width="${w}" height="16" rx="3" fill="${VC.ink}" opacity=".85"/>`
      + `<text x="${W - label - w - 8}" y="${y + 21}" font-size="11.5" fill="${VC.slate}" text-anchor="end" direction="ltr">${money(p.cost)} · ${Math.round((p.cost / total) * 100)}%</text></g>`;
  });
  return { svg: `<svg viewBox="0 0 ${W} ${H}" width="100%" role="img" aria-label="التكلفة بالحزمة" ${FONT} class="mi-viz">${g}</svg>`, missing: [] };
}

/** المخاطر: صفوفها مقروءة من سجلها، بدرجتها وحزمتها */
export function risksOf(doc) {
  const f = fieldOf(doc, 'raid', 'items');
  const c = Math.max(0, ci(f, 'الرمز')), t = ci(f, 'النوع'), d = ci(f, 'الوصف'), p = ci(f, 'الاحتمال'), i = ci(f, 'الأثر'), o = ci(f, 'المالك'), r = ci(f, 'الاستجابة'), l = ci(f, 'مرتبط');
  return rowsOf(f).map((x) => ({ code: String(x[c] ?? '').trim(), type: String(x[t] ?? '').trim(), title: String(x[d] ?? '').trim(), p: Math.round(num(x[p]) || 0), i: Math.round(num(x[i]) || 0), owner: String(x[o] ?? '').trim(), response: String(x[r] ?? '').trim(), link: String(x[l] ?? '').trim().toUpperCase() }))
    .map((x) => ({ ...x, score: x.p * x.i }));
}

/** خريطة المخاطر برموزها: الاحتمال × الأثر، ولون الخانة بحدي RISK_HIGH وRISK_MID */
export function riskMatrixSvg(doc, { high = RISK_HIGH, mid = RISK_MID, width = 520 } = {}) {
  const rs = risksOf(doc).filter((x) => x.p >= 1 && x.p <= 5 && x.i >= 1 && x.i <= 5);
  if (!rs.length) return { svg: '', missing: ['اكتب الاحتمال والأثر (1 إلى 5) لكل بند في سجل المخاطر'] };
  const W = width, ax = 46, cell = (W - ax - 10) / 5, H = cell * 5 + ax + 10;
  let g = '';
  for (let a = 5; a >= 1; a--) {
    for (let b = 1; b <= 5; b++) {
      const x = W - 10 - b * cell, y = (5 - a) * cell + 6, s = a * b;
      const fill = s >= high ? VC.goldSoft : s >= mid ? VC.cream : VC.faint;
      const here = rs.filter((r) => r.p === a && r.i === b);
      g += `<rect x="${x}" y="${y}" width="${cell - 3}" height="${cell - 3}" rx="4" fill="${fill}"/>`;
      here.forEach((r, k) => {
        const cx = x + cell / 2 + ((k % 3) - 1) * 30, cy = y + cell / 2 + (Math.floor(k / 3) - (here.length > 3 ? 0.5 : 0)) * 26;
        g += `<g data-chapter="raid"><title>${esc([`${r.code} · ${r.title}`, `الاحتمال ${r.p} × الأثر ${r.i} = ${r.score}`, r.owner && `المالك: ${r.owner}`, r.response && `الاستجابة: ${r.response}`, r.link && `الحزمة: ${r.link}`].filter(Boolean).join('\n'))}</title>`
          + `<circle cx="${cx}" cy="${cy}" r="12.5" fill="${r.score >= high ? VC.crit : VC.ink}"/><text x="${cx}" y="${cy + 4}" font-size="10" fill="${VC.paper}" text-anchor="middle" direction="ltr">${esc(r.code || '·')}</text></g>`;
      });
    }
    g += `<text x="${W - 10 - 5 * cell - 12}" y="${(5 - a) * cell + 6 + cell / 2 + 4}" font-size="12" fill="${VC.muted}" text-anchor="middle">${a}</text>`;
  }
  for (let b = 1; b <= 5; b++) g += `<text x="${W - 10 - b * cell + cell / 2}" y="${5 * cell + 26}" font-size="12" fill="${VC.muted}" text-anchor="middle">${b}</text>`;
  g += `<text x="${W - 10 - 2.5 * cell}" y="${5 * cell + 44}" font-size="11" fill="${VC.muted}" text-anchor="middle">الأثر ←</text>`;
  return { svg: `<svg viewBox="0 0 ${W} ${H}" width="100%" role="img" aria-label="خريطة المخاطر: ${rs.length} بندًا" ${FONT} class="mi-viz mi-narrow" style="max-width:${W}px">${g}</svg>`, missing: [] };
}
export function riskLegend(high = RISK_HIGH) {
  return `<div class="mi-legend"><span class="mi-lg"><i style="background:${VC.goldSoft}"></i>عالٍ (${high} فأكثر)</span><span class="mi-lg"><i style="background:${VC.cream}"></i>متوسط</span><span class="mi-lg"><i style="background:${VC.faint}"></i>منخفض</span><span class="mi-lg">الرأسي الاحتمال، والأفقي الأثر</span></div>`;
}

// ════════════════════════════════════════════════════════════════
// المرحلة ل3: أصحاب المصلحة، وسلسلة التغيير، والمنافع (والفعلي بعد الاعتماد)، ومصفوفة المسؤوليات
// ════════════════════════════════════════════════════════════════
const HIGH = /عال|مرتفع|كبير|high/i;

/** شبكة أصحاب المصلحة: النفوذ × الاهتمام بأربع خانات، ولكل خانة استراتيجيتها */
export function stakeholderGridSvg(doc, { width = 760 } = {}) {
  const f = fieldOf(doc, 'stakeholder-map', 'stakeholders');
  const n = Math.max(0, ci(f, 'صاحب')), pw = ci(f, 'النفوذ'), it = ci(f, 'الاهتمام'), st = ci(f, 'الاستراتيجية');
  const people = rowsOf(f).map((r) => ({ name: String(r[n] ?? '').trim(), power: HIGH.test(String(r[pw] ?? '')), interest: HIGH.test(String(r[it] ?? '')), strategy: String(r[st] ?? '').trim(), raw: [r[pw], r[it]] }))
    .filter((x) => x.name && String(x.raw[0] ?? '').trim() && String(x.raw[1] ?? '').trim());
  if (!people.length) return { svg: '', missing: ['اكتب النفوذ والاهتمام (عالٍ أو منخفض) لكل صاحب مصلحة في خريطته'] };
  const W = width, pad = 30, cw = (W - pad - 10) / 2, chh = 170, H = chh * 2 + pad + 16;
  const Q = [
    { p: true, i: true, t: 'إدارة عن قرب', h: 'أشركه في القرار وأطلعه دوريًا', fill: VC.goldSoft },
    { p: true, i: false, t: 'أبقه راضيًا', h: 'لا تثقل عليه، وأطلعه بما يهمه', fill: VC.cream },
    { p: false, i: true, t: 'أبقه مطّلعًا', h: 'تواصل منتظم، واستمع لملاحظاته', fill: VC.cream },
    { p: false, i: false, t: 'راقب', h: 'جهد قليل، وتابع تغيره', fill: VC.faint },
  ];
  let g = '';
  for (const q of Q) {
    const x = q.i ? W - 10 - cw : W - 10 - 2 * cw, y = q.p ? 6 : 6 + chh;
    g += `<rect x="${x}" y="${y}" width="${cw - 4}" height="${chh - 4}" rx="8" fill="${q.fill}"/>`
      + `<text x="${x + cw - 14}" y="${y + 22}" font-size="13" font-weight="500" fill="${VC.ink}" text-anchor="start" direction="rtl">${esc(q.t)}</text>`
      + `<text x="${x + cw - 14}" y="${y + 40}" font-size="10.5" fill="${VC.muted}" text-anchor="start" direction="rtl">${esc(q.h)}</text>`;
    people.filter((x2) => x2.power === q.p && x2.interest === q.i).slice(0, 8).forEach((s, k) => {
      const px = x + cw - 18 - (k % 2) * (cw / 2 - 4), py = y + 66 + Math.floor(k / 2) * 26;
      g += `<g data-chapter="stakeholder-map"><title>${esc([s.name, s.strategy && `الاستراتيجية: ${s.strategy}`].filter(Boolean).join('\n'))}</title><circle cx="${px - 4}" cy="${py - 4}" r="4" fill="${VC.ink}"/><text x="${px - 14}" y="${py}" font-size="11.5" fill="${VC.ink}" text-anchor="start" direction="rtl">${esc(cut(s.name, 20))}</text></g>`;
    });
  }
  g += `<text x="${W - 10 - cw}" y="${H - 2}" font-size="11" fill="${VC.muted}" text-anchor="middle">الاهتمام عالٍ</text><text x="${W - 10 - 2 * cw + cw / 2}" y="${H - 2}" font-size="11" fill="${VC.muted}" text-anchor="middle">الاهتمام منخفض</text>`
    + `<text x="12" y="${6 + chh / 2}" font-size="11" fill="${VC.muted}" text-anchor="middle" transform="rotate(-90 12 ${6 + chh / 2})">نفوذ عالٍ</text><text x="12" y="${6 + chh * 1.5}" font-size="11" fill="${VC.muted}" text-anchor="middle" transform="rotate(-90 12 ${6 + chh * 1.5})">نفوذ منخفض</text>`;
  return { svg: `<svg viewBox="0 0 ${W} ${H}" width="100%" role="img" aria-label="شبكة أصحاب المصلحة: ${people.length}" ${FONT} class="mi-viz mi-narrow" style="max-width:${W}px">${g}</svg>`, missing: [] };
}

/** سلسلة نظرية التغيير: أنشطة ← مخرجات ← نتائج ← أثر، والافتراض على كل سهم */
export function changeChainSvg(doc, { width = 1000 } = {}) {
  const f = fieldOf(doc, 'theory-of-change', 'chain');
  const l = Math.max(0, ci(f, 'المستوى')), d = ci(f, 'الوصف'), a = ci(f, 'الافتراض');
  const rows = rowsOf(f).map((r) => ({ level: String(r[l] ?? '').trim(), text: String(r[d] ?? '').trim(), assume: String(r[a] ?? '').trim() })).filter((x) => x.level || x.text);
  const impact = String(fieldOf(doc, 'theory-of-change', 'impact')?.value || '').trim();
  if (!rows.length) return { svg: '', missing: ['املأ سلسلة نظرية التغيير: الأنشطة ثم المخرجات ثم النتائج ثم الأثر'] };
  const W = width, n = rows.length, gap = 46, bw = (W - gap * (n - 1) - 20) / n, bh = 150, H = bh + 110;
  let g = `<defs><marker id="tc-ar" viewBox="0 0 8 8" refX="7" refY="4" markerWidth="8" markerHeight="8" orient="auto"><path d="M0 0 L8 4 L0 8 z" fill="${VC.gold}"/></marker></defs>`;
  const lines = (t, max, per) => { const w = String(t).split(/\s+/); const out = ['']; for (const x of w) { if ((out.at(-1) + ' ' + x).trim().length > per) out.push(x); else out[out.length - 1] = `${out.at(-1)} ${x}`.trim(); } return out.slice(0, max).map((s, i, arr) => (i === max - 1 && out.length > max ? `${s}…` : s)); };
  rows.forEach((r, i) => {
    const x = W - 10 - (i + 1) * bw - i * gap, y = 10, last = i === n - 1;
    g += `<g data-chapter="theory-of-change"><title>${esc([r.level, r.text, r.assume && `الافتراض: ${r.assume}`].filter(Boolean).join('\n'))}</title>`
      + `<rect x="${x}" y="${y}" width="${bw}" height="${bh}" rx="10" fill="${last ? VC.ink : VC.cream}" stroke="${last ? VC.ink : VC.gold}"/>`
      + `<text x="${x + bw - 12}" y="${y + 24}" font-size="13.5" font-weight="500" fill="${last ? VC.goldSoft : VC.gold}" text-anchor="start" direction="rtl">${esc(r.level)}</text>`
      + lines(r.text, 5, Math.floor(bw / 8)).map((t, k) => `<text x="${x + bw - 12}" y="${y + 50 + k * 19}" font-size="11.5" fill="${last ? VC.paper : VC.ink}" text-anchor="start" direction="rtl">${esc(t)}</text>`).join('') + '</g>';
    if (!last) {
      const ax = x - 4, bx = x - gap + 6, ay = y + bh / 2;
      g += `<line x1="${ax}" y1="${ay}" x2="${bx}" y2="${ay}" stroke="${VC.gold}" stroke-width="2" marker-end="url(#tc-ar)"/>`;
      if (r.assume) g += `<g><title>${esc(`الافتراض: ${r.assume}`)}</title>${lines(r.assume, 3, Math.floor((bw + gap) / 8)).map((t, k) => `<text x="${x + bw / 2 - gap / 2}" y="${y + bh + 22 + k * 16}" font-size="10" fill="${VC.muted}" text-anchor="middle">${k === 0 ? 'إذا ' : ''}${esc(t)}</text>`).join('')}</g>`;
    }
  });
  if (impact) g += `<text x="${W - 10}" y="${H - 6}" font-size="11.5" fill="${VC.slate}" text-anchor="start" direction="rtl"><tspan fill="${VC.gold}">الأثر المنشود: </tspan>${esc(cut(impact, 120))}</text>`;
  return { svg: `<svg viewBox="0 0 ${W} ${H}" width="100%" role="img" aria-label="سلسلة نظرية التغيير: ${n} حلقات" ${FONT} class="mi-viz">${g}</svg>`, missing: [] };
}

/** المنافع: لكل منفعة خط الأساس ← المستهدف، والفعلي من المتابعة بعد الاعتماد */
export function benefitsSvg(doc, { width = 1000 } = {}) {
  const f = fieldOf(doc, 'benefits-register', 'benefits');
  const b = ci(f, 'خط الأساس'), t = ci(f, 'المستهدف'), o = ci(f, 'المالك'), dt = ci(f, 'تاريخ');
  const actual = Object.fromEntries((doc?.tracking?.state?.benefits || []).map((x) => [normAr(x.title), x]));
  const list = rowsOf(f).map((r) => ({ title: String(r[0] ?? '').trim(), base: num(r[b]), target: num(r[t]), owner: String(r[o] ?? '').trim(), due: String(r[dt] ?? '').trim() }))
    .filter((x) => x.title && x.base != null && x.target != null && x.base !== x.target);
  if (!list.length) return { svg: '', missing: ['اكتب خط الأساس والمستهدف رقمين لكل منفعة في سجل المنافع'] };
  const W = width, rowH = 58, label = 300, H = list.length * rowH + 12, x0 = 40, x1 = W - label - 20;
  let g = '';
  list.forEach((x, i) => {
    const y = 8 + i * rowH, lo = Math.min(x.base, x.target), hi = Math.max(x.base, x.target), pad = (hi - lo) * 0.15 || 1;
    const S = (v) => x1 - ((v - (lo - pad)) / (hi - lo + 2 * pad)) * (x1 - x0);
    const a = actual[normAr(x.title)];
    const av = a ? num(a.value) : null;
    g += `<g data-chapter="benefits-register"><title>${esc([x.title, `خط الأساس ${x.base} ← المستهدف ${x.target}`, av != null ? `الفعلي ${av}${a.realization != null ? ` (تحقق ${Math.round(a.realization * 100)}%)` : ''}` : '', x.owner && `المالك: ${x.owner}`, x.due && `تاريخ التحقق: ${x.due}`].filter(Boolean).join('\n'))}</title>`
      + `<text x="${W - 4}" y="${y + 20}" font-size="12.5" fill="${VC.ink}" text-anchor="start" direction="rtl">${esc(cut(x.title, 34))}</text>`
      + `<text x="${W - 4}" y="${y + 38}" font-size="10.5" fill="${VC.muted}" text-anchor="start" direction="rtl">${esc(cut([x.owner, x.due].filter(Boolean).join(' · '), 40))}</text>`
      + `<line x1="${x0}" y1="${y + 24}" x2="${x1}" y2="${y + 24}" stroke="${VC.faint}" stroke-width="6" stroke-linecap="round"/>`
      + `<line x1="${S(x.base)}" y1="${y + 24}" x2="${S(x.target)}" y2="${y + 24}" stroke="${VC.goldSoft}" stroke-width="6" stroke-linecap="round"/>`
      + `<circle cx="${S(x.base)}" cy="${y + 24}" r="6" fill="${VC.paper}" stroke="${VC.muted}" stroke-width="2"/><text x="${S(x.base)}" y="${y + 46}" font-size="10.5" fill="${VC.muted}" text-anchor="middle" direction="ltr">${x.base}</text>`
      + `<circle cx="${S(x.target)}" cy="${y + 24}" r="7" fill="${VC.gold}"/><text x="${S(x.target)}" y="${y + 46}" font-size="10.5" fill="${VC.gold}" text-anchor="middle" direction="ltr">${x.target}</text>`
      + (av != null ? `<rect x="${S(av) - 6}" y="${y + 18}" width="12" height="12" transform="rotate(45 ${S(av)} ${y + 24})" fill="${VC.ink}"/><text x="${S(av)}" y="${y + 10}" font-size="10.5" fill="${VC.ink}" text-anchor="middle" direction="ltr">${av}</text>` : '')
      + '</g>';
  });
  return { svg: `<svg viewBox="0 0 ${W} ${H}" width="100%" role="img" aria-label="المنافع: ${list.length}" ${FONT} class="mi-viz">${g}</svg>`, missing: [] };
}
export function benefitsLegend(withActual) {
  return `<div class="mi-legend"><span class="mi-lg"><i style="background:${VC.paper};border:2px solid ${VC.muted};width:9px;height:9px;border-radius:50%"></i>خط الأساس</span><span class="mi-lg"><i style="background:${VC.gold};width:10px;height:10px;border-radius:50%"></i>المستهدف</span>${withActual ? `<span class="mi-lg"><i class="dm" style="background:${VC.ink}"></i>الفعلي من المتابعة</span>` : ''}</div>`;
}

/** مصفوفة المسؤوليات: صف لكل حزمة أو قرار، والأدوار ملوّنة، وتُكشف الحزمة بلا محاسب أو بأكثر من واحد */
export function raciSvg(doc, { width = 1000 } = {}) {
  const f = fieldOf(doc, 'governance', 'raci');
  const rows = rowsOf(f);
  if (!rows.length) return { svg: '', missing: ['املأ مصفوفة المسؤوليات في «الحوكمة والمسؤوليات»'] };
  const roles = [['R', ci(f, 'R')], ['A', ci(f, 'A')], ['C', ci(f, 'C')], ['I', ci(f, 'I')]].filter(([, i]) => i >= 0);
  // الأشخاص أعمدة، والحزم صفوف، وفي الخانة دوره: مصفوفة مقروءة بنظرة
  const names = [...new Set(rows.flatMap((r) => roles.flatMap(([, i]) => String(r[i] ?? '').split(/[،,]/).map((s) => s.trim()).filter(Boolean))))].slice(0, 9);
  const W = width, label = 270, rowH = 30, headH = 104, cw = Math.min(90, (W - label - 10) / Math.max(1, names.length)), H = headH + rows.length * rowH + 8;
  const COL = { R: VC.ink, A: VC.gold, C: VC.cream, I: VC.faint };
  let g = '';
  names.forEach((nm, j) => { const x = W - label - (j + 1) * cw + cw / 2; g += `<text x="${x}" y="${headH - 10}" font-size="11" fill="${VC.slate}" text-anchor="end" transform="rotate(-40 ${x} ${headH - 10})" direction="rtl">${esc(cut(nm, 16))}</text>`; });
  const missing = [];
  rows.forEach((r, i) => {
    const y = headH + i * rowH;
    const as = roles.find(([k]) => k === 'A') ? String(r[roles.find(([k]) => k === 'A')[1]] ?? '').split(/[،,]/).map((s) => s.trim()).filter(Boolean) : [];
    const bad = as.length !== 1;
    if (bad) missing.push(`«${cut(String(r[0] ?? ''), 30)}»: ${as.length ? 'أكثر من محاسب' : 'بلا محاسب'}`);
    if (i % 2) g += `<rect x="0" y="${y}" width="${W}" height="${rowH}" fill="${VC.stripe}"/>`;
    g += `<text x="${W - 4}" y="${y + 19}" font-size="12" fill="${bad ? VC.crit : VC.ink}" text-anchor="start" direction="rtl">${bad ? '⚠ ' : ''}${esc(cut(String(r[0] ?? ''), 34))}</text>`;
    names.forEach((nm, j) => {
      const has = roles.filter(([, k]) => String(r[k] ?? '').split(/[،,]/).map((s) => s.trim()).includes(nm)).map(([k]) => k);
      if (!has.length) return;
      const x = W - label - (j + 1) * cw;
      const k = has[0];
      g += `<g data-chapter="governance"><title>${esc(`${nm}: ${has.map((h) => ({ R: 'المسؤول عن التنفيذ', A: 'المحاسب', C: 'يُستشار', I: 'يُبلَّغ' }[h])).join('، ')} في «${r[0]}»`)}</title><rect x="${x + 4}" y="${y + 4}" width="${cw - 8}" height="${rowH - 8}" rx="4" fill="${COL[k]}"/><text x="${x + cw / 2}" y="${y + 19}" font-size="11.5" font-weight="500" fill="${k === 'R' ? VC.paper : VC.ink}" text-anchor="middle" direction="ltr">${has.join('')}</text></g>`;
    });
  });
  return { svg: `<svg viewBox="0 0 ${W} ${H}" width="100%" role="img" aria-label="مصفوفة المسؤوليات: ${rows.length} صفًا و${names.length} أشخاص" ${FONT} class="mi-viz">${g}</svg>`, missing };
}
export function raciLegend() {
  const it = (c, t, k) => `<span class="mi-lg"><i style="background:${c};width:14px;height:12px"></i><b>${k}</b> ${t}</span>`;
  return `<div class="mi-legend">${it(VC.ink, 'المسؤول عن التنفيذ', 'R')}${it(VC.gold, 'المحاسب، واحد لكل صف', 'A')}${it(VC.cream, 'يُستشار', 'C')}${it(VC.faint, 'يُبلَّغ', 'I')}</div>`;
}

// ── سجل اللوحات: مصدر واحد للتبويب في التطبيق وللوثيقة ──
// لكل لوحة: مفتاحها، وعنوانها، وفصلها الذي يكملها، وما يُرسم منها
export const BOARDS = Object.freeze([
  { key: 'gantt', title: 'المخطط الزمني والعلاقات', chapter: 'schedule', parts: (doc, m) => [{ ...ganttSvg(m), legend: ganttLegend() }] },
  { key: 'network', title: 'الشبكة والمسار الحرج', chapter: 'schedule', parts: (doc, m) => [{ ...networkSvg(m), legend: networkLegend() }] },
  { key: 'wbs', title: 'شجرة تجزئة العمل', chapter: 'wbs', parts: (doc) => [wbsChartSvg(doc)] },
  { key: 'roadmap', title: 'خارطة المعالم', chapter: 'milestone-register', parts: (doc, m) => [{ ...roadmapSvg(m), legend: roadmapLegend() }] },
  { key: 'cost', title: 'الإنفاق والتكلفة', chapter: 'cost-plan', parts: (doc) => [{ ...sCurveSvg(doc), title: 'الإنفاق التراكمي المخطط' }, { ...costBarsSvg(doc), title: 'التكلفة بالحزمة' }] },
  { key: 'risk', title: 'المخاطر', chapter: 'raid', parts: (doc) => [{ ...riskMatrixSvg(doc), legend: riskLegend() }] },
  { key: 'stakeholders', title: 'أصحاب المصلحة', chapter: 'stakeholder-map', parts: (doc) => [stakeholderGridSvg(doc)] },
  { key: 'change', title: 'سلسلة التغيير', chapter: 'theory-of-change', parts: (doc) => [changeChainSvg(doc)] },
  { key: 'benefits', title: 'المنافع', chapter: 'benefits-register', parts: (doc) => [{ ...benefitsSvg(doc), legend: benefitsLegend(!!doc?.tracking?.state?.benefits?.length) }] },
  { key: 'raci', title: 'مصفوفة المسؤوليات', chapter: 'governance', parts: (doc) => [{ ...raciSvg(doc), legend: raciLegend() }] },
]);

/** اللوحات التي في وثيقة المشارك: فصلها من فصول وثيقته (مستواه ونطاقه) */
export const boardsFor = (doc) => BOARDS.filter((b) => (doc?.sections || []).some((s) => s.key === b.chapter));
