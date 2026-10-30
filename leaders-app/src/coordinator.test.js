// ما يراه منسق الجهة: يخرج من الخادم ما تسمح به صلاحياته فقط
import { describe, it, expect } from 'vitest';
import { coordParticipant, coordPermissions, isoWeek } from '../../supabase/functions/leaders-api/logic.js';

const p = {
  id: 'p1', full_name: 'سارة', job_title: 'مديرة', status: 'enrolled', track: 'M1I1L2', track_title: 'مسار', approved: true,
  progress: 40, created_at: '2026-10-01', last_login_at: '2026-10-20',
  email: 's@x.com', phone: '0500', levels: { milestone: 'beginner' }, cv_path: 'cv/x.pdf', bio: 'سيرة', notes: 'ملاحظة داخلية',
};

describe('coordPermissions', () => {
  it('الافتراضي: بلا درجات ولا تواصل ولا نشاط، والتصدير مسموح', () => {
    expect(coordPermissions(null)).toEqual({ scores: false, contact: false, activity: false, export: true });
    expect(coordPermissions({ scores: 'yes', activity: 1, export: false })).toEqual({ scores: false, contact: false, activity: false, export: false });
  });
});

describe('coordParticipant', () => {
  it('لا يخرج البريد ولا الجوال ولا الدرجات ولا أي حقل داخلي افتراضيًا', () => {
    const out = coordParticipant(p, coordPermissions({}));
    expect(Object.keys(out).sort()).toEqual(['approved', 'created_at', 'full_name', 'id', 'job_title', 'progress', 'status', 'track', 'track_title'].sort());
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
    expect(extra('scores')).toEqual(['levels']);
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
  expect(src).toMatch(/initiativesFor\(c\.organization_id\)\)\.filter\(\(x: any\) => x\.status === 'approved'\)/);
  expect(src).toMatch(/paired \?\? 0\) < MIN_COHORT\) return \{[^}]*cohort: null/);
  expect(MIN_COHORT).toBeGreaterThanOrEqual(5);
});
