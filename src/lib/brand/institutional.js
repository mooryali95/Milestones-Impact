// ════════════════════════════════════════════════════════════════
// «الوثيقة المؤسسية»: وثيقة المبادرة للتداول خارج المنصة
// ════════════════════════════════════════════════════════════════
// التصور المعتمد (الخيار ب، 2026-11-24). تُبنى من القيم الصالحة وحدها (doc-quality.js cleanDoc):
// ما لم يُكتب أو كُتب بما لا يصلح يُحذف بصمت ويُعاد ترقيم الأبواب، ولا «لم يُملأ» ولا مؤشر صفري.
// غلاف مشترك: شعار الجهة أعلاه و«بإعداد Milestone Impact» أصغر، ولونها خط تمييز وحده (doc.js meta.brand).
// الأبواب: نظرة عامة، لماذا، القيمة، الخطة، الحوكمة والمخاطر، الأثر (إن وُجد)، الاعتماد.
// لا تُصدر إلا إذا أجابت عن الأسئلة المؤسسية العشرة (institutionalGate)، وإلا تعيد ما ينقص.
// ملف العمل الكامل بكل فصوله وملحق ما ينقص: capstone.js capstoneReport.
import { esc, kpis, section } from './doc.js';
import { cleanDoc, fingerprint, institutionalGate } from '../../../supabase/functions/leaders-api/doc-quality.js';
import { benefitsOf, charterData, durationAr } from '../../../supabase/functions/leaders-api/business-case.js';
import { LEVEL_AR as LVL } from '../../../supabase/functions/leaders-api/labels.js';
import { capstoneReport, heatmap, paras, STYLE, tableOf } from './capstone.js';
import { ganttLegend, ganttSvg, scheduleModel } from './visuals.js';

const fmt = (d) => (d ? new Date(d).toLocaleDateString('ar-SA-u-ca-gregory-nu-latn', { year: 'numeric', month: 'long', day: 'numeric' }) : null);
const money = (n) => `${Math.round(n).toLocaleString('en-US')} ريال`;

const IN_STYLE = `<style>
.in-lead { font-size: 11pt; line-height: 2; color: #0B272F; font-weight: 300; margin: 0 0 4mm; }
.in-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 3mm 8mm; margin-top: 4mm; }
.in-grid > div { border-top: 1px solid #DCE2E1; padding-top: 2mm; break-inside: avoid; }
.in-grid > div span { display: block; font-size: 7.6pt; color: #5F7176; }
.in-grid > div p { margin: .5mm 0 0; font-size: 9.4pt; line-height: 1.8; color: #2C4148; }
.in-sign { display: grid; grid-template-columns: repeat(3, 1fr); gap: 6mm; margin-top: 6mm; }
.in-sign > div { border-top: 1px solid #0B272F; padding-top: 2mm; break-inside: avoid; }
.in-sign span { display: block; font-size: 7.6pt; color: #5F7176; }
.in-sign b { font-weight: 400; font-size: 9.6pt; }
.in-sign small { display: block; font-size: 8pt; color: #2C4148; margin-top: 1mm; }
.in-fp { margin-top: 6mm; font: 300 8pt "Noto Sans", sans-serif; letter-spacing: .12em; color: #5F7176; direction: ltr; text-align: left; }
</style>`;

export { fingerprint };

const sec = (doc, k) => (doc.sections || []).find((s) => s.key === k) || null;
const fld = (doc, k, f) => (sec(doc, k)?.fields || []).find((x) => x.key === f) || null;
const val = (doc, k, f) => fld(doc, k, f)?.value ?? null;
const has = (v) => (Array.isArray(v) ? v.length > 0 : v != null && String(v).trim() !== '');

// حقل صالح بعنوانه، أو لا شيء
function field(doc, k, f, label) {
  const x = fld(doc, k, f);
  if (!x || !has(x.value)) return '';
  const title = esc(label || x.label);
  if (x.type === 'table') return `<div class="cp-f"><b>${title}</b>${tableOf(x.columns, x.value)}</div>`;
  if (x.type === 'select') return `<div class="cp-f"><b>${title}</b><span class="tag gold">${esc(x.value)}</span></div>`;
  return `<div class="cp-f"><b>${title}</b>${paras(x.value)}</div>`;
}
const grid = (pairs) => {
  const ok = pairs.filter(([, v]) => has(v));
  return ok.length ? `<div class="in-grid">${ok.map(([k, v]) => `<div><span>${esc(k)}</span><p>${esc(v)}</p></div>`).join('')}</div>` : '';
};

/**
 * الوثيقة المؤسسية من وثيقة الخادم (docFor أو لقطة الاعتماد).
 * يعيد { blocked: true, missing } إن لم تكتمل الأسئلة العشرة، وإلا { meta, body, fingerprint }
 */
export function institutionalReport(input) {
  // المعتمدة: محتواها النظيف وبصمتها مجمّدان في اللقطة لحظة الاعتماد (capstone.ts approve: snapshot.issued)،
  // فلا يغيّر تحسينٌ لاحق في قواعد الجودة وثيقةً صدرت. غير المعتمدة تُنظَّف لحظة العرض
  const frozen = input?.meta?.status === 'approved' && input?.issued?.sections ? input.issued : null;
  const doc = frozen ? { ...input, sections: frozen.sections, cost: frozen.cost ?? input.cost, summary: frozen.summary ?? input.summary, meta: { ...input.meta, ...(frozen.meta || {}) } } : cleanDoc(input, { strict: true }).doc;
  const gate = institutionalGate(doc);
  if (!gate.ok) return { blocked: true, missing: gate.missing };
  const m = doc.meta || {};
  const approved = m.status === 'approved';
  // البصمة من اللقطة الخام لا من ناتج التنظيف
  const fp = frozen?.fingerprint || fingerprint(input);
  const cost = doc.cost?.withContingency > 0 ? doc.cost : null;
  const c = charterData(doc);
  const benefits = benefitsOf(doc, 5);
  const duration = durationAr(m.start, m.end);
  const parts = [];
  const add = (en, ar, body, note) => { if (body && body.replace(/<[^>]+>/g, '').trim()) parts.push([en, ar, body, note]); };

  // ── نظرة عامة: صفحة واحدة ──
  const packages = (val(doc, 'wbs', 'packages') || []).length;
  const tiles = [
    cost && { value: money(cost.withContingency), label: 'التكلفة مع الاحتياطي' },
    benefits.length && { value: benefits.length, label: 'منفعة مقيسة' },
    (val(doc, 'milestone-register', 'milestones') || []).length && { value: val(doc, 'milestone-register', 'milestones').length, label: 'معلمًا' },
    packages && { value: packages, label: 'حزمة عمل' },
  ].filter(Boolean);
  add('Overview', 'نظرة عامة', `${tiles.length ? kpis(tiles) : ''}
    ${doc.summary ? `<p class="in-lead">${esc(doc.summary)}</p>` : ''}
    ${grid([
      ['المشكلة أو الفرصة', val(doc, 'initiative-charter', 'problem')],
      ['الهدف الأعلى', val(doc, 'initiative-charter', 'objective')],
      ['المستفيدون', val(doc, 'initiative-charter', 'beneficiaries')],
      ['المدة', duration],
      ['المطلوب', cost ? `${money(cost.withContingency)}${val(doc, 'cost-plan', 'funding') ? `، من ${val(doc, 'cost-plan', 'funding')}` : ''}` : null],
    ])}`);

  // ── لماذا ──
  add('Why', 'لماذا هذه المبادرة', [
    field(doc, 'options-analysis', 'evidence', 'الدليل على المشكلة'),
    field(doc, 'options-analysis', 'options', 'البدائل'),
    field(doc, 'options-analysis', 'recommendation', 'التوصية ومبررها'),
    field(doc, 'theory-of-change', 'chain', 'كيف يحدث التغيير'),
    field(doc, 'theory-of-change', 'impact', 'الأثر المنشود'),
  ].join(''));

  // ── القيمة ──
  add('Value', 'القيمة والقياس', [
    field(doc, 'benefits-register', 'benefits', 'المنافع'),
    field(doc, 'evidence-plan', 'plan', 'خطة القياس'),
    field(doc, 'cost-plan', 'cba', 'التكلفة مقابل المنفعة'),
  ].join(''));

  // ── الخطة ──
  const viz = scheduleModel(doc);
  const g = viz ? ganttSvg(viz, { today: null }) : null;
  add('Plan', 'الخطة والموارد', [
    grid([['داخل النطاق', val(doc, 'initiative-charter', 'in_scope')], ['خارج النطاق', val(doc, 'initiative-charter', 'out_scope')]]),
    c?.deliverables ? `<div class="cp-f"><b>المخرجات الرئيسة</b>${tableOf(c.deliverables.columns, c.deliverables.rows)}</div>` : '',
    field(doc, 'milestone-register', 'milestones', 'المعالم'),
    g?.svg ? `<figure class="cp-fig">${g.svg}${ganttLegend()}<figcaption>المخطط الزمني؛ الذهبي على المسار الحرج</figcaption></figure>` : field(doc, 'schedule', 'activities', 'الجدول الزمني'),
    field(doc, 'cost-plan', 'items', 'الموارد والتكلفة'),
    cost ? kpis([{ value: money(cost.total), label: 'التكلفة التقديرية' }, { value: `${cost.contingency || 0}%`, label: 'الاحتياطي' }, { value: money(cost.withContingency), label: 'مع الاحتياطي' }]) : '',
  ].join(''));

  // ── الحوكمة والمخاطر ──
  const risks = val(doc, 'raid', 'items') || [];
  const raidF = fld(doc, 'raid', 'items');
  add('Governance & risks', 'الحوكمة والمخاطر', [
    grid([['الراعي ودوره', m.sponsor], ['من يقرر', val(doc, 'governance', 'structure')], ['إيقاع المتابعة', val(doc, 'governance', 'cadence')]]),
    field(doc, 'stakeholder-map', 'stakeholders', 'أصحاب المصلحة'),
    field(doc, 'raid', 'items', 'سجل المخاطر'),
    risks.length && raidF ? heatmap(raidF.columns, risks) : '',
  ].join(''));

  // ── الأثر: إن كُتب ──
  add('Impact', 'الأثر والاستدامة', [
    field(doc, 'impact-report', 'changes', 'ماذا تغيّر'),
    field(doc, 'impact-report', 'lessons', 'ما تعلمناه'),
    field(doc, 'change-sustain', 'handover', 'التسليم والتسلم'),
    field(doc, 'change-sustain', 'sustain', 'ما يحمي المنافع'),
    grid([['من يشغّل بعد المبادرة', val(doc, 'initiative-charter', 'operator')]]),
  ].join(''));

  // ── الاعتماد ──
  const sp = doc.sponsor;
  const signs = [
    ['المستشار', approved || doc.review ? 'راجع الوثيقة وقبلها بمعيار التقييم' : 'قيد المراجعة', null],
    ['الراعي', sp?.status === 'endorsed' ? (sp.name || m.sponsor || 'الراعي') : sp?.waived ? 'اعتُمدت بقرار الإدارة' : 'لم يؤيد بعد', sp?.status === 'endorsed' ? fmt(sp.at) : null],
    ['تاريخ الاعتماد', approved ? fmt(m.approved_at) : 'لم تُعتمد بعد', null],
  ];
  add('Approval', 'الاعتماد', `${approved ? `<p><span class="cp-stamp">معتمدة · ${esc(fmt(m.approved_at) || '')}</span></p>` : ''}
    <div class="in-sign">${signs.map(([k, v, d]) => `<div><span>${esc(k)}</span><b>${esc(v)}</b>${d ? `<small>${esc(d)}</small>` : ''}</div>`).join('')}</div>
    <p class="in-fp">${esc(`${m.ref || 'MI-CP'}-V${m.version || 1}`)} · FINGERPRINT ${esc(fp)}</p>`,
  'بصمة النسخة تتغير بأي تعديل في محتواها: تطابقها يثبت أن ما بين يديك هو النسخة المعتمدة.');

  const body = STYLE + IN_STYLE + parts.map(([en, ar, b, note], i) => section(en, `${i + 1}. ${ar}`, b, note)).join('');
  // الجهة من لقطة الاعتماد (شعارها ولونها كما كانا لحظة الإصدار)؛ بلا جهة: مبادرة مجتمعية ويُذكر راعيها
  const org = m.org || null;
  return {
    fingerprint: fp,
    meta: {
      id: `${m.ref || 'MI-CP'}-V${m.version || 1}`, kind: 'CP', kindLabel: 'Initiative Document', pageAr: true, selfFonts: true,
      pdfName: `Initiative-${m.ref || 'MI-CP'}-V${m.version || 1}`,
      brand: { name: org?.name || null, logo: org?.logo || null, color: org?.color || null },
      eyebrow: 'Leaders Program · Initiative', title: m.initiative || 'وثيقة المبادرة',
      subtitle: `وثيقة المبادرة${m.scope_title ? ` · ${m.scope_title}` : ''}${LVL[m.level] ? ` · مستوى ${LVL[m.level]}` : ''}`,
      rows: [['قائد المبادرة', m.participant?.name], ...(m.host ? [['الجهة المستضيفة', m.host]] : []), ...(!org && m.sponsor ? [['الراعي', m.sponsor]] : []), ['الإصدار', `V${m.version || 1}`], ['الحالة', approved ? 'معتمدة' : m.status_title]].filter(([, v]) => v),
      confidential: 'ملك قائد المبادرة وجهتها: تُتداول بإذنهما',
      closing: approved ? 'وثيقة معتمدة تُعرض من نسختها المحفوظة لحظة الاعتماد، فلا يغيّرها تعديل لاحق.' : 'نسخة لم تُعتمد بعد: تُبنى من فصول المبادرة لحظة إصدارها.',
    },
    body,
  };
}

/** الوثيقتان من مصدر واحد: 'institutional' (الوثيقة المؤسسية) أو 'working' (ملف العمل الكامل). يعيد { meta, body } أو { blocked, message } */
// 'external': لمن هو خارج العمل (الراعي، الجهة، رابط المشاركة، الخبير): المؤسسية إن اكتملت، وإلا صفحة «قيد الإعداد» مهذبة، ولا ملحق ولا ختم مسودة
export function renderInitiative(doc, kind = 'working') {
  // 'reader': من يراجع قبل الاعتماد (الراعي ليؤيد، والخبير): المؤسسية إن اكتملت، وإلا ملف العمل بلا ملحق ولا ختم
  if (kind === 'external' || kind === 'reader') {
    const r = institutionalReport(doc);
    if (!r.blocked) return r;
    return kind === 'reader' ? capstoneReport(doc, { appendix: false }) : pendingReport(doc);
  }
  if (kind !== 'institutional') return capstoneReport(doc);
  const r = institutionalReport(doc);
  return r.blocked ? { blocked: true, missing: r.missing, message: missingMessage(r.missing) } : r;
}

/** رسالة ما ينقص لإصدار الوثيقة المؤسسية، بلغة المشارك */
export const missingMessage = (missing) => `لا تُصدر الوثيقة المؤسسية قبل أن تجيب عن: ${missing.map((x) => x.title).join('، ')}. اعرض «ملف العمل الكامل» لترى ما ينقص في ملحقه.`;

/** صفحة مهذبة لقارئ خارجي حين لم تكتمل الوثيقة المؤسسية بعد */
export function pendingReport(doc) {
  const m = doc?.meta || {};
  const org = m.org || null;
  return {
    meta: { id: `${m.ref || 'MI-CP'}-V${m.version || 1}`, kind: 'CP', kindLabel: 'Initiative Document', pageAr: true, selfFonts: true,
      brand: { name: org?.name || null, logo: org?.logo || null, color: org?.color || null },
      eyebrow: 'Leaders Program · Initiative', title: m.initiative || 'وثيقة المبادرة', rows: [['قائد المبادرة', m.participant?.name]].filter(([, v]) => v),
      confidential: 'ملك قائد المبادرة وجهتها: تُتداول بإذنهما', closing: 'تصدر الوثيقة المؤسسية حين يكتمل إعدادها.' },
    body: STYLE + section('In preparation', 'الوثيقة قيد الإعداد', '<p class="cp-p">يعمل قائد المبادرة على استكمال وثيقتها مع مستشاره. ستجدها هنا كاملة حين يكتمل إعدادها.</p>'),
  };
}
