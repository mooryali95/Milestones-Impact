// منطق لوحة المنسق بلا واجهة، ليُختبر وحده
import { PARTICIPANT_STATUS } from '../../supabase/functions/leaders-api/labels.js';

// من سجّل ولم يكمل القياس، ومن توقف: مصدر واحد مع الخادم (coord-groups.js) لعدّ «يحتاج تدخلك» ولمرشّح القائمة
// ولمن يذكّرهم المنسق (nudges.ts)
import { isStale, PRE_BASELINE, STALE_DAYS } from '../../supabase/functions/leaders-api/coord-groups.js';
export { isStale, PRE_BASELINE, STALE_DAYS };
export const NOT_STARTED = '@pre';
// المرحلة كما يعرضها عمود «المرحلة»: مرحلة الرحلة الجارية، ولمن خرج من البرنامج أو لم تُحسب رحلته حالته الإدارية
export const stageOf = (p) => p.stage || PARTICIPANT_STATUS[p.status] || p.status;
// خيارات مرشّح «المرحلة» من المراحل الظاهرة في الصفوف نفسها، بترتيب مراحل البرنامج ثم البقية،
// فلا يُختار خيار يعرض صفوفًا بعنوان مرحلة غيره (org-2)
export function stageOptions(rows, order = []) {
  const seen = [...new Set(rows.map(stageOf).filter(Boolean))];
  const rank = (t) => { const i = order.indexOf(t); return i < 0 ? order.length : i; };
  return seen.sort((a, b) => rank(a) - rank(b) || a.localeCompare(b, 'ar'));
}

export const STALE = '@stale';

export function filterRows(rows, { q = '', stage = '', track = '' }, now = Date.now()) {
  const s = q.trim().toLowerCase();
  const byStage = (p) => !stage || (stage === NOT_STARTED ? PRE_BASELINE.includes(p.status) : stage === STALE ? isStale(p, now) : stageOf(p) === stage);
  return rows.filter((p) => byStage(p) && (!track || p.track === track)
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
