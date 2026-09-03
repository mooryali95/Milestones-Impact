# عقد `admin-api` — الإجراءات التي تحتاجها اللوحة الجديدة

اللوحة مبنيّة على هذا العقد. **حتى تُنفَّذ هذه الإجراءات، تعرض اللوحة حالةً صريحة** — «الخادم لا يدعم هذا بعد» بنصّ ظاهر — لا شاشةً فارغة. فالنشر قبل تنفيذ الخادم لا يكسر شيئاً، ولا يكذب على المستشار.

## القاعدة الحاكمة

> **إخفاء زرٍّ في المتصفّح ليس منعاً.**

`src/lib/permissions.js` يحكم ما *يُعرض*. من يملك رمز جلسة يستطيع نداء `admin-api` مباشرةً بأي إجراء. **فكل إجراء أدناه عليه أن يُعيد فحص إذن صاحب الرمز في الخادم قبل أن يردّ ببيانات** — لا يكفي أنه لم يظهر له زرّ.

## شكل الردّ

```jsonc
{ "success": true,  "<dataKey>": [...] }
{ "success": false, "code": "unsupported_action", "message": "..." }
{ "success": false, "code": "forbidden",          "message": "..." }
{ "success": false,                                "message": "..." }   // خطأ عام
```

`code` هو ما يميّز الحالات في `classify()` بـ `src/lib/api.js`. **بلا `code` تُعرض كلّها خطأً عاماً برسالة الخادم** — وهذا مقبول، لكن `unsupported_action` و`forbidden` يجعلان الرسالة أدقّ.

---

## الإجراءات

### `whoami`

الأساس. اللوحة تنادي هذا أول ما تفتح، ولا تعرض شيئاً قبل أن يصل.

**الطلب:** `{ action: "whoami", token }`

```jsonc
{
  "success": true,
  "email": "omar@sunkvalue.com",
  "permissions": {
    "manage_access": true,
    "sources": {
      "matrix":       ["view", "edit", "export", "delete"],
      "home-contact": ["view"]
    }
  }
}
```

مفاتيح `sources` هي `id` في `src/config/sources.js`. القيم من `CAN` في `src/lib/permissions.js`: `view` · `edit` · `export` · `delete`.

> **إذنٌ لا تعرفه الواجهة يُسقَط بصمت** (`normalize` تُرشّح). فلا تخترع أسماء أذونات دون إضافتها إلى `CAN` أولاً.

**التنفيذ:**
1. تحقّق من `token` واستخرج بريد المستشار (كما تفعل الإجراءات الحالية).
2. `select manage_access, sources from admin_permissions where admin_email = $1`.
3. لا صفّ؟ → `{ success: true, email, permissions: { manage_access: false, sources: {} } }`. **لا تردّ بخطأ**: المستشار موجود وبلا صلاحيات، وهذه حالة مشروعة تعرضها اللوحة بوضوح.

---

### `list-contact-requests`

طلبات الموقع. `dataKey` = `requests`.

**الطلب:** `{ action: "list-contact-requests", token }`

**التنفيذ:**
1. تحقّق من الرمز.
2. **افحص `sources->'home-contact'` ⊇ `view`** — وإلا `{ success:false, code:"forbidden" }`.
3. `select * from contact_requests order by created_at desc`.

---

### `list-regs` (قائم)

`dataKey` = `registrations`. **أضِف إليه فحص الإذن**: `sources->'matrix'` ⊇ `view`. اليوم يردّ لأي رمزٍ صالح.

---

### `set-request-status`

**الطلب:** `{ action, token, source, id, status }` — `source` هو `id` المصدر (`home-contact`)، و`status` من `statuses` في السجلّ.

**التنفيذ:** افحص `edit` على `source`، ثم حدّث الجدول المقابل. **لا تثق بـ `source` كاسم جدول** — قابله بقائمة بيضاء في الخادم.

---

### `list-admins` · `set-admin-permissions`

**كلاهما يتطلّب `manage_access`.**

`list-admins` → `{ success: true, admins: [{ email, manage_access, sources, updated_at }] }`

`set-admin-permissions` ← `{ adminId, permissions: { manage_access, sources } }`

**ثلاثة حرّاس لازمة:**
1. **لا يُسقِط أحدٌ `manage_access` عن نفسه** إن كان آخر من يملكه — وإلا أُقفلت اللوحة على الجميع بلا طريق رجوع.
2. **رشّح `sources`** بقائمة المصادر والأذونات المعروفة قبل الحفظ.
3. اكتب `updated_by` — من غيّر صلاحية من، سؤالٌ يُسأل لاحقاً.

---

### `analytics-summary`

**الطلب:** `{ action, token, from, to, site? }` — `from`/`to` بصيغة ISO.

```jsonc
{
  "success": true,
  "daily":  [{ "day": "2026-09-01", "views": 320, "visits": 210 }],
  "pages":  [{ "site": "mi-home", "path": "/", "views": 180, "visits": 140 }],
  "totals": { "views": 320, "visits": 210 }
}
```

**التنفيذ:** افحص `view` على أي مصدر (أو أضِف مصدر `analytics` إلى السجلّ إن أردت إذناً مستقلاً)، ثم نادِ `analytics_daily` و`analytics_pages` من `schema.sql`. الدالّتان `security definer` ومنزوعتا الصلاحية عن العموم، فلا تُنادَيان إلا من هنا بـ `service_role`.

---

## `user-api` — حدّ إعادة الإرسال

هذا يغلق ما فُتح في `a8a93fa`: **المهلة في الواجهة تحسّن التجربة ولا تحمي.**

في `register-send` و`resume-send`، قبل الإرسال:

```ts
const { data: sends } = await supabase.rpc('otp_sends_since', {
  p_identifier: email,
  p_since: new Date(Date.now() - 60_000).toISOString(),
});
if (sends > 0) {
  return json({ success: false, message: 'انتظر دقيقة قبل طلب رمزٍ جديد' });
}
// … أرسِل، ثم:
await supabase.from('otp_send_log').insert({ identifier: email, kind: 'register' });
```

وحدٌّ أوسع للساعة (مثلاً 10) يمنع الاستنزاف البطيء.

**وأمّا قفل المحاولات الفاشلة** (`OTP_MAX_FAILS`) فمكانه هنا وحده. لم يُنفَّذ في الواجهة عمداً: قفلٌ في المتصفّح يمحوه تحديث الصفحة، فيمنع صاحب الحساب ولا يمنع المهاجم.

---

## الترتيب المقترح

| # | الخطوة | الأثر |
|---|---|---|
| ١ | `schema.sql` + بريدك في `CHANGE-ME` | الجداول جاهزة |
| ٢ | `whoami` | اللوحة تعمل بالصلاحيات |
| ٣ | فحص الإذن في `list-regs` | يُسدّ الباب المفتوح اليوم |
| ٤ | `list-contact-requests` | طلبات الموقع تظهر |
| ٥ | `list-admins` + `set-admin-permissions` | إدارة الوصول من اللوحة |
| ٦ | حدّ `user-api` | الحماية الحقيقية للرموز |
| ٧ | `analytics-summary` | تبويب التحليلات |

**كل خطوة تعمل وحدها.** ما لم يُنفَّذ بعد يظهر في اللوحة بحالته الصريحة، لا فراغاً.
