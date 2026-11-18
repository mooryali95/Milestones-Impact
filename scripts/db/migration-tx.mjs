// تطبيق ترحيل واحد بأمان (تصور تحديث المنصة بلا أثر، المرحلة 6، البندان 1 و2). منطق نقي يستورده apply-migration.mjs
// ويختبره scripts/ops/migrations-safety.test.js.
//
// المعاملة: نص الترحيل يُرسل إلى Management API طلبًا واحدًا. لم يُتحقق من توثيق Supabase أن الطلب ينفذ في معاملة واحدة،
// والاستنتاج من السلوك القائم وحده: الترحيلات متعددة الأوامر تمر اليوم، والبروتوكول الموسَّع في Postgres يرفض أكثر من أمر في
// الطلب، فالنص يصل بالبروتوكول البسيط، وPostgres ينفذ أوامر الرسالة البسيطة في معاملة ضمنية واحدة. هذا استنتاج لا ثابت، فلا
// يُبنى عليه: كل ترحيل يُلف هنا في begin وcommit صريحين، فيصير ذريًا أيًا كان سلوك الواجهة، وبهذا وحده تصح إعادة المحاولة.
//   transaction      الافتراضي: begin، ثم set local lock_timeout = '3s' وstatement_timeout = '60s'، ثم الترحيل، ثم commit.
//                    فشل القفل (55P03) وحده يُعاد بتراجع متزايد، لأن المعاملة رُجعت كاملة فلا نصف ترحيل.
//   no-transaction   الوسم «-- migrate: no-transaction» في السطور الأولى: لما لا يعمل داخل معاملة (create index concurrently).
//                    يُرسل أمرًا أمرًا بلا مهلة (المهلة في الطلب نفسه تجعله متعدد الأوامر فمعاملة ضمنية فيُرفض)، ولا يُعاد آليًا.
//   explicit         ترحيل قديم فيه begin وcommit بيده (لا يقبلها الفاحص في الجديد): يُرسل كما هو بمهلتي الجلسة، ولا يُعاد.
import { noTransaction, statements } from './migration-sql.mjs';

export const LOCK_TIMEOUT = '3s';
export const STATEMENT_TIMEOUT = '60s';
// فواصل إعادة المحاولة بعد فشل القفل، ثم عشوائية حتى ثانية: نحو دقيقتين ونصف على الأكثر قبل الإعلان
export const RETRY_DELAYS_MS = [5_000, 15_000, 45_000, 90_000];

export function applyPlan(sql) {
  if (noTransaction(sql)) return { mode: 'no-transaction', requests: statements(sql).map((s) => s.text) };
  if (statements(sql).some((s) => /^(begin|start transaction|commit|end|rollback)\b/.test(s.code))) {
    return { mode: 'explicit', requests: [`set lock_timeout = '${LOCK_TIMEOUT}';\nset statement_timeout = '${STATEMENT_TIMEOUT}';\n${sql}\n;\nreset lock_timeout;\nreset statement_timeout;`] };
  }
  // ";" على سطر وحده: آخر أمر بلا فاصلة منقوطة، أو تعليق في آخر سطر، لا يبتلع commit
  return { mode: 'transaction', requests: [`begin;\nset local lock_timeout = '${LOCK_TIMEOUT}';\nset local statement_timeout = '${STATEMENT_TIMEOUT}';\n${sql}\n;\ncommit;`] };
}

const text = (e) => String(e?.message || e);
export const isLockTimeout = (e) => /55P03|lock_not_available|lock timeout/i.test(text(e));
// الجدول (أو مخططه) غير موجود، ولا غير ذلك: 42P01 و3F000 برمزيهما أو بنصيهما في رد Management API
export const isMissingRelation = (e) => /42P01|3F000|relation "[^"]*schema_migrations" does not exist|schema "leaders" does not exist/i.test(text(e));

// هل الترحيل مسجّل؟ «السجل غير موجود» (قبل 20261105110000) يعني لا، وأي خطأ آخر (الشبكة، الرمز، 5xx) يوقف السلسلة:
// كان يُعدّ «غير مطبَّق» فيُعاد تطبيق ترحيل مطبّق
export async function inLedger(query, name) {
  try {
    return (await query(`select name from leaders.schema_migrations where name = '${name}'`)).length > 0;
  } catch (e) {
    if (isMissingRelation(e)) return false;
    throw new Error(`تعذّرت قراءة سجل الترحيلات (ليس «غير موجود»)، فلا يُعرف أطُبّق ${name}: ${text(e).slice(0, 400)}`);
  }
}

// يطبّق خطة واحدة. يعيد { attempts, mode }، ويرمي بآخر خطأ
export async function applyWithRetry({ query, plan, sleep = (ms) => new Promise((r) => setTimeout(r, ms)), log = () => {}, delays = RETRY_DELAYS_MS, random = Math.random }) {
  for (let attempt = 0; ; attempt++) {
    try {
      for (const r of plan.requests) await query(r);
      return { attempts: attempt + 1, mode: plan.mode };
    } catch (e) {
      // جلسة بقيت في معاملة فاشلة (begin صريح ثم خطأ) تُرجع قبل أي طلب تالٍ. بلا أثر إن لم تكن معاملة
      if (plan.mode !== 'no-transaction') await query('rollback;').catch(() => {});
      if (plan.mode === 'transaction' && isLockTimeout(e) && attempt < delays.length) {
        const wait = delays[attempt] + Math.floor(random() * 1000);
        log(`فشل القفل (المحاولة ${attempt + 1})، والمعاملة رُجعت كاملة؛ إعادة بعد ${Math.round(wait / 1000)} ث`);
        await sleep(wait);
        continue;
      }
      if (plan.mode === 'no-transaction') e.message = `${text(e)}\n(ترحيل بلا معاملة: ما قبل الأمر الفاشل طُبّق. فهرس concurrently فاشل يبقى INVALID: drop index concurrently if exists ثم أعد التشغيل)`;
      throw e;
    }
  }
}
