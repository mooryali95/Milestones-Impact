import { describe, it, expect } from 'vitest';
import { analysisReport, decisionReport, orgReport, planReport } from './reports.js';
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

it('analysisReport يعرض النمط والفجوات والتوصيات من نتيجة التحليل كما هي', () => {
  const a = {
    pattern: { nameAr: 'تكاملي', desc: 'تفكير <منظومي>' }, totalBooked: 5, totalProcesses: 16,
    trackCoverage: { covered: 3, total: 4 }, phaseCoverage: { covered: 2, total: 4 }, avgPhase: '1.8', readinessAr: 'متوسطة',
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
