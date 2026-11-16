# مراقب حداثة النسخ الاحتياطية

Worker مستقل عن GitHub وSupabase (D09). يقرأ `latest.json` من دلو R2 كل ساعة، ويعدّ النسخة متأخرة إن تجاوز عمرها 26 ساعة.

## النشر

من GitHub: `.github/workflows/deploy-backup-monitor.yml` عند كل تغيير في هذا المجلد على `main`، أو يدويًا من Actions. يحتاج السر `CLOUDFLARE_API_TOKEN` (و`CLOUDFLARE_ACCOUNT_ID` اختياريًا، والبديل `R2_ACCOUNT_ID`)، وبلاه يتخطى بتحذير. التفاصيل في `RUNBOOK.md` §4.

أو من جهاز المالك أثناء حجب Actions:

```bash
cd workers/backup-monitor
npx wrangler@4.152.0 deploy
```

## التنبيه (أسرار Worker، مرة واحدة)

تُضبط في Cloudflare ← Workers & Pages ← `mi-backup-monitor` ← Settings ← Variables and Secrets، أو `npx wrangler secret put <الاسم>`، ولا يمسها النشر:

- `SLACK_BOT_TOKEN` و`SLACK_CHANNEL`: قيمتا `LEADERS_SLACK_BOT_TOKEN` و`LEADERS_SLACK_CHANNEL`، فيصل التنبيه قناة `#mi-ops` وإشعار سلاك على الهاتف.
- `RESEND_API_KEY` و`ALERT_TO`: بريد التنبيه.

كلها اختيارية: بدونها لا يُرسل تنبيه، ويبقى `/health` للمراقب الخارجي. التنبيه مرة كل 12 ساعة على الأكثر ما دامت النسخة متأخرة.

## المراقب الخارجي

في UptimeRobot (أو أي مراقب) فحص كلمة مفتاحية كل 5 دقائق:
- الرابط: `https://mi-backup-monitor.<الحساب>.workers.dev/health`
- الشرط: الصفحة تحتوي `"ok":true`

ومعه فحوص المنصات والمسبار في RUNBOOK §3، فيعلم المالك بعطل الإنتاج أو تأخر النسخ ولو توقفت Actions.
