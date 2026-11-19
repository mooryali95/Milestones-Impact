import { describe, expect, it } from 'vitest';
import { norm, rank, scoreText } from './search.js';

describe('البحث الشامل', () => {
  it('يوحّد الهمزات والتاء المربوطة والتشكيل', () => {
    expect(norm('أُسامة')).toBe('اسامه');
    expect(scoreText(norm('اسامه'), 'أسامة الأحمد')).toBe(2);
    expect(scoreText(norm('مد'), 'أحمد')).toBe(1);
    expect(scoreText(norm('x'), '')).toBe(0);
  });

  it('العنوان أولى من الحقول الإضافية، والتام قبل البداية قبل الاحتواء', () => {
    const items = [
      { kind: 'participant', id: 1, title: 'سارة', keys: ['وزارة الأثر'] },
      { kind: 'org', id: 2, title: 'وزارة الأثر' },
      { kind: 'track', id: 3, title: 'مسار الأثر المستدام' },
    ];
    expect(rank('الأثر', items).map((x) => x.id)).toEqual([3, 2, 1]);
    expect(rank('وزارة الأثر', items).map((x) => x.id)).toEqual([2, 1]);
    expect(rank('س', items)).toEqual([]);
  });

  it('حد لكل نوع حتى لا تطغى فئة على البقية', () => {
    const many = Array.from({ length: 10 }, (_, i) => ({ kind: 'participant', id: i, title: `أحمد ${i}` }));
    expect(rank('أحمد', many, { perKind: 3 })).toHaveLength(3);
  });

  // تصور تشغيل الدفعة 2026-11-19: المشارك يُوجد بجواله بأي صيغة، والجوال ليس نصًا يُطابَق حرفيًا
  it('المشارك يُوجد بجواله: 05 و5 و9665 و+9665 وبمسافات وأرقام عربية', () => {
    const items = [
      { kind: 'participant', id: 1, title: 'سارة', keys: ['s@example.sa'], phone: '+966551234567' },
      { kind: 'participant', id: 2, title: 'خالد', keys: ['k@example.sa'], phone: '+966509876543' },
      { kind: 'org', id: 3, title: 'وزارة الأثر' },
    ];
    for (const q of ['0551234567', '551234567', '966551234567', '+966551234567', '055 123 4567', '٠٥٥١٢٣٤٥٦٧']) expect(rank(q, items).map((x) => x.id), q).toEqual([1]);
    expect(rank('05', items)).toEqual([]);
    expect(rank('0509', items).map((x) => x.id)).toEqual([2]);
    expect(rank('سارة', items).map((x) => x.id)).toEqual([1]);
  });
});
