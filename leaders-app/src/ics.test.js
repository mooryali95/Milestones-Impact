import { describe, it, expect } from 'vitest';
import { icsFor } from './ics.js';

describe('icsFor', () => {
  const ics = icsFor({ uid: 's1', title: 'ورشة المعالم، الجلسة 1', start: '2026-11-02T15:00:00Z', end: '2026-11-02T17:00:00Z', location: 'الرياض; القاعة 3', description: 'سطر\nثانٍ' });
  it('حدث واحد بتوقيت UTC وتذكيرين', () => {
    expect(ics).toContain('DTSTART:20261102T150000Z');
    expect(ics).toContain('DTEND:20261102T170000Z');
    expect(ics.match(/BEGIN:VALARM/g)).toHaveLength(2);
    expect(ics).toContain('TRIGGER:-P1D');
    expect(ics).toContain('UID:s1@leaders.sunkvalue.com');
  });
  it('يهرّب الفواصل والسطور ويستعمل CRLF', () => {
    expect(ics).toContain('SUMMARY:ورشة المعالم، الجلسة 1');
    expect(ics).toContain('LOCATION:الرياض\\; القاعة 3');
    expect(ics).toContain('DESCRIPTION:سطر\\nثانٍ');
    expect(ics.split('\r\n').length).toBeGreaterThan(10);
  });
  it('يطوي السطور الطويلة دون كسر الحروف العربية', () => {
    const long = icsFor({ uid: 'x', title: 'عنوان طويل '.repeat(20), start: '2026-11-02T15:00:00Z' });
    const lines = long.split('\r\n');
    for (const l of lines) expect(new TextEncoder().encode(l).length).toBeLessThanOrEqual(75);
    expect(long).toContain('DTEND:20261102T160000Z');
  });
});
