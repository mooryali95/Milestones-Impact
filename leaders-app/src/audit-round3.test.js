// تدقيق الإنتاج، الجولة 3 (2026-11-10): الواجهة وإمكانية الوصول.
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { coordParticipant, coordPermissions } from '../../supabase/functions/leaders-api/logic.js';
import { gateOf } from '../../scripts/ops/pending-migrations.mjs';

const root = join(__dirname, '../..');
const read = (p) => readFileSync(join(root, p), 'utf8');

describe('لوحة الجهة', () => {
  it('8.2 المرحلة الجارية من رحلة المشارك نفسها', () => {
    const c = read('supabase/functions/leaders-api/coordinator.ts');
    expect(c).toContain("stageBy[r.id] = (j.journey || []).find((s: any) => s.status === 'active')?.title_ar || null;");
    expect(coordParticipant({ id: 'p', full_name: 'س', status: 'approved', stage: 'التدريب' }, coordPermissions({})).stage).toBe('التدريب');
    expect(read('leaders-app/src/screens/OrgPortal.jsx')).toContain('{p.stage || STATUS[p.status] || p.status}');
  });
  it('org-1 المنسحب والموقوف بلا مرحلة جارية، فتظهر حالتهما في اللوحة وExcel كما في التقرير المطبوع', () => {
    // رحلتهما تبقى محسوبة بمرحلتها النشطة (الإدارة تغيّر الحالة وحدها)، فكانت اللوحة تعرض «التدريب» لمن انسحب
    for (const status of ['withdrawn', 'suspended']) {
      const row = coordParticipant({ id: 'p', full_name: 'س', status, stage: 'التدريب', progress: 45 }, coordPermissions({}));
      expect(row.stage, status).toBeNull();
      expect(row.status).toBe(status);
    }
    expect(coordParticipant({ id: 'p', full_name: 'س', status: 'enrolled', stage: 'التدريب' }, coordPermissions({})).stage).toBe('التدريب');
    // الخريطة تأخذ الحالة لتُخرجهما من الرحلة (journey-map.test.js)
    expect(read('supabase/functions/leaders-api/coordinator.ts')).toContain('id: r.id, name: r.full_name, status: r.status, created_at: r.created_at,');
  });
  it('8.5 العدد والمعدود، و8.6 الجداول والبحث لقارئ الشاشة', () => {
    const o = read('leaders-app/src/screens/OrgPortal.jsx');
    expect(o).toContain("countAr(org.seats, 'مقعد واحد', 'مقعدين', 'مقاعد', 'مقعدًا')");
    expect(o).not.toContain('أجروا القياس المبدئي');
    expect(o.match(/<caption className="sr-only">/g)).toHaveLength(3);
    expect(o).not.toMatch(/<th>/);
    expect(o).toContain('<label className="op-search"><span className="small">ابحث</span>');
  });
  it('8.4 لوحتا الجهة والخبير: الشعار إلى رئيسيتهما، ولا «الرئيسية» إلى دخول المشارك لمن فتحها مباشرة', () => {
    const app = read('leaders-app/src/App.jsx');
    expect(app).toContain('<Shell tag="لوحة الخبير" home="/x">');
    expect(app).toContain('<Shell tag="لوحة الجهة" home="/org">');
    expect(app).toContain('if (ownHome && !inside) return null;');
  });
});

describe('8.3 الخروج من الأدوار', () => {
  it('خروج واحد للبوابات الثلاث يسأل حين توجد جلسة دور آخر، ويلغي الجلسات على الخادم', () => {
    const api = read('leaders-app/src/api.js');
    expect(api).toContain("export async function signOut(here, all = false) {");
    expect(api).toContain("if (r.store.get()) await r.send(r.action).catch(() => {});");
    for (const a of ["'logout'", "'xp.logout'", "'coord.logout'"]) expect(api, a).toContain(`action: ${a}`);
    // السؤال نافذة من التطبيق بثلاثة أزرار (فحص الجاهزية p-entry-9)، والتراجع لا يُخرج
    expect(api).not.toContain('window.confirm');
    expect(read('leaders-app/src/App.jsx')).toContain("if (!(await askSignOut('participant'))) return;");
    expect(read('leaders-app/src/screens/OrgPortal.jsx')).toContain("if (await askSignOut('org')) setMe(null);");
    expect(read('leaders-app/src/screens/ExpertPortal.jsx').match(/if \(await askSignOut\('expert'\)\) onOut\(\);/g)).toHaveLength(2);
  });
});

describe('المشارك', () => {
  it('7.13 صيغة واحدة لأسماء الأبواب، و7.15 أهداف اللمس على الأجهزة اللمسية', () => {
    const a = read('leaders-app/src/screens/Activities.jsx');
    expect(a).toContain('const mixed = new Set(a.chapters.map((c) => c.dimension)).size > 1;');
    expect(read('leaders-app/src/styles.css')).toMatch(/@media \(pointer: coarse\) \{\n\s+button\.link, \.btn\.sm, a\.btn \{ min-height: 44px; \}/);
  });
  it('7.7 ترحيل نص بند 360 (مطبّق): رواية واحدة، مشروط بالنص الأصلي', () => {
    const name = '20261110220000_leaders_t360_help';
    const sql = read(`supabase/migrations/${name}.sql`);
    expect(gateOf(sql, name).gate).toBe('blocking');   // في بيان البصمات منذ تطبيقه 2026-11-11
    expect(sql).toContain("and help_ar = $q$يرسل لك الموجّه رابطًا قبل التدريب");
    expect(sql).toContain('ادعُ مديرك أو اثنين من زملائك من «ملفي»');
  });
});

describe('لوحة الإدارة', () => {
  it('9.15 عنوان كل صفحة h1، و9.14 بلا Access-Control-Allow-Origin', () => {
    for (const f of ['Leaders', 'Contacts', 'Matrix', 'Visits']) expect(read(`admin-app/src/screens/${f}.jsx`), f).toMatch(/<h1 className="page-title">/);
    const h = read('admin-app/public/_headers');
    expect(h).toMatch(/^\/\*\n(?: {2}.*\n)*? {2}! Access-Control-Allow-Origin$/m);
    expect(h).not.toMatch(/^ {2}#/m);
  });
});

// «خارج البرنامج» مصدر واحد (OUT_OF_PROGRAM/inProgram في logic.js، مراجعة الجولة أ): كانت القائمة مكررة في activities.ts
// وadmin.ts، وكانت دعوات الجلسات تستبعد المنسحب وحده فيُدعى الموقوف.
describe('خارج البرنامج: مصدر واحد', () => {
  const src = (f) => readFileSync(join(__dirname, '../../supabase/functions/leaders-api', f), 'utf8');
  it('لا قائمة منسوخة للمنسحب والموقوف، والدعوات والحضور والقمع على inProgram', () => {
    for (const f of ['activities.ts', 'admin.ts', 'coordinator.ts', 'journey-map.js']) {
      expect(src(f), f).not.toMatch(/\[\s*'withdrawn',\s*'suspended'\s*\]/);
      expect(src(f), f).not.toMatch(/status === 'withdrawn' \|\| r\.status === 'suspended'/);
    }
    expect(src('activities.ts')).toContain("(m) => m.email && inProgram(m.status)");
    expect(src('activities.ts')).toContain('e.approved === 3 && inProgram(e.status)');
    expect(src('admin.ts')).toContain('withdrawn: rows.filter((r) => !inProgram(r.status)).length');
  });
});
