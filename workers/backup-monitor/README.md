# مراقب حداثة النسخ الاحتياطية

Worker مستقل عن GitHub وSupabase (D09). يقرأ `latest.json` من دلو R2 كل ساعة، ويعدّ النسخة متأخرة إن تجاوز عمرها 26 ساعة.

## النشر (مرة واحدة، من جهاز المالك)

```bash
cd workers/backup-monitor
npx wrangler deploy
npx wrangler secret put ALERT_TO
npx wrangler secret put RESEND_API_KEY
```

الأسرار اختيارية: بدونها لا يُرسل بريد، ويبقى `/health` للمراقب الخارجي.

## المراقب الخارجي

في UptimeRobot (أو أي مراقب) فحص كلمة مفتاحية كل 5 دقائق:
- الرابط: `https://mi-backup-monitor.<الحساب>.workers.dev/health`
- الشرط: الصفحة تحتوي `"ok":true`

ومعه فحوص المنصات والمسبار في RUNBOOK §3، فيعلم المالك بعطل الإنتاج أو تأخر النسخ ولو توقفت Actions.
