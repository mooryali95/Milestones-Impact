// قالب البريد: العائلات وسطر المعاينة ودعوة التقويم
import { describe, expect, it } from 'vitest';
import { icsEvent, MAIL_FAMILY, mailShell } from '../../supabase/functions/_shared/mail.ts';

const dec = (b64) => new TextDecoder().decode(Uint8Array.from(atob(b64), (c) => c.charCodeAt(0)));

describe('البريد', () => {
  it('العائلة تضع سطرها، وسطر المعاينة مخفي داخل الرسالة', () => {
    const h = mailShell('عنوان', '<p>نص</p>', { family: 'sessions', preheader: 'غدًا 10:00' });
    expect(h).toContain(MAIL_FAMILY.sessions);
    expect(h).toMatch(/display:none[^>]*>غدًا 10:00/);
  });
  it('دعوة التقويم صحيحة ومهرّبة، وبتنبيه قبل نصف ساعة', () => {
    const r = icsEvent({ uid: 'x1', start: '2026-11-02T07:00:00Z', end: '2026-11-02T07:45:00Z', title: 'جلسة، مع; د. منى', url: 'https://meet.example/x' });
    const t = dec(r.content);
    expect(r.filename).toBe('session.ics');
    expect(t).toContain('DTSTART:20261102T070000Z');
    expect(t).toContain('DTEND:20261102T074500Z');
    expect(t).toContain('SUMMARY:جلسة، مع\\; د. منى');
    expect(t).toContain('TRIGGER:-PT30M');
    expect(t.split('\r\n').at(-2)).toBe('END:VCALENDAR');
  });
});
