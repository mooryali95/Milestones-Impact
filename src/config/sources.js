// ════════════════════════════════════════════════════════════════
// سجلّ المصادر — من أين جاء كل طلب
// ════════════════════════════════════════════════════════════════
// المنظومة خمسة مشاريع على Cloudflare، وكل واحد قد يحمل نموذجاً
// يكتب في جدول. وكانت اللوحة تعرف مصدراً واحداً (مصفوفة التأثير)
// فلا يرى المستشار طلبات الموقع أصلاً.
//
// هذا السجلّ هو المصدر الوحيد للحقيقة: تُسجَّل فيه المصادر مرةً
// واحدة، فتعرضها اللوحة كلَّها بلا شيفرة خاصة بكل واحد. وإضافة
// نموذجٍ جديد غداً = مُدخَلٌ هنا، لا تبويبٌ جديد في اللوحة.
//
// ─ لماذا يحمل كل مصدر حقوله؟
// لأن اللوحة تصيّر الطلب من الوصف لا من معرفة مسبقة بشكله. فحقلٌ
// يُضاف إلى نموذجٍ في الموقع يظهر في اللوحة بلا لمس اللوحة.

// أنواع الحقول التي تعرفها اللوحة. النوع يحدّد كيف يُعرض لا كيف
// يُخزَّن: `long` يُلفّ في فقرة، و`badge` يُعرض شارةً، و`link`
// يصير رابطاً قابلاً للنقر.
export const FIELD = {
  TEXT: 'text',
  LONG: 'long',
  EMAIL: 'email',
  PHONE: 'phone',
  BADGE: 'badge',
  DATE: 'date',
  LINK: 'link',
};

// كل مصدر:
//   id        معرّف داخلي ثابت — لا يُغيَّر بعد النشر (الصلاحيات تُربط به)
//   product   قيمة عمود product في الجدول — بها نميّز الطلبات
//   nameAr    ما يقرؤه المستشار
//   whereAr   أين يعيش النموذج — الجواب على «من أين جاء هذا؟»
//   origin    مشروع Cloudflare، للتوضيح لا للمنطق
//   table     جدول القراءة
//   action    إجراء admin-api الذي يجلبه (الخادم يفرض الصلاحية)
//   color     من لوحة الهوية — يميّز المصدر بصرياً في القوائم المختلطة
//   fields    ما يُعرض، بالترتيب
//   statuses  دورة حياة الطلب، إن كان له واحدة
export const SOURCES = [
  {
    id: 'matrix',
    product: 'MI-MATRIX',
    nameAr: 'مصفوفة التأثير',
    whereAr: 'تطبيق المصفوفة — تسجيل وتخطيط المواعيد',
    origin: 'mi-matrix',
    table: 'registrations',
    action: 'list-regs',
    color: '#12414E',
    idKey: 'id',
    titleKey: 'name',
    dateKey: 'registeredAt',
    fields: [
      { key: 'name', labelAr: 'الاسم', type: FIELD.TEXT },
      { key: 'phone', labelAr: 'الجوال', type: FIELD.PHONE },
      { key: 'email', labelAr: 'البريد', type: FIELD.EMAIL },
      { key: 'registeredAt', labelAr: 'تاريخ التسجيل', type: FIELD.DATE },
      { key: 'submittedAt', labelAr: 'تاريخ التقديم', type: FIELD.DATE },
    ],
    statuses: [
      { id: 'planning', labelAr: 'قيد التخطيط', match: (r) => !r.submitted },
      { id: 'submitted', labelAr: 'مُقدَّم', match: (r) => !!r.submitted },
      { id: 'reopen', labelAr: 'طلب إعادة فتح', match: (r) => !!r.reopenRequested },
    ],
  },
  {
    id: 'home-contact',
    product: 'MI-HOME',
    nameAr: 'طلب تواصل استراتيجي',
    whereAr: 'الموقع الرئيسي — النموذج التفاعلي في الصفحة الأولى',
    origin: 'mi-home',
    table: 'contact_requests',
    action: 'list-contact-requests',
    color: '#A97A2E',
    idKey: 'id',
    titleKey: 'name',
    dateKey: 'created_at',
    fields: [
      { key: 'name', labelAr: 'الاسم', type: FIELD.TEXT },
      { key: 'organization', labelAr: 'الجهة', type: FIELD.TEXT },
      { key: 'email', labelAr: 'البريد', type: FIELD.EMAIL },
      { key: 'phone', labelAr: 'الجوال', type: FIELD.PHONE },
      { key: 'interest_label', labelAr: 'نوع الطلب', type: FIELD.BADGE },
      { key: 'context', labelAr: 'السياق', type: FIELD.LONG },
      { key: 'source_url', labelAr: 'الصفحة', type: FIELD.LINK },
      { key: 'created_at', labelAr: 'وصل في', type: FIELD.DATE },
    ],
    statuses: [
      { id: 'new', labelAr: 'جديد', match: (r) => (r.status || 'new') === 'new' },
      { id: 'contacted', labelAr: 'تمّ التواصل', match: (r) => r.status === 'contacted' },
      { id: 'closed', labelAr: 'مُغلق', match: (r) => r.status === 'closed' },
    ],
  },
];

export const sourceById = (id) => SOURCES.find((s) => s.id === id) || null;

// المنتجات التي تُربط بها الصلاحيات. مشتقّة من السجلّ لا مكرّرة عنه،
// فمصدرٌ جديد يصير قابلاً للتصريح تلقائياً.
export const PRODUCTS = SOURCES.map((s) => ({
  id: s.id,
  product: s.product,
  nameAr: s.nameAr,
  color: s.color,
}));
