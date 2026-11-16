// صحة البريد والتنبيه: العتبات التي تحكم بلون البطاقة والشريط (ops-health.js)، ومتى يُسأل الخادم (ops-watch.js)
import { agoAr, attemptsAr, codeStreak, countAr, lostCodesAr, meterLevel, minutesAr, OPS, opsVerdict, slackHint, slackLabel, TITLE_AR } from '../../supabase/functions/leaders-api/ops-health.js';
import { alertTestText } from './OpsHealth.jsx';
import { dueIn, POLL_MS } from './ops-watch.js';

const NOW = Date.parse('2026-11-15T12:00:00Z');
const ago = (m) => new Date(NOW - m * 60e3).toISOString();
const healthy = (over = {}) => ({
  success: true, at: ago(0),
  mail: { key: true, cap: 80, sent: 12, codes: { sent: 9, failed: 0, blocked: 0 }, code_streak: { count: 0, since: null, last_at: ago(3), last_ok_at: ago(3), open: false }, failed_24h: 0, blocked_24h: 0, queue: { waiting: 0, oldest_minutes: 0 }, ...over.mail },
  slack: { configured: true, missing: [], readable: true, ok_at: ago(4), error_at: null, error: null, ...over.slack },
  alerts: { email: true, webhook: true, ...over.alerts },
});
const keys = (v) => v.issues.map((i) => i.key);

describe('opsVerdict: الأخضر', () => {
  it('كل شيء يعمل: أخضر بلا شريط', () => {
    const v = opsVerdict(healthy(), NOW);
    expect(v).toMatchObject({ level: 'green', label: 'يعمل', banner: null, issues: [] });
  });
  it('سلاك غير مضبوط كليًا خيار لا عطل، وقناة تنبيه واحدة تكفي', () => {
    expect(opsVerdict(healthy({ slack: { configured: false, missing: ['LEADERS_SLACK_BOT_TOKEN', 'LEADERS_SLACK_CHANNEL'] }, alerts: { email: false } }), NOW).level).toBe('green');
  });
  it('خطأ سلاك قديم تلاه نجاح لا يُحسب', () => {
    expect(opsVerdict(healthy({ slack: { error: 'invalid_auth', error_at: ago(30), ok_at: ago(5) } }), NOW).level).toBe('green');
  });
  it('رموز تعذّرت أمس وعادت (أقل من حد المتابعة) لا تلوّن', () => {
    expect(opsVerdict(healthy({ mail: { codes: { sent: 30, failed: 1, blocked: 1 } } }), NOW).level).toBe('green');
  });
});

describe('opsVerdict: الكهرماني', () => {
  it('اقتراب السقف من 70٪ فأكثر', () => {
    expect(keys(opsVerdict(healthy({ mail: { sent: 55 } }), NOW))).toEqual([]);
    const v = opsVerdict(healthy({ mail: { sent: 56 } }), NOW);
    expect(v.level).toBe('amber');
    expect(keys(v)).toEqual(['mail_near']);
    expect(v.banner).toBeNull();
  });
  it('رمز أو رمزان لم يصلا للتو: متابعة لا عطل', () => {
    const v = opsVerdict(healthy({ mail: { code_streak: { count: 2, since: ago(8), last_at: ago(2), open: false } } }), NOW);
    expect(v.level).toBe('amber');
    expect(v.issues[0].text).toBe('آخر رمزي دخول لم يصلا (تعذّرا أو حُجبا)');
    const one = opsVerdict(healthy({ mail: { code_streak: { count: 1, since: ago(2), last_at: ago(2), open: false } } }), NOW);
    expect(one.issues[0].text).toBe('آخر رمز دخول لم يصل (تعذّر أو حُجب)');
  });
  it('سلسلة فشل قديمة (أكثر من ساعة) لا تُحسب عطلًا قائمًا، ويبقى عدد اليوم للمتابعة', () => {
    const v = opsVerdict(healthy({ mail: { codes: { sent: 3, failed: 4, blocked: 0 }, code_streak: { count: 4, since: ago(200), last_at: ago(90), open: false } } }), NOW);
    expect(v.level).toBe('amber');
    expect(keys(v)).toEqual(['codes_lost_day']);
  });
  it('رفض المزوّد، والطابور المتأخر ست ساعات، وتعذّر العداد والطابور', () => {
    const f = opsVerdict(healthy({ mail: { failed_24h: 2 } }), NOW);
    expect(keys(f)).toEqual(['mail_failed']);
    expect(f.issues[0].text).toBe('تعذّر إرسال 2 من الرسائل غير رموز الدخول في آخر 24 ساعة');
    expect(f.issues[0].hint).not.toMatch(/^راجع حالة النطاق/);
    expect(keys(opsVerdict(healthy({ mail: { queue: { waiting: 4, oldest_minutes: OPS.queueWatchHours * 60 - 1 } } }), NOW))).toEqual([]);
    const q = opsVerdict(healthy({ mail: { queue: { waiting: 4, oldest_minutes: 7 * 60 } } }), NOW);
    expect(q.issues[0].text).toBe('طابور البريد: 4 تنتظر، أقدمها منذ 7 ساعات');
    expect(keys(opsVerdict(healthy({ mail: { sent: null, queue: { waiting: null, oldest_minutes: null } } }), NOW))).toEqual(['mail_counter', 'queue_unread']);
  });
  it('لا قناة تنبيه أصلًا، وسلاك وحده قناة تكفي', () => {
    const none = { configured: false, missing: ['LEADERS_SLACK_BOT_TOKEN', 'LEADERS_SLACK_CHANNEL'] };
    expect(keys(opsVerdict(healthy({ slack: none, alerts: { email: false, webhook: false, slack: false } }), NOW))).toEqual(['no_alert_channel']);
    expect(opsVerdict(healthy({ alerts: { email: false, webhook: false, slack: true } }), NOW).level).toBe('green');
  });
  it('رموز مصفوفة التأثير المحجوبة بنصيبها: متابعة بسطرها، لا عطل دخول ولا شريط', () => {
    const v = opsVerdict(healthy({ mail: { sent: 30, codes: { sent: 9, failed: 0, blocked: 0, matrix_blocked: 5 } } }), NOW);
    expect(v.level).toBe('amber');
    expect(keys(v)).toEqual(['matrix_share']);
    expect(v.banner).toBeNull();
    // السجل لا يفرق بين حجب النصيب وحجب السقف الكلي (ما حُجب بالسقف يبقى في النافذة بعد أن تخف)، فالنص لا ينسبه للنصيب وحده
    expect(v.issues[0].text).toBe('حُجب 5 من رموز دخول مصفوفة التأثير في آخر 24 ساعة (لبلوغ نصيبها أو السقف اليومي)');
    expect(v.issues[0].hint).toContain('وإن امتلأ السقف كله حُجبت معه');
    expect(v.issues[0].hint).toContain('لا يمس دخول القادة');
    // السقف ممتلئ: سطره الأحمر يكفي
    expect(keys(opsVerdict(healthy({ mail: { sent: 80, codes: { sent: 9, failed: 0, blocked: 0, matrix_blocked: 5 } } }), NOW))).toEqual(['mail_cap']);
  });
  it('سلاك: آخر نشر تعذّر برمزه وإرشاد إصلاحه، ونصف ضبط بالسر الناقص', () => {
    const v = opsVerdict(healthy({ slack: { error: 'not_in_channel', error_at: ago(2), ok_at: ago(30) } }), NOW);
    expect(v.level).toBe('amber');
    expect(v.issues[0]).toMatchObject({ key: 'slack_error', text: 'آخر نشر في سلاك تعذّر: البوت ليس عضوًا في القناة', code: 'not_in_channel' });
    expect(v.issues[0].text).not.toMatch(/[a-z_]{4,}/);
    expect(v.issues[0].hint).toContain('إضافة تطبيق');
    expect(slackLabel('something_new')).toBe('رفض سلاك النشر');
    const never = opsVerdict(healthy({ slack: { error: 'invalid_auth', error_at: ago(2), ok_at: null } }), NOW);
    expect(never.issues[0].hint).toContain('LEADERS_SLACK_BOT_TOKEN');
    const half = opsVerdict(healthy({ slack: { configured: false, missing: ['LEADERS_SLACK_CHANNEL'] } }), NOW);
    expect(half.issues[0].text).toBe('سلاك نصف مضبوط: ينقص السر LEADERS_SLACK_CHANNEL');
  });
});

describe('opsVerdict: الأحمر والشريط', () => {
  it('ثلاثة رموز متتالية لم تصل خلال الساعة: عطل بالمدة منذ أولها', () => {
    const v = opsVerdict(healthy({ mail: { code_streak: { count: 3, since: ago(20), last_at: ago(1), open: false } } }), NOW);
    expect(v.level).toBe('red');
    expect(v.label).toBe('عطل الآن');
    // الجملة في منطقة التنبيه ثابتة، والمدة بجوارها: لا يتغير نص التنبيه كل دقيقة فيعاد على قارئ الشاشة
    expect(v.banner).toBe('البريد متوقف: رموز الدخول لا تصل');
    expect(v.bannerSince).toBe('منذ 20 دقيقة');
    const later = opsVerdict(healthy({ mail: { code_streak: { count: 3, since: ago(21), last_at: ago(1), open: false } } }), NOW);
    expect(later.banner).toBe(v.banner);
    expect(later.bannerSince).toBe('منذ 21 دقيقة');
    expect(v.issues[0].text).toBe('رموز الدخول لا تصل منذ 20 دقيقة: آخر 3 محاولات تعذّرت أو حُجبت متتالية');
  });
  it('عدد المحاولات بالعربية: التمييز المفرد من 11، و«أو أكثر» بعد المعدود حين يتجاوز ما قُرئ', () => {
    const at = (count, open) => opsVerdict(healthy({ mail: { code_streak: { count, since: ago(20), last_at: ago(1), open } } }), NOW).issues[0].text;
    expect(at(12, false)).toContain('آخر 12 محاولة تعذّرت');
    expect(at(OPS.codeWindow, true)).toContain(`آخر ${OPS.codeWindow} محاولة أو أكثر تعذّرت`);
    expect(at(5, true)).toContain('آخر 5 محاولات أو أكثر تعذّرت');
    expect([1, 2, 3, 10, 11, 20].map(attemptsAr)).toEqual(['محاولة واحدة', 'محاولتان', '3 محاولات', '10 محاولات', '11 محاولة', '20 محاولة']);
    expect(lostCodesAr(4)).toBe('آخر 4 رموز دخول لم تصل (تعذّرت أو حُجبت)');
    expect(lostCodesAr(12)).toBe('آخر 12 رمز دخول لم تصل (تعذّرت أو حُجبت)');
  });
  it('لون العداد من عتبة الحكم نفسها لا من النسبة المقربة', () => {
    // 695 من 1000 تُقرَّب 70٪ لكنها دون عتبة الحكم (700): البطاقة خضراء والعداد بلا لون تنبيه
    const below = opsVerdict(healthy({ mail: { cap: 1000, sent: 695 } }), NOW);
    expect(below.level).toBe('green');
    expect(meterLevel(below)).toBe('');
    expect(meterLevel(opsVerdict(healthy({ mail: { cap: 1000, sent: 700 } }), NOW))).toBe('near');
    expect(meterLevel(opsVerdict(healthy({ mail: { cap: 1000, sent: 1000 } }), NOW))).toBe('full');
    expect(meterLevel(null)).toBe('');
  });
  it('امتلاء السقف', () => {
    const v = opsVerdict(healthy({ mail: { sent: 80 } }), NOW);
    expect(v.level).toBe('red');
    expect(keys(v)).toEqual(['mail_cap']);
    expect(v.banner).toContain('بلغ السقف اليومي');
  });
  it('لا مفتاح بريد: يتقدم الشريط، والكهرماني بعد الأحمر', () => {
    const v = opsVerdict(healthy({ mail: { key: false, failed_24h: 1 }, slack: { configured: false, missing: ['LEADERS_SLACK_BOT_TOKEN', 'LEADERS_SLACK_CHANNEL'] }, alerts: { email: false, webhook: false } }), NOW);
    expect(keys(v)).toEqual(['mail_key', 'mail_failed', 'no_alert_channel']);
    expect(v.banner).toBe('البريد متوقف: مفتاح البريد غير مضبوط، ورموز الدخول لا تخرج');
    expect(v.bannerSince).toBeNull();
  });
  it('الحكم نفسه للبطاقة والشريط: الكهرماني بلا شريط', () => {
    for (const f of [healthy(), healthy({ mail: { sent: 60 } }), healthy({ mail: { sent: 80 } })]) {
      const v = opsVerdict(f, NOW);
      expect(v.banner != null).toBe(v.level === 'red');
    }
  });
});

describe('الأدوات', () => {
  it('codeStreak من الأحدث حتى أول نجاح', () => {
    expect(codeStreak([{ status: 'failed', created_at: 'c' }, { status: 'blocked', created_at: 'b' }, { status: 'sent', created_at: 'a' }, { status: 'failed', created_at: 'z' }]))
      .toEqual({ count: 2, since: 'b', last_at: 'c', last_ok_at: 'a', open: false });
    expect(codeStreak([])).toEqual({ count: 0, since: null, last_at: null, last_ok_at: null, open: false });
  });
  it('الدقائق والساعات بالعربية', () => {
    expect([1, 2, 5, 20, 60, 125].map(minutesAr)).toEqual(['دقيقة', 'دقيقتين', '5 دقائق', '20 دقيقة', 'ساعة', 'ساعتين']);
    expect(agoAr(ago(0.2), NOW)).toBe('الآن');
    expect(agoAr(ago(14), NOW)).toBe('منذ 14 دقيقة');
    expect(agoAr(ago(3000), NOW)).toBeNull();
    expect(slackHint('something_new')).toContain('سجل الدالة');
  });
  it('عدد الأمور بالعربية، وعنوان الكهرماني لا يناقض العدد', () => {
    expect([1, 2, 3, 10, 11, 25].map(countAr)).toEqual(['أمر واحد', 'أمران', '3 أمور', '10 أمور', '11 أمرًا', '25 أمرًا']);
    expect(TITLE_AR.amber).toBe('البريد والتنبيه: يحتاج متابعتك');
  });
  it('أين ذهب التنبيه التجريبي: سلاك قناة وإن لم يُضبط الرابط ولا البريد', () => {
    const none = { webhook: false, email: false };
    expect(alertTestText({ channels: { ...none, slack: true }, delivered: none }, true)).toEqual({ bad: false, text: 'أُرسل إلى سلسلة التنبيهات في سلاك، وهو قناة التنبيه الوحيدة المضبوطة.' });
    expect(alertTestText({ channels: { ...none, slack: false }, delivered: none }, false).bad).toBe(true);
    expect(alertTestText({ channels: { webhook: true, email: true, slack: true }, delivered: { webhook: true, email: false } }, true).text)
      .toBe('وصل التنبيه التجريبي عبر: رابط التنبيه. وأُرسل إلى سلسلة التنبيهات في سلاك.');
  });
  it('التنبيه التجريبي بنتيجة سلاك الفعلية: وصل منه، أو لم يصل منه وهو مضبوط', () => {
    const ch = { webhook: false, email: false, slack: true };
    expect(alertTestText({ channels: ch, delivered: { webhook: false, email: false, slack: true } }, true))
      .toEqual({ bad: false, text: 'وصل التنبيه التجريبي عبر: سلسلة التنبيهات في سلاك.' });
    expect(alertTestText({ channels: ch, delivered: { webhook: false, email: false, slack: false } }, true))
      .toEqual({ bad: true, text: 'ضُبط سلسلة التنبيهات في سلاك ولم يصل التنبيه منه: راجع القيمة في أسرار الدالة.' });
    expect(alertTestText({ channels: { webhook: true, email: false, slack: true }, delivered: { webhook: true, email: false, slack: false } }, true).text)
      .toBe('وصل التنبيه التجريبي عبر: رابط التنبيه. ولم يصل عبر سلسلة التنبيهات في سلاك: راجع القيمة في أسرار الدالة.');
    expect(alertTestText({ channels: { webhook: false, email: false, slack: false }, delivered: { webhook: false, email: false, slack: false } }, false).bad).toBe(true);
  });
  it('السؤال كل 60 ثانية والصفحة ظاهرة، ولا سؤال وهي مخفية', () => {
    expect(POLL_MS).toBe(60e3);
    expect(dueIn(NOW - 10e3, NOW, true)).toBe(50e3);
    expect(dueIn(NOW - 90e3, NOW, true)).toBe(0);
    expect(dueIn(NOW, NOW, false)).toBeNull();
  });
});
