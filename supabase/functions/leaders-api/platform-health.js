// ════════════════════════════════════════════════════════════════
// «صحة المنصة» في النظرة العامة للإدارة: خمسة فحوص تشغيلية بسطر علاج لكل منها (منطق خالص بلا قاعدة)
// ════════════════════════════════════════════════════════════════
// الخادم (system.ts platformHealth) يقرأ الحقائق، وهنا تُحكم وتُكتب بالعربية، فتقرؤها البطاقة (Overview.jsx) كما هي.
// level: ok (أخضر) أو warn (كهرماني) أو bad (أحمر) أو unknown (تعذّرت القراءة: لا يُقال «سليم» عما لم يُقرأ).
// لا يحمل قيمة سر: LEADERS_ALERT_EMAIL مضبوط أم لا فقط.

export const PLATFORM_CRON_JOB = 'leaders-expert-offers';
// الملخص اليومي يخرج مرة في يوم الرياض بعد الثامنة (model-digest.ts): أقدم من يومين يعني أن المهمة الساعية متوقفة أو تفشل
export const DIGEST_STALE_HOURS = 48;

const HOUR = 36e5;
const row = (key, label, level, line, remedy = '') => ({ key, label, level, line, remedy: level === 'ok' ? '' : remedy });

/**
 * @param {{ migrations?: { ledger: boolean, missing: string[] } | null, alertEmail?: boolean,
 *   cron?: { readable: boolean, exists?: boolean, active?: boolean, last_status?: string | null, last_run?: string | null } | null,
 *   digest?: { readable: boolean, last?: string | null } | null,
 *   sponsors?: { readable: boolean, without: { id: string, name: string }[] } | null }} f
 * @param {number} [now]
 */
export function platformChecks(f, now = Date.now()) {
  const out = [];
  // 1) الترحيلات
  const m = f.migrations;
  if (!m || !m.ledger) out.push(row('migrations', 'ترحيلات القاعدة', 'unknown', 'تعذّرت قراءة سجل الترحيلات', 'تحقق من وصول الخادم إلى leaders.schema_migrations، ثم أعد فتح الصفحة.'));
  else if (!m.missing.length) out.push(row('migrations', 'ترحيلات القاعدة', 'ok', 'كل الترحيلات مطبّقة'));
  else out.push(row('migrations', 'ترحيلات القاعدة', 'bad', `${m.missing.length} لم ${m.missing.length === 1 ? 'يُطبَّق' : 'تُطبَّق'}: ${m.missing.slice(0, 3).join('، ')}${m.missing.length > 3 ? '…' : ''}`,
    'شغّل سير «migrate» في GitHub Actions لتطبيقها على الإنتاج.'));
  // 2) بريد التنبيه
  out.push(f.alertEmail
    ? row('alert_email', 'بريد التنبيه', 'ok', 'LEADERS_ALERT_EMAIL مضبوط')
    : row('alert_email', 'بريد التنبيه', 'bad', 'LEADERS_ALERT_EMAIL غير مضبوط', 'اضبطه في أسرار دوال Supabase، فبدونه لا يصل فريق البرنامج ملخص النماذج ولا التنبيهات.'));
  // 3) المهمة الساعية
  const c = f.cron;
  if (!c || !c.readable) out.push(row('cron', 'المهمة الساعية', 'unknown', `تعذّرت قراءة حالة ${PLATFORM_CRON_JOB}`, 'طبّق ترحيل 20261128100000 أو راجع صلاحية قراءة cron.job من لوحة Supabase.'));
  else if (!c.exists) out.push(row('cron', 'المهمة الساعية', 'bad', `${PLATFORM_CRON_JOB} غير موجودة`, 'أعد تطبيق ترحيل المهمة (20261031110000) لجدولتها.'));
  else if (!c.active) out.push(row('cron', 'المهمة الساعية', 'bad', `${PLATFORM_CRON_JOB} موقوفة`, 'فعّلها من Database ← Cron في لوحة Supabase.'));
  else if (c.last_status && !['succeeded', 'running', 'starting'].includes(c.last_status)) out.push(row('cron', 'المهمة الساعية', 'warn', `آخر تشغيل: ${c.last_status}${c.last_run ? ` (${String(c.last_run).slice(0, 16).replace('T', ' ')})` : ''}`, 'افتح سجل تشغيلها في Database ← Cron وراجع الخطأ.'));
  else out.push(row('cron', 'المهمة الساعية', 'ok', c.last_status ? 'تعمل، وآخر تشغيل نجح' : 'مفعّلة'));
  // 4) آخر ملخص نماذج
  const d = f.digest;
  if (!d || !d.readable) out.push(row('digest', 'ملخص النماذج اليومي', 'unknown', 'تعذّرت قراءة آخر ملخص', 'أعد فتح الصفحة بعد قليل.'));
  else if (!d.last) out.push(row('digest', 'ملخص النماذج اليومي', 'warn', 'لم يُرسل ملخص بعد', 'يخرج بعد الثامنة صباحًا بتوقيت الرياض مع المهمة الساعية؛ إن مضى يوم تحقق منها.'));
  else if (now - Date.parse(d.last) > DIGEST_STALE_HOURS * HOUR) out.push(row('digest', 'ملخص النماذج اليومي', 'warn', `آخر ملخص ${String(d.last).slice(0, 10)}`, 'المهمة الساعية لم تُخرجه منذ يومين: تحقق منها ومن LEADERS_CRON_SECRET.'));
  else out.push(row('digest', 'ملخص النماذج اليومي', 'ok', `آخر ملخص ${String(d.last).slice(0, 10)}`));
  // 5) الجهات بلا رمز رعاية فعّال
  const s = f.sponsors;
  if (!s || !s.readable) out.push(row('sponsor_codes', 'رموز الرعاية', 'unknown', 'تعذّرت قراءة رموز الرعاية', 'إن لم يُطبَّق ترحيل رموز الرعاية (20261126100000) فطبّقه.'));
  else if (!s.without.length) out.push(row('sponsor_codes', 'رموز الرعاية', 'ok', 'لكل جهة نشطة رمز فعّال'));
  else out.push(row('sponsor_codes', 'رموز الرعاية', 'warn', `${s.without.length} ${s.without.length === 1 ? 'جهة' : 'جهات'} بلا رمز فعّال: ${s.without.slice(0, 3).map((o) => o.name).join('، ')}${s.without.length > 3 ? '…' : ''}`,
    'أنشئ رمزًا من ملف الجهة ← رموز الرعاية، إن كانت الجهة ترشّح مشاركين.'));
  return out;
}

// الحكم العام: أسوأ الصفوف (bad ثم warn ثم unknown ثم ok)
export function platformLevel(checks) {
  const order = ['bad', 'warn', 'unknown', 'ok'];
  for (const l of order) if ((checks || []).some((c) => c.level === l)) return l;
  return 'ok';
}
