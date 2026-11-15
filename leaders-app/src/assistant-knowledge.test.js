// معرفة المساعد الآلي (supabase/content/assistant/v1): مصدر واحد منشور بطبيعته، فلا يدخله ما لا يُنشر.
// لا سعر لبرنامج القادة (يُقرأ حيًا من payment_settings)، ولا نص من بنك الأسئلة أو الكتيب، ولا موضع بيانات غير صادق.
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const root = join(__dirname, '../..');
const read = (p) => readFileSync(join(root, p), 'utf8');
const K = read('supabase/content/assistant/v1/knowledge.md');
const section = (from, to) => K.slice(K.indexOf(from), to ? K.indexOf(to) : undefined);
const leaders = section('## 2. برنامج إدارة المشروعات للقادة', '## 3. مصفوفة التأثير');

describe('معرفة المساعد', () => {
  it('حجمها بين 3 و6 آلاف رمز تقريبًا (نحو 2.2 حرف للرمز بالعربية)', () => {
    const est = Math.round(K.length / 2.2);
    expect(est).toBeGreaterThan(3000);
    expect(est).toBeLessThan(6000);
  });

  it('لا سعر لبرنامج القادة: لا رقم بعملة في قسمه، ولا القيم الافتراضية لإعداد الدفع', () => {
    expect(leaders).not.toMatch(/\d[\d,.]*\s*(دولار|USD|\$|ريال|SAR)/);
    expect(leaders).not.toMatch(/\$\s*\d/);
    expect(K).not.toMatch(/\b(9900|99\.00|1\.00)\b/);
  });

  it('لا نص من فقرات القياس ولا من متن الكتيب', () => {
    const qdir = join(root, 'supabase/content/questions');
    for (const v of readdirSync(qdir)) {
      for (const item of JSON.parse(readFileSync(join(qdir, v, 'items.json'), 'utf8'))) {
        if (item.text_ar && item.text_ar.length > 25) expect(K, item.code).not.toContain(item.text_ar.slice(0, 40));
      }
    }
    const hdir = join(root, 'supabase/content/handbook');
    for (const v of readdirSync(hdir)) {
      for (const f of readdirSync(join(hdir, v)).filter((x) => x.endsWith('.md'))) {
        const lines = readFileSync(join(hdir, v, f), 'utf8').split('\n').map((l) => l.trim()).filter((l) => l.length > 60);
        for (const l of lines) expect(K, `${v}/${f}`).not.toContain(l.slice(0, 60));
      }
    }
  });

  it('موضع البيانات كما في سياسة برنامج القادة: مومباي خارج المملكة، ولا ادعاء بالبقاء في السعودية', () => {
    expect(read('leaders-app/src/screens/Legal.jsx')).toContain('على خوادم AWS في مومباي بالهند');
    expect(K).toContain('على خوادم AWS في مومباي بالهند');
    expect(K).toContain('خارج المملكة العربية السعودية');
    expect(K).not.toMatch(/داخل المملكة[^.\n]*(تُحفظ|محفوظة)/);
  });

  it('سياستا المنتجين مفصولتان باسم المنتج، ولكل منهما رابطها', () => {
    expect(leaders).toContain('https://leaders.sunkvalue.com/legal/refund');
    expect(leaders).not.toContain('refund.html');
    expect(section('### سياسات المصفوفة', '## 4.')).toContain('https://mi.sunkvalue.com/refund.html');
  });

  it('لا روابط خارج مواقع المنظومة المعتمدة (ولا لوحة الإدارة)', () => {
    const hosts = [...K.matchAll(/https?:\/\/([a-z0-9.-]+)/gi)].map((m) => m[1].toLowerCase());
    for (const h of hosts) expect(['mi.sunkvalue.com', 'leaders.sunkvalue.com', 'matrix.sunkvalue.com']).toContain(h);
  });

  it('لا شرطة طويلة ولا متوسطة', () => {
    expect(K).not.toMatch(/[–—]/);
  });
});
