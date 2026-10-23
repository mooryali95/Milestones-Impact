// منطق لوحة المنسق بلا واجهة، ليُختبر وحده
export function filterRows(rows, { q = '', status = '', track = '' }) {
  const s = q.trim().toLowerCase();
  return rows.filter((p) => (!status || p.status === status) && (!track || p.track === track)
    && (!s || `${p.full_name} ${p.job_title || ''} ${p.track_title || ''}`.toLowerCase().includes(s)));
}

export function sortRows(rows, key) {
  const by = {
    name: (a, b) => a.full_name.localeCompare(b.full_name, 'ar'),
    progress: (a, b) => b.progress - a.progress,
    recent: (a, b) => Date.parse(b.last_login_at || 0) - Date.parse(a.last_login_at || 0),
  }[key];
  return by ? [...rows].sort(by) : rows;
}

export function csv(head, rows) {
  const q = (v) => `"${String(v ?? '').replace(/"/g, '""')}"`;
  return '﻿' + [head, ...rows].map((r) => r.map(q).join(',')).join('\r\n');
}
