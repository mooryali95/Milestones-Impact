// مركز البريد: الحصة كما يراها حارس الإرسال، والتشخيص، وحراس مصدر لما لا يُختبر بلا قاعدة
import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { dailySeries, diagnose, mailBudget, mailtoUrl, nextFreeAt, tally } from '../../supabase/functions/leaders-api/mail-center.js';
import { mailDecision } from '../../supabase/functions/_shared/mail-budget.js';

const src = (p) => readFileSync(join(process.cwd(), p), 'utf8');

describe('الحصة', () => {
  it('المتبقي وحصة الإشعارات والحالة، مطابقة لقرار الإرسال نفسه', () => {
    expect(mailBudget({ sent: 10, nonCode: 4 }, 80)).toMatchObject({ remaining: 70, codes: 6, nonCodeLimit: 40, nonCodeLeft: 36, state: 'ok', pct: 13 });
    expect(mailBudget({ sent: 56, nonCode: 10 }, 80).state).toBe('warn');
    expect(mailBudget({ sent: 50, nonCode: 40 }, 80)).toMatchObject({ nonCodeLeft: 0, state: 'share' });
    expect(mailBudget({ sent: 80, nonCode: 20 }, 80)).toMatchObject({ remaining: 0, state: 'full' });
    // ما تقوله الصفحة هو ما يفعله الحارس
    for (const c of [{ sent: 10, nonCode: 4 }, { sent: 50, nonCode: 40 }, { sent: 80, nonCode: 20 }, { sent: 79, nonCode: 39 }]) {
      const b = mailBudget(c, 80);
      expect(mailDecision('notify', c, 80).ok, JSON.stringify(c)).toBe(b.nonCodeLeft > 0);
      expect(mailDecision('code', c, 80).ok, JSON.stringify(c)).toBe(b.remaining > 0);
    }
  });
  it('الإشعارات لا تتجاوز المتبقي الكلي', () => {
    expect(mailBudget({ sent: 78, nonCode: 10 }, 80).nonCodeLeft).toBe(2);
  });
  it('أول تحرر للحصة: أقدم مُرسل + 24 ساعة', () => {
    expect(nextFreeAt(['2026-11-14T10:00:00Z', '2026-11-14T08:00:00Z'])).toBe('2026-11-15T08:00:00.000Z');
    expect(nextFreeAt([])).toBeNull();
  });
  it('السلسلة اليومية بتوقيت الرياض', () => {
    const now = Date.parse('2026-11-14T12:00:00Z');
    const s = dailySeries([{ created_at: '2026-11-13T22:30:00Z', status: 'sent' }, { created_at: '2026-11-14T09:00:00Z', status: 'blocked' }, { created_at: '2026-10-01T09:00:00Z', status: 'sent' }], 3, now);
    expect(s.map((d) => d.day)).toEqual(['2026-11-12', '2026-11-13', '2026-11-14']);
    expect(s[2]).toMatchObject({ sent: 1, blocked: 1 });   // 22:30 UTC = 01:30 الرياض في اليوم التالي
    expect(tally([{ kind: 'code' }, { kind: 'code' }, { kind: 'notify' }], 'kind')).toEqual({ code: 2, notify: 1 });
  });
});

describe('التشخيص', () => {
  const ok = { state: 'ok' };
  it('لا شيء أُرسل: يفرّق بين المسجل وغير المسجل', () => {
    expect(diagnose({ events: [], known: true }).title).toContain('لم تُرسل المنصة');
    expect(diagnose({ events: [], known: false }).title).toContain('غير مسجل');
  });
  it('المحجوب: الرمز يُعالج برابط يدوي حين يمتلئ السقف، والإشعار من الصندوق', () => {
    expect(diagnose({ events: [{ status: 'blocked', kind: 'code' }], budget: { state: 'full' } }).advice).toContain('رابط دخول');
    expect(diagnose({ events: [{ status: 'blocked', kind: 'code' }], budget: ok }).advice).toContain('طلب الرمز من جديد');
    expect(diagnose({ events: [{ status: 'blocked', kind: 'notify' }], budget: ok }).advice).toContain('لم يُرسل');
  });
  it('حالة التسليم عند المزوّد تحسم الحكم', () => {
    const ev = [{ status: 'sent', kind: 'code', resend_id: 're_1' }];
    expect(diagnose({ events: ev, delivery: { re_1: 'bounced' } }).tone).toBe('bad');
    expect(diagnose({ events: ev, delivery: { re_1: 'complained' } }).title).toContain('مزعج');
    expect(diagnose({ events: ev, delivery: { re_1: 'delivered' } })).toMatchObject({ tone: 'ok' });
    expect(diagnose({ events: ev, delivery: { re_1: 'delivered' } }).advice).toContain('غير المرغوب');
    expect(diagnose({ events: ev, delivery: {} }).tone).toBe('info');
    expect(diagnose({ events: [{ status: 'failed', kind: 'code' }] }).tone).toBe('bad');
  });
  it('قبل الترحيل: يقول إن البحث غير متاح بدل حكم خاطئ', () => {
    expect(diagnose({ events: [], traceable: false }).title).toContain('بصمة');
  });
  it('رابط البريد اليدوي مرمّز', () => {
    expect(mailtoUrl('a@x.sa', 'عنوان & أكثر', 'سطر\nثانٍ')).toBe('mailto:a%40x.sa?subject=%D8%B9%D9%86%D9%88%D8%A7%D9%86%20%26%20%D8%A3%D9%83%D8%AB%D8%B1&body=%D8%B3%D8%B7%D8%B1%0A%D8%AB%D8%A7%D9%86%D9%8D');
  });
});

describe('حراس المصدر', () => {
  const mail = src('supabase/functions/_shared/mail.ts');
  const mc = src('supabase/functions/leaders-api/mail-center.ts');
  const core = src('supabase/functions/leaders-api/core.ts');
  it('السجل يحفظ بصمة العنوان لا العنوان، والكتابة تتسامح مع عمود ناقص', () => {
    expect(mail).toContain('to_hash: await addressHash(to)');
    expect(mail).not.toMatch(/mail_events[^\n]*to_email|to_email: to[^\n]*eventsOf/);
    expect(mail).toMatch(/if \(error\) \(\{ error \} = await eventsOf\(client\)\.insert\(row\)\)/);
  });
  it('إرسال المدير اليدوي يبقى تحت السقف الكلي: force يتجاوز الحصة لا السقف', () => {
    expect(mail).toContain("mailDecision(force ? 'alert' : kind, counts, cap)");
    expect(mailDecision('alert', { sent: 80, nonCode: 0 }, 80).ok).toBe(false);
    expect(mailDecision('alert', { sent: 50, nonCode: 40 }, 80).ok).toBe(true);
  });
  it('الإشعار المحجوب يدخل الطابور، والرمز لا يُؤجَّل، والقديم يُترك', () => {
    expect(core).toContain("(kind === 'bulk' || kind === 'notify') && !attachments.length && await enqueueMail(");
    expect(core).toContain("last_error: 'stale'");
  });
  it('رابط الدخول اليدوي للمدير الأعلى وحده، ويُسجَّل، ولا لحساب موقوف', () => {
    const b = mc.slice(mc.indexOf('export async function loginLink'));
    expect(b.indexOf('requireSuper(a)')).toBeGreaterThan(-1);
    expect(b.indexOf('requireSuper(a)')).toBeLessThan(b.indexOf("from('email_challenges').insert"));
    expect(b).toContain('اكتب سبب إنشاء الرابط');
    expect(b).toContain("'mail.login-link'");
    expect(b).toContain("p.status === 'suspended'");
  });
  it('رمز الدخول لا يدخل السجل: عنوان رسالة الرمز لا يُحفظ', () => {
    expect(mail).toContain("subject: kind === 'code' ? null : String(subject || '').slice(0, 300)");
    // admin-api وuser-api تكتبان الرمز في العنوان ليُرى في إشعار الهاتف: لذلك لا يُحفظ عنوان أي رسالة رمز
    expect(src('supabase/functions/admin-api/index.ts')).toMatch(/sendEmail\(email, `[^`]*\$\{code\}[^`]*`, otpHtml\(code\), "code"\)/);
  });
  it('تشخيص العنوان ونص الرسالة المنتظرة (قد يحمل رابط دخول) مغلقان على المراقب في الخادم', () => {
    for (const fn of ['trace', 'queueBody']) {
      const b = mc.slice(mc.indexOf(`export async function ${fn}`), mc.indexOf('\n}\n', mc.indexOf(`export async function ${fn}`)));
      expect(b, fn).toContain('requireWrite(a)');
    }
    expect(mc).toContain('to_email: writer ? m.to_email : null');
  });
  it('الإرسال والإلغاء من الصندوق يفحصان صلاحية الكتابة ويُسجَّلان', () => {
    for (const fn of ['queueSend', 'queueCancel']) {
      const b = mc.slice(mc.indexOf(`export async function ${fn}`), mc.indexOf('\n}\n', mc.indexOf(`export async function ${fn}`)));
      expect(b, fn).toContain('requireWrite(a)');
      expect(b, fn).toContain("await audit('admin'");
    }
  });
});
