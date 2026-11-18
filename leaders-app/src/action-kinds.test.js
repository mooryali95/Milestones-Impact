// تصنيف الأفعال قراءة أو كتابة (تصور التحديث بلا أثر، المرحلة 3، ش9): القائمة صريحة في _shared/action-kinds.js، وهذا الاختبار
// يتحقق منها على خرائط الخادم نفسها. ما لم يُصنَّف قراءة يُعامل كتابة، فلا يُعاد تلقائيًا بعد خطأ شبكة إلا بمفتاح منع التكرار.
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { ADMIN_API_READS, isReadAction, LEADERS_ADMIN_READS, LEADERS_READS, NO_REPLAY, replayable, USER_API_READS } from '../../supabase/functions/_shared/action-kinds.js';

const root = join(__dirname, '../..');
const fn = (p) => readFileSync(join(root, 'supabase/functions/leaders-api', p), 'utf8');
const index = fn('index.ts');
const modules = Object.fromEntries([...index.matchAll(/import \* as (\w+) from '\.\/([\w.-]+)';/g)].map((m) => [m[1], m[2]]));
function mapOf(name) {
  const start = index.indexOf(`const ${name}: Record`);
  const end = index.indexOf('\n};', start);
  return [...index.slice(start, end).matchAll(/^\s*'([a-z0-9.-]+)':(.*)$/gm)].map((m) => ({ key: m[1], impl: m[2] }));
}
// جسم الدالة المُصدَّرة التي يستدعيها الفعل (حتى نهايتها بإغلاق «}» في أول السطر)
function bodyOf(impl) {
  const m = impl.match(/\b([A-Z]{1,2})\.(\w+)\(/);
  if (!m || !modules[m[1]]) return null;
  const src = fn(modules[m[1]]);
  const d = src.match(new RegExp(`export (?:async )?function ${m[2]}\\b[^{]*\\{`));
  if (!d) return null;
  const from = d.index + d[0].length;
  const end = src.indexOf('\n}', from);
  return src.slice(from, end < 0 ? from + 3000 : end);
}
const MAPS = ['open', 'participant', 'expert', 'coordinator', 'admin'];
const all = new Map(MAPS.flatMap((m) => mapOf(m).map((x) => [x.key, { ...x, map: m }])));
const WRITES = /\.(insert|update|upsert|delete)\(|sendMail\(|enqueueMail\(|\.rpc\(/;
// قراءات تكتب كتابة لا يضر تكرارها، بسببها مكتوبًا. ما عداها يجب أن يخلو جسمه المباشر من أي كتابة
const IDEMPOTENT_WRITES = {
  // ربط المشارك بجهة نطاق بريده مرة واحدة: الشرط is('organization_id', null) يجعل الإعادة بلا أثر
  me: 'participant.ts me: ربط الجهة بالنطاق مرة واحدة بشرط is null',
  // نبضة الحضور في القاعة: last_seen وقت آخر سؤال، فالإعادة تكتب الوقت نفسه تقريبًا
  'hall.state': 'hall.ts state: نبضة last_seen',
};

describe('تصنيف الأفعال (ش9)', () => {
  it('كل قراءة فعل موجود في خريطة الخادم، وليست في NO_REPLAY', () => {
    const missing = [...LEADERS_READS, ...LEADERS_ADMIN_READS].filter((k) => !all.has(k));
    expect(missing).toEqual([]);
    expect([...LEADERS_READS, ...LEADERS_ADMIN_READS].filter((k) => NO_REPLAY.has(k))).toEqual([]);
  });
  it('كل فعل في NO_REPLAY موجود، وكل فعل مفتوح قراءة أو في NO_REPLAY (لا فاعل يُربط به المفتاح)', () => {
    expect([...NO_REPLAY].filter((k) => !all.has(k))).toEqual([]);
    expect(mapOf('open').map((x) => x.key).filter((k) => !LEADERS_READS.has(k) && !NO_REPLAY.has(k))).toEqual([]);
  });
  it('أفعال القراءة لا تكتب في جسم دالتها المباشر، إلا كتابة موثقة لا يضر تكرارها', () => {
    const gaps = [];
    let found = 0;
    for (const k of LEADERS_READS) {
      const { impl } = all.get(k);
      const body = bodyOf(impl);
      // الفعل المكتوب في الخريطة نفسها (بلا دالة في وحدة) يُفحص سطره
      if (!body) { if (WRITES.test(impl)) gaps.push(k); continue; }
      if (WRITES.test(body) && !IDEMPOTENT_WRITES[k]) gaps.push(k);
      found += 1;
    }
    expect(gaps).toEqual([]);
    // المحلل وجد أجسام الدوال فعلًا، لا أن الفحص مر لأنه لم يقرأ شيئًا
    expect(found).toBeGreaterThan(LEADERS_READS.size * 0.7);
  });
  it('قراءات الإدارة تطابق الخريطة: لا غلاف writer على قراءة', () => {
    const wrapped = [...LEADERS_ADMIN_READS].filter((k) => /[Ww]riter/.test(all.get(k).impl));
    expect(wrapped).toEqual([]);
  });
  it('ما لم يُذكر يُعامل كتابة، ودالة مجهولة كذلك', () => {
    expect(isReadAction('leaders-api', 'me')).toBe(true);
    expect(isReadAction('leaders-api', 'admin.overview')).toBe(true);
    expect(isReadAction('leaders-api', 'profile.save')).toBe(false);
    expect(isReadAction('leaders-api', 'action-not-listed')).toBe(false);
    expect(isReadAction('leaders-api', '')).toBe(false);
    expect(isReadAction('other-fn', 'me')).toBe(false);
    expect(isReadAction('admin-api', 'list-contacts')).toBe(true);
    expect(isReadAction('admin-api', 'login-send')).toBe(false);
    expect(isReadAction('user-api', 'get')).toBe(true);
    expect(isReadAction('user-api', 'save')).toBe(false);
  });
  it('replayable: كتابات leaders-api ذات الجلسة وحدها', () => {
    expect(replayable('leaders-api', 'profile.save')).toBe(true);
    expect(replayable('leaders-api', 'me')).toBe(false);
    expect(replayable('leaders-api', 'auth.verify')).toBe(false);
    expect(replayable('leaders-api', 'upload.url')).toBe(false);
    expect(replayable('admin-api', 'unlock-reg')).toBe(false);
  });
  it('قراءات admin-api فروع موجودة في الدالة', () => {
    const src = readFileSync(join(root, 'supabase/functions/admin-api/index.ts'), 'utf8');
    for (const a of ADMIN_API_READS) expect(src, a).toContain(`action === "${a}"`);
    const user = readFileSync(join(root, 'supabase/functions/user-api/index.ts'), 'utf8');
    for (const a of USER_API_READS) expect(user, a).toMatch(new RegExp(`['"]${a}['"]`));
  });
});
