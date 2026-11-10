// تدقيق الإنتاج، الجولة 2 (2026-11-10): الأداء.
// 8.1 لوحة الجهة في رحلة واحدة وأجزاؤها متوازية، والطلب التمهيدي مخزّن. 7.5 رئيسية المشارك في رحلة واحدة ببواباتها.
// 9.13 حزمة الإدارة: كل قسم يُحمَّل عند فتحه.
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const root = join(__dirname, '../..');
const read = (p) => readFileSync(join(root, p), 'utf8');
const index = read('supabase/functions/leaders-api/index.ts');

describe('8.1 لوحة الجهة', () => {
  it('coord.me يجمع اللوحة والاستبيان بعد الموافقة وحدها', () => {
    const me = index.slice(index.indexOf("'coord.me': async"), index.indexOf("'coord.me': async") + 600);
    expect(me).toContain("if (b.with_dashboard !== true || m.consent_needed) return m;");
    expect(me).toContain("settle('coord.dashboard', C.dashboard(c)), settle('coord.sus-state', SU.state('coordinator', c))");
    const ui = read('leaders-app/src/screens/OrgPortal.jsx');
    expect(ui).toContain("coordCall('coord.me', { with_dashboard: true })");
    expect(ui).toContain('useState(me.preload?.dashboard ?? null)');
    expect(ui).toContain('initial={me.preload?.sus}');
  });
  it('أجزاء اللوحة على الخادم متوازية', () => {
    const c = read('supabase/functions/leaders-api/coordinator.ts');
    expect(c).toContain('await Promise.all([dashboardFor(c), impactFor(c), initiativesFor(c.organization_id)]);');
  });
  it('الطلب التمهيدي مخزّن في الدوال الثلاث التي تخدم واجهات', () => {
    expect(read('supabase/functions/leaders-api/core.ts')).toContain("'Access-Control-Max-Age': '86400',");
    for (const f of ['admin-api', 'user-api']) expect(read(`supabase/functions/${f}/index.ts`), f).toContain('"Access-Control-Max-Age": "86400",');
  });
});

describe('7.5 رئيسية المشارك', () => {
  it('me مع with_home يجمع المختبر وتقييم الخبير والاستبيان، وكل جزء ببواباته', () => {
    const me = index.slice(index.indexOf("'me': async"), index.indexOf("'me': async") + 700);
    expect(me).toContain("['lab.list', 'ratings.pending', 'sus.state'].map((a) => settle(a, asAction(a, p, {}, sid, ctx)))");
    const gate = index.slice(index.indexOf('async function asAction('), index.indexOf('const participant: Record'));
    // البوابات نفسها التي في معالج الطلب: حساب العرض، والدفع، وتجديد الموافقة
    expect(gate).toContain('DEMO_BLOCKED.has(action)');
    expect(gate).toContain('if (need) await Y.requireAccess(p, need);');
    expect(gate).toContain('CONSENT_GATED.includes(action)');
  });
  it('الواجهة تأخذ كل جزء مرة واحدة', () => {
    expect(read('leaders-app/src/api.js')).toContain('take(key) { const v = preloaded[key]; delete preloaded[key]; return v; },');
    const app = read('leaders-app/src/App.jsx');
    expect(app).toContain("call('me', { with_home: true })");
    expect(app).toContain("bootPreload.take('lab') || await call('lab.list')");
    expect(read('leaders-app/src/screens/RateExpert.jsx')).toContain("useState(() => bootPreload.take('ratings'))");
    expect(read('leaders-app/src/screens/Journey.jsx')).toContain("useState(() => bootPreload.take('sus'))");
  });
});

describe('9.13 حزمة الإدارة', () => {
  it('شريط البحث لا يجرّ الأقسام، وكل قسم كسول', () => {
    expect(read('admin-app/src/Palette.jsx')).toContain("import { TABS } from './leaders-tabs.js';");
    const l = read('admin-app/src/screens/Leaders.jsx');
    expect(l).not.toMatch(/^import \w+ from '\.\/\w+\.jsx';/m);
    expect(l.match(/= (lazy|named)\(/g).length).toBeGreaterThanOrEqual(20);
    expect(l).toContain('<Suspense fallback={<Spinner />}>{body}</Suspense>');
  });
});
