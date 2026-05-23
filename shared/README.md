# Shared CSS — Milestone Impact

## البنية
```
shared/css/
  tokens.css      ← المتغيرات (ألوان، خطوط، مسافات)
  base.css        ← Reset + Typography
  layout.css      ← Header + Footer + Grid
  components.css  ← Buttons + Badges + Section titles
  typeform.css    ← نموذج التواصل
```

## لتعديل أي شيء مشترك
1. عدّل الملف المناسب في `shared/css/`
2. شغّل `python3 shared/build-css.py`
3. ارفع الكل على GitHub

## لتعديل شيء خاص بصفحة
- **Home**: `home/assets/css/05-home-sections.css`
- **Leaders**: `leaders/assets/css/05-sections.css`
- ثم شغّل `python3 shared/build-css.py`

## ملاحظة
لا تعدّل `main.css` مباشرة — يُولَّد تلقائياً بالـ build script.
