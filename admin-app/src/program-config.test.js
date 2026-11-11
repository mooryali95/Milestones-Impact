// إعداد البرنامج في لوحة الإدارة (التدقيق 2026-11-11، المجموعة b5): حراس المصدر والتباين.
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { withRunningReason } from './leaders.js';

const ROOT = join(__dirname, '../..');
const read = (p) => readFileSync(join(ROOT, p), 'utf8');

// ── التباين (WCAG 1.4.3): نص صغير على خلفيته لا يقل عن 4.5 إلى 1 ──
const lum = (hex) => {
  const c = [0, 2, 4].map((i) => parseInt(hex.slice(1 + i, 3 + i), 16) / 255).map((x) => (x <= 0.03928 ? x / 12.92 : ((x + 0.055) / 1.055) ** 2.4));
  return 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2];
};
const ratio = (a, b) => { const [x, y] = [lum(a), lum(b)].sort((m, n) => n - m); return (x + 0.05) / (y + 0.05); };
const tokens = Object.fromEntries([...read('shared/css/status.css').matchAll(/(--st-[a-z-]+):\s*(#[0-9A-Fa-f]{6})/g)].map((m) => [m[1], m[2]]));
const css = read('admin-app/src/leaders-admin.css');
// قيمة خاصية في قاعدة محددها كما هو مكتوب، مع حل var(--st-*) من status.css
const prop = (selector, name) => {
  const rule = css.match(new RegExp(`^${selector.replace(/[.]/g, '\\.')}\\s*\\{([^}]*)\\}`, 'm'));
  if (!rule) throw new Error(`لا قاعدة ${selector}`);
  const v = rule[1].match(new RegExp(`(?:^|;)\\s*${name}:\\s*([^;]+)`))?.[1].trim();
  const t = v?.match(/^var\((--st-[a-z-]+)\)$/)?.[1];
  return t ? tokens[t] : v;
};

describe('تباين قواعد المرحلة وأعلام المحتوى في اللوحة (admin-program-10)', () => {
  it('سطر قاعدة المرحلة بأنواعه الثلاثة يبلغ 4.5 على خلفيته', () => {
    for (const sel of ['.la-rule', '.la-rule.on_demand', '.la-rule.optional']) {
      const fg = prop(sel, 'color'), bg = prop(sel, 'background');
      expect(ratio(fg, bg), `${sel}: ${fg} على ${bg}`).toBeGreaterThanOrEqual(4.5);
    }
  });
  it('أعلام كاتون والتقييم المستمر على البطاقة البيضاء تبلغ 4.5', () => {
    const fg = prop('.la-flags', 'color');
    expect(ratio(fg, '#FFFFFF'), `.la-flags: ${fg}`).toBeGreaterThanOrEqual(4.5);
  });
});

describe('جلسة البرنامج بدفعة واحدة (admin-program-3)', () => {
  const fn = (src, name) => src.slice(src.indexOf(`export async function ${name}(`), src.indexOf('\nexport ', src.indexOf(`export async function ${name}(`) + 1));
  it('الخادم: غياب cohort_id في التحرير يُبقي ربط الجلسة بدفعتها، والفارغ الصريح وحده يجعلها عامة', () => {
    const save = fn(read('supabase/functions/leaders-api/activities.ts'), 'workshopSave');
    expect(save).toMatch(/if \('cohort_id' in row \|\| !row\.id\) out\.cohort_id = /);
    // لا يُكتب cohort_id ضمن الصف الثابت فيصير null كلما غاب الحقل
    expect(save.slice(save.indexOf('const out'), save.indexOf('};'))).not.toMatch(/cohort_id/);
  });
  it('اللوحة: حقل الدفعة يظهر من الدفعة الأولى، والدفعة الوحيدة افتراضي الموعد الجديد', () => {
    const ui = read('admin-app/src/screens/Activities.jsx');
    expect(ui).not.toMatch(/cohorts\.length < 2 \? SESSION_FIELDS/);
    expect(ui).toMatch(/cohort_id: cohorts\.length === 1 \? cohorts\[0\]\.id : ''/);
  });
});

describe('استثناء الدفعة الجارية للمدير العام بتعليل (admin-program-2)', () => {
  const LOCKED = { success: false, code: 'cohort_running', message: 'دفعة «نوفمبر» جارية. معيار التسكين مقفل أثناءها إلا للمدير الأعلى بتعليل مكتوب' };
  // خادم مُحاكى: يرفض بلا تعليل من 10 أحرف، ويسجل كل إرسال
  const server = () => { const sent = []; return { sent, send: async (extra) => { sent.push(extra); return String(extra.reason || '').length >= 10 ? { success: true } : LOCKED; } }; };
  const asker = (...answers) => { const asked = []; return { asked, ask: async (m) => { asked.push(m); return answers.shift() ?? null; } }; };

  it('المدير العام يُسأل عن التعليل ويُعاد الإرسال به، والتعليل القصير يُعاد السؤال عنه', async () => {
    const s = server(), a = asker('قصير', 'خفض الحد بعد مراجعة لجنة القياس');
    expect(await withRunningReason(s.send, a.ask, true)).toEqual({ success: true });
    expect(s.sent).toEqual([{}, { reason: 'خفض الحد بعد مراجعة لجنة القياس' }]);
    expect(a.asked).toHaveLength(2);
    expect(a.asked[0]).toContain('اكتب تعليل التعديل (10 أحرف على الأقل)');
    expect(a.asked[1]).toContain('التعليل أقصر من المطلوب');
  });
  it('الإلغاء لا يرسل ولا يعرض خطأ، وغير المدير العام يرى رسالة الخادم بلا سؤال', async () => {
    const s = server(), a = asker(null);
    expect(await withRunningReason(s.send, a.ask, true)).toEqual({ success: false, cancelled: true });
    expect(s.sent).toEqual([{}]);
    const s2 = server(), a2 = asker('تعليل طويل بما يكفي');
    expect(await withRunningReason(s2.send, a2.ask, false)).toEqual(LOCKED);
    expect(a2.asked).toEqual([]);
    const ok = asker();
    expect(await withRunningReason(async () => ({ success: false, message: 'خطأ آخر' }), ok.ask, true)).toEqual({ success: false, message: 'خطأ آخر' });
    expect(ok.asked).toEqual([]);
  });
  it('شاشتا معيار التسكين وإعدادات الحكم تحفظان عبر المساعد، والكتالوج يعيد الدفعة الجارية بقاعدة القفل نفسها', () => {
    for (const f of ['admin-app/src/screens/Methodology.jsx', 'admin-app/src/screens/Impact.jsx']) {
      const src = read(f);
      expect(src, f).toMatch(/withRunningReason\(\(extra\) => L\('admin\.save', \{ entity: 'placement_model', row, \.\.\.extra \}\), prompt\)/);
      expect(src, f).toMatch(/running=\{catalog\.running_cohort\}/);
    }
    const admin = read('supabase/functions/leaders-api/admin.ts');
    const cat = admin.slice(admin.indexOf('export async function catalog('), admin.indexOf('\n}\n', admin.indexOf('export async function catalog(')));
    expect(cat).toMatch(/out\.running_cohort = await runningCohort\(null\);/);
    expect(admin).toMatch(/if \(b\.entity === 'placement_model' && !isNew\) \{\s*const running = await runningCohort\(null\);/);
  });
});
