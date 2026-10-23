import { describe, expect, it } from 'vitest';
import { certificateHtml, linkedinUrl } from './certificate.js';

const c = {
  serial: 'MI-LDR-2026-7K3QX9', name_ar: 'سارة <b>', name_en: 'Sarah', program_ar: 'برنامج القادة', program_en: 'Leaders Program',
  issued_at: '2026-10-23T09:00:00Z', signatories: [], verify_url: 'https://leaders.sunkvalue.com/v/MI-LDR-2026-7K3QX9',
};

describe('شهادة المشاركة', () => {
  it('تهرّب النصوص وتضع الرقم ورابط التحقق', () => {
    const h = certificateHtml(c, '<svg></svg>');
    expect(h).toContain('سارة &lt;b&gt;');
    expect(h).toContain('MI-LDR-2026-7K3QX9');
    expect(h).toContain('leaders.sunkvalue.com/v/MI-LDR-2026-7K3QX9');
    expect(h).toContain('data-act="linkedin"');
  });
  it('الملغاة بختمها وبلا زر LinkedIn', () => {
    const h = certificateHtml(c, '', { status: 'ملغاة' });
    expect(h).toContain('class="status"');
    expect(h).not.toContain('data-act="linkedin"');
  });
  it('رابط LinkedIn لقسم الشهادات بالرقم والرابط', () => {
    const u = new URL(linkedinUrl(c));
    expect(u.searchParams.get('startTask')).toBe('CERTIFICATION_NAME');
    expect(u.searchParams.get('certId')).toBe(c.serial);
    expect(u.searchParams.get('certUrl')).toBe(c.verify_url);
    expect(u.searchParams.get('issueYear')).toBe('2026');
  });
});
