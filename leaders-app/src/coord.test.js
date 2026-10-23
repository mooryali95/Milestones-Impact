import { describe, it, expect } from 'vitest';
import { csv, filterRows, sortRows } from './coord.js';

const rows = [
  { full_name: 'سارة', job_title: 'مديرة', status: 'enrolled', track: 'M1I1L2', track_title: 'البداية', progress: 40, last_login_at: '2026-10-20' },
  { full_name: 'عمر', job_title: 'مهندس', status: 'pending_approval', track: null, progress: 10, last_login_at: '2026-10-22' },
];

describe('لوحة المنسق', () => {
  it('تصفي بالبحث والحالة والمسار', () => {
    expect(filterRows(rows, { q: 'مهندس' })).toHaveLength(1);
    expect(filterRows(rows, { status: 'enrolled' })[0].full_name).toBe('سارة');
    expect(filterRows(rows, { track: 'M1I1L2' })).toHaveLength(1);
  });
  it('ترتب بالإنجاز وبآخر نشاط', () => {
    expect(sortRows(rows, 'progress')[0].full_name).toBe('سارة');
    expect(sortRows(rows, 'recent')[0].full_name).toBe('عمر');
  });
  it('csv بعلامة BOM', () => {
    expect(csv(['a'], [['b']]).charCodeAt(0)).toBe(0xfeff);
  });
});
