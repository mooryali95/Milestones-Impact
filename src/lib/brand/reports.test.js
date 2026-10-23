import { describe, it, expect } from 'vitest';
import { orgReport, planReport } from './reports.js';
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
