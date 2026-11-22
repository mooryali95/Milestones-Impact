// بيئة اختبارات Deno: الأسرار الإلزامية بقيم وهمية قبل استيراد core.ts (الذي يرفض الإقلاع بدونها)
Deno.env.set('SUPABASE_URL', 'http://127.0.0.1:54321');
Deno.env.set('SUPABASE_SERVICE_ROLE_KEY', 'service-role-test-key');
Deno.env.set('LEADERS_TOKEN_PEPPER', 'test-pepper');
Deno.env.set('LEADERS_RP_ID', 'leaders.test');
Deno.env.set('LEADERS_ORIGINS', 'https://leaders.test');
// مدقق رد المساعد (guide.ts GD.verify) موقوف في الاختبارات ما لم يُحقن صراحة، فلا نداء نموذج ثانٍ يغيّر عدّ النداءات
Deno.env.set('LEADERS_GUIDE_VERIFY', 'off');
