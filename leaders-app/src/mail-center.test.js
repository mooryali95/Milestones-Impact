// مركز البريد: الحصة كما يراها حارس الإرسال، والتشخيص، وحراس مصدر لما لا يُختبر بلا قاعدة
import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { dailySeries, diagnose, etaAr, etaDay, mailBudget, mailtoUrl, nextDrainAt, nextFreeAt, queueEta, tally } from '../../supabase/functions/leaders-api/mail-center.js';
import { etaCell } from '../../admin-app/src/screens/MailCenter.jsx';
import { mailLine } from '../../admin-app/src/screens/BulkApprove.jsx';
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
  it('تحرر الحصة: بداية يوم المزوّد التالي (03:00 بالرياض) إن أُرسل شيء اليوم', () => {
    const now = Date.parse('2026-11-14T12:00:00Z');
    expect(nextFreeAt(['2026-11-14T10:00:00Z', '2026-11-14T08:00:00Z'], now)).toBe('2026-11-15T00:00:00.000Z');
    expect(nextFreeAt(['2026-11-13T23:00:00Z'], now)).toBeNull();
    expect(nextFreeAt([], now)).toBeNull();
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
  it('إرسال المدير اليدوي يبقى تحت السقف الكلي: force يتجاوز الحصة لا السقف، ولا يأخذ احتياط التنبيه فوقه', () => {
    expect(mail).toContain("mailDecision(force ? 'code' : kind, counts, cap, { flush })");
    expect(mailDecision('code', { sent: 80, nonCode: 0 }, 80).ok).toBe(false);
    expect(mailDecision('code', { sent: 50, nonCode: 40 }, 80).ok).toBe(true);
    // التنبيه وحده يمر فوق السقف باحتياطه (P1-12)
    expect(mailDecision('alert', { sent: 80, nonCode: 0 }, 80).ok).toBe(true);
    expect(mailDecision('alert', { sent: 85, nonCode: 0 }, 80).ok).toBe(false);
  });
  it('الإشعار المحجوب يدخل الطابور، والرمز لا يُؤجَّل، والقديم يُترك', () => {
    expect(core).toContain("(kind === 'bulk' || kind === 'notify') && queueableAttachments(attachments) && await enqueueMail(");
    // رسالة بمرفق لا تُحفظ بلاه، والتفريغ والإرسال اليدوي يخرجانها بمرفقها
    expect(core).toContain("if (error) { console.error('mail_queue insert (attachments):', error); return false; }");
    expect(core).toContain("...(Array.isArray(m.attachments) && m.attachments.length ? { attachments: m.attachments } : {})");
    expect(src('supabase/functions/leaders-api/mail-center.ts')).toContain("...(Array.isArray(m.attachments) && m.attachments.length ? { attachments: m.attachments } : {})");
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

describe('متى يخرج المنتظر (queueEta)', () => {
  const now = Date.parse('2026-11-16T05:27:00Z');   // 08:27 بالرياض
  const hAgo = (h) => new Date(now - h * 36e5).toISOString();
  it('التشغيلة التالية في الدقيقة 17', () => {
    expect(new Date(nextDrainAt(Date.parse('2026-11-16T05:27:00Z'))).toISOString()).toBe('2026-11-16T06:17:00.000Z');
    expect(new Date(nextDrainAt(Date.parse('2026-11-16T05:17:00Z'))).toISOString()).toBe('2026-11-16T05:17:00.000Z');
  });
  // يوم 16 نوفمبر: النصيب 40 والسقف 80، والمساء (22:17 بالرياض) يتسع إلى السقف إلا 10
  const at = (iso) => new Date(Date.parse(iso)).toISOString();
  it('قبل المساء: ما بقي من النصيب في التشغيلة التالية، ثم تفريغ المساء 22:17 بالرياض، والإشعار قبل الجماعي', () => {
    const rows = [{ id: 'b', kind: 'bulk', created_at: hAgo(9) }, { id: 'n1', kind: 'notify', created_at: hAgo(2) }, { id: 'n2', kind: 'notify', created_at: hAgo(1) }];
    const eta = queueEta(rows, { budget: mailBudget({ sent: 50, nonCode: 39 }, 80), now });
    expect(eta.n1.at).toBe(at('2026-11-16T06:17:00Z'));
    // أُرسل 50 ثم واحد من الطابور: يتسع المساء لـ 70 - 51 = 19
    expect(eta.n2.at).toBe(at('2026-11-16T19:17:00Z'));
    expect(eta.b.at).toBe(at('2026-11-16T19:17:00Z'));
  });
  it('في المساء: التشغيلة التالية تأخذ ما بقي إلى السقف إلا 10، والباقي بعد تصفير الحصة 03:17 بالرياض', () => {
    const evening = Date.parse('2026-11-16T19:40:00Z');   // 22:40 بالرياض
    const rows = Array.from({ length: 25 }, (_, i) => ({ id: `r${i}`, kind: 'notify', created_at: hAgo(30 - i) }));
    const eta = queueEta(rows, { budget: mailBudget({ sent: 50, nonCode: 40 }, 80), now: evening });
    const by = (iso) => rows.filter((r) => eta[r.id].at === at(iso)).length;
    expect(by('2026-11-16T20:17:00Z')).toBe(20);
    expect(by('2026-11-17T00:17:00Z')).toBe(5);
    // بعد منتصف ليل UTC يوم جديد: النصيب كاملًا في 03:17 بالرياض
    const late = queueEta(rows.slice(0, 3), { budget: mailBudget({ sent: 80, nonCode: 40 }, 80), now: Date.parse('2026-11-16T23:30:00Z') });
    expect(late.r0.at).toBe(at('2026-11-17T00:17:00Z'));
  });
  it('أكثر من يوم: 40 في 03:17 و30 في 22:17 من كل يوم تالٍ، ولا يُترك', () => {
    const rows = Array.from({ length: 150 }, (_, i) => ({ id: `r${i}`, kind: 'notify', created_at: new Date(now - 1e6 + i).toISOString() }));
    const eta = queueEta(rows, { budget: mailBudget({ sent: 80, nonCode: 40 }, 80), now });
    const count = (iso) => rows.filter((r) => eta[r.id].at === at(iso)).length;
    expect(count('2026-11-17T00:17:00Z')).toBe(40);
    expect(count('2026-11-17T19:17:00Z')).toBe(30);
    expect(count('2026-11-18T00:17:00Z')).toBe(40);
    expect(count('2026-11-18T19:17:00Z')).toBe(30);
    expect(count('2026-11-19T00:17:00Z')).toBe(10);
    expect(Object.values(eta).every((e) => e.at && !e.expires)).toBe(true);
  });
  it('ما أُرسل بقرار المدير فوق النصيب لا يفتح مكانًا قبل المساء', () => {
    const eta = queueEta([{ id: 'a', kind: 'notify', created_at: hAgo(1) }], { budget: mailBudget({ sent: 50, nonCode: 46 }, 80), now });
    expect(eta.a.at).toBe(at('2026-11-16T19:17:00Z'));
  });
  it('المؤرخ الذي يمضي موعده قبل دوره يُعلَّم، وبلا سقف معروف: لا موعد بعد ما بقي الآن', () => {
    const eta = queueEta([{ id: 'x', kind: 'bulk', created_at: hAgo(1), expires_at: new Date(now + 36e5).toISOString() }], { budget: mailBudget({ sent: 80, nonCode: 40 }, 80), now });
    expect(eta.x.expires).toBe(true);
    expect(queueEta([{ id: 'y', kind: 'notify' }], { budget: { nonCodeLeft: 0 }, now }).y).toEqual({ at: null, expires: false });
  });
  it('اليوم والغد بتوقيت الرياض بالعربية', () => {
    expect(etaDay('2026-11-16T18:00:00Z', now)).toBe('today');
    expect(etaDay('2026-11-16T22:00:00Z', now)).toBe('tomorrow');   // 01:00 بالرياض يوم 17
    expect(etaAr('2026-11-17T05:17:00Z', now)).toBe('غدًا نحو 08:17');
    expect(etaAr(null)).toBe('حين تتحرر الحصة');
  });
});

describe('العرض في اللوحة', () => {
  it('خانة «يُتوقع إرساله»: الممسَك، والمؤرخ الذي يُترك، والموعد', () => {
    expect(etaCell({ state: 'waiting', held: true })).toContain('ممسَك');
    expect(etaCell({ state: 'waiting', eta: '2026-11-17T05:17:00Z', eta_expires: true })).toMatch(/^يُترك/);
    expect(etaCell({ state: 'waiting', eta: null })).toBe('حين تتحرر الحصة');
    expect(etaCell({ state: 'stale' })).toBe('·');
  });
  it('سطر البريد قبل تأكيد الاعتماد الجماعي دائمًا، والمنتظر بموعد آخره، والاعتماد ظاهر في الرحلة', () => {
    expect(mailLine({ now: 14, queued: 0, clear_at: null })).toMatch(/^سيصل 14 بريدًا الآن/);
    const q = mailLine({ now: 0, queued: 14, clear_at: '2026-11-17T05:17:00Z' });
    expect(q).toContain('سيصل 14 بريدًا: 0 الآن، والباقي 14 ينتظر في صندوق «لم يُرسل»');
    expect(mailLine({ now: 0, queued: 14, tonight: 14, later: 0, clear_at: '2026-11-16T19:17:00Z' })).toContain('ويخرج آليًّا الليلة من 22:17');
    expect(mailLine({ now: 2, queued: 50, tonight: 30, later: 20, clear_at: '2026-11-17T00:17:00Z' })).toContain('(30 الليلة من 22:17، و20 بعدها)');
    expect(q).toContain('ويرى كل واحد اعتماده في رحلته فورًا');
    expect(mailLine({ now: 0, queued: 3 }, false)).toMatch(/^تعذّرت قراءة حصة البريد/);
    for (const t of [q, mailLine(null)]) expect(t).not.toMatch(/[\u2013\u2014]/);
  });
  it('الصندوق يقرأ كل منتظر بلا حد الأسبوع، والمتروك بآخر أسبوع، ونص المساعدة بلا قاعدة اليومين', () => {
    const center = src('supabase/functions/leaders-api/mail-center.ts');
    expect(center).toMatch(/\.is\('sent_at', null\)\.is\('gave_up_at', null\)\.order\('created_at', \{ ascending: false \}\)\.limit\(500\)/);
    expect(center).toMatch(/\.not\('gave_up_at', 'is', null\)\.gte\('gave_up_at', week\)/);
    const ui = src('admin-app/src/screens/MailCenter.jsx');
    expect(ui).not.toContain('يومين');
    expect(ui).toContain('يُتوقع إرساله');
  });
});
