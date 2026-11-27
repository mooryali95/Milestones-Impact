import { describe, expect, it } from 'vitest';
import { attendanceButton } from './attendance-button.js';

const NOW = Date.parse('2026-11-20T10:00:00Z');
const past = { starts_at: '2026-11-18T06:00:00Z', ends_at: '2026-11-18T12:00:00Z', attended: 3, expected: 10 };

describe('زر الحضور (المرحلة 12)', () => {
  it('يقول ما يفتح بالحاضر من المتوقع لمن يكتب، و«عرض الحضور» لمن يقرأ', () => {
    expect(attendanceButton(past, { canWrite: true, now: NOW })).toEqual({ label: 'سجّل الحضور (3 من 10)', disabled: false, reason: null });
    expect(attendanceButton(past, { canWrite: false, now: NOW }).label).toBe('عرض الحضور (3 من 10)');
  });
  it('بلا متوقع في الرد (خادم أقدم أو تعذّر) يبقى العدد وحده', () => {
    expect(attendanceButton({ ...past, expected: undefined, attended: 0 }, { canWrite: true, now: NOW }).label).toBe('سجّل الحضور (0)');
  });
  it('يُعطل لغير المؤرخة وحدها بسبب ظاهر، والمستقبلية تفتح لعرض المتوقعين', () => {
    const future = { starts_at: '2026-11-25T06:00:00Z', ends_at: '2026-11-25T12:00:00Z', attended: 0, expected: 4 };
    expect(attendanceButton(future, { canWrite: true, now: NOW })).toEqual({ label: 'سجّل الحضور (0 من 4)', disabled: false, reason: null });
    expect(attendanceButton({ attended: 0 }, { canWrite: true, now: NOW }).reason).toBe('يُفتح بعد تحديد الموعد');
    expect(attendanceButton({ attended: 2 }, { canWrite: true, now: NOW }).disabled).toBe(false);
  });
});
