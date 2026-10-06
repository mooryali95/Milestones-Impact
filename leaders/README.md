# 📗 Milestone Impact — Leaders (redirect only)

> صفحة **برنامج إدارة المشروعات للقادة** انتقلت إلى `home/leaders/`.

## 🌐 الرابط الحي

```
https://mi.sunkvalue.com/leaders/
```

## ↪️ وظيفة هذا المجلد

مشروع Cloudflare Pages `mi-leaders` (مخرجات البناء `leaders`) يخدم الآن التحويل فقط:

- `_redirects` يحوّل كل طلبات `leaders.sunkvalue.com/*` إلى `https://mi.sunkvalue.com/leaders/` بتحويل دائم 301.
- `index.html` احتياطي بـ meta refresh و canonical لنفس الرابط.

أي تعديل على محتوى الصفحة يتم في `home/leaders/`.
