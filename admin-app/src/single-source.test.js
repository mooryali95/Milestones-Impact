// المصدر الواحد (تصور تبويبات الإدارة 2026-11-24، المرحلة أ): كل مكوّن مجال يُرسم من شاشة واحدة بالضبط،
// و«نظرة عامة» لا ترسم مكوّن مجال آخر أبدًا؛ تقرأ حكمه سطرًا في شريط «يحتاج انتباهك»
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const DIR = join(__dirname, 'screens');
const screens = readdirSync(DIR).filter((f) => f.endsWith('.jsx')).map((f) => [f, readFileSync(join(DIR, f), 'utf8')]);
const rendering = (tag) => screens.filter(([, src]) => new RegExp(`<${tag}[\\s/>]`).test(src)).map(([f]) => f);

// المكوّن ← الشاشة الوحيدة التي ترسمه
const DOMAIN = {
  OpsHealthCard: 'MailCenter.jsx',
  Readiness: 'PlatformHealth.jsx',
  OrgsReadiness: 'PlatformHealth.jsx',
  PlatformChecks: 'PlatformHealth.jsx',
  SystemState: 'PlatformHealth.jsx',
  DemoCard: 'PlatformHealth.jsx',
  CohortPulse: 'Programs.jsx',
};

describe('المصدر الواحد لمكوّنات المجال', () => {
  for (const [tag, home] of Object.entries(DOMAIN)) {
    it(`${tag} تُرسمه ${home} وحدها`, () => expect(rendering(tag)).toEqual([home]));
  }
  it('«نظرة عامة» لا تستورد مكوّن مجال ولا طابور المتطلبات ولا نبض الدفعات', () => {
    const src = readFileSync(join(DIR, 'Overview.jsx'), 'utf8');
    for (const x of [...Object.keys(DOMAIN), 'ReqQueue', 'Pulse', 'HealthBadge', 'PlatformHealth']) expect(src, x).not.toMatch(new RegExp(`<${x}[\\s/>]`));
    expect(src).not.toMatch(/from '\.\.\/OpsHealth\.jsx'/);
    expect(src).not.toMatch(/DemoLinks/);
  });
  it('نبض الدفعات (admin.today › pulse) يُرسم في مكان واحد: البرامج والدفعات، ولا يضيع من اللوحة', () => {
    const users = screens.filter(([, src]) => /\bt\.pulse\b/.test(src)).map(([f]) => f);
    expect(users).toEqual(['CohortPulse.jsx']);
    expect(rendering('CohortPulse')).toEqual(['Programs.jsx']);
  });
});
