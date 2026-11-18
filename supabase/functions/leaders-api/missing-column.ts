// كتابة متسامحة: عمود لم يُرحَّل بعد (42703 أو PGRST204) وحده يبرر الإعادة بلا الأعمدة الجديدة، وأي خطأ غيره يُرد كما هو.
// خارج core.ts عمدًا: الكتابات المحروسة (ختم المحتوى في admin وkaton) لا تتسامح، واختبار content-ownership يحرس ذلك
export const missingColumn = (e: any) => !!e && (e.code === '42703' || e.code === 'PGRST204');
// جدول لم يُرحَّل بعد (42P01 من Postgres أو PGRST205 من PostgREST): للمسارات المتسامحة مع جدول جديد (إيصال المسح في activities.ts)
export const missingTable = (e: any) => !!e && (e.code === '42P01' || e.code === 'PGRST205');
