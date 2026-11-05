#!/usr/bin/env node
// أسرار دوال الحافة على المشروع الحي: الأسماء فقط، لا قيمة ولا بصمة، عبر Management API
// بالسر SUPABASE_ACCESS_TOKEN نفسه الذي ينشر الدوال. معنى كل سر ومكان ضبطه: docs/SECRETS.md.
//   node scripts/ops/function-secrets.mjs                     يطبع أسماء الأسرار المضبوطة
//   node scripts/ops/function-secrets.mjs --require=signin    ويخرج برمز 1 إن غاب سرّ يحتاجه الدخول بالرمز
//   node scripts/ops/function-secrets.mjs --require=A,B       أو أسماء بعينها
// يستعمله وضع check في migrate.yml للقراءة، وبوابة النشر في ci.yml قبل نشر الدوال: منذ المرحلة ل1
// يفشل التحقق البشري مغلقًا، فنشر الدوال بلا مفتاحَي Turnstile يوقف الدخول بالبريد؛ البوابة تمنع ذلك.

const REF = process.env.SUPABASE_PROJECT_REF || 'eormhcupwgwpllhrfxxg';
const TOKEN = process.env.SUPABASE_ACCESS_TOKEN;

// ما يحتاجه الدخول برمز البريد في البوابات الثلاث: غياب أي منها يوقفه
const SETS = {
  signin: ['LEADERS_TOKEN_PEPPER', 'RESEND_API_KEY', 'LEADERS_TURNSTILE_SECRET', 'LEADERS_TURNSTILE_SITE_KEY'],
};

if (!TOKEN) { console.error('SUPABASE_ACCESS_TOKEN مطلوب'); process.exit(2); }
const arg = process.argv.find((a) => a.startsWith('--require='))?.slice('--require='.length) || '';
const need = arg.split(',').map((s) => s.trim()).filter(Boolean).flatMap((s) => SETS[s] || [s]);

const r = await fetch(`https://api.supabase.com/v1/projects/${REF}/secrets`, { headers: { Authorization: `Bearer ${TOKEN}` } });
if (!r.ok) { console.error(`✗ تعذّرت قراءة أسماء الأسرار: ${r.status}`); process.exit(1); }
// الاستجابة تحمل حقلًا للقيمة أيضًا؛ لا يُقرأ ولا يُطبع منه شيء
const names = new Set((await r.json()).map((s) => String(s.name)));
console.log(`أسرار الدوال المضبوطة (أسماء فقط): ${[...names].sort().join('، ') || 'لا شيء'}`);
for (const n of need) console.log(`${names.has(n) ? '✓' : '✗'} ${n}`);
const missing = need.filter((n) => !names.has(n));
if (missing.length) {
  console.log(`::error::أسرار مطلوبة غير مضبوطة: ${missing.join('، ')}. اضبطها في Supabase ← Edge Functions ← Secrets (docs/SECRETS.md)`);
  process.exit(1);
}
