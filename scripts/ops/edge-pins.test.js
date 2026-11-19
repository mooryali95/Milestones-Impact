// تثبيت إصدارات الدوال بالضبط (تصور تحديث المنصة بلا أثر على المستخدمين، المرحلة 2 البند 7):
// كل استيراد خارجي في supabase/functions (npm: وjsr: وروابط https) بإصدار كامل، وكلها في ملف القفل
// supabase/functions/deno.lock الذي يفحص به CI بـ--frozen، وقفل leaders-api (يقرؤه نشرها مع deno.json) لا يخالفه.
// رفع إصدار مقصود: غيّر الاستيراد، ثم من جذر المستودع (القفل القائم يبقى ويضاف إليه ما استجد، فلا تتحرك حزمة لم تُمس):
//   DENO_NO_PACKAGE_JSON=1 deno check --lock=supabase/functions/deno.lock --node-modules-dir=none supabase/functions/*/index.ts
//   DENO_NO_PACKAGE_JSON=1 deno test --lock=supabase/functions/deno.lock --node-modules-dir=none --allow-env --allow-read \
//     --allow-net=127.0.0.1 supabase/functions/leaders-api/ supabase/functions/agent-chat/ supabase/functions/admin-api/ supabase/functions/_shared/
//   (cd supabase/functions/leaders-api && deno check --node-modules-dir=none index.ts && deno test --node-modules-dir=none -A .)
// واحذف من "specifiers" ما لم يعد مستوردًا. إصدار عمره أقل من 24 ساعة يحتاج --min-dep-age=0، والأفضل انتظاره.
import { readFileSync, readdirSync } from 'node:fs';
import { join, relative } from 'node:path';
import { describe, expect, it } from 'vitest';

const root = join(__dirname, '../..');
const fnDir = join(root, 'supabase/functions');
const read = (p) => readFileSync(join(root, p), 'utf8');

const EXACT = /^\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?$/;
// import x from '…' و import '…' و export … from '…' و import('…') وimport type
const SPEC = /(?:\bfrom\s*|\bimport\s*\(?\s*)(['"])((?:npm:|jsr:|https?:\/\/)[^'"]+)\1/g;

export function externalImports(src) {
  return [...src.matchAll(SPEC)].map((m) => m[2]);
}

// npm:@scope/name@1.2.3/sub و jsr:@scope/name@1.2.3/sub و npm:name@1.2.3: يعيد { pkg, version } أو سبب الرفض
export function parsePin(spec) {
  const m = /^(npm|jsr):(@[^/@]+\/[^/@]+|[^/@]+)(?:@([^/]+))?(\/.*)?$/.exec(spec);
  if (m) {
    if (!m[3]) return { error: 'بلا إصدار' };
    if (!EXACT.test(m[3])) return { error: `مدى لا إصدار: ${m[3]}` };
    return { kind: m[1], pkg: m[2], version: m[3], key: `${m[1]}:${m[2]}@${m[3]}` };
  }
  if (/^https?:\/\//.test(spec)) {
    // رابط CDN مقبول بإصدار كامل في مساره وحده، والمعتمد npm: أو jsr: (سلامتهما في ملف القفل ثابتة)
    const v = /@(\d[^/?#]*)/.exec(spec);
    if (!v || !EXACT.test(v[1])) return { error: 'رابط بلا إصدار كامل' };
    return { kind: 'https', version: v[1] };
  }
  return { error: 'صيغة غير معروفة' };
}

function sources(dir) {
  const out = [];
  for (const e of readdirSync(dir, { withFileTypes: true })) {
    if (e.name === 'node_modules' || e.name.startsWith('.')) continue;
    const p = join(dir, e.name);
    if (e.isDirectory()) out.push(...sources(p));
    else if (/\.(ts|tsx|js|mjs|jsx)$/.test(e.name)) out.push(p);
  }
  return out;
}

const all = sources(fnDir).flatMap((f) =>
  externalImports(readFileSync(f, 'utf8')).map((spec) => ({ file: relative(root, f), spec })));
const lock = JSON.parse(read('supabase/functions/deno.lock'));
const leadersLock = JSON.parse(read('supabase/functions/leaders-api/deno.lock'));

describe('تثبيت إصدارات الدوال (المرحلة 2 البند 7)', () => {
  it('المحلل يرفض المدى والإصدار الغائب ويقبل الكامل', () => {
    expect(parsePin('npm:@supabase/supabase-js@2.118.0')).toMatchObject({ version: '2.118.0' });
    expect(parsePin('jsr:@supabase/functions-js@2.119.1/edge-runtime.d.ts')).toMatchObject({ pkg: '@supabase/functions-js' });
    expect(parsePin('npm:@supabase/supabase-js@2').error).toBeTruthy();
    expect(parsePin('npm:@supabase/supabase-js@^2.118.0').error).toBeTruthy();
    expect(parsePin('jsr:@std/assert@1').error).toBeTruthy();
    expect(parsePin('jsr:@supabase/functions-js/edge-runtime.d.ts').error).toBeTruthy();
    expect(parsePin('https://esm.sh/@supabase/supabase-js@2').error).toBeTruthy();
    expect(parsePin('https://esm.sh/@supabase/supabase-js@2.119.1').error).toBeUndefined();
    expect(externalImports(`import "jsr:a@1";\nimport { x } from 'npm:b@2.0.0';\nexport * from "https://x.y/c@3";\nconst m = await import('npm:d');`))
      .toEqual(['jsr:a@1', 'npm:b@2.0.0', 'https://x.y/c@3', 'npm:d']);
  });

  it('المسح يجد الاستيرادات فعلًا', () => {
    expect(all.length).toBeGreaterThan(20);
    expect(all.some((i) => i.spec.startsWith('npm:@supabase/supabase-js@'))).toBe(true);
  });

  it('كل استيراد خارجي بإصدار كامل', () => {
    const bad = all.map((i) => ({ ...i, ...parsePin(i.spec) })).filter((i) => i.error)
      .map((i) => `${i.file}: ${i.spec} (${i.error})`);
    expect(bad).toEqual([]);
  });

  it('كل استيراد npm: وjsr: في ملف القفل الذي يفحص به CI', () => {
    const missing = [...new Set(all.map((i) => parsePin(i.spec)).filter((p) => p.key).map((p) => p.key))]
      .filter((k) => !(k in lock.specifiers));
    expect(missing).toEqual([]);
  });

  it('القفل لا يحمل إعدادات المستودع (package.json) ولا يحل مدى لاستيراد مباشر', () => {
    // DENO_NO_PACKAGE_JSON=1 في أمر CI نفسه: وإلا سجّل القفل اعتماديات package.json ففشل --frozen مع كل تحديث لها
    expect(lock.workspace).toBeUndefined();
    for (const p of all.map((i) => parsePin(i.spec)).filter((x) => x.key)) expect(lock.specifiers[p.key]).toBe(p.version);
  });

  it('قفل leaders-api يطابق القفل العام في كل حزمة مشتركة', () => {
    const diff = [];
    for (const sec of ['jsr', 'npm']) {
      for (const [k, v] of Object.entries(leadersLock[sec] || {})) {
        const r = lock[sec]?.[k];
        if (!r) diff.push(`${sec} ${k}: غائب من supabase/functions/deno.lock`);
        else if (r.integrity !== v.integrity) diff.push(`${sec} ${k}: سلامة مختلفة`);
      }
    }
    for (const [k, v] of Object.entries(leadersLock.specifiers)) if (lock.specifiers[k] !== v) diff.push(`${k}: ${v} مقابل ${lock.specifiers[k]}`);
    expect(diff).toEqual([]);
  });

  it('CI يفحص الأنواع ويشغّل اختبارات Deno بالقفل المجمّد', () => {
    const ci = read('.github/workflows/ci.yml');
    const steps = ci.split('\n').filter((l) => /run: .*\bdeno (check|test)\b/.test(l));
    expect(steps.length).toBe(2);
    for (const l of steps) expect(l).toContain('run: DENO_NO_PACKAGE_JSON=1 deno ' + (l.includes('deno check') ? 'check' : 'test') + ' --lock=supabase/functions/deno.lock --frozen ');
    expect(read('.gitignore')).toContain('!supabase/functions/deno.lock');
  });
});
