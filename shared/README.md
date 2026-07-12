# Shared assets — Milestone Impact

## البنية
```
shared/css/
  tokens.css      ← المتغيرات (ألوان، خطوط، مسافات)
  base.css        ← Reset + Typography
  layout.css      ← Header + Footer + Grid
  components.css  ← Buttons + Badges + Section titles
  typeform.css    ← نموذج التواصل
shared/js/
  canvas.js       ← خلفية الـ canvas المتحركة
  counters.js     ← عدّادات الأرقام
  tabs.js         ← تبديل التبويبات
```

## لتعديل أي شيء مشترك (CSS أو JS)
1. عدّل الملف المناسب في `shared/css/` أو `shared/js/`
2. شغّل `python3 shared/build-css.py`
3. ارفع الكل على GitHub

## لتعديل شيء خاص بصفحة
- **Home**: `home/assets/css/05-home-sections.css`
- **Leaders**: `leaders/assets/css/05-sections.css`
- ثم شغّل `python3 shared/build-css.py`

## ملاحظة
لا تعدّل `main.css` ولا ملفات JS داخل `home|leaders/assets/js/` (canvas/counters/tabs)
مباشرةً — كلها تُولَّد تلقائياً بالـ build script من المصادر المشتركة.
(الصفحة تنشر ملفاتها مباشرةً على Cloudflare، لذا تبقى النسخ المولّدة محفوظة في Git.)
