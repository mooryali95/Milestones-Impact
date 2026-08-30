import { LocalSession, AdminSession } from './session';

// ════════════════════════════════════════════════════════════════
// الجلسات المحفوظة محلياً
// ════════════════════════════════════════════════════════════════
// انتهاء الصلاحية هنا حدٌّ أمني: جلسة المستخدم 24 ساعة والمدير 4.
// وهو منطق يفشل صامتاً — لا شيء يصرخ إن بقيت الجلسة حيّة أطول
// مما ينبغي — فيستحق تغطية صريحة.

const HOUR = 60 * 60 * 1000;

beforeEach(() => {
  localStorage.clear();
  vi.useRealTimers();
});

describe('LocalSession', () => {
  const save = (over = {}) => LocalSession.save(
    over.user ?? { name: 'عمر', phone: '0512345678', email: 'a@b.co' },
    'sess-1', { 'creation-1': '2026-09-01' }, { 'creation-1': true }, false, false, 'tok-1',
  );

  it('تحفظ ثم تُستعاد كما هي', () => {
    save();
    const s = LocalSession.load();
    expect(s.sessionId).toBe('sess-1');
    expect(s.token).toBe('tok-1');
    expect(s.user.name).toBe('عمر');
    expect(s.dates).toEqual({ 'creation-1': '2026-09-01' });
    expect(s.confirmed).toEqual({ 'creation-1': true });
  });

  it('تعيد null حين لا شيء محفوظ', () => {
    expect(LocalSession.load()).toBeNull();
  });

  it('تبقى حيّة قبل 24 ساعة', () => {
    save();
    vi.useFakeTimers();
    vi.setSystemTime(Date.now() + 23 * HOUR);
    expect(LocalSession.load()).not.toBeNull();
  });

  it('تنتهي بعد 24 ساعة وتُمحى من التخزين', () => {
    save();
    vi.useFakeTimers();
    vi.setSystemTime(Date.now() + 25 * HOUR);
    expect(LocalSession.load()).toBeNull();
    // لا يكفي أن تُرفض؛ يجب ألا تبقى على القرص.
    expect(localStorage.getItem('mi_local_session')).toBeNull();
  });

  it('ترفض حمولةً بلا savedAt', () => {
    // شكلٌ من إصدار أقدم أو تلاعب يدوي — لا سبيل لمعرفة عمرها.
    localStorage.setItem('mi_local_session', JSON.stringify({ token: 'x' }));
    expect(LocalSession.load()).toBeNull();
  });

  it('ترفض JSON فاسداً بدل أن ترمي', () => {
    localStorage.setItem('mi_local_session', '{ليس JSON');
    expect(() => LocalSession.load()).not.toThrow();
    expect(LocalSession.load()).toBeNull();
  });

  it('update تدمج الحقول وتجدّد الطابع الزمني', () => {
    save();
    const before = LocalSession.load().savedAt;
    vi.useFakeTimers();
    vi.setSystemTime(Date.now() + 2 * HOUR);
    LocalSession.update({ submitted: true });
    const after = LocalSession.load();
    expect(after.submitted).toBe(true);
    expect(after.sessionId).toBe('sess-1');   // البقية سليمة
    expect(after.savedAt).toBeGreaterThan(before);
  });

  it('update على لا شيء لا تُنشئ جلسة', () => {
    LocalSession.update({ submitted: true });
    expect(localStorage.getItem('mi_local_session')).toBeNull();
  });

  it('clear تمحو', () => {
    save();
    LocalSession.clear();
    expect(LocalSession.load()).toBeNull();
  });
});

describe('AdminSession', () => {
  it('تحفظ الرمز وتعيده', () => {
    AdminSession.save('admin-tok');
    expect(AdminSession.load()).toBe('admin-tok');
  });

  it('تبقى حيّة قبل 4 ساعات', () => {
    AdminSession.save('admin-tok');
    vi.useFakeTimers();
    vi.setSystemTime(Date.now() + 3 * HOUR);
    expect(AdminSession.load()).toBe('admin-tok');
  });

  it('تنتهي بعد 4 ساعات — أقصر من جلسة المستخدم عن قصد', () => {
    AdminSession.save('admin-tok');
    vi.useFakeTimers();
    vi.setSystemTime(Date.now() + 5 * HOUR);
    expect(AdminSession.load()).toBeNull();
    expect(localStorage.getItem('mi_admin_session')).toBeNull();
  });

  it('ترفض JSON فاسداً', () => {
    localStorage.setItem('mi_admin_session', 'x{');
    expect(AdminSession.load()).toBeNull();
  });

  it('جلستا المستخدم والمدير مستقلّتان', () => {
    AdminSession.save('admin-tok');
    LocalSession.save({ name: 'ع' }, 's', {}, {}, false, false, 't');
    AdminSession.clear();
    expect(AdminSession.load()).toBeNull();
    expect(LocalSession.load()).not.toBeNull();
  });
});
