// المساعد الآلي في الموقع العام (المرحلة 1): المعرفة المولدة تطابق مصدرها، والوعد واحد في البريد والصفحات والمساعد،
// والنافذة في كل صفحات الموقع بلا HTML من الخادم، والدالة منشورة بالبوابة نفسها، والترحيل متسامح.
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { render, OUT } from '../../scripts/assistant/knowledge.mjs';
import { HOURS_AR, PROMISE_AR, promiseNow } from '../../supabase/functions/_shared/hours.js';
import { gateOf } from '../../scripts/ops/pending-migrations.mjs';

const root = join(__dirname, '../..');
const read = (p) => readFileSync(join(root, p), 'utf8');
const PAGES = ['index.html', 'leaders/index.html', 'projects/index.html', 'governance/index.html', 'assessment/index.html', 'pricing.html', 'refund.html', 'privacy.html', 'terms.html'];

describe('المساعد الآلي في الموقع', () => {
  it('knowledge.js مولَّد من supabase/content/assistant ولا يُحرَّر يدويًا', () => {
    expect(readFileSync(OUT, 'utf8')).toBe(render());
  });

  it('الوعد واحد: بريد التأكيد يقرؤه من hours.js، والصفحات تقوله نصًا، ولا 48 ساعة بعد اليوم', () => {
    expect(read('supabase/functions/_shared/contact.ts')).toContain('${PROMISE_AR}');
    expect(PROMISE_AR).toContain(HOURS_AR);
    for (const p of PAGES) {
      const html = read(`home/${p}`);
      expect(html, p).not.toContain('48 ساعة');
      expect(html, p).toContain('<span class="tf-thanks__highlight">4 ساعات عمل</span> (الأحد إلى الخميس، من 9:00 إلى 17:00 بتوقيت الرياض)، وما يصل خارجها يُرد عليه في يوم العمل التالي.');
    }
    expect(promiseNow('ar', Date.parse('2026-11-20T10:00:00Z'))).toContain('يوم العمل التالي');
  });

  it('النافذة في كل الصفحات بعد typeform.js، وتعرض النص نصًا لا HTML، وروابطها لمواقع المنظومة وحدها', () => {
    for (const p of PAGES) {
      const html = read(`home/${p}`);
      expect(html.indexOf('chat.js?v=')).toBeGreaterThan(html.indexOf('typeform.js?v='));
    }
    const js = read('home/assets/program/js/chat.js');
    expect(js).not.toMatch(/innerHTML|insertAdjacentHTML|outerHTML/);
    expect(js).toContain("const HOSTS = ['mi.sunkvalue.com', 'leaders.sunkvalue.com', 'matrix.sunkvalue.com'];");
    expect(js).toContain("C.fnUrl('agent-chat')");
    expect(js).not.toMatch(/eyJhbGci/);
    // سطر الإفصاح: آلي، وقد يطلع الفريق، ومدة الحفظ، ورابط الخصوصية
    expect(js).toMatch(/مساعد آلي[^']*وقد يطلع فريقنا على المحادثة\. تُحفظ المحادثة 90 يومًا/);
    expect(read('shared/build-css.py')).toMatch(/'extra': \['typeform\.css', 'chat\.css'\]/);
  });

  it('الدالة بـ verify_jwt وتُنشر بالبوابة نفسها، واختباراتها في CI، والترحيل متسامح', () => {
    expect(read('supabase/config.toml')).toMatch(/\[functions\.agent-chat\]\nverify_jwt = true/);
    const ci = read('.github/workflows/ci.yml');
    expect(ci).toMatch(/\n\s+deploy agent-chat\n/);
    expect(ci).toMatch(/deno test [^\n]*supabase\/functions\/agent-chat\//);
    expect(read('.github/workflows/deploy-leaders-api.yml')).toMatch(/\n\s+deploy agent-chat\n/);
    const sql = read('supabase/migrations/20261115150000_leaders_agent_conversations.sql');
    expect(gateOf(sql).gate).toBe('tolerant');
    expect(sql).toMatch(/revoke all on leaders\.conversations, leaders\.conversation_messages, leaders\.agent_spend_daily from anon, authenticated;/);
  });

  it('التكلفة: Haiku 5.5 افتراضيًا بجهد منخفض و700 رمز، ولا أدوات، والسقف 200 سنت', () => {
    const model = read('supabase/functions/agent-chat/model.ts');
    expect(model).toContain("export const DEFAULT_MODEL = 'claude-haiku-5-5';");
    expect(model).toContain('export const MAX_TOKENS = 700;');
    expect(model).toContain("output_config: { effort: 'low' as const }");
    expect(model).toMatch(/import Anthropic from 'npm:@anthropic-ai\/sdk@\d+\.\d+\.\d+';/);
    const code = model.split('\n').filter((l) => !l.trim().startsWith('//')).join('\n');
    expect(code).not.toMatch(/\btools:|temperature|budget_tokens|thinking:/);
    expect(read('supabase/functions/agent-chat/handler.ts')).toContain("Number(get('LEADERS_AGENT_DAILY_CAP_CENTS') || '200')");
  });
});
