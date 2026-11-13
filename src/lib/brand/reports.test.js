import { describe, it, expect } from 'vitest';
import { analysisReport, decisionReport, impactReport, orgReport, planReport } from './reports.js';
import { documentHtml, docId } from './doc.js';

const d = {
  org: { name: 'وزارة <التجربة>', seats: 10, sector: 'حكومي' },
  participants: [
    { full_name: 'سارة<script>', job_title: 'مديرة', status: 'enrolled', track: 'M1I1L2', track_title: 'البداية', progress: 40, email: 'secret@x.com', levels: { milestone: 'beginner' }, created_at: '2026-10-01' },
  ],
  funnel: { registered: 1, profiled: 1, assessed: 1, approved: 1, completed: 0 },
  by_track: { M1I1L2: 1 }, by_via: { link: 1 }, by_campaign: { whatsapp: 1 },
};

describe('orgReport', () => {
  it('يهرّب كل نص قادم من البيانات', () => {
    const { meta, body } = orgReport(d, 'admin');
    const html = documentHtml(meta, body);
    expect(html).not.toContain('<script>');
    expect(html).toContain('سارة&lt;script&gt;');
    expect(html).toContain('وزارة &lt;التجربة&gt;');
  });
  it('لا يظهر بريد المشارك للمنسق إلا بإذن', () => {
    expect(orgReport({ ...d, permissions: { contact: false } }, 'coordinator').body).not.toContain('secret@x.com');
    expect(orgReport({ ...d, permissions: { contact: true } }, 'coordinator').body).toContain('secret@x.com');
  });
  it('الحملات للإدارة فقط', () => {
    expect(orgReport(d, 'admin').body).toContain('whatsapp');
    expect(orgReport(d, 'coordinator').body).not.toContain('whatsapp');
  });
  // D18: المسار مشتق من المستويات، فلا يظهر للمنسق بلا صلاحيتها، ومفتاحه الداخلي لا يُطبع له أبدًا
  it('المسار في تقرير المنسق مع صلاحية المستويات وحدها، والإدارة كما هي', () => {
    const coord = orgReport({ ...d, permissions: { scores: false } }, 'coordinator').body;
    expect(coord).not.toContain('البداية');
    expect(coord).not.toContain('M1I1L2');
    expect(coord).not.toContain('التوزيع على المسارات');
    expect(coord).not.toMatch(/>المسار</);
    expect(orgReport({ ...d, permissions: { scores: true } }, 'coordinator').body).toContain('البداية');
    const noTitle = { ...d, participants: [], by_track: { M1I1L2: 1 }, permissions: { scores: true } };
    expect(orgReport(noTitle, 'coordinator').body).not.toContain('M1I1L2');
    // منسق بالمستويات بلا «القائمة»: العناوين تصل مع الأعداد، فلا تُجمع المسارات تحت «مسار»
    const titled = { ...noTitle, track_titles: { M1I1L2: 'مسار البداية المعنون' } };
    expect(orgReport(titled, 'coordinator').body).toContain('مسار البداية المعنون');
    expect(orgReport(d, 'admin').body).toContain('التوزيع على المسارات');
    expect(orgReport(d, 'admin').body).toContain('البداية');
  });
});

describe('documentHtml', () => {
  it('يحمل الشعار والختم وحقوق النشر ورقم الوثيقة', () => {
    const html = documentHtml({ kind: 'ORG', title: 'ت', id: 'MI-ORG-1' }, '');
    expect(html).toContain('aria-label="Milestone Impact"');
    expect(html).not.toContain('<?xml');
    expect(html).toContain('جميع الحقوق محفوظة');
    expect(html).toContain('MI-ORG-1');
    expect(html).toContain('size: A4');
    expect(html).not.toContain('معلم الأثر');
  });
  it('رقم الوثيقة بصيغة ثابتة', () => {
    expect(docId('ORG')).toMatch(/^MI-ORG-\d{8}-[A-Z0-9]{4}$/);
  });
});

it('planReport يعدّ المؤكد ويرتب الأعمدة', () => {
  const { body } = planReport({ name: 'عمر' }, [{ name: 'ع1', track: 'م', trackColor: '#123456', weight: 10, phase: 'أ', duration: '3 أيام', gregorian: '1/1', hijri: '1/1', confirmed: true }]);
  expect(body).toContain('مؤكد');
  expect(body).toContain('ع1');
});

import { fileNameFor } from './xlsx.js';
it('اسم ملف Excel إنجليزي ثابت', () => {
  expect(fileNameFor({ file: 'Organization', code: 'wt01' }, new Date('2026-10-23T10:00:00Z'))).toBe('Milestone-Impact_Organization_wt01_2026-10-23.xlsx');
  expect(fileNameFor({ file: 'Participants', code: 'رمز عربي' }, new Date('2026-10-23T10:00:00Z'))).toBe('Milestone-Impact_Participants_-_2026-10-23.xlsx');
});

it('analysisReport يعرض شكل الخطة والفجوات والتوصيات من نتيجة التحليل كما هي', () => {
  const a = {
    pattern: { nameAr: 'تكاملي', desc: 'تفكير <منظومي>' }, totalBooked: 5, totalProcesses: 16,
    trackCoverage: { covered: 3, total: 4 }, phaseCoverage: { covered: 2, total: 4 }, furthestPhase: 2, readinessAr: 'متوسطة',
    weightBalance: { pct: 60 }, trackDist: [{ nameAr: 'التأسيس', count: 2 }],
    timeline: [{ step: 1, nameAr: 'التشخيص', trackNameAr: 'التأسيس', trackColor: '#123456', phaseNameAr: 'أ', date: '2026-01-01', isConfirmed: true }],
    depGaps: [{ process: 'التنفيذ', missing: 'التخطيط' }], recommendations: ['ابدأ بالتخطيط'],
  };
  const { meta, body } = analysisReport({ name: 'عمر' }, a);
  expect(meta.kind).toBe('ANL');
  expect(body).toContain('تفكير &lt;منظومي&gt;');
  expect(body).toContain('2026');
  expect(body).toContain('التخطيط');
  expect(body).toContain('ابدأ بالتخطيط');
  expect(body).toContain('شكل الخطة');
  expect(body).toContain('أبعد مرحلة محجوزة');
  expect(body).not.toContain('نمط');
  expect(body).not.toContain('متوسط المرحلة');
  expect(meta.rows.map((r) => r[0])).toContain('شكل الخطة');
});

it('decisionReport يعرض الفئات غير الفارغة فقط ويعدّ الكل في الملخص', () => {
  const { meta, body } = decisionReport('مشروع <أ>', [
    { key: 'launch', ar: 'ابدأ الآن', color: '#2E7D5B', items: [{ name: 'خدمة × شريحة', adj: '8.1', risk: 3, trust: '90%', why: 'أقوى محركات النتيجة: القيمة.' }] },
    { key: 'defer', ar: 'أجّل', color: '#8E6524', items: [] },
  ]);
  expect(meta.kind).toBe('DEC');
  expect(meta.subtitle).toBe('مشروع <أ>');
  expect(body).toContain('خدمة × شريحة');
  expect(body.match(/<section/g).length).toBe(2);
});

describe('impactReport', () => {
  const dim = (pre, post) => ({ n: 2, pre, post, diff: post - pre, dz: 1.1, effect: 'كبير', reliable_up: 1, reliable_down: 0, level_up: 1, verdicts: { confirmed: 1, none: 1 }, rater: { n: 1, pre: 2.5, post: 3.5 } });
  const r = {
    counts: { participants: 3, baseline: 3, post: 2, paired: 2 },
    cohort: { milestone: dim(45, 70), impact: dim(50, 60), leadership: dim(55, 58) },
    transfer: [{ code: 'T-1', text: 'أطبق ما تعلمته', n: 2, agree_pct: 100, mean: 3.5 }],
    participants: [{ full_name: 'سارة<b>', organization: 'جهة', dimensions: [{ dimension: 'milestone', composite_pre: 45, composite_post: 70, change: 25, verdict: { key: 'confirmed' } }] }],
    caution: 'العدد 2 أقل من 20',
  };
  it('يعرض أرقام الخادم كما هي مع التنبيه المنهجي', () => {
    const { meta, body } = impactReport(r);
    expect(meta.title).toBe('تقرير أثر برنامج القادة');
    expect(body).toContain('+25');
    expect(body).toContain('1.1 (كبير)');
    expect(body).toContain('العدد 2 أقل من 20');
    expect(body).toContain('تغير مؤكد 1');
    expect(body).toContain('أطبق ما تعلمته');
    expect(documentHtml(meta, body)).toContain('سارة&lt;b&gt;');
  });
  it('أسماء المشاركين للمنسق بإذن فقط', () => {
    expect(impactReport(r, { org: 'جهة', audience: 'coordinator' }).body).not.toContain('سارة');
    expect(impactReport(r, { org: 'جهة', audience: 'coordinator', names: true }).body).toContain('سارة');
  });
  it('ثلاث طبقات مسماة، والثالثة من منافع المبادرات، وحد القراءة مكتوب', () => {
    const plain = impactReport(r).body;
    for (const t of ['الطبقة الأولى: تعلم مُقاس', 'الطبقة الثالثة: نتائج عند الجهة', 'تغيّر مرصود لا أثر مُسند', 'لا مبادرات معتمدة تُتابَع بعد']) expect(plain).toContain(t);
    const withOutcomes = impactReport(r, { outcomes: { approved: 4, reporting: 3, realization: 62, verified: 2 } }).body;
    expect(withOutcomes).toContain('62%');
    expect(withOutcomes).toContain('مبادرة معتمدة');
    expect(withOutcomes).not.toContain('لا مبادرات معتمدة تُتابَع بعد');
  });
  it('بلا أزواج يشرح متى تظهر المقارنة', () => {
    expect(impactReport({ counts: { participants: 1, baseline: 1, post: 0, paired: 0 }, cohort: {} }).body).toContain('لا أحد لديه القياسان بعد');
  });
});
