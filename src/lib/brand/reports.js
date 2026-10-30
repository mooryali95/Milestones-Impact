// ════════════════════════════════════════════════════════════════
// قوالب التقارير: تبني محتوى الوثيقة من بيانات المنصة
// ════════════════════════════════════════════════════════════════
// دوال صافية تعيد { meta, body }؛ يفتحها openDocument أو تُختبر وحدها.
import { bars, callout, chain, esc, kpis, points, progress, raw, section, table, today } from './doc.js';

import { PARTICIPANT_STATUS as STATUS } from '../../../supabase/functions/leaders-api/labels.js';
export { STATUS };
const FUNNEL_EN = { registered: 'Joined', profiled: 'Profiled', assessed: 'Assessed', approved: 'Placed', completed: 'Completed' };
const FUNNEL = BASE_FUNNEL.map(([k, t]) => [k, t, FUNNEL_EN[k]]);
const VIA = { link: 'رابط الجهة', domain: 'موقع الجهة', admin: 'أضافته الإدارة', none: 'غير محدد' };
import { DIM_AR, DIM_SHORT as DIM_EN, FUNNEL as BASE_FUNNEL, LEVEL_AR as LVL } from '../../../supabase/functions/leaders-api/labels.js';
const fmt = (d) => (d ? new Date(d).toLocaleDateString('ar-SA-u-ca-gregory-nu-latn', { year: 'numeric', month: 'short', day: 'numeric' }) : '·');

// تقرير الجهة. audience: 'admin' (كامل بمصادر الانضمام) أو 'coordinator' (بصلاحياته فقط)
// d: { org, participants, funnel, by_track, by_via, by_campaign?, by_site?, kpis?, permissions? }
export function orgReport(d, audience = 'admin') {
  const o = d.org;
  const ps = d.participants || [];
  const f = d.funnel || {};
  const perms = d.permissions || { contact: false, scores: false };
  const weekAgo = Date.now() - 7 * 864e5;
  const k = d.kpis || {
    total: ps.length,
    joined_week: ps.filter((p) => Date.parse(p.created_at) > weekAgo).length,
    active_week: ps.filter((p) => p.last_login_at && Date.parse(p.last_login_at) > weekAgo).length,
    approved: f.approved || 0, completed: f.completed || 0,
  };
  const titleOf = (key) => ps.find((p) => p.track === key)?.track_title || key;
  const tracks = Object.entries(d.by_track || {}).sort((a, b) => b[1] - a[1]);
  const showProgress = ps.some((p) => typeof p.progress === 'number');

  const cols = [{ label: 'الاسم' }, { label: 'المسمى' }, { label: 'المسار' }, { label: 'المرحلة' }];
  if (showProgress) cols.push({ label: 'الإنجاز', width: '26mm' });
  cols.push({ label: 'آخر دخول' });
  if (audience === 'coordinator' && perms.contact) cols.push({ label: 'البريد', ltr: true });
  if (audience === 'coordinator' && perms.scores) cols.push({ label: 'المستويات' });
  const rows = ps.map((p) => {
    const r = [raw(`<b style="font-weight:400">${esc(p.full_name)}</b>`), p.job_title || '', p.track_title || p.track || '·', STATUS[p.status] || p.status];
    if (showProgress) r.push(raw(progress(p.progress || 0)));
    r.push(fmt(p.last_login_at));
    if (audience === 'coordinator' && perms.contact) r.push(p.email || '');
    if (audience === 'coordinator' && perms.scores) r.push(p.levels ? ['milestone', 'impact', 'leadership'].map((x) => LVL[p.levels[x]] || '·').join(' · ') : '·');
    return r;
  });

  const body = [
    section('Overview', 'ملخص الجهة', kpis([
      { value: k.total, label: o.seats ? `مشارك من ${o.seats} مقعد` : 'مشارك' },
      { value: k.joined_week ?? 0, label: 'انضموا هذا الأسبوع' },
      { value: k.active_week ?? 0, label: 'نشطون هذا الأسبوع' },
      { value: k.approved ?? 0, label: 'اعتُمد مسارهم' },
      ...(k.avg_progress != null ? [{ value: `${k.avg_progress}%`, label: 'متوسط الإنجاز' }] : [{ value: k.completed ?? 0, label: 'أنهوا البرنامج' }]),
    ])),
    section('Journey', 'مسار الرحلة', chain(FUNNEL.map(([key, label, en]) => ({ value: f[key] || 0, label, en }))), 'عدد من بلغ كل مرحلة من مراحل البرنامج.'),
    section('Tracks', 'التوزيع على المسارات', bars(tracks.map(([key, n]) => ({ label: titleOf(key), value: n })), k.total)),
    section('Sources', 'طريقة الانضمام', bars(Object.entries(d.by_via || {}).sort((a, b) => b[1] - a[1]).map(([key, n]) => ({ label: VIA[key] || key, value: n })), k.total)),
    ...(audience === 'admin' && Object.keys(d.by_campaign || {}).length
      ? [section('Campaigns', 'الحملات', bars(Object.entries(d.by_campaign).sort((a, b) => b[1] - a[1]).map(([key, n]) => ({ label: key, value: n })), k.total, { ltr: true }))] : []),
    section('Participants', 'المشاركون', table(cols, rows, 'لم ينضم أحد من الجهة بعد'), `${ps.length} مشارك، مرتبون كما في اللوحة.`),
  ].join('');

  return {
    meta: {
      kind: 'ORG', kindLabel: 'Organization Report', eyebrow: 'Leaders Program · Organization Report',
      title: `تقرير ${o.name}`, subtitle: 'برنامج القادة من Milestone Impact',
      rows: [['الجهة', o.name], ['القطاع', o.sector || '·'], ['تاريخ الإصدار', today()], ['الجمهور', audience === 'admin' ? 'إدارة البرنامج' : 'منسق الجهة']],
      confidential: `سري: مخصص لـ ${o.name} وإدارة البرنامج فقط`,
      closing: 'أُعدّ هذا التقرير آليًا من بيانات برنامج القادة لحظة إصداره، ويعكس حالة المشاركين في ذلك التاريخ.',
    },
    body,
  };
}

// خطة التأثير النهائية في المصفوفة: العمليات بمواعيدها
// rows: [{ name, track, trackColor, weight, phase, duration, gregorian, hijri, confirmed }]
export function planReport(user, rows) {
  const confirmed = rows.filter((r) => r.confirmed).length;
  const tracks = {};
  rows.forEach((r) => { tracks[r.track] = (tracks[r.track] || 0) + 1; });
  const body = [
    section('Summary', 'ملخص الخطة', kpis([
      { value: rows.length, label: 'عملية مجدولة', hint: 'من 16 عملية' },
      { value: confirmed, label: 'موعد مؤكد' },
      { value: Object.keys(tracks).length, label: 'مسار' },
      { value: rows[0]?.gregorian || '·', label: 'أول موعد' },
    ])),
    section('Schedule', 'جدول العمليات', table(
      [{ label: '#', width: '8mm' }, { label: 'العملية' }, { label: 'المسار' }, { label: 'الوزن' }, { label: 'المرحلة' }, { label: 'المدة' }, { label: 'الميلادي' }, { label: 'الهجري' }, { label: 'الحالة' }],
      rows.map((r, i) => [String(i + 1), raw(`<b style="font-weight:400">${esc(r.name)}</b>`), raw(`<span style="color:${esc(r.trackColor)}">◆</span> ${esc(r.track)}`), `${r.weight}%`, r.phase, r.duration, r.gregorian, r.hijri,
        raw(r.confirmed ? '<span class="tag gold">مؤكد</span>' : '<span class="tag">محدد</span>')]),
      'لم تُحدد مواعيد بعد',
    )),
  ].join('');
  return {
    meta: {
      kind: 'PLAN', kindLabel: 'Impact Plan', eyebrow: 'Impact Matrix · Final Plan',
      title: 'خطة التأثير النهائية', subtitle: `مصفوفة التأثير · ${user.name || ''}`,
      rows: [['المشارك', user.name || '·'], ['الجوال', user.phone || '·'], ['البريد', user.email || '·'], ['تاريخ الإصدار', today()]],
      confidential: `سري: مخصص لـ ${user.name || 'المشارك'} ومستشاره فقط`,
      closing: 'هذه الخطة نتاج عمل المشارك على مصفوفة التأثير، وتُعتمد بالمراجعة مع المستشار.',
    },
    body,
  };
}

// التقرير التحليلي للمصفوفة: يقرأ نتيجة analyzeBookings كما هي (مصدرها الوحيد)
export function analysisReport(user, a) {
  const body = [
    section('Pattern', 'نمط التخطيط', callout(`نمط ${a.pattern.nameAr}`, a.pattern.desc)),
    section('Indicators', 'المؤشرات', kpis([
      { value: a.totalBooked, label: 'عملية محجوزة', hint: `من ${a.totalProcesses}` },
      { value: `${a.trackCoverage.covered}/${a.trackCoverage.total}`, label: 'مسارات مغطاة' },
      { value: `${a.phaseCoverage.covered}/${a.phaseCoverage.total}`, label: 'مراحل مغطاة' },
      { value: a.avgPhase, label: 'متوسط المرحلة' },
      { value: a.readinessAr, label: 'الجاهزية' },
    ])),
    section('Tracks', 'توزيع الاهتمام على المسارات', bars(a.trackDist.map((t) => ({ label: t.nameAr, value: t.count })), 4),
      `تغطي الخطة ${a.weightBalance.pct}% من وزن المسارات.`),
    section('Journey', 'رحلة الحجز', table(
      [{ label: '#', width: '8mm' }, { label: 'العملية' }, { label: 'المسار' }, { label: 'المرحلة' }, { label: 'التاريخ' }, { label: 'الحالة' }],
      a.timeline.map((t) => [String(t.step), raw(`<b style="font-weight:400">${esc(t.nameAr)}</b>`), raw(`<span style="color:${esc(t.trackColor)}">◆</span> ${esc(t.trackNameAr)}`),
        t.phaseNameAr, fmt(t.date), raw(t.isConfirmed ? '<span class="tag gold">مؤكد</span>' : '<span class="tag">محدد</span>')]),
    )),
    ...(a.depGaps.length ? [section('Gaps', 'فجوات التبعية', points(a.depGaps.map((g) => raw(`حُجزت <b style="font-weight:400">${esc(g.process)}</b> دون <b style="font-weight:400">${esc(g.missing)}</b> التي تغذيها`))),
      'عمليات تعتمد على مدخلات من عمليات لم تُحجز بعد.')] : []),
    ...(a.recommendations.length ? [section('Recommendations', 'التوصيات', points(a.recommendations))] : []),
  ].join('');
  return {
    meta: {
      kind: 'ANL', kindLabel: 'Analytical Report', eyebrow: 'Impact Matrix · Analytical Report',
      title: 'التقرير التحليلي', subtitle: `مصفوفة التأثير · ${user.name || ''}`,
      rows: [['المشارك', user.name || '·'], ['العمليات المحجوزة', `${a.totalBooked} من ${a.totalProcesses}`], ['النمط', a.pattern.nameAr], ['تاريخ الإصدار', today()]],
      confidential: `سري: مخصص لـ ${user.name || 'المشارك'} ومستشاره فقط`,
      closing: 'أُعدّ هذا التقرير آليًا من حجوزات المشارك على مصفوفة التأثير لحظة إصداره، وهو قراءة أولية تُستكمل بالحوار مع المستشار.',
    },
    body,
  };
}

// تقرير القرار في SSPDF: التركيبات مصنّفة في فئات القرار كما تعرضها الشاشة
// buckets: [{ key, ar, color, items: [{ name, adj, risk, trust, why }] }]
export function decisionReport(project, buckets) {
  const total = buckets.reduce((s, b) => s + b.items.length, 0);
  const body = [
    section('Summary', 'ملخص القرار', kpis(buckets.map((b) => ({ value: b.items.length, label: b.ar })))),
    ...buckets.filter((b) => b.items.length).map((b) => section('Decision', b.ar, table(
      [{ label: 'التركيبة' }, { label: 'النتيجة المعدّلة', width: '26mm' }, { label: 'المخاطر', width: '18mm' }, { label: 'الثقة', width: '16mm' }, { label: 'المبرر' }],
      b.items.map((r) => [raw(`<span style="color:${esc(b.color)}">◆</span> <b style="font-weight:400">${esc(r.name)}</b>`), r.adj, `${r.risk}/9`, r.trust, r.why]),
    ), `${b.items.length} من ${total} تركيبة.`)),
  ].join('');
  return {
    meta: {
      kind: 'DEC', kindLabel: 'Decision Report', eyebrow: 'SSPDF · Decision & Recommendations',
      title: 'تقرير القرار والتوصيات', subtitle: project || 'إطار قرار محفظة الخدمات الاستراتيجية',
      rows: [['المشروع', project || '·'], ['التركيبات', String(total)], ['المنهجية', 'النتيجة المعدّلة بالثقة ودرجة المخاطر'], ['تاريخ الإصدار', today()]],
      confidential: 'سري: مخصص لفريق القرار في المشروع',
      closing: 'صُنّفت التركيبات آليًا وفق النتيجة المعدّلة بالثقة ودرجة المخاطر لحظة الإصدار، وتُعتمد التوصيات بقرار الفريق.',
    },
    body,
  };
}

// تقرير الأثر النهائي: القياس المبدئي مقابل البعدي للدفعة أو لجهة واحدة.
// r: رد admin.impact كما هو (counts, cohort, transfer, participants, caution)؛ لا يُعاد هنا أي حساب.
// audience: 'admin' أو 'coordinator'؛ أسماء المشاركين تظهر للمنسق فقط إن مُنح صلاحية المستويات.
const VERDICT = { confirmed: 'تغير مؤكد', emerging: 'مؤشرات أولية', none: 'لا دليل كافٍ', decline: 'تراجع يحتاج مراجعة' };
const signed = (x) => (x == null ? '·' : x > 0 ? `+${x}` : `${x}`);
export function impactReport(r, { org = null, audience = 'admin', names = audience === 'admin' } = {}) {
  const c = r.counts || {};
  const dims = Object.keys(DIM_AR).filter((d) => r.cohort?.[d]);
  const cohortRows = dims.map((d) => {
    const x = r.cohort[d];
    return [raw(`<b style="font-weight:400">${esc(DIM_EN[d])}</b><br><small>${esc(DIM_AR[d])}</small>`), x.n ?? 0, x.pre ?? '·', x.post ?? '·',
      raw(`<b>${esc(signed(x.diff))}</b>`), x.dz != null ? `${x.dz}${x.effect ? ` (${x.effect})` : ''}` : '·',
      `${x.reliable_up ?? 0} من ${x.n ?? 0}`, x.level_up ?? 0, x.rater?.n ? `${x.rater.pre} ← ${x.rater.post}` : '·'];
  });
  const verdictLines = dims.map((d) => `${DIM_EN[d]}: ${Object.entries(VERDICT).map(([k, l]) => `${l} ${r.cohort[d].verdicts?.[k] || 0}`).join('، ')}`);
  const people = (r.participants || []).filter((p) => p.dimensions);
  const peopleRows = people.map((p) => [
    raw(`<b style="font-weight:400">${esc(p.full_name)}</b>${!org && p.organization ? `<br><small>${esc(p.organization)}</small>` : ''}`),
    ...dims.map((d) => {
      const x = p.dimensions.find((y) => y.dimension === d);
      return x ? raw(`${esc(x.composite_pre ?? '·')} ← ${esc(x.composite_post ?? '·')} <small>(${esc(signed(x.change))})</small><br><small>${esc(VERDICT[x.verdict?.key] || '')}</small>`) : '·';
    }),
  ]);

  const body = [
    section('Overview', 'ملخص القياس', kpis([
      { value: c.participants ?? 0, label: 'مشارك' },
      { value: c.baseline ?? 0, label: 'أجروا القياس المبدئي' },
      { value: c.post ?? 0, label: 'أجروا القياس البعدي' },
      { value: c.paired ?? 0, label: 'لديهم القياسان' },
    ])),
    ...(r.caution ? [callout('تنبيه منهجي', r.caution)] : []),
    c.paired
      ? section('Before and after', 'قبل وبعد لكل إطار', table(
        [{ label: 'الإطار' }, { label: 'العدد' }, { label: 'قبل' }, { label: 'بعد' }, { label: 'الفرق' }, { label: 'حجم الأثر dz' }, { label: 'تحسن موثوق' }, { label: 'ارتقى مستوى' }, { label: 'تقدير المدير' }],
        cohortRows), 'النسب المركبة من 100 على الجوانب المشتركة بين القياسين. التحسن الموثوق يتجاوز خطأ القياس (RCI ≥ 1.96).')
      : section('Before and after', 'قبل وبعد لكل إطار', '<p class="muted">لا أحد لديه القياسان بعد، فتظهر المقارنة حين يُتم المشاركون القياس البعدي.</p>'),
    ...(c.paired ? [section('Verdicts', 'الحكم بالتثليث', points(verdictLines), '«تغير مؤكد» يتطلب مصدرين على الأقل أحدهما غير ذاتي: الاختبار، أو تقدير المدير، أو دليل المشروع المعتمد.')] : []),
    ...((r.transfer || []).length ? [section('Transfer', 'انتقال التعلم إلى العمل', table(
      [{ label: 'البند' }, { label: 'العدد', width: '18mm' }, { label: 'موافقون', width: '22mm' }, { label: 'المتوسط من 4', width: '26mm' }],
      r.transfer.map((t) => [t.text, t.n, `${t.agree_pct}%`, t.mean])), 'بيئة التطبيق: ضعف الدعم أو الفرص يفسّر غياب الأثر أحيانًا أكثر من جودة التدريب.')] : []),
    ...(names && peopleRows.length ? [section('Participants', 'المشاركون', table([{ label: 'المشارك' }, ...dims.map((d) => ({ label: DIM_EN[d] }))], peopleRows), `${peopleRows.length} مشارك لديهم القياسان.`)] : []),
  ].join('');

  return {
    meta: {
      kind: 'IMP', kindLabel: 'Impact Report', eyebrow: 'Leaders Program · Impact Report',
      title: org ? `تقرير أثر ${org}` : 'تقرير أثر برنامج القادة', subtitle: 'القياس المبدئي مقابل القياس البعدي',
      rows: [['النطاق', org || 'كل الجهات'], ['المقارنات', `${c.paired ?? 0} مشارك`], ['تاريخ الإصدار', today()], ['الجمهور', audience === 'admin' ? 'إدارة البرنامج' : 'منسق الجهة']],
      confidential: org ? `سري: مخصص لـ ${org} وإدارة البرنامج فقط` : 'سري: مخصص لإدارة البرنامج فقط',
      closing: 'أُعدّ هذا التقرير آليًا من نتائج القياسين لحظة إصداره. الأرقام وصفية للدفعة، ولا يُعرض فرق خام دون هامش خطأ القياس.',
    },
    body,
  };
}
