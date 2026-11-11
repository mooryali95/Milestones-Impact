// ما يراه منسق الجهة: يخرج من الخادم ما تسمح به صلاحياته فقط
import { describe, it, expect } from 'vitest';
import { coordParticipant, coordPermissions, COORD_TEMPLATES, isoWeek, orgVisibility, templateOf, viewerActive } from '../../supabase/functions/leaders-api/logic.js';

const p = {
  id: 'p1', full_name: 'سارة', job_title: 'مديرة', status: 'enrolled', track: 'M1I1L2', track_title: 'مسار', approved: true,
  progress: 40, created_at: '2026-10-01', last_login_at: '2026-10-20',
  email: 's@x.com', phone: '0500', levels: { milestone: 'beginner' }, cv_path: 'cv/x.pdf', bio: 'سيرة', notes: 'ملاحظة داخلية',
};

describe('coordPermissions', () => {
  it('الافتراضي: بلا درجات ولا تواصل ولا نشاط، والتصدير مسموح', () => {
    expect(coordPermissions(null)).toEqual({ list: true, scores: false, contact: false, activity: false, export: true });
    expect(coordPermissions({ scores: 'yes', activity: 1, export: false })).toEqual({ list: true, scores: false, contact: false, activity: false, export: false });
  });
});

describe('coordParticipant', () => {
  it('لا يخرج البريد ولا الجوال ولا الدرجات ولا أي حقل داخلي افتراضيًا', () => {
    const out = coordParticipant(p, coordPermissions({}));
    // stage: المرحلة الجارية في رحلته (8.2)، من نوع الحالة المعروضة أصلًا، لا درجة فيها ولا مستوى
    expect(Object.keys(out).sort()).toEqual(['approved', 'created_at', 'full_name', 'id', 'job_title', 'progress', 'stage', 'status'].sort());
  });
  // D18: المسار مشتق من المستويات، فلا يخرج إلا معها: صلاحية المستويات وموافقة المشارك
  it('لا مسار ولا عنوان مسار بلا موافقة المشارك ولو مُنحت صلاحية المستويات', () => {
    const out = coordParticipant({ ...p, levels: null }, coordPermissions({ scores: true }));
    expect(out.levels).toBeNull();
    expect(out.track).toBeUndefined();
    expect(out.track_title).toBeUndefined();
    expect(coordParticipant(p, coordPermissions({ activity: true, contact: true })).track).toBeUndefined();
  });
  it('يضيف التواصل والدرجات فقط عند السماح', () => {
    const out = coordParticipant(p, coordPermissions({ contact: true, scores: true }));
    expect(out.email).toBe('s@x.com');
    expect(out.levels).toEqual({ milestone: 'beginner' });
    expect(out.cv_path).toBeUndefined();
    expect(out.notes).toBeUndefined();
  });
  // كل صلاحية تكشف حقولها وحدها: تُفتح واحدة واحدة ويُقارن ما زاد على الافتراضي
  it('كل صلاحية وحدها تكشف حقولها فقط', () => {
    const base = Object.keys(coordParticipant(p, coordPermissions({})));
    const extra = (k) => Object.keys(coordParticipant(p, coordPermissions({ [k]: true }))).filter((x) => !base.includes(x)).sort();
    expect(extra('activity')).toEqual(['last_login_at']);
    expect(extra('contact')).toEqual(['email', 'phone']);
    expect(extra('scores')).toEqual(['levels', 'track', 'track_title']);
    expect(extra('export')).toEqual([]);
  });
});


it('isoWeek يعطي الأسبوع نفسه لأيام الأسبوع الواحد', () => {
  expect(isoWeek(new Date('2026-10-19T08:00:00Z'))).toBe(isoWeek(new Date('2026-10-25T20:00:00Z')));
  expect(isoWeek(new Date('2026-10-25T20:00:00Z'))).not.toBe(isoWeek(new Date('2026-10-26T01:00:00Z')));
  expect(isoWeek(new Date('2027-01-01T00:00:00Z'))).toBe('2026-W53');
});

// ضمانات الخادم في لوحة الجهة (coordinator.ts): المسودات لا تخرج، والمقارنة تُحجب دون الحد الأدنى
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { MIN_COHORT } from '../../supabase/functions/leaders-api/logic.js';
it('لوحة الجهة: المبادرات المعتمدة وحدها، ولا مقارنة أثر دون الحد الأدنى', () => {
  const src = readFileSync(join(__dirname, '../../supabase/functions/leaders-api/coordinator.ts'), 'utf8');
  // الأجزاء متوازية (8.1): المبادرات تُجلب مع الملخص، والمعتمدة وحدها تُعرض
  expect(src).toContain('Promise.all([dashboardFor(c), impactFor(c), initiativesFor(c.organization_id)])');
  expect(src).toMatch(/r\.initiatives = inits\.filter\(\(x: any\) => x\.status === 'approved'\)/);
  expect(src).toMatch(/paired \?\? 0\) < MIN_COHORT\) return \{[^}]*cohort: null/);
  expect(MIN_COHORT).toBeGreaterThanOrEqual(5);
});
// org-15: رحلة كل مشارك تُحسب عند كل فتح للوحة. الحساب الخفيف يترك المجموعة والتقييم المستمر (نحو عشرة استعلامات لكل مشارك)
// ولا يمس ما قبلهما، فالرحلة والتقدم والمعالم التي تأخذها اللوحة هي نفسها. وقرار المقيّم لا يعيد اللوحة كلها (org-5)
it('لوحة الجهة: رحلة خفيفة بلا المجموعة والتقييم المستمر، والرحلة نفسها', () => {
  const coord = readFileSync(join(__dirname, '../../supabase/functions/leaders-api/coordinator.ts'), 'utf8');
  const part = readFileSync(join(__dirname, '../../supabase/functions/leaders-api/participant.ts'), 'utf8');
  expect(coord).toContain('journeyFor(r, { lite: true })');
  // ما تأخذه اللوحة من الرحلة: لا group ولا continuous
  const dash = coord.slice(coord.indexOf('export async function dashboardFor'), coord.indexOf('export async function impactFor'));
  expect(dash).not.toMatch(/\.(group|continuous)\b/);
  // lite لا يغيّر إلا الخطوة الأخيرة: كل ما يُرجعه غير المجموعة والتقييم المستمر محسوب قبلها
  const fn = part.slice(part.indexOf('export async function journeyFor'), part.indexOf('export async function mePayload'));
  expect(fn.match(/\blite\b/g)).toHaveLength(3);   // المعامل ونوعه، وموضع استعماله الوحيد
  expect(fn).toMatch(/const \[group, continuous\] = lite \? \[null, null\] : await Promise\.all\(\[\s*groupOf\(/);
  const tail = fn.slice(fn.indexOf('const [group, continuous]'));
  expect(tail).not.toMatch(/\b(journey|milestones|pl|levels|approved)\s*=/);
  const portal = readFileSync(join(__dirname, 'screens/OrgPortal.jsx'), 'utf8');
  expect(portal).not.toMatch(/rater-confirm', b\); if \(r\.success\) load\(\)/);
});
// org-6: رابط التسجيل في اللوحة هو نفسه الذي تحمله رسالة دعوة المنسق وبشرطها (جهة نشطة)، من orgJoinUrl وحده
it('لوحة الجهة: رابط تسجيل الموظفين من مصدر رسالة الدعوة، ولجهة نشطة وحدها', () => {
  const src = readFileSync(join(__dirname, '../../supabase/functions/leaders-api/coordinator.ts'), 'utf8');
  expect(src).toContain("join_url: d.org.status === 'active' ? orgJoinUrl(d.org.invite_code) : null");
  expect(src).toContain("invite_code: o.status === 'active' ? o.invite_code : null");
});

describe('المطّلعون المتعددون', () => {
  it('بلا «القائمة» لا يخرج صف واحد عن أي مشارك', () => {
    expect(coordParticipant(p, coordPermissions(COORD_TEMPLATES.executive))).toBeNull();
  });
  it('القالب يُستنتج من الصلاحيات، وأي تعديل يجعله مخصّصًا', () => {
    for (const k of Object.keys(COORD_TEMPLATES)) expect(templateOf(COORD_TEMPLATES[k])).toBe(k);
    expect(templateOf({ ...COORD_TEMPLATES.program, scores: true })).toBe('custom');
  });
  it('المطّلع غير نافذ إن أُوقف أو انتهت مدته أو توقفت جهته', () => {
    const now = Date.parse('2026-10-30T00:00:00Z');
    expect(viewerActive({ status: 'active' }, now)).toBe(true);
    expect(viewerActive({ status: 'suspended' }, now)).toBe(false);
    expect(viewerActive({ status: 'active', expires_at: '2026-10-29T00:00:00Z' }, now)).toBe(false);
    expect(viewerActive({ status: 'active', organizations: { status: 'inactive' } }, now)).toBe(false);
  });
  it('ما يراه المشارك: اتحاد صلاحيات النافذين وحدهم', () => {
    const now = Date.parse('2026-10-30T00:00:00Z');
    const v = orgVisibility([
      { status: 'active', permissions: COORD_TEMPLATES.executive },
      { status: 'active', permissions: COORD_TEMPLATES.hr },
      { status: 'suspended', permissions: { list: true, scores: true } },
      { status: 'active', expires_at: '2026-01-01T00:00:00Z', permissions: { list: true, activity: true } },
    ], now);
    expect(v).toEqual({ viewers: 2, list: true, activity: false, contact: true, scores: false, export: true });
    expect(orgVisibility([], now).viewers).toBe(0);
  });
});
